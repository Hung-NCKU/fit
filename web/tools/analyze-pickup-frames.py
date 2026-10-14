"""Read alpha bounds without changing the generated images."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
layouts = {}
for path in sorted((root / 'pet/pickup-v1').glob('*-source.png')):
    species = path.name.removesuffix('-source.png')
    image = Image.open(path).convert('RGBA')
    width, height = image.size
    alpha = image.getchannel('A')
    bounds = []
    for i in range(4):
        left, right = round(width*i/4), round(width*(i+1)/4)
        box = alpha.crop((left, 0, right, height)).point(lambda a: 255 if a > 128 else 0).getbbox()
        if not box:
            raise ValueError(f'Missing {species} frame {i}')
        x0, y0, x1, y1 = box
        bounds.append(dict(x=left+x0, y=y0, width=x1-x0, height=y1-y0))
    top = min(b['y'] for b in bounds)
    bottom = max(b['y']+b['height'] for b in bounds)
    size = round(max(bottom-top, max(b['width'] for b in bounds)) / .82)
    y = round(top-size*.08)
    frames = [f'{round(width*(i+.5)/4-size/2)} {y} {size} {size}' for i in range(4)]
    layouts[species] = dict(width=width, height=height, frames=frames, bounds=bounds)
    print(f'{species}: four frames, alpha range {alpha.getextrema()}')
(root / 'web/src/pet-pickup-layout.json').write_text(json.dumps(layouts, indent=2)+'\n', encoding='utf-8')
