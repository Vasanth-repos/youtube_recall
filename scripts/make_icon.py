import os
from PIL import Image, ImageDraw, ImageFont

def generate_app_icon():
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = []

    for size in sizes:
        w, h = size
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Rounded dark obsidian background
        radius = max(2, int(w * 0.2))
        draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=(20, 21, 24, 255), outline=(245, 158, 11, 255), width=max(1, int(w * 0.04)))

        # Inner amber glyph "R"
        font_size = int(h * 0.6)
        try:
            font = ImageFont.truetype("georgia.ttf", font_size)
        except Exception:
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except Exception:
                font = ImageFont.load_default()

        text = "R"
        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        x = (w - text_w) / 2
        y = (h - text_h) / 2 - (bbox[1])

        draw.text((x, y), text, font=font, fill=(245, 158, 11, 255))
        images.append(img)

    out_path = os.path.join(os.path.dirname(__file__), "..", "app_icon.ico")
    images[-1].save(out_path, format="ICO", sizes=[(s[0], s[1]) for s in sizes])
    print(f"✓ Saved Windows Application Icon: {os.path.abspath(out_path)}")

if __name__ == "__main__":
    generate_app_icon()

