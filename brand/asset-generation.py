"""Generates the committed brand assets from the source artwork in this directory.

Run once from the repo root, then commit the output. Not wired into the build — these are
static brand assets, not build artifacts. Requires Pillow.

    python brand/asset-generation.py

Windows-only as written: the OG card rasterizes text with Consolas, which is what the
site's `--font-mono` stack already falls back to on Windows. Regenerating elsewhere means
pointing `centred`'s font directory at an equivalent mono face.

Crop boxes are the measured content bounds of the source artwork, not eyeballed:
  logo.png              mark bbox (198, 352, 820, 480); sun = circle (508, 455) r 102
  seriora-research.jpg  lockup bbox (394, 473, 1227, 1056)
"""

from PIL import Image, ImageDraw, ImageFont

MARK = (198, 352, 820, 480)
LOCKUP = (394, 473, 1227, 1056)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)


def icon(out):
    # Square crop centred on the mark's optical centre (508, 418), side 420 — wide enough
    # that the horizon line still reads at 32x32 rather than running off the edge.
    src = Image.open("brand/logo.png").convert("RGB")
    src.crop((298, 208, 718, 628)).resize((512, 512), Image.LANCZOS).save(out)


def og_web(out):
    card = Image.new("RGB", (1200, 630), BLACK)
    art = Image.open("brand/logo.png").convert("RGB").crop(MARK)
    w = 460
    h = round(art.height * w / art.width)
    card.paste(art.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, 232 - h))

    d = ImageDraw.Draw(card)
    centred(d, "seri", "consolab.ttf", 132, 300, WHITE)
    centred(d, "by Seriora Research", "consola.ttf", 34, 470, (150, 150, 150))
    card.save(out, quality=92)


def centred(d, text, font_file, size, y, fill):
    font = ImageFont.truetype(f"C:/Windows/Fonts/{font_file}", size)
    left, _, right, _ = d.textbbox((0, 0), text, font=font)
    d.text(((1200 - (right - left)) // 2 - left, y), text, font=font, fill=fill)


def og_lab(out):
    card = Image.new("RGB", (1200, 630), BLACK)
    art = Image.open("brand/seriora-research.jpg").convert("RGB").crop(LOCKUP)
    w = int(1200 * 0.52)
    h = round(art.height * w / art.width)
    card.paste(art.resize((w, h), Image.LANCZOS), ((1200 - w) // 2, (630 - h) // 2))
    card.save(out, quality=92)


if __name__ == "__main__":
    icon("apps/web/app/icon.png")
    icon("apps/lab/app/icon.png")
    og_web("apps/web/app/opengraph-image.jpg")
    og_lab("apps/lab/app/opengraph-image.jpg")
    print("wrote 4 assets")
