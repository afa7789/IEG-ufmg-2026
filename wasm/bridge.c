// Ponte C sobre a API FFI do Botan: ElGamal (Z_p*, padding "Raw") exposto como funções simples para o JS.
// Chaves trafegam como DER (PKCS#8 privada, SubjectPublicKeyInfo pública); ciphertext é c1||c2 (p_bytes cada).
#include <botan/ffi.h>
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

static botan_rng_t g_rng = NULL;
static const char* g_err = "";

EM_JS(void, js_random_bytes, (uint8_t* out, size_t len), {
  crypto.getRandomValues(HEAPU8.subarray(out, out + len));
});

static int rng_get(void* ctx, uint8_t* out, size_t len) {
  (void)ctx;
  js_random_bytes(out, len);
  return 0;
}
static int rng_add(void* ctx, const uint8_t* in, size_t len) { (void)ctx; (void)in; (void)len; return 0; }
static void rng_destroy(void* ctx) { (void)ctx; }

static int fail(int rc) {
  const char* msg = botan_error_last_exception_message();
  g_err = (msg && *msg) ? msg : botan_error_description(rc);
  return rc;
}

static int rng(void) {
  if (g_rng) return 0;
  int rc = botan_rng_init_custom(&g_rng, "webcrypto", NULL, rng_get, rng_add, rng_destroy);
  return rc ? fail(rc) : 0;
}

// Exporta com a dança "pergunta tamanho, aloca, exporta".
static int export_priv(botan_privkey_t key, uint8_t** out, size_t* len) {
  *len = 0;
  botan_privkey_export(key, NULL, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
  *out = malloc(*len);
  int rc = botan_privkey_export(key, *out, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
  return rc ? fail(rc) : 0;
}

static int export_pub(botan_pubkey_t key, uint8_t** out, size_t* len) {
  *len = 0;
  botan_pubkey_export(key, NULL, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
  *out = malloc(*len);
  int rc = botan_pubkey_export(key, *out, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
  return rc ? fail(rc) : 0;
}

EMSCRIPTEN_KEEPALIVE
const char* eg_last_error(void) { return g_err; }

EMSCRIPTEN_KEEPALIVE
void eg_free(void* p) { free(p); }

// group: nome de grupo DL do Botan, ex. "modp/ietf/2048".
EMSCRIPTEN_KEEPALIVE
int eg_keygen(const char* group, uint8_t** priv, size_t* priv_len, uint8_t** pub, size_t* pub_len) {
  int rc = rng();
  if (rc) return rc;
  botan_privkey_t key = NULL;
  botan_pubkey_t pubkey = NULL;
  rc = botan_privkey_create(&key, "ElGamal", group, g_rng);
  if (rc) return fail(rc);
  rc = export_priv(key, priv, priv_len);
  if (!rc) rc = botan_privkey_export_pubkey(&pubkey, key);
  if (!rc) rc = export_pub(pubkey, pub, pub_len);
  botan_pubkey_destroy(pubkey);
  botan_privkey_destroy(key);
  return rc ? fail(rc) : 0;
}

static int field_hex(botan_pubkey_t key, const char* name, char** out) {
  botan_mp_t mp = NULL;
  size_t bytes = 0;
  int rc = botan_mp_init(&mp);
  if (!rc) rc = botan_pubkey_get_field(mp, key, name);
  if (!rc) rc = botan_mp_num_bytes(mp, &bytes);
  if (!rc) {
    *out = malloc(bytes * 2 + 8);
    rc = botan_mp_to_hex(mp, *out);
  }
  botan_mp_destroy(mp);
  return rc;
}

// Lê (p, g, y) em hex de uma chave pública DER. p_bytes define o limite da mensagem.
EMSCRIPTEN_KEEPALIVE
int eg_pub_fields(const uint8_t* pub, size_t len, char** p, char** g, char** y, size_t* p_bytes) {
  botan_pubkey_t key = NULL;
  int rc = botan_pubkey_load(&key, pub, len);
  if (rc) return fail(rc);
  rc = field_hex(key, "p", p);
  if (!rc) rc = field_hex(key, "g", g);
  if (!rc) rc = field_hex(key, "y", y);
  if (!rc) *p_bytes = (strlen(*p) - 2) / 2;
  botan_pubkey_destroy(key);
  return rc ? fail(rc) : 0;
}

EMSCRIPTEN_KEEPALIVE
int eg_encrypt(const uint8_t* pub, size_t pub_len, const uint8_t* msg, size_t msg_len, uint8_t** ct, size_t* ct_len) {
  int rc = rng();
  if (rc) return rc;
  botan_pubkey_t key = NULL;
  botan_pk_op_encrypt_t op = NULL;
  rc = botan_pubkey_load(&key, pub, pub_len);
  if (rc) return fail(rc);
  rc = botan_pk_op_encrypt_create(&op, key, "Raw", 0);
  if (!rc) rc = botan_pk_op_encrypt_output_length(op, msg_len, ct_len);
  if (!rc) {
    *ct = malloc(*ct_len);
    rc = botan_pk_op_encrypt(op, g_rng, *ct, ct_len, msg, msg_len);
  }
  botan_pk_op_encrypt_destroy(op);
  botan_pubkey_destroy(key);
  return rc ? fail(rc) : 0;
}

EMSCRIPTEN_KEEPALIVE
int eg_decrypt(const uint8_t* priv, size_t priv_len, const uint8_t* ct, size_t ct_len, uint8_t** pt, size_t* pt_len) {
  int rc = rng();
  if (rc) return rc;
  botan_privkey_t key = NULL;
  botan_pk_op_decrypt_t op = NULL;
  rc = botan_privkey_load(&key, g_rng, priv, priv_len, NULL);
  if (rc) return fail(rc);
  rc = botan_pk_op_decrypt_create(&op, key, "Raw", 0);
  if (!rc) rc = botan_pk_op_decrypt_output_length(op, ct_len, pt_len);
  if (!rc) {
    *pt = malloc(*pt_len);
    rc = botan_pk_op_decrypt(op, *pt, pt_len, ct, ct_len);
  }
  botan_pk_op_decrypt_destroy(op);
  botan_privkey_destroy(key);
  return rc ? fail(rc) : 0;
}
