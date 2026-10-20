"""Measure new Bully atlas alpha only; preserve the generated pixels unchanged."""
import hashlib,json
from math import ceil
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[2];file=root/'web/public/pets/special-bully-v1.png'
im=Image.open(file).convert('RGBA');w,h=im.size;alpha=im.getchannel('A');assert alpha.getextrema()==(0,255)
mask=bytearray(alpha.point(lambda a:255 if a>128 else 0).tobytes());parts=[]
for start in range(len(mask)):
 if not mask[start]:continue
 stack=[start];mask[start]=0;left,top,right,bottom,area=w,h,0,0,0
 while stack:
  p=stack.pop();x,y=p%w,p//w;left=min(left,x);top=min(top,y);right=max(right,x);bottom=max(bottom,y);area+=1
  for q in ([p-1] if x else [])+([p+1] if x<w-1 else [])+([p-w] if y else [])+([p+w] if y<h-1 else []):
   if mask[q]:mask[q]=0;stack.append(q)
 if area>500:parts.append((left,top,right+1,bottom+1,area))
core=sorted(parts,key=lambda b:b[4],reverse=True)[:12];assert len(core)==12
# Large connected bodies are separated into the three pose rows and four columns.
core=sorted(core,key=lambda b:(b[1]+b[3])/2);rows=[sorted(core[i:i+4],key=lambda b:(b[0]+b[2])/2) for i in range(0,12,4)]
base=ceil(max(max(b[2]-b[0],b[3]-b[1]) for row in rows[:2] for b in row)/.8)
layout={'width':w,'height':h,'sourceHash':hashlib.sha256(file.read_bytes()).hexdigest(),'poses':{},'bounds':{}}
for pose,row in zip(['idle','walk','pickup'],rows):
 baseline=max(b[3] for b in row);size=max(base,ceil(max(max(b[2]-b[0],b[3]-b[1]) for b in row)/.8)) if pose=='pickup' else base
 layout['poses'][pose]=[f'{round((b[0]+b[2]-size)/2,1)} {round(baseline-size*.9,1)} {size} {size}' for b in row]
 layout['bounds'][pose]=[{'x':max(0,b[0]-2),'y':max(0,b[1]-2),'width':min(w,b[2]+2)-max(0,b[0]-2),'height':min(h,b[3]+2)-max(0,b[1]-2)} for b in row]
 print(pose,[b[:4] for b in row])
(root/'web/src/special-bully-layout.json').write_text(json.dumps(layout,indent=2)+'\n',encoding='utf-8')
print('Bully atlas:',im.size,'12 frames with transparent alpha')
