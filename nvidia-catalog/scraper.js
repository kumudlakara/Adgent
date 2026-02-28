/**
 * NVIDIA Marketplace Graphics Card Catalog Scraper
 *
 * Discovered API: https://api.nvidia.partners/edge/product/search
 * Parameters: page, limit, locale, category=GPU
 *
 * Tries direct API fetch first; falls back to browser-based interception
 * (real Chrome, non-headless) if the API blocks the request.
 *
 * Output: catalog.json ready for MCP consumption.
 */

import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://api.nvidia.partners/edge/product/search";
const MARKETPLACE_URL = "https://marketplace.nvidia.com/en-us/consumer/graphics-cards/";
const OUTPUT_FILE = join(__dirname, "catalog.json");

const PAGE_SIZE = 60; // largest accepted value by the API (15 / 30 / 60 are valid)
const LOCALE = "en-us";
const CATEGORY = "GPU";

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Normalize a raw API product item ────────────────────────────────────────

function normalizeProduct(raw) {
  // Parse price string like "$549.00" or "1999.0"
  const parsePrice = (v) => {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
    return isNaN(n) ? null : n;
  };

  // Convert productInfo array to a flat object: { gpu_memory_size: "12 GB", ... }
  const specMap = {};
  for (const entry of raw.productInfo ?? []) {
    if (entry.name && entry.value && entry.value !== "--") {
      specMap[entry.name] = entry.value;
    }
  }

  // Cheapest available retailer
  const retailers = (raw.retailers ?? []).map((r) => ({
    name: r.retailerName,
    logoUrl: r.logoUrl,
    price: parsePrice(r.salePrice),
    purchaseLink: r.purchaseLink,
    directPurchaseLink: r.directPurchaseLink,
    isAvailable: r.isAvailable,
    stock: r.stock,
    sku: r.sku,
    partnerId: r.partnerId,
  }));

  const availableRetailers = retailers.filter((r) => r.isAvailable && r.price != null);
  const lowestPrice =
    availableRetailers.length > 0 ? Math.min(...availableRetailers.map((r) => r.price)) : null;

  return {
    productId: raw.productID,
    sku: raw.productSKU,
    upc: raw.productUPCOriginal,
    title: raw.productTitle,
    displayName: raw.displayName,
    brand: raw.manufacturer,
    gpu: raw.gpu,
    category: raw.category,
    imageUrl: raw.imageURL,
    marketplaceUrl: raw.internalLink,
    msrp: parsePrice(raw.mrp),
    listPrice: parsePrice(raw.productPrice),
    lowestRetailPrice: lowestPrice,
    currency: "USD",
    availability: raw.prdStatus,
    isAvailable: raw.productAvailable,
    isFounderEdition: raw.isFounderEdition,
    isFeatured: raw.isFeaturedProduct,
    isBestSeller: raw.bestSeller,
    hasActiveOffer: raw.isOffer ?? false,
    offerText: raw.offerText,
    rating: raw.productRating,
    reviewCount: raw.customerReviewCount,
    specs: specMap,
    retailers,
  };
}

// ─── Direct API fetch (no browser) ───────────────────────────────────────────

async function fetchAllViaApi() {
  log("Attempting direct API fetch (no browser)...");

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://marketplace.nvidia.com/",
    Origin: "https://marketplace.nvidia.com",
  };

  // Probe page 1 to get total count
  const probeUrl = `${API_BASE}?page=1&limit=1&locale=${LOCALE}&category=${CATEGORY}`;
  log(`Probing: ${probeUrl}`);

  const probeRes = await fetch(probeUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!probeRes.ok) throw new Error(`API probe failed: ${probeRes.status}`);

  const probeJson = await probeRes.json();
  const totalCount = probeJson.searchedProducts?.productDetails?.[0]?.totalCount ?? null;
  log(`Total products reported by API: ${totalCount}`);

  // Fetch all pages
  const allProducts = [];
  let page = 1;

  while (true) {
    const url = `${API_BASE}?page=${page}&limit=${PAGE_SIZE}&locale=${LOCALE}&category=${CATEGORY}`;
    log(`Fetching page ${page}: ${url}`);

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`API request failed on page ${page}: ${res.status}`);

    const json = await res.json();
    const details = json.searchedProducts?.productDetails ?? [];

    if (details.length === 0) {
      log(`Page ${page} returned 0 items — done paginating.`);
      break;
    }

    allProducts.push(...details);
    log(`  Got ${details.length} products (total so far: ${allProducts.length})`);

    if (allProducts.length >= (totalCount ?? Infinity)) break;
    if (details.length < PAGE_SIZE) break;

    page++;
    await sleep(300); // be polite
  }

  return allProducts;
}

// ─── Browser-based fallback (intercept the XHR from real Chrome) ─────────────

async function fetchAllViaBrowser() {
  log("Falling back to browser-based API interception (real Chrome)...");

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
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // Intercept all JSON responses from the NVIDIA partners API
  const captured = []; // { page, data[] }

  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("api.nvidia.partners") && !url.includes("product/search")) return;
    const ct = response.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    try {
      const json = await response.json();
      const details = json.searchedProducts?.productDetails ?? json.productDetails ?? null;
      if (Array.isArray(details) && details.length > 0) {
        captured.push({ url, data: details });
        log(`  Intercepted ${details.length} products from ${url}`);
      }
    } catch {}
  });

  log(`Navigating to ${MARKETPLACE_URL}...`);
  await page.goto(MARKETPLACE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Scroll to trigger lazy loading / pagination XHRs
  await page.evaluate(async () => {
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, 600);
      await new Promise((r) => setTimeout(r, 300));
    }
  });
  await sleep(4000);

  await browser.close();

  if (captured.length === 0) throw new Error("Browser interception captured no API data.");

  // Merge all captured batches, de-duplicate by productID
  const seen = new Set();
  const all = [];
  for (const batch of captured) {
    for (const item of batch.data) {
      if (!seen.has(item.productID)) {
        seen.add(item.productID);
        all.push(item);
      }
    }
  }
  return all;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  let rawProducts;
  let method;

  try {
    rawProducts = await fetchAllViaApi();
    method = "direct-api";
  } catch (err) {
    log(`Direct API fetch failed: ${err.message}`);
    log("Switching to browser-based fallback...");
    rawProducts = await fetchAllViaBrowser();
    method = "browser-interception";
  }

  const products = rawProducts.map(normalizeProduct);

  // De-duplicate by productId just in case
  const seen = new Set();
  const unique = products.filter((p) => {
    if (seen.has(p.productId)) return false;
    seen.add(p.productId);
    return true;
  });

  const catalog = {
    metadata: {
      scrapedAt: new Date().toISOString(),
      source: MARKETPLACE_URL,
      apiEndpoint: API_BASE,
      method,
      totalProducts: unique.length,
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
