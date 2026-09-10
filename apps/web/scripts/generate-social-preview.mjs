import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 1734;
const HEIGHT = 907;
const BOARD_SIZE = 14;
const CORNER_SIZE = 3;
const SQUARE_SIZE = 56;
const BOARD_X = 895;
const BOARD_Y = 61;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../..");
const pieceDirectory = resolve(repositoryRoot, "packages/ui-kit/src/assets/cburnett");
const outputPath = resolve(repositoryRoot, "apps/web/public/social-preview.png");

const colors = {
  red: "#e66b64",
  blue: "#6da8e3",
  yellow: "#f4cf52",
  green: "#72bb83",
};

const standardBackRank = ["R", "N", "B", "Q", "K", "B", "N", "R"];
const reversedCenterBackRank = ["R", "N", "B", "K", "Q", "B", "N", "R"];
const pieces = [];

for (let index = 0; index < 8; index += 1) {
  pieces.push({ color: "red", type: standardBackRank[index], column: 3 + index, row: 13 });
  pieces.push({ color: "red", type: "P", column: 3 + index, row: 12 });
  pieces.push({ color: "yellow", type: reversedCenterBackRank[index], column: 3 + index, row: 0 });
  pieces.push({ color: "yellow", type: "P", column: 3 + index, row: 1 });
  pieces.push({ color: "blue", type: standardBackRank[index], column: 0, row: 3 + index });
  pieces.push({ color: "blue", type: "P", column: 1, row: 3 + index });
  pieces.push({ color: "green", type: reversedCenterBackRank[index], column: 13, row: 3 + index });
  pieces.push({ color: "green", type: "P", column: 12, row: 3 + index });
}

const isPlayable = (column, row) => !(
  (column < CORNER_SIZE || column >= BOARD_SIZE - CORNER_SIZE)
  && (row < CORNER_SIZE || row >= BOARD_SIZE - CORNER_SIZE)
);

const playableSquareCount = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, square) => ({
  column: square % BOARD_SIZE,
  row: Math.floor(square / BOARD_SIZE),
})).filter(({ column, row }) => isPlayable(column, row)).length;

const occupiedSquares = new Set(pieces.map(({ column, row }) => `${column},${row}`));
const pawnCount = pieces.filter(({ type }) => type === "P").length;
const inventory = Object.fromEntries(Object.keys(colors).map(color => [
  color,
  pieces.filter(piece => piece.color === color).length,
]));

if (playableSquareCount !== 160) throw new Error(`Expected 160 playable squares, got ${playableSquareCount}.`);
if (pieces.length !== 64 || occupiedSquares.size !== 64) throw new Error("Expected 64 pieces on 64 distinct squares.");
if (pawnCount !== 32) throw new Error(`Expected 32 pawns, got ${pawnCount}.`);
if (Object.values(inventory).some(count => count !== 16)) throw new Error(`Invalid color inventory: ${JSON.stringify(inventory)}`);
if (pieces.some(({ column, row }) => !isPlayable(column, row))) throw new Error("A piece was placed off the playable board.");

const escapeXml = value => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const pieceSources = {};
for (const type of ["P", "N", "B", "R", "Q", "K"]) {
  pieceSources[type] = await readFile(resolve(pieceDirectory, `w${type}.svg`), "utf8");
}

const pieceImage = ({ color, type, column, row }) => {
  const recolored = pieceSources[type]
    .replaceAll("#fff", colors[color])
    .replaceAll("#000", "#292621");
  const encoded = Buffer.from(recolored).toString("base64");
  const inset = 2;
  return `<image href="data:image/svg+xml;base64,${encoded}" x="${BOARD_X + column * SQUARE_SIZE + inset}" y="${BOARD_Y + row * SQUARE_SIZE + inset}" width="${SQUARE_SIZE - inset * 2}" height="${SQUARE_SIZE - inset * 2}"/>`;
};

