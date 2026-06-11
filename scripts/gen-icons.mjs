// Generates PWA icons (dark gate-diamond with cyan glow) without any native
// image deps: draws RGBA buffers and encodes PNG via zlib. Run once:
//   node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.3; // diamond "radius"
  const stroke = size * 0.022;
  const glowFall = size * 0.06;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // background: near-black blue with subtle vertical gradient
      let R = 5, G = 6, B = 13;
      const grad = (y / size) * 8;
      B += grad;

      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const d = dx + dy - r; // signed distance to diamond edge (L1 norm)

      // inner fill: faint cyan wash inside the gate
      if (d < 0) {
        const t = Math.min(1, -d / r);
        R += 6 * t;
        G += 28 * t;
        B += 44 * t;
      }
      // edge stroke + glow
      const edge = Math.abs(d);
      let glow = Math.exp(-Math.max(0, edge - stroke) / glowFall);
      if (edge <= stroke) glow = 1;
      R += (78 - R) * glow * (edge <= stroke ? 1 : 0.55);
      G += (203 - G) * glow * (edge <= stroke ? 1 : 0.55);
      B += (255 - B) * glow * (edge <= stroke ? 1 : 0.55);

      // inner diamond core (small, solid)
      const core = dx + dy - r * 0.22;
      if (core < 0) {
        const t = Math.min(1, -core / (r * 0.22));
        R = R + (200 - R) * t;
        G = G + (240 - G) * t;
        B = B + (255 - B) * t;
      }

      px[i] = Math.min(255, Math.round(R));
      px[i + 1] = Math.min(255, Math.round(G));
      px[i + 2] = Math.min(255, Math.round(B));
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, drawIcon(size));
  console.log(`wrote public/icons/icon-${size}.png`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#05060d"/>
  <path d="M50 20 L80 50 L50 80 L20 50 Z" fill="none" stroke="#4ecbff" stroke-width="3.5"/>
  <path d="M50 43 L57 50 L50 57 L43 50 Z" fill="#cdf0ff"/>
</svg>
`;
writeFileSync('public/icons/icon.svg', svg);
console.log('wrote public/icons/icon.svg');
