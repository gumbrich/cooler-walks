import fs from 'node:fs';
import sharp from 'sharp';

// Render the same source mark as the website. No stock template icons remain.
const square = await sharp('public/icon.svg')
  .resize(1024)
  .flatten({ background: '#193d32' })
  .png()
  .toBuffer();
await sharp(square).toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const splashMark = await sharp('public/icon.svg').resize(340).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 3, background: '#f8f6ef' },
})
  .composite([{ input: splashMark, left: 1196, top: 1196 }])
  .png()
  .toBuffer();
for (const file of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
  fs.writeFileSync(`ios/App/App/Assets.xcassets/Splash.imageset/${file}`, splash);

const res = 'android/app/src/main/res';
for (const [density, size] of [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]) {
  for (const name of ['ic_launcher', 'ic_launcher_round'])
    await sharp(square).resize(size).png().toFile(`${res}/mipmap-${density}/${name}.png`);
  // Android adaptive icons apply their own circular or rounded-square mask.
  const mark = await sharp('public/icon.svg')
    .resize(Math.round(size * 1.2))
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: Math.round(size * 2.25),
      height: Math.round(size * 2.25),
      channels: 4,
      background: '#193d32',
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toFile(`${res}/mipmap-${density}/ic_launcher_foreground.png`);
}
for (const folder of fs.readdirSync(res).filter((f) => f.startsWith('drawable'))) {
  const file = `${res}/${folder}/splash.png`;
  if (fs.existsSync(file)) fs.writeFileSync(file, splash);
}
fs.mkdirSync(`${res}/values`, { recursive: true });
fs.writeFileSync(
  `${res}/values/ic_launcher_background.xml`,
  '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">#193d32</color></resources>\n',
);
console.log('Native app icons and launch artwork generated from public/icon.svg');