const squares = [];
for (let row = 0; row < BOARD_SIZE; row += 1) {
  for (let column = 0; column < BOARD_SIZE; column += 1) {
    if (!isPlayable(column, row)) continue;
    const rank = BOARD_SIZE - 1 - row;
    const fill = (column + rank) % 2 === 0 ? "#b58863" : "#f0d9b5";
    squares.push(`<rect x="${BOARD_X + column * SQUARE_SIZE}" y="${BOARD_Y + row * SQUARE_SIZE}" width="${SQUARE_SIZE}" height="${SQUARE_SIZE}" fill="${fill}"/>`);
  }
}

const x0 = BOARD_X;
const y0 = BOARD_Y;
const s = SQUARE_SIZE;
const crossPath = [
  `M ${x0 + 3 * s} ${y0}`,
  `H ${x0 + 11 * s}`,
  `V ${y0 + 3 * s}`,
  `H ${x0 + 14 * s}`,
  `V ${y0 + 11 * s}`,
  `H ${x0 + 11 * s}`,
  `V ${y0 + 14 * s}`,
  `H ${x0 + 3 * s}`,
  `V ${y0 + 11 * s}`,
  `H ${x0}`,
  `V ${y0 + 3 * s}`,
  `H ${x0 + 3 * s}`,
  "Z",
].join(" ");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f7f5f1"/>
      <stop offset="0.6" stop-color="#eeece8"/>
      <stop offset="1" stop-color="#e3dfd8"/>
    </linearGradient>
    <radialGradient id="brandGlow" cx="0.18" cy="0.44" r="0.55">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="paper" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="7"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="table" tableValues="0 0.045"/></feComponentTransfer>
    </filter>
    <filter id="boardShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#3b3028" flood-opacity="0.28"/>
    </filter>
    <filter id="pieceShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.6" flood-color="#292621" flood-opacity="0.3"/>
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#background)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#brandGlow)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#paper)" opacity="0.42"/>
  <g aria-label="li4chess wordmark">
    <text x="70" y="412" font-family="Arial, Helvetica, sans-serif" font-size="136" font-weight="700" letter-spacing="-7">
      <tspan fill="#45413c">li</tspan><tspan fill="#397caa">4</tspan><tspan fill="#45413c">chess</tspan>
    </text>
    <text x="76" y="490" fill="#514b44" font-family="Arial, Helvetica, sans-serif" font-size="51" font-weight="500" letter-spacing="-1.5">${escapeXml("Free four-player chess")}</text>
    <g transform="translate(78 546)">
      <rect width="64" height="7" rx="3.5" fill="${colors.red}"/>
      <rect x="76" width="64" height="7" rx="3.5" fill="${colors.blue}"/>
      <rect x="152" width="64" height="7" rx="3.5" fill="${colors.yellow}"/>
      <rect x="228" width="64" height="7" rx="3.5" fill="${colors.green}"/>
    </g>
  </g>
  <g filter="url(#boardShadow)">
    <path d="${crossPath}" fill="#6d4f38" stroke="#4f3a2a" stroke-width="18" stroke-linejoin="round"/>
    ${squares.join("\n    ")}
    <path d="${crossPath}" fill="none" stroke="#5a402d" stroke-width="3" stroke-linejoin="round"/>
  </g>
  <g filter="url(#pieceShadow)">
    ${pieces.map(pieceImage).join("\n    ")}
  </g>
</svg>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const encodedSvg = Buffer.from(svg).toString("base64");
  await page.setContent(`<style>html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}img{display:block;width:${WIDTH}px;height:${HEIGHT}px}</style><img id="art" alt="" src="data:image/svg+xml;base64,${encodedSvg}">`);
  await page.waitForFunction(() => {
    const image = document.querySelector("#art");
    return image?.complete && image.naturalWidth > 0;
  });
  await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
} finally {
  await browser.close();
}

console.log(`Wrote ${outputPath}`);
console.log(`Verified ${playableSquareCount} playable squares, ${pieces.length} pieces, ${pawnCount} pawns, and ${JSON.stringify(inventory)}.`);
