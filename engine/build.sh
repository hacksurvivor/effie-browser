#!/bin/zsh
# Alter's engine: Chromium + CEF at the exact commit in engine/cef.lock, with engine/patches on
# top, built as a release-only CEF distribution that cef-rs links against: macOS arm64 on a Mac,
# Linux x64 on Linux. A Mac engine can only be built on a Mac (Chromium doesn't cross-build to it).
#
#   ALTER_ENGINE_DIR=/Volumes/Engine/alter-engine engine/build.sh fetch    # hours, ~100 GB
#   ALTER_ENGINE_DIR=... engine/build.sh patch                            # our patches
#   ALTER_ENGINE_DIR=... engine/build.sh build                            # hours
#   ALTER_ENGINE_DIR=... engine/build.sh install                          # → ~/.local/share/cef-alter
#   CEF_PATH=~/.local/share/cef-alter spikes/build.sh                     # Alter on our engine
#
# CEF asks for 200 GB free and 16 GB of memory (chromiumembedded.github.io/cef/automated_build_setup).
# The tree belongs on a fast drive, never on a nearly full system disk, and outside ~/code (backed up).
set -euo pipefail
here=${0:a:h}
source "$here/cef.lock"
step=${1:-help}
[[ $step == help ]] && { sed -n '2,13p' "$0"; exit 0; }
: "${ALTER_ENGINE_DIR:?set ALTER_ENGINE_DIR to a folder on a drive with 200 GB free}"
dir=$ALTER_ENGINE_DIR
src=$dir/src
cef_src=$src/chromium/src
install_dir=${ALTER_ENGINE_INSTALL:-$HOME/.local/share/cef-alter}

if [[ $(uname) == Darwin ]]; then
  arch_flag=--arm64-build distrib=macosarm64 cef_dir_name=cef_macos_aarch64
else
  arch_flag=--x64-build distrib=linux64 cef_dir_name=cef_linux_x86_64
fi

need_space() {
  local free_gb=$(( $(df -k "$dir" | awk 'NR==2 {print $4}') / 1024 / 1024 ))
  if (( free_gb < $1 )); then
    echo "Only ${free_gb} GB free at $dir; this step needs about $1 GB." >&2
    exit 1
  fi
}

automate() {
  # The script that matches our CEF branch, not master's.
  [[ -f $dir/automate-git.py ]] || curl -fsSL "https://raw.githubusercontent.com/chromiumembedded/cef/$CEF_BRANCH/tools/automate/automate-git.py" -o "$dir/automate-git.py"
  [[ -d $dir/depot_tools ]] || git clone --depth 1 https://chromium.googlesource.com/chromium/tools/depot_tools.git "$dir/depot_tools"
  export PATH="$dir/depot_tools:$PATH"
  local keep_awake=()
  if [[ $(uname) == Darwin ]]; then
    export SDKROOT="$(xcrun --show-sdk-path --sdk macosx)"
    # Keeps the Mac awake for the hours a checkout or build takes (on power only).
    keep_awake=(caffeinate -i)
  fi
  $keep_awake python3 "$dir/automate-git.py" --download-dir="$src" --depot-tools-dir="$dir/depot_tools" \
    --branch="$CEF_BRANCH" --checkout="$CEF_COMMIT" $arch_flag "$@"
}

