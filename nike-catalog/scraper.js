/**
 * Nike Men's Shoes Catalog Scraper
 *
 * Target: https://www.nike.com/gb/w/mens-shoes-nik1zy7ok
 *
 * Nike serves the initial product grid via SSR in __NEXT_DATA__:
 *   __NEXT_DATA__.props.pageProps.initialState.Wall.productGroupings
 *
 * Subsequent pages are fetched via the internal API discovered from
 *   Wall.pageData.next → https://api.nike.com/discover/product_wall/v1/…
 *
 * Strategy:
 *   1. Launch real Chrome, load page 1, extract SSR data + the "next" URL.
 *   2. Use page.evaluate(fetch(…)) to paginate through the API (inherits
 *      cookies/headers from the browser session).
 *   3. Normalize all products and write catalog.json.
 *
 * Output: catalog.json  (same shape as nvidia-catalog/catalog.json)
 */

import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const STOREFRONT_URL = "https://www.nike.com/gb/w/mens-shoes-nik1zy7ok";
const API_HOST = "https://api.nike.com";
const OUTPUT_FILE = join(__dirname, "catalog.json");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Extract Wall data from the current page's __NEXT_DATA__ ─────────────────

async function extractWallData(page) {
  return page.evaluate(() => {
    const el = document.getElementById("__NEXT_DATA__");
    if (!el) return null;
    try {
      const data = JSON.parse(el.textContent);
      return data.props?.pageProps?.initialState?.Wall ?? null;
    } catch {
      return null;
    }
  });
}

// ─── Normalize a product from Wall.productGroupings ──────────────────────────

function normalizeProduct(grouping) {
  const product = grouping.products?.[0];
  if (!product) return null;

  const prices = product.prices ?? {};
  const copy = product.copy ?? {};
  const colors = product.displayColors ?? {};

  // All colorway variants from the grouping
  const colorways = (grouping.products ?? []).map((p) => ({
    productCode:      p.productCode ?? null,
    colorDescription: p.displayColors?.colorDescription ?? null,
    simpleColor:      p.displayColors?.simpleColor?.label ?? null,
    imageUrl:         p.colorwayImages?.portraitURL ?? p.colorwayImages?.squarishURL ?? null,
    currentPrice:     p.prices?.currentPrice ?? null,
    fullPrice:        p.prices?.initialPrice ?? null,
    isOnSale:         (p.prices?.discountPercentage ?? 0) > 0,
    productUrl:       p.pdpUrl?.url ?? null,
  }));

  return {
    groupKey:         product.groupKey ?? null,
    productCode:      product.productCode ?? null,
    globalProductId:  product.globalProductId ?? null,
    title:            copy.title ?? null,
    subtitle:         copy.subTitle ?? null,
    brand:            "Nike",
    category:         "Shoes",
    gender:           "Men",
    productType:      product.productType ?? null,
    colorDescription: colors.colorDescription ?? null,
    simpleColor:      colors.simpleColor?.label ?? null,
    imageUrl:         product.colorwayImages?.portraitURL
                        ?? product.colorwayImages?.squarishURL
                        ?? null,
    productUrl:       product.pdpUrl?.url ?? null,
    currentPrice:     prices.currentPrice ?? null,
    fullPrice:        prices.initialPrice ?? null,
    currency:         prices.currency ?? "GBP",
    isOnSale:         (prices.discountPercentage ?? 0) > 0,
    discountPercent:  prices.discountPercentage ?? 0,
    isCustomizable:   product.customization != null,
    badge:            product.badgeLabel ?? null,
    totalColorways:   colorways.length,
    colorways,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("Launching browser...");

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-GB",
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // ── Load page 1: get SSR data + pagination "next" URL ─────────────────────

  log(`Navigating to ${STOREFRONT_URL}...`);
  await page.goto(STOREFRONT_URL, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("#__NEXT_DATA__", { state: "attached", timeout: 15000 });
  await sleep(2000);

  // Extract SSR data BEFORE dismissing cookie consent (which can trigger a reload)
  const firstWall = await extractWallData(page);
  if (!firstWall || !firstWall.productGroupings?.length) {
    await browser.close();
    throw new Error("Could not extract Wall data from __NEXT_DATA__ on page 1.");
  }

  // Dismiss cookie consent if it appears
  try {
    const acceptBtn = page.locator(
      'button:has-text("Accept All"), button:has-text("Accept Cookies"), button:has-text("Accept")'
    );
    if (await acceptBtn.first().isVisible({ timeout: 3000 })) {
      await acceptBtn.first().click();
      log("Dismissed cookie consent banner.");
      await sleep(2000);
    }
  } catch {}

  const totalPages = firstWall.pageData?.totalPages ?? 1;
  const totalResources = firstWall.pageData?.totalResources ?? null;
  let nextPath = firstWall.pageData?.next ?? null;

  log(`Page 1: ${firstWall.productGroupings.length} groupings, ` +
      `totalPages=${totalPages}, totalResources=${totalResources}`);

  const allGroupings = [...firstWall.productGroupings];

  // ── Paginate via the internal API ──────────────────────────────────────────

  let pageNum = 2;
  while (nextPath) {
    const apiUrl = `${API_HOST}${nextPath}`;
    log(`Fetching page ${pageNum}/${totalPages}: ${apiUrl.substring(0, 120)}...`);

    let result = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url, {
            headers: { "nike-api-caller-id": "com.nike.commerce.nikedotcom.web" },
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            return { error: res.status, body: body.substring(0, 300) };
          }
          return await res.json();
        } catch (e) {
          return { error: e.message };
        }
      }, apiUrl);

      if (!result.error) break;

      log(`  Attempt ${attempt}/3 failed: ${result.error} ${result.body ?? ""}`);
      if (attempt < 3) {
        const backoff = attempt * 3000;
        log(`  Retrying in ${backoff}ms...`);
        await sleep(backoff);
      }
    }

    if (result.error) {
      log(`  API failed after 3 attempts — stopping pagination.`);
      break;
    }

    const groupings = result.productGroupings ?? [];
    // API uses "pages" (SSR uses "pageData")
    const pageData = result.pages ?? result.pageData ?? {};

    if (groupings.length === 0) {
      log(`  Page ${pageNum} returned 0 groupings — done.`);
      break;
    }

    allGroupings.push(...groupings);
    log(`  Got ${groupings.length} groupings (total so far: ${allGroupings.length})`);

    nextPath = pageData.next || null;
    pageNum++;
    await sleep(1000);
  }

  await browser.close();

  // ── Normalize & deduplicate ────────────────────────────────────────────────

  const products = allGroupings
    .map(normalizeProduct)
    .filter(Boolean);

  const seen = new Set();
  const unique = products.filter((p) => {
    const key = p.productCode ?? p.globalProductId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const catalog = {
    metadata: {
      scrapedAt:      new Date().toISOString(),
      source:         STOREFRONT_URL,
      apiEndpoint:    `${API_HOST}/discover/product_wall/v1/`,
      method:         "browser-ssr-extraction",
      totalPages,
      totalProducts:  unique.length,
    },
    products: unique,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(catalog, null, 2));
  log(`Done. ${unique.length} products written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
