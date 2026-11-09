// Chaves ElGamal fracas (p de 8–64 bits) e decifragem com um x recuperado, via API C++ do Botan.
// Fica em C++ porque a FFI não permite montar um DL_Group com q, e o DER exige q.
#include <botan/bigint.h>
#include <botan/dl_group.h>
#include <botan/elgamal.h>
#include <botan/numthry.h>
#include <botan/pkcs8.h>
#include <botan/pubkey.h>
#include <botan/rng.h>
#include <botan/x509_key.h>
#include <emscripten.h>

#include <cstdlib>
#include <cstring>
#include <string>

extern "C" {
void js_random_bytes(uint8_t* out, size_t len);   // EM_JS em bridge.c
extern const char* g_err;
}

namespace {

class JsRng final : public Botan::RandomNumberGenerator {
   public:
      void fill_bytes_with_input(std::span<uint8_t> out, std::span<const uint8_t>) override {
         if(!out.empty()) js_random_bytes(out.data(), out.size());
      }
      bool accepts_input() const override { return false; }
      std::string name() const override { return "js"; }
      void clear() override {}
      bool is_seeded() const override { return true; }
};

std::string g_msg;

int fail(const char* stage, const std::exception& e) {
   g_msg = std::string(stage) + ": " + e.what();
   g_err = g_msg.c_str();
   return -1;
}

template <typename V>
void give(const V& v, uint8_t** out, size_t* len) {
   *len = v.size();
   *out = static_cast<uint8_t*>(std::malloc(v.size() ? v.size() : 1));
   std::memcpy(*out, v.data(), v.size());
}

char* hex_of(const Botan::BigInt& n) {
   std::string h = n.to_hex_string();
   if(h.rfind("0x", 0) != 0) h = "0x" + h;
   return strdup(h.c_str());
}

}  // namespace

extern "C" {

// Primo seguro p = 2q + 1 com `bits` bits, g de ordem q, x em [1, q-1]. Devolve DER privada/pública e x.
EMSCRIPTEN_KEEPALIVE
int eg_keygen_weak(size_t bits, uint8_t** priv, size_t* priv_len, uint8_t** pub, size_t* pub_len, char** x_hex) {
   if(bits < 8 || bits > 64) { g_err = "bits deve estar entre 8 e 64"; return -1; }
   try {
      JsRng rng;
      Botan::BigInt p, q;
      for(;;) {
         q = Botan::BigInt(rng, bits - 1, true);
         q.set_bit(0);
         if(!Botan::is_prime(q, rng, 64)) continue;
         p = (q << 1) + Botan::BigInt::one();
         if(Botan::is_prime(p, rng, 64)) break;
      }
      Botan::BigInt g;
      for(uint32_t h = 2;; h++) {
         g = Botan::power_mod(Botan::BigInt::from_u64(h), Botan::BigInt::from_u64(2), p);
         if(g != Botan::BigInt::one()) break;
      }
      const Botan::BigInt x = Botan::BigInt::random_integer(rng, Botan::BigInt::one(), q - Botan::BigInt::one());
      const Botan::DL_Group group(p, q, g);
      const Botan::ElGamal_PrivateKey key(group, x);
      give(Botan::PKCS8::BER_encode(key), priv, priv_len);
      give(Botan::X509::BER_encode(key), pub, pub_len);
      *x_hex = hex_of(x);
      return 0;
   } catch(const std::exception& e) {
      return fail("keygen_weak", e);
   }
}

// Decifra c1||c2 usando só a chave pública (p, q, g) e um x recuperado pelo ataque.
EMSCRIPTEN_KEEPALIVE
int eg_decrypt_with_x(const uint8_t* pub, size_t pub_len, const char* x_hex, const uint8_t* ct, size_t ct_len, uint8_t** pt, size_t* pt_len) {
   try {
      const auto pk = Botan::X509::load_key(std::span(pub, pub_len));
      const Botan::DL_Group group(pk->get_int_field("p"), pk->get_int_field("q"), pk->get_int_field("g"));
      const Botan::ElGamal_PrivateKey key(group, Botan::BigInt::from_string(x_hex));
      JsRng rng;
      Botan::PK_Decryptor_EME dec(key, rng, "Raw");
      give(dec.decrypt(std::span(ct, ct_len)), pt, pt_len);
      return 0;
   } catch(const std::exception& e) {
      return fail("decrypt_with_x", e);
   }
}

}  // extern "C"
