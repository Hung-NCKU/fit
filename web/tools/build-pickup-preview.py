import json
from pathlib import Path
root = Path(__file__).resolve().parents[2]
layouts = json.loads((root/'web/src/pet-pickup-layout.json').read_text(encoding='utf-8'))
names = dict(cat='橘白貓',dog='狗',rabbit='垂耳兔',hamster='倉鼠',guinea='天竺鼠',hedgehog='刺蝟',ferret='貂',parrot='鸚鵡',tortoise='烏龜',chinchilla='龍貓')
cards = []
for species, name in names.items():
    layout = layouts[species]
    frames = []
    for i, viewport in enumerate(layout['frames']):
        b = layout['bounds'][i]
        rect = ' '.join(f'{k}="{v}"' for k,v in b.items())
        clip = f'{species}-{i}'
        frames.append(f'<svg viewBox="{viewport}" style="animation-delay:{(i-4)*.8 if i else 0}s"><defs><clipPath id="{clip}"><rect {rect}/></clipPath></defs><image href="pickup-v1/{species}.webp" width="{layout["width"]}" height="{layout["height"]}" clip-path="url(#{clip})"/></svg>')
    cards.append(f'<article><div class="stage"><div class="sprite">{"".join(frames)}</div></div><p>{name}</p></article>')
html = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>十種寵物拎起姿勢</title><style>body{background:#f5f1e9;color:#473b31;font:16px system-ui;margin:24px}h1{font-size:24px}main{max-width:1200px;margin:auto}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px}article{background:#fff;border-radius:18px;overflow:hidden;text-align:center}.stage{height:220px;background:url(scene-room-v2.webp) center/cover;display:grid;place-items:center}.sprite{position:relative;width:210px;height:210px}svg{position:absolute;inset:0;width:100%;height:100%;opacity:0;animation:dangle 3.2s step-end infinite}@keyframes dangle{0%{opacity:1}25%,100%{opacity:0}}@media(prefers-reduced-motion:reduce){svg{animation:none}svg:first-child{opacity:1}}</style><main><h1>十種寵物・拎起姿勢</h1><p>在自己的小屋按住寵物，即可拎起拖移；放開後回到地板並恢復活動。</p><section>'+''.join(cards)+'</section></main></html>'
(root/'web/public/pets/pickup-preview.html').write_text(html,encoding='utf-8')
