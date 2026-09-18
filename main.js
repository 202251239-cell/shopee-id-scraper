/**
 * Shopee Indonesia Product Search Scraper v3
 *
 * Strategy: Launch browser → extract cookies → make API calls from Node.js (not browser context).
 * Shopee detects fetch() inside headless browser, but external HTTP calls with valid cookies work.
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { log } from 'crawlee';

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function toIDR(shopeePrice) {
  if (shopeePrice === null || shopeePrice === undefined || shopeePrice === '') return null;
  if (typeof shopeePrice === 'number') return Math.round(shopeePrice / 100000);
  if (typeof shopeePrice === 'string') {
    const cleaned = shopeePrice.replace(/[^0-9]/g, '');
    if (cleaned) return Math.round(parseInt(cleaned, 10) / 100000) || null;
  }
  return null;
}

function formatPriceText(idr) {
  if (!idr) return null;
  return `Rp${idr.toLocaleString('id-ID')}`;
}

function normalizeProduct(item, ctx = {}) {
  if (!item) return null;
  const ib = item.item_basic || item;
  const shop = item.shop || {};
  const productId = ib.itemid || item.itemid || null;
  const name = ib.name || item.name || null;
  if (!name) return null;
  const price = toIDR(ib.price || item.price);
  const priceMin = toIDR(ib.price_min || item.price_min);
  const priceMax = toIDR(ib.price_max || item.price_max);
  let originalPrice = toIDR(ib.price_before_discount || item.price_before_discount);
  let discount = null;
  let discountPercent = 0;
  if (ib.discount || item.discount) {
    discountPercent = parseInt(ib.discount || item.discount, 10) || 0;
  }
  if (originalPrice && price && originalPrice > price) {
    discount = originalPrice - price;
    if (!discountPercent && originalPrice > 0) {
      discountPercent = Math.round((discount / originalPrice) * 100);
    }
  }
  if (!originalPrice && discount && price) originalPrice = price + discount;
  const image = ib.image || item.image || null;
  const imageUrl = image ? `https://cf.shopee.co.id/file/${image}` : null;
  const images = ib.images || item.images || [];
  const imageUrls = Array.isArray(images) ? images.map(img => `https://cf.shopee.co.id/file/${img}`) : [];
  const shopId = ib.shopid || item.shopid || shop.shopid || null;
  const url = (productId && shopId) ? `https://shopee.co.id/product/${shopId}/${productId}` : null;
  const shopName = shop.name || ib.shop_name || null;
  const shopUrl = shopId ? `https://shopee.co.id/shop/${shopId}` : null;
  const shopCity = shop.city || ib.shop_city || null;
  const shopRating = shop.shop_rating || ib.shop_rating || null;
  const responseRate = shop.response_rate || ib.response_rate || null;
  const responseTime = shop.response_time || ib.response_time || null;
  const followerCount = shop.follower_count || ib.follower_count || null;
  const isOfficialShop = !!(ib.shopee_verified || shop.is_official_shop || item.is_official_shop);
  const isShopeeVerified = !!(shop.shopee_verified || ib.shopee_verified || item.shopee_verified);
  const itemRating = ib.item_rating || item.item_rating || {};
  const ratingStar = itemRating.rating_star || 0;
  const ratingCount = itemRating.rating_count || [];
  const reviewCount = Array.isArray(ratingCount) ? ratingCount.reduce((sum, r) => sum + (parseInt(r, 10) || 0), 0) : 0;
  const historicalSold = ib.historical_sold || item.historical_sold || null;
  const sold = ib.sold || item.sold || null;
  const stock = ib.stock || item.stock || null;
  const categoryId = ib.catid || item.catid || null;
  const categoryName = ib.cat_name || item.cat_name || null;
  const itemType = ib.item_type || item.item_type || null;
  const likedCount = ib.liked_count || item.liked_count || null;
  const commentCount = ib.comment_count || item.comment_count || null;
  const isAd = !!(ib.is_ad || item.is_ad || item.adid);
  const flashSale = !!(ib.flash_sale || item.flash_sale);
  const liked = !!(ib.liked || item.liked);

  return {
    keyword: ctx.keyword || null, page: ctx.page || null, position: ctx.position || null,
    productId, name, price, priceText: formatPriceText(price), priceMin, priceMax,
    originalPrice, discount, discountPercent, currency: 'IDR',
    imageUrl, imageUrls, url,
    shopId, shopName, shopUrl, shopCity, shopRating, responseRate, responseTime,
    followerCount, isOfficialShop, isShopeeVerified,
    rating: ratingStar, ratingStar, reviewCount,
    historicalSold, sold, stock,
    categoryId, categoryName,
    itemType, likedCount, commentCount, isAd, flashSale, liked,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Call Shopee search API from Node.js using cookies extracted from browser.
 * This avoids headless browser detection since the request comes from Node.js.
 */
