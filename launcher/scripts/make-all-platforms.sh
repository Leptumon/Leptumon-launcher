#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for platform in darwin win32 linux; do
  case "$platform" in
    darwin)
      arches=(x64 arm64 universal)
      ;;
    win32)
      arches=(ia32 x64 arm64)
      ;;
    linux)
      arches=(x64 armv7l arm64)
      ;;
  esac

  for arch in "${arches[@]}"; do
    echo "==> Making ${platform}/${arch}"
    case "$platform" in
      win32)
        # Squirrel requires Wine + Mono on non-Windows hosts. ZIP is still cross-buildable.
        LEPTUMON_SKIP_SQUIRREL=1 npm run make -- --platform="$platform" --arch="$arch"
        ;;
      linux)
        # RPM generation is unreliable from macOS rpmbuild; DEB and ZIP are cross-buildable.
        LEPTUMON_SKIP_RPM=1 LEPTUMON_SKIP_SQUIRREL=1 npm run make -- --platform="$platform" --arch="$arch"
        ;;
      darwin)
        if [[ "$arch" == "universal" ]]; then
          LEPTUMON_STRIP_DARWIN_CODE_SIGNATURE=1 npm run make -- --platform="$platform" --arch="$arch"
        else
          npm run make -- --platform="$platform" --arch="$arch"
        fi
        ;;
      *)
        npm run make -- --platform="$platform" --arch="$arch"
        ;;
    esac
  done
done
