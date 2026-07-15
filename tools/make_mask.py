#!/usr/bin/env python3
"""Generate a figure mask for autoportrait.

The engine paints better when it knows where the subject ends and the world
begins: the two sides get their own reveal layers, and labels like "face"
only fire inside the figure. This script produces that mask with
u2net_human_seg, the same model behind the demo portrait's mask.

Usage:
  pip install rembg pillow
  python3 tools/make_mask.py photo.jpg              # writes photo-mask.png
  python3 tools/make_mask.py photo.jpg out.png
"""

import sys
from pathlib import Path

try:
    from PIL import Image
    from rembg import new_session, remove
except ImportError:
    sys.exit("needs pillow and rembg:  pip install rembg pillow")


def main() -> None:
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) == 3 else src.with_name(src.stem + "-mask.png")

    img = Image.open(src).convert("RGB")
    session = new_session("u2net_human_seg")
    mask = remove(img, session=session, only_mask=True)

    # half resolution is plenty: the engine reads the mask on a coarse cell grid
    mask = mask.resize((img.width // 2, img.height // 2), Image.LANCZOS)
    mask.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