case $step in
  fetch)
    mkdir -p "$dir"
    # CEF asks for 200 GB; a Linux checkout without history plus a release build came to about
    # 45 GB (1 Nov 2026), so 120 leaves room for a bigger Mac build.
    need_space 120
    # Chromium and CEF at our commit, CEF's own patches applied; nothing built yet.
    # PGO profiles come with the checkout: build runs with --no-update, so it can't fetch them.
    automate --no-build --no-distrib --no-chromium-history --with-pgo-profiles
    # Linux: the system packages Chromium's build needs (asks for sudo once).
    if [[ $(uname) == Linux ]]; then
      sudo "$cef_src/build/install-build-deps.sh" --no-prompt --no-chromeos-fonts
    fi
    ;;
  patch)
    # Each patch applies once; a patch's name and hash are recorded so a re-run skips it.
    cd "$cef_src"
    stamp=.alter-patches
    touch "$stamp"
    for p in "$here"/patches/*.patch(N); do
      # Mac-only patches (named *-mac-*) stay off other engines.
      [[ $(uname) != Darwin && ${p:t} == *-mac-* ]] && continue
      id="$(basename "$p") $(shasum -a 256 "$p" | cut -c1-16)"
      if grep -qxF "$id" "$stamp"; then continue; fi
      echo "applying $(basename "$p")"
      git apply --3way "$p"
      echo "$id" >> "$stamp"
    done
    ;;
  build)
    need_space 60
    # Release only, no symbols: what a 16 GB Mac can link. PGO profiles make it Chrome-fast.
    export GN_DEFINES="is_official_build=true symbol_level=0 blink_symbol_level=0 v8_symbol_level=0"
    # The video and audio the web uses: H.264, AAC and HEVC (MP4, MOV) besides VP9, AV1, Opus and
    # MP3, as in Chrome, Brave and Vivaldi. Without them videos on X, Instagram, Vimeo and most news
    # sites don't play, and Widevine only plays WebM.
    GN_DEFINES+=" proprietary_codecs=true ffmpeg_branding=Chrome"
    # Linux: build against Chromium's Debian sysroot, as stock CEF does (CEF's local default reads
    # this machine's headers instead), so the engine runs on older distributions than the builder.
    [[ $(uname) == Linux ]] && GN_DEFINES+=" use_sysroot=true"
    export CEF_ARCHIVE_FORMAT=tar.bz2
    # Linux: CEF's small sample, not cefclient (which wants GTK headers the sysroot doesn't give it);
    # Effie only needs libcef and the sandbox helper from the build.
    local_target=()
    [[ $(uname) == Linux ]] && local_target=(--build-target=cefsimple)
    automate --no-update --force-build --no-debug-build --minimal-distrib --with-pgo-profiles $local_target
    ;;
  install)
    # Laid out the way cef-dll-sys keeps a downloaded CEF (CEF_PATH/<version>/<os_arch>, Release
    # and Resources flattened, archive.json), so it links against this one and never downloads.
    archive=$(ls -t "$cef_src"/cef/binary_distrib/cef_binary_*_${distrib}_minimal.tar.bz2 | head -1)
    tmp=$install_dir.new
    rm -rf "$tmp" && mkdir -p "$tmp/x"
    tar -xjf "$archive" -C "$tmp/x" --strip-components 1
    built=$(grep '#define CEF_VERSION ' "$tmp/x/include/cef_version.h" | cut -d'"' -f2)
    if [[ $built != "$CEF_VERSION" ]]; then
      echo "Built $built, but cef.lock says $CEF_VERSION; not installing." >&2
      exit 1
    fi
    out=$tmp/${CEF_VERSION%%+*}/$cef_dir_name
    mkdir -p "${out:h}"
    mv "$tmp/x/Release" "$out"
    [[ $(uname) == Darwin ]] || mv "$tmp"/x/Resources/* "$out"/
    for f in CMakeLists.txt cmake include libcef_dll CREDITS.html; do mv "$tmp/x/$f" "$out"/; done
    rm -rf "$tmp/x"
    printf '{\n  "type": "minimal",\n  "name": "%s",\n  "sha1": "%s"\n}\n' \
      "${archive:t}" "$(shasum -a 1 "$archive" | cut -d' ' -f1)" > "$out/archive.json"
    rm -rf "$install_dir" && mv "$tmp" "$install_dir"
    echo "Installed $built (with $(wc -l < "$cef_src/.alter-patches" 2>/dev/null || echo 0) Alter patches) at $install_dir"
    ;;
  *)
    sed -n '2,13p' "$0"
    ;;
esac
