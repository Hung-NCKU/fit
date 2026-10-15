// Resize the approved generated artwork into install icons, without redrawing
// the character. Node built-ins only; npm run icons --prefix web works on WSL.
import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);

function decodePng(file) {
  const b=readFileSync(file);
  if(!b.subarray(0,8).equals(SIGNATURE)) throw new Error('Icon source must be PNG');
  const width=b.readUInt32BE(16), height=b.readUInt32BE(20), channels=({2:3,6:4})[b[25]];
  if(b[24]!==8 || !channels || b[28]!==0 || width!==height) throw new Error('Use a square, non-interlaced 8-bit RGB/RGBA PNG');
  const chunks=[];
  for(let at=8;at<b.length;) {
    const length=b.readUInt32BE(at), type=b.toString('ascii',at+4,at+8);
    if(type==='IDAT') chunks.push(b.subarray(at+8,at+8+length));
    at+=length+12;
  }
  const raw=inflateSync(Buffer.concat(chunks)), stride=width*channels, pixels=Buffer.alloc(stride*height);
  if(raw.length!==(stride+1)*height) throw new Error('Invalid PNG scanlines');
  const paeth=(a,b,c)=>{const p=a+b-c, x=Math.abs(p-a), y=Math.abs(p-b), z=Math.abs(p-c);return x<=y && x<=z ? a : y<=z ? b : c;};
  for(let y=0;y<height;y++) {
    const filter=raw[y*(stride+1)];
    if(filter>4) throw new Error('Unsupported PNG filter');
    for(let x=0;x<stride;x++) {
      const i=y*stride+x, left=x>=channels ? pixels[i-channels] : 0, up=y ? pixels[i-stride] : 0, diagonal=y && x>=channels ? pixels[i-stride-channels] : 0;
      const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,diagonal)][filter];
      pixels[i]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  if(channels===4) for(let i=3;i<pixels.length;i+=4) if(pixels[i]!==255) throw new Error('Install artwork must have an opaque background');
  return {width,height,channels,pixels};
}

function resize(source,size,inset=1) {
  const output=Buffer.alloc(size*size*3);
  // Maskable variant scales the complete image inward; edge extension retains
  // its opaque apricot backdrop without introducing a visible square border.
  const coordinate=v=>Math.min(source.width-1,Math.max(0,((v+.5-size/2)/inset+size/2)*source.width/size-.5));
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const sx=coordinate(x),sy=coordinate(y),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(x0+1,source.width-1),y1=Math.min(y0+1,source.height-1),fx=sx-x0,fy=sy-y0;
    for(let c=0;c<3;c++) {
      const sample=(xx,yy)=>source.pixels[(yy*source.width+xx)*source.channels+c];
      output[(y*size+x)*3+c]=Math.round((sample(x0,y0)*(1-fx)+sample(x1,y0)*fx)*(1-fy)+(sample(x0,y1)*(1-fx)+sample(x1,y1)*fx)*fy);
    }
  }
  return output;
}

const CRC=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1 ? 0xedb88320^(c>>>1) : c>>>1;return c;});
function chunk(type,data) {
  const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  const body=Buffer.concat([Buffer.from(type),data]);let c=0xffffffff;
  for(const byte of body)c=CRC[(c^byte)&255]^(c>>>8);
  const crc=Buffer.alloc(4);crc.writeUInt32BE((c^0xffffffff)>>>0);
  return Buffer.concat([len,body,crc]);
}
function png(rgb,size) {
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;
  const raw=Buffer.alloc(size*(size*3+1));
  for(let y=0;y<size;y++)rgb.copy(raw,y*(size*3+1)+1,y*size*3,(y+1)*size*3);
  return Buffer.concat([SIGNATURE,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const source=decodePng(join(ROOT,'branding','fitness-puppy-source.png'));
mkdirSync(OUT,{recursive:true});
for(const [name,size,inset] of [['icon-192.png',192,1],['icon-512.png',512,1],['icon-maskable-512.png',512,.8],['apple-touch-icon.png',180,1],['favicon-32.png',32,1]]) {
  const bytes=png(resize(source,size,inset),size);writeFileSync(join(OUT,name),bytes);
  console.log(`${name}: ${size}x${size}, ${Math.round(bytes.length/1024)} KB`);
}
