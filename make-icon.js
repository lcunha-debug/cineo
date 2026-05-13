const fs = require("fs");
const path = require("path");

function makeBmpDib(size) {
  const w = size, h = size;
  const rowBytes = w * 4;
  const pixelDataSize = rowBytes * h;

  const dibHeader = Buffer.alloc(40);
  dibHeader.writeUInt32LE(40, 0);
  dibHeader.writeInt32LE(w, 4);
  dibHeader.writeInt32LE(h * 2, 8);
  dibHeader.writeUInt16LE(1, 12);
  dibHeader.writeUInt16LE(32, 14);
  dibHeader.writeUInt32LE(0, 16);
  dibHeader.writeUInt32LE(pixelDataSize, 20);

  const pixels = Buffer.alloc(pixelDataSize);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const cx = x - w / 2, cy = y - h / 2;
      const r = Math.sqrt(cx * cx + cy * cy);
      const maxR = w * 0.38, minR = w * 0.22;
      const inRing = r >= minR && r <= maxR;
      const angle = Math.atan2(cy, cx);
      const gap = Math.abs(angle) < 0.55;
      const isC = inRing && !gap;
      if (isC) {
        pixels[i] = 0xED; pixels[i+1] = 0x3A; pixels[i+2] = 0x7C; pixels[i+3] = 0xFF;
      } else {
        pixels[i] = 0x10; pixels[i+1] = 0x08; pixels[i+2] = 0x08; pixels[i+3] = 0xFF;
      }
    }
  }

  const maskRowBytes = Math.ceil(w / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * h, 0);
  return Buffer.concat([dibHeader, pixels, mask]);
}

const dib32 = makeBmpDib(32);
const dib256 = makeBmpDib(256);

const numImages = 2;
const headerSize = 6 + numImages * 16;
const offset1 = headerSize;
const offset2 = headerSize + dib32.length;

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(numImages, 4);

header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
header.writeUInt32LE(dib32.length, 14); header.writeUInt32LE(offset1, 18);

header.writeUInt8(0, 22); header.writeUInt8(0, 23); header.writeUInt8(0, 24); header.writeUInt8(0, 25);
header.writeUInt16LE(1, 26); header.writeUInt16LE(32, 28);
header.writeUInt32LE(dib256.length, 30); header.writeUInt32LE(offset2, 34);

const ico = Buffer.concat([header, dib32, dib256]);
fs.writeFileSync(path.join(__dirname, "resources", "icon.ico"), ico);
console.log("icon.ico created:", ico.length, "bytes");
