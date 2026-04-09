from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
BG = (255, 255, 255, 0)
CIRCLE = (255, 248, 235, 255)
BORDER = (226, 232, 240, 255)
DARK = (42, 42, 46, 255)
ORANGE = (245, 158, 11, 255)

img = Image.new('RGBA', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

margin = 52
draw.ellipse((margin, margin, SIZE - margin, SIZE - margin), fill=CIRCLE, outline=BORDER, width=14)

font_path = '/System/Library/Fonts/Supplemental/Arial Bold Italic.ttf'
font = ImageFont.truetype(font_path, 500)

# Simple speed lines behind the B
for y in (410, 485, 560):
    draw.rounded_rectangle((150, y, 315, y + 20), radius=10, fill=ORANGE)

# Letters with a very subtle shadow for depth
shadow = (0, 0, 0, 24)
draw.text((236, 254), 'B', font=font, fill=shadow)
draw.text((521, 254), 'S', font=font, fill=shadow)
draw.text((225, 245), 'B', font=font, fill=DARK)
draw.text((510, 245), 'S', font=font, fill=ORANGE)

img.save('/Users/Beto/BSOP/public/favicon.png')
img.save('/Users/Beto/BSOP/public/apple-touch-icon.png')
img.save('/Users/Beto/BSOP/public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
