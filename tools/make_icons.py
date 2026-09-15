"""仮アイコンと iPhone 用スプラッシュ画像を作る（後で差し替え前提）。

使い方: python3 tools/make_icons.py
出力先: docs/icons/, docs/splash/
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent / "docs"
ORANGE = (224, 90, 43, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # 4倍で描いて縮小し、輪郭をなめらかにする

# iPhone の画面サイズ（CSSピクセル幅, 高さ, 倍率）。スプラッシュ画像は機種ごとに必要
IPHONES = [
    (440, 956, 3),  # 16 Pro Max / 17 Pro Max
    (402, 874, 3),  # 16 Pro / 17 / 17 Pro
    (420, 912, 3),  # Air
    (430, 932, 3),  # 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus
    (393, 852, 3),  # 14 Pro / 15 / 15 Pro / 16
    (428, 926, 3),  # 12 Pro Max / 13 Pro Max / 14 Plus
    (390, 844, 3),  # 12 / 13 / 14 / 12 Pro / 13 Pro / 16e
    (375, 812, 3),  # X / XS / 11 Pro / 12 mini / 13 mini
    (414, 896, 3),  # XS Max / 11 Pro Max
    (414, 896, 2),  # XR / 11
    (375, 667, 2),  # SE 第2・第3世代 / 8
]

FONT_CANDIDATES = [
    "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]


def dumbbell(size: int) -> Image.Image:
    """白いダンベル（斜め）を透明背景に描いた正方形画像"""
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    u = s / 100
    r = 3 * u
    d.rounded_rectangle([18 * u, 46 * u, 82 * u, 54 * u], radius=2 * u, fill=WHITE)          # シャフト
    for x0, x1, y0, y1 in [(25, 35, 28, 72), (65, 75, 28, 72), (15, 24, 36, 64), (76, 85, 36, 64)]:
        d.rounded_rectangle([x0 * u, y0 * u, x1 * u, y1 * u], radius=r, fill=WHITE)            # プレート
    layer = layer.rotate(35, resample=Image.BICUBIC)
    return layer.resize((size, size), Image.LANCZOS)


def icon(size: int, scale: float = 1.0) -> Image.Image:
    img = Image.new("RGBA", (size, size), ORANGE)
    mark = dumbbell(int(size * 0.9 * scale))
    img.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return img.convert("RGB")


def load_font(px: int):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, px)
            except OSError:
                pass
    return None


def splash(w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h), ORANGE)
    mark = dumbbell(int(w * 0.42))
    top = int(h * 0.40 - mark.height / 2)
    img.alpha_composite(mark, ((w - mark.width) // 2, top))
    font = load_font(int(w * 0.065))
    if font:
        d = ImageDraw.Draw(img)
        text = "トレーニングメニュー"
        tw = d.textlength(text, font=font)
        d.text(((w - tw) / 2, top + mark.height + w * 0.02), text, font=font, fill=WHITE)
    return img.convert("RGB")


def main():
    icons = ROOT / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    icon(192).save(icons / "icon-192.png", optimize=True)
    icon(512).save(icons / "icon-512.png", optimize=True)
    icon(512, scale=0.8).save(icons / "icon-512-maskable.png", optimize=True)  # Android の丸型切り抜き用に余白多め
    icon(180).save(icons / "apple-touch-icon.png", optimize=True)

    out = ROOT / "splash"
    out.mkdir(parents=True, exist_ok=True)
    links = []
    for cw, ch, ratio in IPHONES:
        w, h = cw * ratio, ch * ratio
        name = f"splash-{w}x{h}.png"
        splash(w, h).save(out / name, optimize=True)
        links.append(
            f'<link rel="apple-touch-startup-image" href="splash/{name}" media="(device-width: {cw}px) and '
            f'(device-height: {ch}px) and (-webkit-device-pixel-ratio: {ratio}) and (orientation: portrait)">'
        )
    print("\n".join(links))


if __name__ == "__main__":
    main()
