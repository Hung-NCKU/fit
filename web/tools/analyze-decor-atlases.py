"""Measure alpha silhouettes for SVG display. Source pixels are never modified."""
import json
from math import ceil
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[2]
manifest = json.loads((root/'pet/decor-v2/generation-manifest.json').read_text(encoding='utf-8'))
result = {}
def centers(values, n):
    low, high = min(v[0] for v in values), max(v[0] for v in values)
    means = [low + (high-low)*i/max(1,n-1) for i in range(n)]
    for _ in range(25):
        buckets = [[] for _ in means]
        for value,weight in values:
            buckets[min(range(n),key=lambda i:abs(value-means[i]))].append((value,weight))
        means = [sum(v*w for v,w in bucket)/sum(w for _,w in bucket) if bucket else means[i] for i,bucket in enumerate(buckets)]
    return sorted(means)
for sheet in manifest:
    image = Image.open(root/f"pet/decor-v2/{sheet['slug']}-source.png")
    width,height = image.size
    mask = bytearray(image.getchannel('A').point(lambda a:255 if a>128 else 0).tobytes())
    parts=[]
    for start in range(len(mask)):
        if not mask[start]: continue
        stack=[start];mask[start]=0
        left,top,right,bottom,area=width,height,0,0,0
        while stack:
            pixel=stack.pop();x,y=pixel%width,pixel//width
            left=min(left,x);top=min(top,y);right=max(right,x);bottom=max(bottom,y);area+=1
            for neighbor in ([pixel-1] if x else [])+([pixel+1] if x<width-1 else [])+([pixel-width] if y else [])+([pixel+width] if y<height-1 else []):
                if mask[neighbor]: mask[neighbor]=0;stack.append(neighbor)
        if area>100: parts.append((left,top,right+1,bottom+1,area))
    count=len(sheet['items']);cols=sheet['columns'];rows=ceil(count/cols)
    core=sorted(parts,key=lambda p:p[4],reverse=True)[:count]
    xs=centers([((p[0]+p[2])/2,p[4]) for p in core],cols)
    ys=centers([((p[1]+p[3])/2,p[4]) for p in core],rows)
    cells=[[] for _ in range(cols*rows)]
    for part in parts:
        cx,cy=(part[0]+part[2])/2,(part[1]+part[3])/2
        col=min(range(cols),key=lambda c:abs(cx-xs[c]));row=min(range(rows),key=lambda r:abs(cy-ys[r]))
        cells[row*cols+col].append(part)
    for index,item in enumerate(sheet['items']):
        pieces=cells[index]
        if not pieces: raise ValueError(f"Missing {sheet['slug']}/{index}: {item['name']}")
        # Include detached pieces of the same prop (bubbles, plaques, paired banners).
        left=max(0,min(p[0] for p in pieces)-4);top=max(0,min(p[1] for p in pieces)-4)
        right=min(width,max(p[2] for p in pieces)+4);bottom=min(height,max(p[3] for p in pieces)+4)
        result[item['id']]={'sheet':sheet['slug'],'width':width,'height':height,'viewBox':f'{left} {top} {right-left} {bottom-top}',
          'bounds':{'x':left,'y':top,'width':right-left,'height':bottom-top}}
    print(f"{sheet['slug']}: {count} objects, {len(parts)} alpha components")
(root/'web/src/decor-art-layout.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(f'Analyzed {len(result)} decorations; PNG source pixels preserved.')
