from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
BG = (255, 255, 255, 0)
CARD = (255, 255, 255, 255)
BORDER = (226, 232, 240, 255)
DARK = (42, 42, 46, 255)
ORANGE = (245, 158, 11, 255)

img = Image.new('RGBA', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

margin = 70
radius = 210
shadow_offset = 12

# soft shadow
shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
shadow_draw = ImageDraw.Draw(shadow)
shadow_draw.rounded_rectangle(
    (margin + shadow_offset, margin + shadow_offset, SIZE - margin + shadow_offset, SIZE - margin + shadow_offset),
    radius=radius,
    fill=(15, 23, 42, 20),
)
img.alpha_composite(shadow)

# rounded card
card_bounds = (margin, margin, SIZE - margin, SIZE - margin)
draw.rounded_rectangle(card_bounds, radius=radius, fill=CARD, outline=BORDER, width=12)

font_path = '/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf'
font = ImageFont.truetype(font_path, 570)

# letters
shadow_color = (0, 0, 0, 28)
draw.text((176, 256), 'B', font=font, fill=shadow_color)
draw.text((521, 256), 'S', font=font, fill=shadow_color)
draw.text((164, 244), 'B', font=font, fill=DARK)
draw.text((509, 244), 'S', font=font, fill=ORANGE)

img.save('/Users/Beto/BSOP/public/favicon.png')
img.save('/Users/Beto/BSOP/public/apple-touch-icon.png')
img.save('/Users/Beto/BSOP/public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
