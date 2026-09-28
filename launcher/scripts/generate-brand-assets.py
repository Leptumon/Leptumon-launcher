#!/usr/bin/env python3
"""
Generate Leptumon launcher logo + app icons from branding/leptumon-logo.png.

Outputs (under launcher/src/assets):
  logo.png                 trimmed UI logo
  logos/logo.png           1024x1024 app icon
  logos/logo.icns          macOS icon (needs macOS `iconutil`)
  logos/logo.ico           Windows icon

Then run scripts/generate-install-loading-gif.py for the Windows installer splash.

Requires: pip install pillow
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'branding/leptumon-logo.png'
ASSETS = ROOT / 'launcher/src/assets'
LOGOS = ASSETS / 'logos'


def main() -> None:
    LOGOS.mkdir(parents=True, exist_ok=True)
    logo = Image.open(SRC).convert('RGBA')

    # UI logo: trim transparent padding.
    trimmed = logo.crop(logo.getchannel('A').getbbox())
    trimmed.thumbnail((900, 900), Image.LANCZOS)
    trimmed.save(ASSETS / 'logo.png', optimize=True)

    # App icon: square canvas with a little breathing room.
    icon = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    inner = trimmed.copy()
    inner.thumbnail((960, 960), Image.LANCZOS)
    icon.alpha_composite(inner, ((1024 - inner.width) // 2, (1024 - inner.height) // 2))
    icon.save(LOGOS / 'logo.png', optimize=True)
    icon.save(LOGOS / 'logo.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / 'logo.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            icon.resize((size, size), Image.LANCZOS).save(iconset / f'icon_{size}x{size}.png')
            icon.resize((size * 2, size * 2), Image.LANCZOS).save(iconset / f'icon_{size}x{size}@2x.png')
        subprocess.run(['iconutil', '-c', 'icns', str(iconset), '-o', str(LOGOS / 'logo.icns')], check=True)

    print('Logo and icons written to', ASSETS)


if __name__ == '__main__':
    main()
