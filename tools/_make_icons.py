#!/usr/bin/env python3
"""Genera los iconos PNG/ICO de la PWA a partir de un diseño vectorial simple."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "_pylibs"))

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 512
BG = (19, 31, 36, 255)          # #131f24
GREEN_TOP = (126, 224, 58)
GREEN_BOTTOM = (70, 184, 0)
WHITE = (255, 255, 255, 255)
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")
FONT = r"C:\Windows\Fonts\seguibl.ttf"


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def pick_mask(size, scale=1.0):
    """Púa de guitarra con laterales curvos (tres curvas de Bézier)."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    c = size / 2

    def p(x, y):
        return (c + (x - c) * scale, c + (y - c) * scale)

    def bez(p0, p1, p2, n=48):
        pts = []
        for i in range(n + 1):
            t = i / n
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            pts.append(p(x, y))
        return pts

    top_left = (95, 190)
    top_right = (417, 190)
    bottom = (256, 468)
    outline = (
        bez(top_left, (256, 30), top_right)
        + bez(top_right, (472, 312), bottom)
        + bez(bottom, (40, 312), top_left)
    )
    d.polygon(outline, fill=255)
    return m


def vertical_gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        col = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (size, y)], fill=col)
    return img


def make_icon(size=512, maskable=False, logo_scale=1.0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Fondo: cuadrado redondeado (o sangrado completo para maskable/Apple).
    if maskable:
        img.paste(BG, (0, 0, size, size))
    else:
        img.paste(BG, (0, 0, size, size), rounded_mask(size, int(size * 0.225)))

    # Resplandor verde suave detrás de la púa.
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([int(size * 0.18), int(size * 0.18), int(size * 0.82), int(size * 0.82)],
               fill=(88, 204, 2, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(int(size * 0.10)))
    img = Image.alpha_composite(img, glow)

    # Púa con degradado.
    mask = pick_mask(size, logo_scale)
    grad = vertical_gradient(size, GREEN_TOP, GREEN_BOTTOM)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.paste(grad, (0, 0), mask)
    img = Image.alpha_composite(img, layer)

    # Brillo superior sutil dentro de la púa.
    shine = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shine)
    sd.ellipse([int(size * 0.22), int(size * 0.14), int(size * 0.78), int(size * 0.46)],
               fill=(255, 255, 255, 34))
    shine = shine.filter(ImageFilter.GaussianBlur(int(size * 0.05)))
    shine.putalpha(Image.composite(shine.getchannel("A"), Image.new("L", (size, size), 0), mask))
    img = Image.alpha_composite(img, shine)

    # Letra S centrada.
    font_size = int(size * (0.40 if maskable else 0.46))
    font = ImageFont.truetype(FONT, font_size)
    d = ImageDraw.Draw(img)
    text = "S"
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.015
    d.text((x, y + size * 0.008), text, font=font, fill=(0, 40, 0, 70))
    d.text((x, y), text, font=font, fill=WHITE)

    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    base = make_icon(512)
    base.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"))
    base.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))
    make_icon(512, maskable=True, logo_scale=0.80).save(os.path.join(OUT, "icon-maskable-512.png"))
    make_icon(180, maskable=True, logo_scale=0.84).save(os.path.join(OUT, "apple-touch-icon.png"))
    base.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, "favicon-32.png"))
    base.resize((16, 16), Image.LANCZOS).save(os.path.join(OUT, "favicon-16.png"))
    ico = base.resize((48, 48), Image.LANCZOS)
    ico.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("Iconos generados en", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
