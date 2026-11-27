"""Draw the saved generation snapshots; this is a schematic, not a browser capture."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

folder = Path(__file__).resolve().parent
before = json.loads((folder / 'composition-before.json').read_text(encoding='utf-8'))
after = json.loads((folder / 'composition-after.json').read_text(encoding='utf-8'))


def font(size, bold=False):
    try:
        return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf', size)
    except OSError:
        return ImageFont.load_default()


canvas = Image.new('RGB', (1672, 1194), '#0b1421')
draw = ImageDraw.Draw(canvas)
draw.text((28, 16), 'Spatial composition: before and after', font=font(28, True), fill='#edf5ff')
draw.text((28, 58), 'Seed 42 | world position (32,000, 16,000) | 1600 x 900 viewport | schematic generation snapshots', font=font(18), fill='#b2c5db')
draw.text((28, 88), 'Blue: planets   Gray: moons   Gold: asteroids   Cyan ring: player   |   Positions, sizes and opacity use the game data.', font=font(17), fill='#b2c5db')

for row, radius in enumerate([600, 1999]):
    for col, (label, data) in enumerate([('Before', before), ('After', after)]):
        maps = data.get('maps', data['rows'])
        view = next(r for r in maps if r['seed'] == 42 and r['radius'] == radius and r['position'][0] == 32000)
        x, y = 28 + col * 824, 132 + row * 520
        counts = view['physical']
        draw.text((x, y), f'{label}  |  radius {radius}  |  zoom {view["zoom"]:.4f}', font=font(21, True), fill='#edf5ff')
        draw.text((x, y + 29), f'Planets {counts["planet"]}   Moons {counts["moon"]}   Asteroids {counts["asteroid"]}', font=font(18), fill='#b2c5db')
        background = (15, 23, 36)
        panel = Image.new('RGB', (800, 450), background)
        marks = ImageDraw.Draw(panel)
        scale = view['zoom'] * 0.5
        palette = {'planet': (75, 150, 235), 'moon': (176, 191, 209), 'asteroid': (239, 185, 99)}
        for body in sorted(view['bodies'], key=lambda b: -b['r']):
            px = 400 + (body['x'] - view['position'][0]) * scale
            py = 225 + (body['y'] - view['position'][1]) * scale
            r = max(body['r'] * view['zoom'], 1.25) * 0.5
            alpha = body['alpha']
            color = tuple(round(a + (b - a) * alpha) for a, b in zip(background, palette[body['type']]))
            marks.ellipse((px-r, py-r, px+r, py+r), fill=color)
        r = radius * scale
        marks.ellipse((400-r, 225-r, 400+r, 225+r), outline='#78f4ee', width=2)
        marks.ellipse((398, 223, 402, 227), fill='#78f4ee')
        canvas.paste(panel, (x, y + 58))
        draw.rectangle((x, y+58, x+799, y+507), outline='#34465c', width=1)

draw.text((28, 1173), 'Static composition only. Counts exclude decorative stars and use intersecting physical silhouettes, before impacts or travel.', font=font(15), fill='#b2c5db')
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else folder / 'composition-comparison.png'
canvas.save(destination)
print(destination)
