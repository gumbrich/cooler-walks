import fs from 'node:fs';
import sharp from 'sharp';
fs.mkdirSync('public/icons', { recursive: true });
for (const [file, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
])
  await sharp('public/icon.svg')
    .resize(size, size)
    .png()
    .toFile('public/icons/' + file);
const mark = await sharp('public/icon.svg').resize(340, 340).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#193d32' } })
  .composite([{ input: mark, left: 86, top: 86 }])
  .png()
  .toFile('public/icons/maskable-512.png');
