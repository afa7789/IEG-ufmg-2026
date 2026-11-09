#!/usr/bin/env bash
# Compila Botan (C++) para WebAssembly com Emscripten e linka a ponte C.
# Saída: public/wasm/botan-elgamal.js + botan-elgamal.wasm (commitados; este script só roda para regenerar).
# Requer: emcc/em++ (brew install emscripten), python3, curl, make.
set -euo pipefail
cd "$(dirname "$0")"

BOTAN_VERSION=3.14.1
BUILD=build
SRC=$BUILD/Botan-$BOTAN_VERSION
OUT=../public/wasm

mkdir -p "$BUILD" "$OUT"
if [ ! -d "$SRC" ]; then
  curl -sL "https://botan.randombit.net/releases/Botan-$BOTAN_VERSION.tar.xz" | tar xJ -C "$BUILD"
fi

if [ ! -f "$SRC/libbotan-3.a" ]; then
  (cd "$SRC" && python3 configure.py --cpu=wasm --os=emscripten --cc=emcc --cc-bin=em++ \
    --disable-shared-library --without-documentation --minimized-build \
    --enable-modules=ffi,elgamal,eme_raw,system_rng,auto_rng --build-targets=static \
    && make -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" libs)
fi

emcc -O2 -c bridge.c -I "$SRC/build/include/public" -o "$BUILD/bridge.o"
em++ -O2 -fwasm-exceptions "$BUILD/bridge.o" "$SRC/libbotan-3.a" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS=_eg_keygen,_eg_pub_fields,_eg_encrypt,_eg_decrypt,_eg_last_error,_eg_free,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=cwrap,getValue,HEAPU8,UTF8ToString,stringToUTF8,lengthBytesUTF8 \
  -o "$OUT/botan-elgamal.js"
ls -la "$OUT"
