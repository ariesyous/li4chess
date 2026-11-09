import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

// The SVG is the editable source. Render fallbacks without extra dependencies.
const publicDirectory = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", publicDirectory), "utf8");
const browser = await chromium.launch();
const images = new Map();

try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>
    html, body { margin: 0; background: transparent; }
    img { display: block; width: 100vw; height: 100vh; }
  </style><img alt="" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`);
  await page.locator("img").evaluate(image => image.decode());

  for (const size of [16, 32, 48, 180]) {
    await page.setViewportSize({ width: size, height: size });
    images.set(size, await page.screenshot({ omitBackground: true }));
  }
} finally {
  await browser.close();
}

await writeFile(new URL("favicon-32x32.png", publicDirectory), images.get(32));
await writeFile(new URL("apple-touch-icon.png", publicDirectory), images.get(180));

// ICO directory entries wrap the same PNGs at native browser-tab sizes.
const sizes = [16, 32, 48];
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2); // Image type: icon.
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  const png = images.get(size);
  directory[entry] = size;
  directory[entry + 1] = size;
  directory.writeUInt16LE(1, entry + 4); // Color planes.
  directory.writeUInt16LE(32, entry + 6); // Bits per pixel.
  directory.writeUInt32LE(png.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += png.length;
}
await writeFile(new URL("favicon.ico", publicDirectory), Buffer.concat([
  directory, ...sizes.map(size => images.get(size)),
]));
console.log("Generated favicon.ico (16/32/48px), favicon-32x32.png and apple-touch-icon.png (180px).");
