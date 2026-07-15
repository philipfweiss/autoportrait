#!/usr/bin/env python3
"""A classical watercolor filter, the offline fallback.

The engine performs a painting; it does not restyle your pixels. A raw photo
therefore paints like a photo. The demo portrait was made painterly with an
image model first (see the README), and that route gives the best results.
This script is the no-model alternative: edge-preserving smoothing to pool
the colors, darkened edges to stand in for pigment settling, and paper grain.
It is honest work and it looks like a filter. Temper expectations.

Usage:
  pip install pillow numpy
  python3 tools/watercolorize.py photo.jpg               # writes photo-watercolor.jpg
  python3 tools/watercolorize.py photo.jpg out.jpg
"""

import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageFilter, ImageEnhance
except ImportError:
    sys.exit("needs pillow and numpy:  pip install pillow numpy")


def main() -> None:
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) == 3 else src.with_name(src.stem + "-watercolor.jpg")

    img = Image.open(src).convert("RGB")
    side = 1200
    if max(img.size) > side:
        img.thumbnail((side, side), Image.LANCZOS)

    # pool the colors: repeated median filtering approximates the flat pools
    # a wash leaves, without pulling in an optimization library
    pooled = img
    for r in (5, 5, 3):
        pooled = pooled.filter(ImageFilter.MedianFilter(r))
    pooled = pooled.filter(ImageFilter.GaussianBlur(1.2))
    pooled = ImageEnhance.Color(pooled).enhance(1.15)
    pooled = ImageEnhance.Brightness(pooled).enhance(1.06)

    # pigment settles at the edges: darken where the image changes fastest
    edges = img.convert("L").filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.5))
    e = np.asarray(edges, dtype=np.float32) / 255.0
    e = np.clip(e * 1.8, 0, 1)[..., None]
    base = np.asarray(pooled, dtype=np.float32) / 255.0
    darkened = base * (1 - 0.35 * e)

    # cold-pressed paper: broad soft noise, multiplied in gently
    rng = np.random.default_rng(7)
    grain = rng.normal(0, 1, (base.shape[0] // 4, base.shape[1] // 4)).astype(np.float32)
    grain = np.asarray(
        Image.fromarray(((grain - grain.min()) / (grain.ptp() + 1e-6) * 255).astype(np.uint8))
        .resize((base.shape[1], base.shape[0]), Image.BILINEAR)
        .filter(ImageFilter.GaussianBlur(1.0)),
        dtype=np.float32,
    ) / 255.0
    paper = 0.96 + 0.08 * grain[..., None]
    result = np.clip(darkened * paper, 0, 1)

    Image.fromarray((result * 255).astype(np.uint8)).save(out, quality=90)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
