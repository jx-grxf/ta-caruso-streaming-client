import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const assetsDir = path.join(rootDir, "assets", "mac");
const iconsetDir = path.join(assetsDir, "CarusoReborn.iconset");
const iconPngPath = path.join(assetsDir, "icon-1024.png");
const iconIcnsPath = path.join(assetsDir, "icon.icns");
const dmgBackgroundPath = path.join(assetsDir, "dmg-background.png");

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#111726" />
      <stop offset="100%" stop-color="#04070d" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="28" flood-color="#000000" flood-opacity="0.34" />
    </filter>
  </defs>

  <g filter="url(#shadow)">
    <rect x="92" y="92" width="840" height="840" rx="238" fill="url(#bg)" />
  </g>
  <circle cx="246" cy="258" r="158" fill="#1bc1d6" opacity="0.18" />
  <circle cx="734" cy="770" r="144" fill="#ff6a2a" opacity="0.20" />
  <path d="M726 198c-56-47-126-72-206-72-172 0-308 130-308 300s136 300 308 300c83 0 160-28 221-76"
        fill="none" stroke="#ff8a1c" stroke-width="82" stroke-linecap="round" />
  <path d="M388 450c35-64 94-104 170-104 52 0 101 20 138 55"
        fill="none" stroke="#92f7ff" stroke-width="42" stroke-linecap="round" />
  <circle cx="655" cy="410" r="34" fill="#92f7ff" />
</svg>
`.trim();

const dmgBackgroundSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="880" viewBox="0 0 1360 880">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#09101a" />
      <stop offset="50%" stop-color="#10192b" />
      <stop offset="100%" stop-color="#070c14" />
    </linearGradient>
    <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.12)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0.05)" />
    </linearGradient>
  </defs>

  <rect width="1360" height="880" fill="url(#bg)" />
  <circle cx="150" cy="150" r="260" fill="#1bc1d6" opacity="0.16" />
  <circle cx="1240" cy="770" r="220" fill="#ff6a2a" opacity="0.18" />
  <rect x="86" y="120" width="1188" height="640" rx="42" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" />

  <text x="120" y="220" fill="#ffffff" font-size="78" font-family="Avenir Next, SF Pro Display, Helvetica Neue, Arial" font-weight="700">
    Caruso Reborn Beta
  </text>
  <text x="120" y="282" fill="rgba(255,255,255,0.72)" font-size="30" font-family="Avenir Next, SF Pro Text, Helvetica Neue, Arial" font-weight="500">
    Beta macOS app. Drop it into Applications to install your local Caruso control room.
  </text>
  <text x="120" y="678" fill="#92f7ff" font-size="28" font-family="Avenir Next, SF Pro Text, Helvetica Neue, Arial" font-weight="600">
    1. Open    2. Drag to Applications    3. Launch from the menu bar
  </text>
</svg>
`.trim();

const iconsetSizes = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

await fs.rm(iconsetDir, { recursive: true, force: true });
await fs.mkdir(iconsetDir, { recursive: true });

await sharp(Buffer.from(iconSvg))
  .png()
  .toFile(iconPngPath);

await sharp(Buffer.from(dmgBackgroundSvg))
  .png()
  .toFile(dmgBackgroundPath);

for (const [fileName, size] of iconsetSizes) {
  await sharp(iconPngPath)
    .resize(size, size)
    .png()
    .toFile(path.join(iconsetDir, fileName));
}

execFileSync("/usr/bin/iconutil", ["-c", "icns", iconsetDir, "-o", iconIcnsPath], {
  stdio: "inherit"
});
