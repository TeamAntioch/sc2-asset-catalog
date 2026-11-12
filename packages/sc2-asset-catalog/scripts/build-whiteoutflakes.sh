#!/usr/bin/env bash
# Builds the WhiteoutFlakes model viewer (github.com/FernandoS27/WhiteoutFlakes, BSD-3-Clause; see
# THIRD-PARTY-NOTICES.md), which the built-in renderer draws doodads with. `sc2-asset-catalog
# setup-renderer` checks for what it needs, then runs it. Vulkan through MoltenVK only: its Metal
# backend renders black on macOS 27. Apple silicon only.
#
#   scripts/build-whiteoutflakes.sh <dir>     # setup-renderer passes <cache folder>/whiteoutflakes
#
# Needs Xcode (with `xcodebuild -downloadComponent MetalToolchain`) and Homebrew. Re-running
# skips the steps that are already done. The app lands at <dir>/stage/WhiteoutFlakes.app.
set -euo pipefail

mkdir -p "${1:?usage: build-whiteoutflakes.sh <dir>}"
DIR="$(cd "$1" && pwd)"
# Pins proven together on macOS 27.2 / Xcode 27.1 (2026-10-27). Newer Slang rejects the bundled
# WC3 shaders; the headers match the LunarG SDK upstream CI uses.
WF_COMMIT=d2756ce
SLANG_VERSION=2026.1.2
VULKAN_HEADERS_TAG=v1.4.341
VMA_TAG=v3.3.0

export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
if ! xcrun --sdk macosx metal -v >/dev/null 2>&1; then
  echo "Xcode's Metal toolchain is missing; run: xcodebuild -downloadComponent MetalToolchain" >&2
  exit 1
fi
brew list cmake ninja vulkan-loader molten-vk >/dev/null 2>&1 || brew install cmake ninja vulkan-loader molten-vk

cd "$DIR"

# Marked done only once the submodules are in, so a clone cut short is started again.
if [[ ! -f src/.checkout-done ]]; then
  rm -rf src
  git clone --filter=blob:none https://github.com/FernandoS27/WhiteoutFlakes src
  git -C src checkout -q "$WF_COMMIT"
  git -C src submodule update --init --recursive --depth 1
  touch src/.checkout-done
fi

if [[ ! -x slang/bin/slangc ]]; then
  mkdir -p slang
  curl -fsSL "https://github.com/shader-slang/slang/releases/download/v$SLANG_VERSION/slang-$SLANG_VERSION-macos-aarch64.tar.gz" | tar -xz -C slang
fi

# A minimal stand-in for the LunarG SDK: pinned headers + VMA; loader and MoltenVK from Homebrew.
if [[ ! -f vksdk/include/vma/vk_mem_alloc.h ]]; then
  rm -rf vksdk vk-dl
  git clone -q --depth 1 --branch "$VULKAN_HEADERS_TAG" https://github.com/KhronosGroup/Vulkan-Headers.git vk-dl/headers
  git clone -q --depth 1 --branch "$VMA_TAG" https://github.com/GPUOpen-LibrariesAndSDKs/VulkanMemoryAllocator.git vk-dl/vma
  mkdir -p vksdk/include/vma
  cp -R vk-dl/headers/include/. vksdk/include/
  cp vk-dl/vma/include/vk_mem_alloc.h vksdk/include/vma/
  rm -rf vk-dl
fi

# Flags follow upstream's .github/workflows/macos-dmg.yml, except: Metal and WebGPU off; the GLFW
# include path (upstream only adds it through the WebGPU target); deployment target 26.0 (Xcode
# 27's libc++ marks floating-point std::from_chars as macOS 26+).
if [[ ! -f build/build.ninja ]]; then
  cmake -S src -B build -G Ninja \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=26.0 \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DSLANG_DIR="$DIR/slang" \
    -DWDX_BUILD_WC3_SHADERS=OFF \
    -DWDX_USE_PREBUILT_SHADERS=ON \
    -DWDX_BUILD_WC3_DEBUG_SHADERS=OFF \
    -DWDX_ENABLE_TRACY=OFF \
    -DWDX_BUILD_MAX_PLUGIN=OFF \
    -DWDX_ENABLE_METAL=OFF \
    -DWDX_ENABLE_WEBGPU=OFF \
    -DVulkan_INCLUDE_DIR="$DIR/vksdk/include" \
    -DVulkan_LIBRARY="$(brew --prefix vulkan-loader)/lib/libvulkan.dylib" \
    -DCMAKE_CXX_FLAGS="-I$DIR/src/externals/glfw/include"
fi

cmake --build build --target WhiteoutFlakesStandalone --parallel
# On macOS the shaders, fonts and translations are staged beside the .app; install puts them in it.
cmake --install build --prefix stage >/dev/null

APP="$DIR/stage/WhiteoutFlakes.app"
HEADLESS="$("$APP/Contents/MacOS/WhiteoutFlakes" --backend vulkan --headless-test 2>&1 || true)"
grep -E '^\[headless\] (PASS|FAIL)' <<<"$HEADLESS" || true
if ! grep -q '^\[headless\] PASS' <<<"$HEADLESS"; then
  echo "The viewer was built, but its offscreen render test didn't pass:" >&2
  echo "$HEADLESS" | tail -20 >&2
  exit 1
fi
echo "Built $APP"
