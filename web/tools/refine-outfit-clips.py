"""Refine only SVG atlas clipping; leave the original bitmap and animation framing intact."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[2]
key='outfit-dog-1'
image=Image.open(root/f'pet/outfits-v1/{key}-source.png').convert('RGBA');w,h=image.size
mask=bytearray(image.getchannel('A').point(lambda a:255 if a>128 else 0).tobytes());parts=[]
for start in range(len(mask)):
 if not mask[start]:continue
 stack=[start];mask[start]=0;pixels=[]
 while stack:
  p=stack.pop();pixels.append(p);x,y=p%w,p//w
  for q in ([p-1] if x else [])+([p+1] if x<w-1 else [])+([p-w] if y else [])+([p+w] if y<h-1 else []):
   if mask[q]:mask[q]=0;stack.append(q)
 if len(pixels)>500:parts.append(pixels)
parts=sorted(parts,key=len,reverse=True)[:12]
layout_path=root/'web/src/pet-outfit-layout.json';layouts=json.loads(layout_path.read_text(encoding='utf-8'));layout=layouts[key]
boxes=[(min(p%w for p in part),min(p//w for p in part),max(p%w for p in part)+1,max(p//w for p in part)+1) for part in parts]
paths=[];chosen=[]
for bounds in layout['bounds']['walk']:
 cx=bounds['x']+bounds['width']/2;cy=bounds['y']+bounds['height']/2
 index=min(range(len(parts)),key=lambda n:((boxes[n][0]+boxes[n][2])/2-cx)**2+((boxes[n][1]+boxes[n][3])/2-cy)**2)
 assert index not in chosen;chosen.append(index);rows={}
 for p in parts[index]:
  x,y=p%w,p//w
  for yy in range(max(bounds['y'],y-2),min(bounds['y']+bounds['height']-1,y+2)+1):
   lo=max(bounds['x'],x-2);hi=min(bounds['x']+bounds['width'],x+3)
   old=rows.get(yy,(w,0));rows[yy]=(min(old[0],lo),max(old[1],hi))
 points=[(rows[y][0],y) for y in sorted(rows)]+[(rows[y][1],y) for y in sorted(rows,reverse=True)]
 # Remove exactly collinear vertices without changing the clipping contour.
 simplified=[]
 for point in points:
  while len(simplified)>1:
   a,b=simplified[-2],simplified[-1]
   if (b[0]-a[0])*(point[1]-b[1])!=(b[1]-a[1])*(point[0]-b[0]):break
   simplified.pop()
  simplified.append(point)
 points=simplified
 # The polygon must retain every opaque body pixel and exclude adjacent characters.
 clip=Image.new('1',(w,h));ImageDraw.Draw(clip).polygon(points,fill=1)
 assert all(clip.getpixel((p%w,p//w)) for p in parts[index])
 for n,other in enumerate(parts):
  if n!=index:assert not any(clip.getpixel((p%w,p//w)) for p in other),'Neighbor leaked into walk frame'
 paths.append('M'+' L'.join(f'{x},{y}' for x,y in points)+' Z')
layout['clips']={'walk':paths};layout['clipVersion']=1
layout_path.write_text(json.dumps(layouts,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('4 walk clip polygons: all opaque character pixels retained; no neighboring character pixels included.')