async function callShopeeApi(keyword, page_num, cookies, options = {}) {
  const offset = (page_num - 1) * 60;
  const params = new URLSearchParams();
  params.set('by', options.sortBy || 'relevancy');
  params.set('limit', '60');
  params.set('newest', String(offset));
  params.set('order', options.sortByAsc ? 'asc' : 'desc');
  params.set('page_type', 'search');
  params.set('scenario', 'PAGE_GLOBAL_SEARCH');
  params.set('version', '2');
  if (keyword) params.set('keyword', keyword);
  if (options.minPrice && options.minPrice > 0) params.set('min_price', String(options.minPrice * 100000));
  if (options.maxPrice && options.maxPrice > 0) params.set('max_price', String(options.maxPrice * 100000));
  if (options.officialShop) params.set('official_shop', '1');
  if (options.shopeeVerified) params.set('shopee_verified', '1');
  if (options.location) params.set('city', options.location);

  const url = `https://shopee.co.id/api/v4/search/search_items?${params.toString()}`;

  // Convert cookie array to string
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}`,
    'Cookie': cookieStr,
    'X-Requested-With': 'XMLHttpRequest',
  };

  log.info(`Calling API: ${url.slice(0, 120)}...`);

  const resp = await fetch(url, { headers });
  const contentType = resp.headers.get('content-type') || '';
  log.info(`API response status=${resp.status} content-type=${contentType}`);

  if (!resp.ok) {
    log.warning(`API returned status ${resp.status}`);
    return [];
  }

  const json = await resp.json();
  const keys = Object.keys(json || {});
  log.info(`API response keys: ${JSON.stringify(keys)}`);

  // Check for anti-bot error
  if (json.error !== undefined && json.error !== 0) {
    log.warning(`API error: ${json.error}`);
    // Dump first few numeric keys for debugging
    for (const k of keys.slice(0, 5)) {
      log.info(`  key="${k}" value=${JSON.stringify(json[k])?.slice(0, 100)}`);
    }
    return [];
  }

  // Standard response: { items: [...], total_count: N }
  if (json.items && Array.isArray(json.items)) {
    return json.items;
  }

  // Alternate: { data: { items: [...] } }
  if (json.data?.items && Array.isArray(json.data.items)) {
    return json.data.items;
  }

  log.info(`Unexpected response shape, keys: ${JSON.stringify(keys)}`);
  return [];
}

/* ──────────────────────────────────────────────
   Main
   ────────────────────────────────────────────── */

await Actor.init();

const input = await Actor.getInput();
const {
  keyword,
  maxPages = 1,
  minRating = 0,
  sortBy = 'relevancy',
  sortByAsc = false,
  minPrice = 0,
  maxPrice = 0,
  officialShop = false,
  shopeeVerified = false,
  location = '',
} = input;

if (!keyword) throw new Error('Input "keyword" is required');

log.info(`Starting Shopee scrape: "${keyword}" (${maxPages} pages, minRating=${minRating})`);

const allProducts = [];
const seenIds = new Set();

// Step 1: Use browser to get cookies
let browserCookies = [];

const crawler = new PlaywrightCrawler({
  maxConcurrency: 1,
  headless: true,
  navigationTimeoutSecs: 45,
  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },
  preNavigationHooks: [
    async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['id-ID', 'id', 'en-US', 'en'] });
      });
    },
  ],
  async requestHandler({ page, request }) {
    const currentPage = request.userData.page || 1;
    log.info(`Processing page ${currentPage}...`);

    // Navigate to Shopee homepage first to establish session
    if (currentPage === 1) {
      log.info('Navigating to Shopee homepage to establish session...');
      try {
        await page.goto('https://shopee.co.id/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      } catch (err) {
        log.warning(`Homepage navigation: ${err.message}`);
      }
    }

    // Navigate to search page
    const webUrl = `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}&page=${currentPage}`;
    log.info(`Navigating to: ${webUrl}`);

    try {
      await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (err) {
      log.warning(`Search page navigation: ${err.message}`);
    }

    // Wait for page to load and cookies to be set
    await page.waitForTimeout(5000);

    // Extract all cookies
    browserCookies = await page.context().cookies();
    log.info(`Got ${browserCookies.length} cookies`);

    // Now make API call from Node.js context using these cookies
    const apiOptions = { sortBy, sortByAsc, minPrice, maxPrice, officialShop, shopeeVerified, location };
    const apiItems = await callShopeeApi(keyword, currentPage, browserCookies, apiOptions);

    if (apiItems.length > 0) {
      log.info(`Got ${apiItems.length} items from API`);
      for (const item of apiItems) {
        const product = normalizeProduct(item, { keyword, page: currentPage });
        if (product && !seenIds.has(product.productId)) {
          seenIds.add(product.productId);
          product.position = allProducts.length + 1;
          allProducts.push(product);
        }
      }
    } else {
      log.info('API returned 0 items, trying DOM extraction...');
      // Fallback: wait longer and try DOM
      await page.waitForTimeout(5000);
      try {
        const domProducts = await page.evaluate(() => {
          const results = [];
          const cards = document.querySelectorAll('.shopee-search-item-result__item, [data-sqe="item"], .col-xs-2-4');
          for (const card of cards) {
            const link = card.querySelector('a[href*="/product/"]') || card.querySelector('a');
            if (!link) continue;
            const href = link.getAttribute('href') || '';
            const match = href.match(/\/product\/(\d+)\/(\d+)/);
            if (!match) continue;
            const shopId = parseInt(match[1]);
            const productId = parseInt(match[2]);
            const name = (card.querySelector('.name, .line-clamp-2') || link).textContent?.trim() || '';
            if (!name) continue;
            const priceText = (card.querySelector('.price') || {}).textContent || '';
            const priceMatch = priceText.replace(/[^0-9]/g, '');
            results.push({
              itemid: productId, shopid: shopId, name,
              price: priceMatch ? parseInt(priceMatch) : 0,
              image: card.querySelector('img')?.src || '',
            });
          }
          return results;
        });

        log.info(`DOM found ${domProducts.length} products`);
        for (const item of domProducts) {
          const product = normalizeProduct(item, { keyword, page: currentPage });
          if (product && !seenIds.has(product.productId)) {
            seenIds.add(product.productId);
            product.position = allProducts.length + 1;
            allProducts.push(product);
          }
        }
      } catch (domErr) {
        log.warning(`DOM extraction failed: ${domErr.message}`);
      }
    }

    log.info(`Page ${currentPage}: total ${allProducts.length} products`);
  },
  failedRequestHandler({ request }, error) {
    log.error(`Request failed: ${request.url} - ${error.message}`);
  },
});

// Build requests
const requests = [];
for (let page = 1; page <= maxPages; page++) {
  requests.push({ url: `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}&page=${page}`, userData: { page } });
}
await crawler.addRequests(requests);
await crawler.run();

// Apply post-fetch filters
let filteredProducts = allProducts;
if (minRating > 0) {
  const before = filteredProducts.length;
  filteredProducts = filteredProducts.filter(p => (p.rating || 0) >= minRating);
  const skipped = before - filteredProducts.length;
  if (skipped > 0) log.info(`Filtered out ${skipped} products with rating < ${minRating}`);
}

filteredProducts.forEach((p, i) => { p.position = i + 1; });

log.info(`Scrape complete: ${filteredProducts.length} products`);
await Actor.pushData(filteredProducts);
await Actor.exit();
