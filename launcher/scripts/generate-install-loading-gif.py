#!/usr/bin/env python3
"""
Build the Squirrel.Windows loadingGif (install splash) from logo.png.

Squirrel only accepts a .gif path (see Squirrel.Windows docs: loading-gif.md).
The Electron default install-spinner.gif is 268×167; other sizes are stretched
by the installer window and look worse.

Pipeline: crop logo padding → supersample → flatten on black matte → gifski.
gifski produces much cleaner edges than Pillow's GIF encoder for soft alpha.

Requires: pip install pillow, gifski on PATH (brew install gifski)
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / 'src/assets/logos/logo.png'
OUT = ROOT / 'src/assets/logos/install-loading.gif'

# Squirrel.Windows native splash dimensions (electron-winstaller install-spinner.gif).
CANVAS_WIDTH = 268
CANVAS_HEIGHT = 167
# Logo is scaled to fit inside this box, so tall or square logos are not clipped.
LOGO_MAX_WIDTH = 250
LOGO_MAX_HEIGHT = 155
RENDER_SCALE = 10
ALPHA_CUTOFF = 6
# Edge colors are baked for a dark desktop behind Squirrel's transparent window.
MATTE_RGB = (0, 0, 0)


def load_logo_cropped() -> Image.Image:
    logo = Image.open(LOGO).convert('RGBA')
    bounds = logo.split()[3].getbbox()
    if bounds is not None:
        logo = logo.crop(bounds)
    return logo


def compose_frame() -> Image.Image:
    logo = load_logo_cropped()
    hi_w = CANVAS_WIDTH * RENDER_SCALE
    hi_h = CANVAS_HEIGHT * RENDER_SCALE
    scale = min(LOGO_MAX_WIDTH / logo.width, LOGO_MAX_HEIGHT / logo.height) * RENDER_SCALE
    target_w = round(logo.width * scale)
    target_h = round(logo.height * scale)
    logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)

    canvas = Image.new('RGBA', (hi_w, hi_h), (0, 0, 0, 0))
    canvas.paste(logo, ((hi_w - logo.width) // 2, (hi_h - logo.height) // 2), logo)
    rgba = canvas.resize((CANVAS_WIDTH, CANVAS_HEIGHT), Image.Resampling.LANCZOS)

    matte = Image.new('RGBA', rgba.size, MATTE_RGB + (255,))
    flattened = Image.alpha_composite(matte, rgba)
    alpha = rgba.split()[3].point(lambda value: 0 if value < ALPHA_CUTOFF else 255)
    flattened.putalpha(alpha)
    return flattened


def encode_gifski(frame: Image.Image, output: Path) -> None:
    gifski = shutil.which('gifski')
    if gifski is None:
        raise RuntimeError(
            'gifski not found on PATH (install: brew install gifski)'
        )

    with tempfile.TemporaryDirectory() as tmp:
        png = Path(tmp) / 'frame.png'
        frame.save(png)
        cmd = [
            gifski,
            '-o', str(output),
            '--extra',
            '--width', str(CANVAS_WIDTH),
            '--quality', '100',
            '--lossy-quality', '100',
            '--fps', '1',
            '--repeat', '0',
            str(png),
            str(png),
        ]
        subprocess.run(cmd, check=True, capture_output=True, text=True)


def main() -> int:
    if not LOGO.is_file():
        print(f'Logo not found: {LOGO}', file=sys.stderr)
        return 1

    frame = compose_frame()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    try:
        encode_gifski(frame, OUT)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1
    except subprocess.CalledProcessError as error:
        print(error.stderr or error, file=sys.stderr)
        return 1

    print(f'Wrote {OUT} ({OUT.stat().st_size} bytes, {CANVAS_WIDTH}x{CANVAS_HEIGHT})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
