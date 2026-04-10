from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
BG = (255, 255, 255, 0)
CARD = (255, 255, 255, 255)
BORDER = (226, 232, 240, 255)
DARK = (42, 42, 46, 255)
ORANGE = (245, 158, 11, 255)

img = Image.new('RGBA', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

margin = 72
radius = 205
shadow_offset = 8

shadow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
shadow_draw = ImageDraw.Draw(shadow)
shadow_draw.rounded_rectangle(
    (margin + shadow_offset, margin + shadow_offset, SIZE - margin + shadow_offset, SIZE - margin + shadow_offset),
    radius=radius,
    fill=(15, 23, 42, 14),
)
img.alpha_composite(shadow)

draw.rounded_rectangle(
    (margin, margin, SIZE - margin, SIZE - margin),
    radius=radius,
    fill=CARD,
    outline=BORDER,
    width=12,
)

font_path = '/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf'
font = ImageFont.truetype(font_path, 640)
shadow_color = (0, 0, 0, 18)

draw.text((140, 232), 'B', font=font, fill=shadow_color)
draw.text((488, 232), 'S', font=font, fill=shadow_color)
draw.text((132, 224), 'B', font=font, fill=DARK)
draw.text((480, 224), 'S', font=font, fill=ORANGE)

img.save('/Users/Beto/BSOP/public/favicon-preview-v2.png')
