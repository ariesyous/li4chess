import { expect, test } from "@playwright/test";

const homepage = process.env.LI4CHESS_PREVIEW_BASE === "/" ? "/" : "/li4chess/";
const canonical = "https://li4chess.org/";

test("initial HTML includes descriptive content and consistent search metadata", async ({ request, page }) => {
  const response = await request.get(homepage);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/html");
  const html = await response.text();
  const document = await page.evaluate(source => {
    const parsed = new DOMParser().parseFromString(source, "text/html");
    const meta = (selector: string) => parsed.querySelector(selector)?.getAttribute("content");
    return {
      title: parsed.title,
      canonical: [...parsed.querySelectorAll('link[rel="canonical"]')].map(link => link.getAttribute("href")),
      description: meta('meta[name="description"]'),
      socialTitle: meta('meta[property="og:title"]'),
      socialDescription: meta('meta[property="og:description"]'),
      socialUrl: meta('meta[property="og:url"]'),
      twitterTitle: meta('meta[name="twitter:title"]'),
      twitterDescription: meta('meta[name="twitter:description"]'),
      information: parsed.querySelector("#site-information")?.textContent,
      informationInApp: parsed.querySelector("#root #site-information") !== null,
      noScript: parsed.querySelector("noscript")?.textContent,
    };
  }, html);
  expect(document.title).toMatch(/4 player chess/i);
  expect(document.title).toContain("li4chess");
  expect(document.canonical).toEqual([canonical]);
  expect(document.description).toMatch(/chess/i);
  expect(document.description).toMatch(/computer/i);
  expect(document.socialTitle).toBe(document.title);
  expect(document.twitterTitle).toBe(document.title);
  expect(document.socialDescription).toBe(document.description);
  expect(document.twitterDescription).toBe(document.description);
  expect(document.socialUrl).toBe(canonical);
  expect(document.informationInApp).toBe(false);
  expect(document.information).toMatch(/four.player chess/i);
  expect(document.information).toMatch(/computer/i);
  expect(document.information).toMatch(/same device/i);
  expect(document.information).toMatch(/points/i);
  expect(document.information).toMatch(/sav/i);
  expect(document.noScript).toMatch(/JavaScript/i);
});

test("crawl files allow the public site and list only the canonical homepage", async ({ request, page }) => {
  const robotsResponse = await request.get(`${homepage}robots.txt`);
  expect(robotsResponse.ok()).toBe(true);
  expect(robotsResponse.headers()["content-type"]).toContain("text/plain");
  const robots = await robotsResponse.text();
  expect(robots).toMatch(/^User-agent:\s*\*\s*$/im);
  expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/im);
  expect(robots).toMatch(/^Sitemap:\s*https:\/\/li4chess\.org\/sitemap\.xml\s*$/im);

  const sitemapResponse = await request.get(`${homepage}sitemap.xml`);
  expect(sitemapResponse.ok()).toBe(true);
  expect(sitemapResponse.headers()["content-type"]).toMatch(/(?:application|text)\/xml/);
  const sitemap = await page.evaluate(source => {
    const parsed = new DOMParser().parseFromString(source, "application/xml");
    return {
      invalid: parsed.querySelector("parsererror") !== null,
      root: parsed.documentElement.localName,
      namespace: parsed.documentElement.namespaceURI,
      locations: [...parsed.querySelectorAll("url > loc")].map(location => location.textContent?.trim()),
    };
  }, await sitemapResponse.text());
  expect(sitemap).toEqual({
    invalid: false,
    root: "urlset",
    namespace: "http://www.sitemaps.org/schemas/sitemap/0.9",
    locations: [canonical],
  });
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("site information and the game requirement remain readable", async ({ page }) => {
    await page.goto(homepage);
    await expect(page.locator("#site-information")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Free four-player chess in your browser" })).toBeVisible();
    await expect(page.locator(".javascript-notice")).toBeVisible();
    await expect(page.locator(".javascript-notice")).toContainText(/Enable JavaScript to play/i);
    await expect(page.locator("#site-information")).toContainText(/same device/i);
  });
});

for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 360, 800]] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } });
    test("setup information fits the viewport and stays out of an active game", async ({ page }, info) => {
      await page.goto(homepage);
      const information = page.locator("#site-information");
      const play = page.getByRole("button", { name: "Play against computers", exact: true });
      await expect(information).toBeVisible();
      await expect(play).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${name}-seo-setup.png`), fullPage: true });

      await play.click();
      await expect(page.getByTestId("turn-status")).toContainText("Your turn");
      await expect(information).toBeHidden();
      await page.getByRole("button", { name: "New game", exact: true }).click();
      await expect(information).toBeVisible();
      await expect(play).toBeVisible();
    });
  });
}
