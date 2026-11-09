import { expect, test } from "@playwright/test";

const base = process.env.LI4CHESS_PREVIEW_BASE === "/" ? "/" : "/li4chess/";
const pages = [
  ["learn/how-to-play-four-player-chess/", "How to play four-player chess"],
  ["learn/four-player-chess-strategy/", "Four-player chess strategy for beginners"],
  ["about/", "About li4chess"],
  ["privacy/", "Privacy on li4chess"],
] as const;

for (const [path, heading] of pages) {
  test(`${path} serves complete static content, metadata and working local links`, async ({ page, request }) => {
    const response = await request.get(`${base}${path}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("text/html");
    const source = await response.text();
    expect(source).toContain(heading);
    expect(source).not.toContain("%BASE_URL%");
    const document = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const meta = (selector: string) => doc.querySelector(selector)?.getAttribute("content");
      return {
        title: doc.title, description: meta('meta[name="description"]'),
        canonical: [...doc.querySelectorAll('link[rel="canonical"]')].map(link => link.getAttribute("href")),
        ogTitle: meta('meta[property="og:title"]'), ogDescription: meta('meta[property="og:description"]'),
        ogUrl: meta('meta[property="og:url"]'), twitterTitle: meta('meta[name="twitter:title"]'),
        twitterDescription: meta('meta[name="twitter:description"]'),
        text: doc.querySelector("main")?.textContent, mainCount: doc.querySelectorAll("main").length,
        headingCount: doc.querySelectorAll("h1").length,
        appScripts: [...doc.querySelectorAll("script[src]")].filter(script => !script.getAttribute("src")!.includes("/@vite/client")).length,
        links: [...doc.querySelectorAll("a[href]")].map(link => link.getAttribute("href")!),
        images: [...doc.querySelectorAll("img")].map(img => ({ src: img.getAttribute("src")!, alt: img.alt })),
        ids: [...doc.querySelectorAll("[id]")].map(element => element.id),
      };
    }, source);
    expect(document.title).toContain("li4chess");
    expect(document.description!.length).toBeGreaterThan(70);
    expect(document.ogTitle).toBe(document.title);
    expect(document.twitterTitle).toBe(document.title);
    expect(document.ogDescription).toBe(document.description);
    expect(document.twitterDescription).toBe(document.description);
    expect(document.canonical).toEqual([`https://li4chess.org/${path}`]);
    expect(document.ogUrl).toBe(document.canonical[0]);
    expect(document.mainCount).toBe(1);
    expect(document.headingCount).toBe(1);
    expect(document.appScripts).toBe(0);
    expect(document.text!.length).toBeGreaterThan(2000);
    expect(new Set(document.ids).size).toBe(document.ids.length);
    for (const href of new Set(document.links)) {
      if (href.startsWith("#")) expect(document.ids).toContain(href.slice(1));
      else if (!href.startsWith("https://")) {
        expect(href.startsWith(base)).toBe(true);
        const linked = await request.get(href);
        expect(linked.ok(), href).toBe(true);
        expect(linked.headers()["content-type"], href).toContain("text/html");
      }
    }
    for (const image of document.images) {
      expect(image.alt.length).toBeGreaterThan(40);
      expect(image.src.startsWith(base)).toBe(true);
      const asset = await request.get(image.src);
      expect(asset.ok()).toBe(true);
      expect(asset.headers()["content-type"]).toContain("image/svg+xml");
      expect(await asset.text()).toContain("<desc");
    }
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const [path, heading] of pages) {
    test(`${path} remains readable on a direct load`, async ({ page }) => {
      await page.goto(`${base}${path}`);
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Feedback / report a bug", exact: true })).toBeVisible();
      expect(await page.locator("img").evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0))).toBe(true);
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "About", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("About li4chess");
      await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Privacy on li4chess");
    });
  }
});

for (const [device, width, height] of [["desktop", 1440, 1000], ["phone", 360, 800]] as const) {
  test.describe(device, () => {
    test.use({ viewport: { width, height } });
    test("information pages fit, support keyboard navigation and lead back to play", async ({ page }, info) => {
      for (const [path, heading] of pages) {
        await page.goto(`${base}${path}`);
        await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();
        await page.getByRole("main").evaluate(element => element.blur());
        for (const image of await page.locator("img").all()) {
          expect((await image.boundingBox())!.width).toBeLessThanOrEqual(width);
        }
        await page.screenshot({ path: info.outputPath(`${device}-${path.replaceAll("/", "-")}.png`), fullPage: true });
      }
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "How to play", exact: true }).click();
      await page.getByRole("navigation", { name: "On this page" }).getByRole("link", { name: "Points & placements", exact: true }).click();
      await expect(page).toHaveURL(/#scoring$/);
      await expect(page.getByRole("heading", { name: "Score points, then compare the final totals" })).toBeInViewport();
      await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Play", exact: true }).click();
      const play = page.getByRole("button", { name: "Play against computers", exact: true });
      await expect(play).toBeInViewport();
      await page.getByRole("navigation", { name: "Learn and about li4chess" }).getByRole("link", { name: "Beginner strategy" }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(pages[1][1]);
      await page.getByRole("link", { name: "Try a game", exact: true }).click();
      await play.click();
      await expect(page.getByTestId("turn-status")).toContainText("Your turn");
      await expect(page.getByRole("main").locator(".app-footer").getByRole("link", { name: "Privacy", exact: true })).toBeVisible();
      await expect(page.getByRole("main").locator(".app-footer").getByRole("link", { name: "Feedback / report a bug", exact: true })).toBeVisible();
    });
  });
}
