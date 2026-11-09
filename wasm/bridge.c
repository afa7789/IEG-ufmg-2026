// Ponte C sobre a API FFI do Botan: ElGamal (Z_p*, padding "Raw") exposto como funções simples para o JS.
// Chaves trafegam como DER (PKCS#8 privada, SubjectPublicKeyInfo pública); ciphertext é c1||c2 (p_bytes cada).
#include <botan/ffi.h>
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>

static botan_rng_t g_rng = NULL;
const char* g_err = "";   // compartilhado com bridge_weak.cpp

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

// RNG compartilhado com bridge_pq.c
int eg_rng_handle(botan_rng_t* out) {
  int rc = rng();
  *out = g_rng;
  return rc;
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

/* ------------------------------------------------------------------------------------------------
 * Parte 2: ataque (log discreto por Pollard rho). Chaves fracas estão em bridge_weak.cpp (API C++ do Botan).
 * O ataque é código nosso em C puro sobre uint64; o Botan só entra para gerar/cifrar/decifrar.
 * ---------------------------------------------------------------------------------------------- */
#include <stdint.h>

/* ---- Pollard rho para log discreto em Z_p*, p < 2^64, g de ordem q = (p-1)/2 ----
 * Aritmética de Montgomery de 64 bits (só multiplicação alta, sem divisão de 128 bits).
 * Caminhada r-adding com 32 multiplicadores g^a_j y^b_j e detecção de ciclo de Brent.
 * Resumível: dlp_start() prepara, dlp_run(n) faz até n passos, dlp_result() devolve x. */

typedef unsigned __int128 u128;
#define R_ADD 32

static struct {
  uint64_t p, q, pinv, r2, one;          // Montgomery: pinv = -p^-1 mod 2^64, r2 = R^2 mod p
  uint64_t g, y;                         // em forma de Montgomery
  uint64_t m[R_ADD], ma[R_ADD], mb[R_ADD];
  uint64_t t, ta, tb, h, ha, hb;         // tartaruga e lebre (Brent)
  uint64_t power, lam, iters, x, restarts;
  int done;
} S;

static uint64_t mont_mul(uint64_t a, uint64_t b) {
  u128 t = (u128)a * b;
  uint64_t m = (uint64_t)t * S.pinv;
  u128 u = t + (u128)m * S.p;             // pode estourar 128 bits se p > 2^63: tratado abaixo
  uint64_t carry = (u < t);
  uint64_t r = (uint64_t)(u >> 64);
  if (carry || r >= S.p) r -= S.p;
  return r;
}
static uint64_t to_mont(uint64_t a) { return mont_mul(a % S.p, S.r2); }
static uint64_t mont_pow(uint64_t b, uint64_t e) {
  uint64_t r = S.one;
  for (; e; e >>= 1, b = mont_mul(b, b)) if (e & 1) r = mont_mul(r, b);
  return r;
}
static uint64_t mulmod_q(uint64_t a, uint64_t b) { return (uint64_t)(((u128)a * b) % S.q); }
static uint64_t powmod_q(uint64_t b, uint64_t e) {
  uint64_t r = 1 % S.q;
  for (b %= S.q; e; e >>= 1, b = mulmod_q(b, b)) if (e & 1) r = mulmod_q(r, b);
  return r;
}
static uint64_t inv_q(uint64_t a) { return powmod_q(a, S.q - 2); }   // q primo

static uint64_t rand64(void) { uint64_t v; js_random_bytes((uint8_t*)&v, 8); return v; }

static void step(uint64_t* v, uint64_t* a, uint64_t* b) {
  unsigned j = (unsigned)(*v ^ (*v >> 29)) % R_ADD;
  *v = mont_mul(*v, S.m[j]);
  *a += S.ma[j]; if (*a >= S.q) *a -= S.q;
  *b += S.mb[j]; if (*b >= S.q) *b -= S.q;
}

static void restart(void) {
  for (int j = 0; j < R_ADD; j++) {
    S.ma[j] = rand64() % S.q; S.mb[j] = rand64() % S.q;
    S.m[j] = mont_mul(mont_pow(S.g, S.ma[j]), mont_pow(S.y, S.mb[j]));
  }
  S.ta = rand64() % S.q; S.tb = rand64() % S.q;
  S.t = mont_mul(mont_pow(S.g, S.ta), mont_pow(S.y, S.tb));
  S.h = S.t; S.ha = S.ta; S.hb = S.tb;
  step(&S.h, &S.ha, &S.hb);
  S.power = 1; S.lam = 1;
}

static uint64_t parse_hex(const char* s) {
  uint64_t v = 0;
  if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) s += 2;
  for (; *s; s++) {
    int d = (*s >= '0' && *s <= '9') ? *s - '0' : (*s | 32) - 'a' + 10;
    v = (v << 4) | (uint64_t)d;
  }
  return v;
}

EMSCRIPTEN_KEEPALIVE
int dlp_start(const char* p_hex, const char* g_hex, const char* y_hex) {
  memset(&S, 0, sizeof S);
  S.p = parse_hex(p_hex);
  if (!(S.p & 1) || S.p < 7) { g_err = "p precisa ser primo ímpar < 2^64"; return -1; }
  S.q = (S.p - 1) / 2;
  uint64_t inv = 1;                                   // Newton: inv = p^-1 mod 2^64
  for (int i = 0; i < 6; i++) inv *= 2 - S.p * inv;
  S.pinv = (uint64_t)0 - inv;
  uint64_t r = (uint64_t)(((u128)1 << 64) % S.p);     // R mod p
  S.one = r;
  S.r2 = (uint64_t)(((u128)r * r) % S.p);
  S.g = to_mont(parse_hex(g_hex));
  S.y = to_mont(parse_hex(y_hex));
  restart();
  return 0;
}

// Executa até `budget` passos. Retorna 1 se achou x, 0 para continuar, -1 em erro.
EMSCRIPTEN_KEEPALIVE
int dlp_run(uint32_t budget) {
  if (S.done) return 1;
  for (uint32_t i = 0; i < budget; i++) {
    if (S.t == S.h) {
      // t = g^ta y^tb = h = g^ha y^hb  →  x = (ta - ha) / (hb - tb) mod q
      uint64_t num = (S.ta + S.q - S.ha) % S.q, den = (S.hb + S.q - S.tb) % S.q;
      if (den != 0) {
        uint64_t x = mulmod_q(num, inv_q(den));
        if (mont_pow(S.g, x) == S.y) { S.x = x; S.done = 1; return 1; }
        if (mont_pow(S.g, x + S.q) == S.y) { S.x = x + S.q; S.done = 1; return 1; }
      }
      if (++S.restarts > 1000) { g_err = "Pollard rho: excesso de reinícios"; return -1; }
      restart();
      S.iters++;
      continue;
    }
    if (S.power == S.lam) { S.t = S.h; S.ta = S.ha; S.tb = S.hb; S.power <<= 1; S.lam = 0; }
    step(&S.h, &S.ha, &S.hb);
    S.lam++;
    S.iters++;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE double dlp_iters(void) { return (double)S.iters; }
EMSCRIPTEN_KEEPALIVE double dlp_result_lo(void) { return (double)(uint32_t)S.x; }
EMSCRIPTEN_KEEPALIVE double dlp_result_hi(void) { return (double)(uint32_t)(S.x >> 32); }
