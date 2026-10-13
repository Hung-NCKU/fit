"""Read alpha silhouettes to generate SVG viewports; never modify raster assets."""
import json
from math import ceil
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
result = {}
poses = ['idle', 'walk', 'eat', 'sleep', 'play']
sources = sorted((root / 'pet' / 'animation-v2').glob('*-source.png'))
for source in sources:
    species = source.name.removesuffix('-source.png')
    image = Image.open(source)
    width, height = image.size
    mask = bytearray(image.getchannel('A').point(lambda a: 255 if a > 128 else 0).tobytes())
    components = []
    for start in range(len(mask)):
        if not mask[start]:
            continue
        stack = [start]
        mask[start] = 0
        left, top, right, bottom, area = width, height, 0, 0, 0
        while stack:
            pixel = stack.pop()
            x, y = pixel % width, pixel // width
            left, top = min(left, x), min(top, y)
            right, bottom = max(right, x), max(bottom, y)
            area += 1
            for neighbor in ([pixel - 1] if x else []) + ([pixel + 1] if x < width - 1 else []) + ([pixel - width] if y else []) + ([pixel + width] if y < height - 1 else []):
                if mask[neighbor]:
                    mask[neighbor] = 0
                    stack.append(neighbor)
        if area > 500:
            components.append((left, top, right + 1, bottom + 1, area))
    boxes = []
    for row in range(5):
        row_boxes = []
        for col in range(4):
            candidates = [b for b in components if int((b[0] + b[2]) / 2 / (width / 4)) == col and int((b[1] + b[3]) / 2 / (height / 5)) == row]
            if not candidates:
                raise ValueError(f'Missing silhouette: {species}/{row}/{col}')
            row_boxes.append((min(b[0] for b in candidates), min(b[1] for b in candidates),
                              max(b[2] for b in candidates), max(b[3] for b in candidates),
                              sum(b[4] for b in candidates)))
        boxes.append(row_boxes)
    size = ceil(max(max(b[2] - b[0], b[3] - b[1]) for row in boxes for b in row) / .8)
    result[species] = {'width': width, 'height': height, 'poses': {}, 'bounds': {}}
    for pose, row in zip(poses, boxes):
        # Shared canvas and baseline; leave lift in play's jump frame intact.
        baseline = max(b[3] for b in row)
        result[species]['poses'][pose] = [
            f'{round((b[0] + b[2]) / 2 - size / 2, 1)} {round(baseline - size * .88, 1)} {size} {size}' for b in row
        ]
        result[species]['bounds'][pose] = [
            {'x': b[0] - 3, 'y': b[1] - 3, 'width': b[2] - b[0] + 6, 'height': b[3] - b[1] + 6} for b in row
        ]
(root / 'web' / 'src' / 'pet-frame-layout.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(f'Analyzed {len(sources) * 20} frames; source images unchanged.')
