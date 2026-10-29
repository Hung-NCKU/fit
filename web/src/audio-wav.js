/**
 * 錄音轉成 16kHz 單聲道 WAV。
 *
 * 各家瀏覽器錄出來的容器不一樣——Chrome 是 webm/opus、iOS Safari 是 mp4/aac——
 * 而模型不保證兩種都吃。用 AudioContext 解碼再自己寫 WAV 檔頭，不管誰錄的，
 * 送上去的都是同一種格式，少掉一整類「在我手機上不能用」的問題。
 *
 * 16kHz 單聲道是語音辨識夠用的下限，一分鐘約 1.9MB；原始的 48kHz 立體聲是
 * 它的六倍，手機上傳會等很久。
 */
export const RECORD_RATE = 16_000;

const AudioCtx = () => window.AudioContext || window.webkitAudioContext;
const OfflineCtx = () => window.OfflineAudioContext || window.webkitOfflineAudioContext;

/** 瀏覽器要同時有錄音與解碼能力，缺一個就別把麥克風按鈕顯示出來 */
export const canRecord = () => Boolean(
  typeof window !== 'undefined'
  && window.MediaRecorder
  && navigator.mediaDevices?.getUserMedia
  && AudioCtx() && OfflineCtx(),
);

export async function blobToWav(blob, sampleRate = RECORD_RATE) {
  const bytes = await blob.arrayBuffer();
  const decoder = new (AudioCtx())();
  let decoded;
  try { decoded = await decoder.decodeAudioData(bytes); }
  finally { decoder.close?.(); }

  // 目標聲道數給 1，混音與重取樣都交給 OfflineAudioContext
  const frames = Math.max(1, Math.round(decoded.duration * sampleRate));
  const offline = new (OfflineCtx())(1, frames, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const mono = await offline.startRendering();
  return encodeWav(mono.getChannelData(0), sampleRate);
}

/** Float32 的取樣 → 16-bit PCM 的 WAV（44 bytes 檔頭 + 資料） */
export function encodeWav(samples, sampleRate = RECORD_RATE) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);          // PCM 的 fmt 區塊長度
  view.setUint16(20, 1, true);           // 1 = 未壓縮 PCM
  view.setUint16(22, 1, true);           // 單聲道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);   // 每秒位元組數
  view.setUint16(32, 2, true);           // 每個取樣點的位元組數
  view.setUint16(34, 16, true);          // 位元深度
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    // 超出 ±1 的值要夾住，不然轉成 16-bit 會繞回去變成爆音
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return view.buffer;
}

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // 一次把幾十萬個參數展開給 apply 會爆呼叫堆疊，所以分段
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export const wavDataUrl = buffer => `data:audio/wav;base64,${toBase64(buffer)}`;
