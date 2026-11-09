// Pós-quântico via FFI do Botan: ML-KEM (FIPS 203) + HKDF(SHA-256) + AES-256/GCM (KEM-DEM).
// c1 = chave encapsulada; c2 = nonce (12 bytes) || ciphertext+tag do AES-GCM. Chaves em DER.
#include <botan/ffi.h>
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

extern const char* g_err;
void js_random_bytes(uint8_t* out, size_t len);
int eg_rng_handle(botan_rng_t* out);   // bridge.c

#define KDF "HKDF(SHA-256)"
#define AEAD "AES-256/GCM"
#define KEY_LEN 32
#define NONCE_LEN 12

static int pq_fail(int rc) {
  const char* msg = botan_error_last_exception_message();
  g_err = (msg && *msg) ? msg : botan_error_description(rc);
  return rc;
}

static int der_priv(botan_privkey_t key, uint8_t** out, size_t* len) {
  *len = 0;
  botan_privkey_export(key, NULL, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
  *out = malloc(*len);
  return botan_privkey_export(key, *out, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
}

static int der_pub(botan_pubkey_t key, uint8_t** out, size_t* len) {
  *len = 0;
  botan_pubkey_export(key, NULL, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
  *out = malloc(*len);
  return botan_pubkey_export(key, *out, len, BOTAN_PRIVKEY_EXPORT_FLAG_DER);
}

// mode: "ML-KEM-512" | "ML-KEM-768" | "ML-KEM-1024"
EMSCRIPTEN_KEEPALIVE
int pq_keygen(const char* mode, uint8_t** priv, size_t* priv_len, uint8_t** pub, size_t* pub_len) {
  botan_rng_t rng;
  int rc = eg_rng_handle(&rng);
  if (rc) return rc;
  botan_privkey_t key = NULL;
  botan_pubkey_t pubkey = NULL;
  rc = botan_privkey_create(&key, "ML-KEM", mode, rng);
  if (!rc) rc = der_priv(key, priv, priv_len);
  if (!rc) rc = botan_privkey_export_pubkey(&pubkey, key);
  if (!rc) rc = der_pub(pubkey, pub, pub_len);
  botan_pubkey_destroy(pubkey);
  botan_privkey_destroy(key);
  return rc ? pq_fail(rc) : 0;
}

// AES-256/GCM com chave `k`: out = nonce || ct||tag (encrypt) ou pt (decrypt). Retorna 0 ou erro Botan.
static int aead(int decrypt, const uint8_t* k, const uint8_t* in, size_t in_len, uint8_t** out, size_t* out_len) {
  botan_cipher_t c = NULL;
  int rc = botan_cipher_init(&c, AEAD, decrypt ? BOTAN_CIPHER_INIT_FLAG_DECRYPT : BOTAN_CIPHER_INIT_FLAG_ENCRYPT);
  if (rc) return rc;
  uint8_t nonce[NONCE_LEN];
  const uint8_t* body = in;
  size_t body_len = in_len;
  if (decrypt) {
    if (in_len < NONCE_LEN) { botan_cipher_destroy(c); g_err = "c2 curto demais"; return -1; }
    memcpy(nonce, in, NONCE_LEN);
    body += NONCE_LEN;
    body_len -= NONCE_LEN;
  } else {
    js_random_bytes(nonce, NONCE_LEN);
  }
  size_t cap = 0;
  rc = botan_cipher_set_key(c, k, KEY_LEN);
  if (!rc) rc = botan_cipher_start(c, nonce, NONCE_LEN);
  if (!rc) rc = botan_cipher_output_length(c, body_len, &cap);
  if (rc) { botan_cipher_destroy(c); return rc; }
  size_t prefix = decrypt ? 0 : NONCE_LEN;
  uint8_t* buf = malloc(prefix + cap + 16);
  size_t written = 0, consumed = 0;
  rc = botan_cipher_update(c, BOTAN_CIPHER_UPDATE_FLAG_FINAL, buf + prefix, cap + 16, &written, body, body_len, &consumed);
  botan_cipher_destroy(c);
  if (rc) { free(buf); return rc; }
  if (!decrypt) memcpy(buf, nonce, NONCE_LEN);
  *out = buf;
  *out_len = prefix + written;
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int pq_encrypt(const uint8_t* pub, size_t pub_len, const uint8_t* msg, size_t msg_len,
               uint8_t** c1, size_t* c1_len, uint8_t** c2, size_t* c2_len) {
  botan_rng_t rng;
  int rc = eg_rng_handle(&rng);
  if (rc) return rc;
  botan_pubkey_t key = NULL;
  botan_pk_op_kem_encrypt_t op = NULL;
  uint8_t shared[KEY_LEN];
  size_t shared_len = KEY_LEN;
  rc = botan_pubkey_load(&key, pub, pub_len);
  if (!rc) rc = botan_pk_op_kem_encrypt_create(&op, key, KDF);
  if (!rc) rc = botan_pk_op_kem_encrypt_encapsulated_key_length(op, c1_len);
  if (!rc) {
    *c1 = malloc(*c1_len);
    rc = botan_pk_op_kem_encrypt_create_shared_key(op, rng, NULL, 0, KEY_LEN, shared, &shared_len, *c1, c1_len);
  }
  if (!rc) rc = aead(0, shared, msg, msg_len, c2, c2_len);
  botan_pk_op_kem_encrypt_destroy(op);
  botan_pubkey_destroy(key);
  return rc ? pq_fail(rc) : 0;
}

EMSCRIPTEN_KEEPALIVE
int pq_decrypt(const uint8_t* priv, size_t priv_len, const uint8_t* c1, size_t c1_len,
               const uint8_t* c2, size_t c2_len, uint8_t** pt, size_t* pt_len) {
  botan_rng_t rng;
  int rc = eg_rng_handle(&rng);
  if (rc) return rc;
  botan_privkey_t key = NULL;
  botan_pk_op_kem_decrypt_t op = NULL;
  uint8_t shared[KEY_LEN];
  size_t shared_len = KEY_LEN;
  rc = botan_privkey_load(&key, rng, priv, priv_len, NULL);
  if (!rc) rc = botan_pk_op_kem_decrypt_create(&op, key, KDF);
  if (!rc) rc = botan_pk_op_kem_decrypt_shared_key(op, NULL, 0, c1, c1_len, KEY_LEN, shared, &shared_len);
  if (!rc) rc = aead(1, shared, c2, c2_len, pt, pt_len);
  botan_pk_op_kem_decrypt_destroy(op);
  botan_privkey_destroy(key);
  return rc ? pq_fail(rc) : 0;
}
