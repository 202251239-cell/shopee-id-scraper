/**
 * Shopee Indonesia Product Search Scraper v2
 *
 * Strategy: Launch browser to get session cookies, then call Shopee API directly.
 * This bypasses anti-bot detection that blocks headless API-only requests.
 *
 * Shopee API: https://shopee.co.id/api/v4/search/search_items
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

/**
 * Build the Shopee API search URL with all filter parameters.
 */
function buildApiSearchUrl(input, newest = 0) {
  const { keyword, sortBy, sortByAsc, minPrice, maxPrice, officialShop, shopeeVerified, location } = input;
  const params = new URLSearchParams();
  params.set('by', sortBy || 'relevancy');
  params.set('limit', '60');
  params.set('newest', String(newest));
  params.set('order', sortByAsc ? 'asc' : 'desc');
  params.set('page_type', 'search');
  params.set('scenario', 'PAGE_GLOBAL_SEARCH');
  params.set('version', '2');
  if (keyword) params.set('keyword', keyword);
  if (minPrice && minPrice > 0) params.set('min_price', String(minPrice * 100000));
  if (maxPrice && maxPrice > 0) params.set('max_price', String(maxPrice * 100000));
  if (officialShop) params.set('official_shop', '1');
  if (shopeeVerified) params.set('shopee_verified', '1');
  if (location) params.set('city', location);
  // Add rating filter if needed
  return `https://shopee.co.id/api/v4/search/search_items?${params.toString()}`;
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

/* ──────────────────────────────────────────────
   Main crawler
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

log.info(`Starting Shopee Indonesia scrape: "${keyword}" (${maxPages} pages, minRating=${minRating})`);

const allProducts = [];
const seenIds = new Set();

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
      // Anti-detection: override navigator.webdriver
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        // Override chrome detection
        window.chrome = { runtime: {} };
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission })
            : originalQuery(parameters);
        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['id-ID', 'id', 'en-US', 'en'],
        });
      });
    },
  ],

  async requestHandler({ page, request }) {
    const currentPage = request.userData.page || 1;
    log.info(`Processing page ${currentPage}...`);

    // Step 1: Navigate to Shopee search page to get cookies
    const webUrl = `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}&page=${currentPage}`;
    log.info(`Navigating to: ${webUrl}`);

    try {
      await page.goto(webUrl, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (err) {
      log.warning(`Navigation timeout, continuing anyway: ${err.message}`);
    }

    // Wait a bit for JavaScript to execute and set cookies
    await page.waitForTimeout(3000);

    // Step 2: Extract cookies and use them to call API directly
    const cookies = await page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    log.info(`Got ${cookies.length} cookies from browser session`);

    // Step 3: Call Shopee search API directly from page context (uses browser's cookies/session)
    let apiProducts = [];
    try {
      // Use page.evaluate to make fetch calls from within the browser context
      // This automatically uses the browser's cookies and session
      apiProducts = await page.evaluate(async ({ keyword, page_num, sortBy, sortByAsc, minPrice, maxPrice, officialShop, shopeeVerified, location }) => {
        const results = [];
        const offset = (page_num - 1) * 60;
        const params = new URLSearchParams();
        params.set('by', sortBy || 'relevancy');
        params.set('limit', '60');
        params.set('newest', String(offset));
        params.set('order', sortByAsc ? 'asc' : 'desc');
        params.set('page_type', 'search');
        params.set('scenario', 'PAGE_GLOBAL_SEARCH');
        params.set('version', '2');
        if (keyword) params.set('keyword', keyword);
        if (minPrice && minPrice > 0) params.set('min_price', String(minPrice * 100000));
        if (maxPrice && maxPrice > 0) params.set('max_price', String(maxPrice * 100000));
        if (officialShop) params.set('official_shop', '1');
        if (shopeeVerified) params.set('shopee_verified', '1');
        if (location) params.set('city', location);

        const url = `https://shopee.co.id/api/v4/search/search_items?${params.toString()}`;

        try {
          const resp = await fetch(url, {
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
            },
          });
          const json = await resp.json();

          // Shopee wraps items as { items: [{item_basic: {...}, shop: {...}}, ...] }
          if (json && json.items && Array.isArray(json.items)) {
            return json.items;
          }
          // Try alternate: data.items
          if (json && json.data && json.data.items && Array.isArray(json.data.items)) {
            return json.data.items;
          }
          // Return the raw response for debugging
          return { _debug_keys: Object.keys(json || {}), _debug_raw: JSON.stringify(json).slice(0, 500) };
        } catch (fetchErr) {
          return { _error: fetchErr.message };
        }
      }, { keyword, page_num: currentPage, sortBy, sortByAsc, minPrice, maxPrice, officialShop, shopeeVerified, location });

      log.info(`API response type: ${typeof apiProducts}, is_array: ${Array.isArray(apiProducts)}`);

      if (Array.isArray(apiProducts)) {
        log.info(`Got ${apiProducts.length} products from API`);
        for (const item of apiProducts) {
          const product = normalizeProduct(item, { keyword, page: currentPage });
          if (product && !seenIds.has(product.productId)) {
            seenIds.add(product.productId);
            product.position = allProducts.length + 1;
            allProducts.push(product);
          }
        }
      } else {
        log.info(`API returned non-array: ${JSON.stringify(apiProducts).slice(0, 300)}`);
      }
    } catch (apiErr) {
      log.warning(`API call failed: ${apiErr.message}`);
    }

    // Step 4: Fallback — DOM extraction
    if (allProducts.length === 0) {
      log.info('No API products, trying DOM extraction...');
      try {
        const domProducts = await page.evaluate(({ keyword, page_num }) => {
          const results = [];
          // Wait for product cards to render
          const cards = document.querySelectorAll(
            '.shopee-search-item-result__item, [data-sqe="item"], .col-xs-2-4, li[data-item-id]'
          );
          if (cards.length === 0) {
            // Try broader selectors
            const links = document.querySelectorAll('a[href*="/product/"]');
            for (let i = 0; i < links.length; i++) {
              const link = links[i];
              const href = link.getAttribute('href') || '';
              const match = href.match(/\/product\/(\d+)\/(\d+)/);
              if (!match) continue;
              const shopId = parseInt(match[1]);
              const productId = parseInt(match[2]);
              const nameEl = link.querySelector('.line-clamp-2, .name, [class*="name"]') || link;
              const name = nameEl?.textContent?.trim() || '';
              if (!name) continue;
              const priceEl = link.closest('.col-xs-2-4, [data-sqe="item"]')?.querySelector('.price, [class*="price"]');
              const priceText = priceEl?.textContent?.trim() || '';
              const priceMatch = priceText.replace(/[^0-9]/g, '');
              results.push({
                itemid: productId,
                shopid: shopId,
                name,
                price: priceMatch ? parseInt(priceMatch) : 0,
                image: link.querySelector('img')?.src || '',
                _source: 'dom_links',
              });
            }
          } else {
            for (const card of cards) {
              const link = card.querySelector('a[href*="/product/"]') || card.querySelector('a');
              if (!link) continue;
              const href = link.getAttribute('href') || '';
              const match = href.match(/\/product\/(\d+)\/(\d+)/);
              if (!match) continue;
              const shopId = parseInt(match[1]);
              const productId = parseInt(match[2]);
              const name = (card.querySelector('.name, .line-clamp-2, [class*="name"]') || link).textContent?.trim() || '';
              if (!name) continue;
              const priceText = (card.querySelector('.price, [class*="price"]') || {}).textContent || '';
              const priceMatch = priceText.replace(/[^0-9]/g, '');
              results.push({
                itemid: productId,
                shopid: shopId,
                name,
                price: priceMatch ? parseInt(priceMatch) : 0,
                image: card.querySelector('img')?.src || '',
                _source: 'dom_cards',
              });
            }
          }
          return results;
        }, { keyword, page_num: currentPage });

        log.info(`DOM extraction found ${domProducts.length} products`);
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

    log.info(`Page ${currentPage}: total ${allProducts.length} products so far`);
  },

  async failedRequestHandler({ request }, error) {
    log.error(`Request failed: ${request.url} - ${error.message}`);
  },
});

// Build requests for all pages
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

// Assign final positions
filteredProducts.forEach((p, i) => { p.position = i + 1; });

log.info(`Scrape complete: ${filteredProducts.length} products`);
await Actor.pushData(filteredProducts);
await Actor.exit();
