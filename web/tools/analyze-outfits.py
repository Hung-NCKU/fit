"""Measure generated full-character alpha bounds without editing source pixels."""
import json
import hashlib
from math import ceil
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
result={}
layout_path=root/'web/src/pet-outfit-layout.json'
cached=json.loads(layout_path.read_text(encoding='utf-8')) if layout_path.exists() else {}
def centers(values,n):
    means=[min(values)+(max(values)-min(values))*i/(n-1) for i in range(n)]
    for _ in range(30):
        buckets=[[] for _ in means]
        for value in values: buckets[min(range(n),key=lambda i:abs(value-means[i]))].append(value)
        means=[sum(b)/len(b) if b else means[i] for i,b in enumerate(buckets)]
    return sorted(means)
for path in sorted((root/'pet/outfits-v1').glob('*-source.png')):
    key=path.name.removesuffix('-source.png')
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    if cached.get(key,{}).get('sourceHash')==digest and cached[key].get('layoutVersion')==2:
        result[key]=cached[key]
        continue
    image=Image.open(path).convert('RGBA');width,height=image.size
    alpha=image.getchannel('A')
    if alpha.getextrema()!=(0,255): raise ValueError(f'No transparent alpha: {path.name}')
    mask=bytearray(alpha.point(lambda a:255 if a>128 else 0).tobytes());parts=[]
    for start in range(len(mask)):
        if not mask[start]: continue
        stack=[start];mask[start]=0;left,top,right,bottom,area=width,height,0,0,0
        while stack:
            pixel=stack.pop();x,y=pixel%width,pixel//width
            left=min(left,x);top=min(top,y);right=max(right,x);bottom=max(bottom,y);area+=1
            for neighbor in ([pixel-1] if x else [])+([pixel+1] if x<width-1 else [])+([pixel-width] if y else [])+([pixel+width] if y<height-1 else []):
                if mask[neighbor]:mask[neighbor]=0;stack.append(neighbor)
        if area>500:parts.append((left,top,right+1,bottom+1,area))
    core=sorted(parts,key=lambda p:p[4],reverse=True)[:12]
    xs=centers([(p[0]+p[2])/2 for p in core],4);ys=centers([(p[1]+p[3])/2 for p in core],3)
    cells=[[] for _ in range(12)]
    for part in parts:
        cx,cy=(part[0]+part[2])/2,(part[1]+part[3])/2
        col=min(range(4),key=lambda c:abs(cx-xs[c]));row=min(range(3),key=lambda r:abs(cy-ys[r]))
        cells[row*4+col].append(part)
    if any(not c for c in cells):raise ValueError(f'Incomplete 12-frame atlas: {path.name}')
    boxes=[(min(p[0] for p in cell),min(p[1] for p in cell),max(p[2] for p in cell),max(p[3] for p in cell)) for cell in cells]
    base_size=ceil(max(max(b[2]-b[0],b[3]-b[1]) for b in boxes[:8])/.8)
    entry={'width':width,'height':height,'sourceHash':digest,'layoutVersion':2,'poses':{},'bounds':{}}
    for row,pose in enumerate(['idle','walk','pickup']):
        group=boxes[row*4:row*4+4];baseline=max(b[3] for b in group)
        # A large pickup hand must not shrink the normal dressed animal.
        size=max(base_size,ceil(max(max(b[2]-b[0],b[3]-b[1]) for b in group)/.8)) if pose=='pickup' else base_size
        entry['poses'][pose]=[f'{round((b[0]+b[2])/2-size/2,1)} {round(baseline-size*.9,1)} {size} {size}' for b in group]
        entry['bounds'][pose]=[dict(x=max(0,b[0]-2),y=max(0,b[1]-2),width=min(width,b[2]+2)-max(0,b[0]-2),height=min(height,b[3]+2)-max(0,b[1]-2)) for b in group]
    result[key]=entry
    print(f'{path.name}: 12 complete frames')
(root/'web/src/pet-outfit-layout.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(f'{len(result)} outfits / {len(result)*12} frames')
