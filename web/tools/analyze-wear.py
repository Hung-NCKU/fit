"""Measure existing transparent art; never modify raster files."""
import json
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2]
result={}
for path in sorted((root/'web/public/pets/wear').glob('*.webp')):
    im=Image.open(path).convert('RGBA')
    alpha=im.getchannel('A')
    pixels=alpha.load()
    visited=set()
    components=[]
    limit=103 if path.stem=='dog-7' else im.width
    for py in range(im.height):
        for px in range(limit):
            if (px,py) in visited or pixels[px,py]<64: continue
            stack=[(px,py)];visited.add((px,py));points=[]
            while stack:
                a,b=stack.pop();points.append((a,b))
                for nx,ny in [(a-1,b),(a+1,b),(a,b-1),(a,b+1)]:
                    if 0<=nx<limit and 0<=ny<im.height and (nx,ny) not in visited and pixels[nx,ny]>=64:
                        visited.add((nx,ny));stack.append((nx,ny))
            components.append(points)
    largest=max(map(len,components))
    points=[point for c in components if len(c)>=largest*.08 for point in c]
    x=max(0,min(p[0] for p in points)-1);y=max(0,min(p[1] for p in points)-1)
    right=min(limit,max(p[0] for p in points)+2);bottom=min(im.height,max(p[1] for p in points)+2)
    result[path.stem]={'width':im.width,'height':im.height,'x':x,'y':y,'w':right-x,'h':bottom-y}
    if path.stem=='ferret-3':
        result[path.stem]['clip']='0,80 27,80 27,0 200,0 200,158 0,158'
    if path.stem=='tortoise-7':
        # This hat is the hood of the original raincoat. Exclude its torso and neighbour.
        result[path.stem].update(x=46,y=0,w=140,h=89)
(root/'web/src/pet-wear-layout.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
