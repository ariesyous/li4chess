// Original li4chess board diagrams with the existing licensed Cburnett pieces.
// Run from apps/web: pnpm generate:guide-diagrams [--check]
import { createServer } from "vite";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true }, appType: "custom" });
try {
  const { guideDiagrams } = await server.ssrLoadModule("/src/content/guidePositions.ts");
  const { PLAYER_COLOR_HEX } = await server.ssrLoadModule("/@fs/" + fileURLToPath(new URL("../../../packages/ui-kit/src/theme.ts", import.meta.url)).replaceAll("\\", "/"));
  const { VALID_SQUARES, fileOf, rankOf } = await server.ssrLoadModule("/@fs/" + fileURLToPath(new URL("../../../packages/engine/src/index.ts", import.meta.url)).replaceAll("\\", "/"));
  const shapes = {};
  for (const type of ["K", "Q", "R", "B", "N", "P"]) {
    const source = await readFile(new URL(`../../../packages/ui-kit/src/assets/cburnett/w${type}.svg`, import.meta.url), "utf8");
    shapes[type] = source.slice(source.indexOf(">", source.indexOf("<svg")) + 1, source.lastIndexOf("</svg>"));
  }
  const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
  const output = new URL("../public/guide-diagrams/", import.meta.url);
  await mkdir(output, { recursive: true });
  for (const diagram of guideDiagrams) {
    const [minFile, maxFile, minRank, maxRank] = diagram.crop;
    const size = 44, inset = 40;
    const width = (maxFile - minFile + 1) * size + 2 * inset;
    const boardHeight = (maxRank - minRank + 1) * size;
    const height = boardHeight + 2 * inset + (diagram.seats ? 28 : 0);
    const x = square => inset + (fileOf(square) - minFile) * size;
    const y = square => inset + (maxRank - rankOf(square)) * size;
    const squares = VALID_SQUARES.filter(square => fileOf(square) >= minFile && fileOf(square) <= maxFile && rankOf(square) >= minRank && rankOf(square) <= maxRank);
    const markup = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">`,
      `<title id="title">${escape(diagram.title)}</title><desc id="description">${escape(diagram.description)}</desc>`,
      `<!-- Board and annotations: li4chess, AGPL-3.0-only. Piece shapes: Colin M. L. Burnett, GPL-2.0-or-later. See THIRD_PARTY_NOTICES.md. -->`,
      `<rect width="${width}" height="${height}" rx="4" fill="#eeece8"/>`,
      `<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#2d526c"/></marker></defs>`,
      ...squares.map(square => `<rect x="${x(square)}" y="${y(square)}" width="${size}" height="${size}" fill="${(fileOf(square) + rankOf(square)) % 2 === 0 ? "#b58863" : "#f0d9b5"}"/>`),
      ...diagram.highlights.map(square => `<rect x="${x(square) + 2}" y="${y(square) + 2}" width="${size - 4}" height="${size - 4}" fill="none" stroke="#286134" stroke-width="4"/>`),
      ...squares.flatMap(square => {
        const piece = diagram.state.board[square];
        return piece ? [`<svg x="${x(square) + 1}" y="${y(square) + 1}" width="${size - 2}" height="${size - 2}" viewBox="0 0 45 45">${shapes[piece.type].replaceAll("#fff", PLAYER_COLOR_HEX[piece.owner]).replaceAll("#000", "#292621")}</svg>`] : [];
      }),
      ...diagram.arrows.map(([from, to], index) => {
        const startX = x(from) + size / 2, startY = y(from) + size / 2;
        const dx = x(to) - x(from), dy = y(to) - y(from), length = Math.hypot(dx, dy);
        return `<path d="M${startX + dx / length * 15} ${startY + dy / length * 15}L${x(to) + size / 2 - dx / length * 12} ${y(to) + size / 2 - dy / length * 12}" fill="none" stroke="#2d526c" stroke-width="6" stroke-linecap="round" marker-end="url(#arrow)"/>`
          + (!diagram.seats && diagram.arrows.length > 1 ? `<g><circle cx="${startX + 18}" cy="${startY - 18}" r="12" fill="#faf9f7" stroke="#2d526c"/><text x="${startX + 18}" y="${startY - 13}" text-anchor="middle" font-family="Arial,sans-serif" font-size="15" fill="#302c27">${index + 1}</text></g>` : "");
      }),
      `<g font-family="Arial,sans-serif" font-size="15" fill="#514b44" text-anchor="middle">`,
      ...Array.from({ length: maxFile - minFile + 1 }, (_, i) => `<text x="${inset + (i + 0.5) * size}" y="${inset + boardHeight + 25}">${String.fromCharCode(97 + minFile + i)}</text>`),
      ...Array.from({ length: maxRank - minRank + 1 }, (_, i) => `<text x="20" y="${inset + (i + 0.5) * size + 5}">${maxRank - i + 1}</text>`),
      diagram.seats ? `<g font-size="20"><text x="${width / 2}" y="25">Yellow · 3</text><text x="${width / 2}" y="${height - 8}">Red · 1</text><text x="100" y="85">Blue · 2</text><text x="${width - 100}" y="${height - 100}">Green · 4</text></g>` : "",
      `</g></svg>\n`];
    const svg = markup.join("\n");
    const path = new URL(`${diagram.name}.svg`, output);
    if (process.argv.includes("--check")) {
      if (await readFile(path, "utf8") !== svg) throw new Error(`${diagram.name}.svg needs regeneration`);
    } else await writeFile(path, svg);
    process.stdout.write(`${diagram.name}: ${process.argv.includes("--check") ? "verified" : "generated"}\n`);
  }
} finally { await server.close(); }
