/**
 * Shopee Indonesia Product Search Scraper
 *
 * Requires user-provided cookies from browser (standard for Shopee scrapers).
 * Shopee's anti-bot blocks server IPs; cookies from a real session bypass this.
 *
 * Usage: Provide keyword + cookie string from your browser.
 * How to get cookie: Open shopee.co.id → DevTools → Application → Cookies → copy all as string.
 */

import { Actor } from 'apify';
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
  if (ib.discount || item.discount) discountPercent = parseInt(ib.discount || item.discount, 10) || 0;
  if (originalPrice && price && originalPrice > price) {
    discount = originalPrice - price;
    if (!discountPercent && originalPrice > 0) discountPercent = Math.round((discount / originalPrice) * 100);
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
    historicalSold, sold, stock, categoryId, categoryName,
    itemType, likedCount, commentCount, isAd, flashSale, liked,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Call Shopee search API with user-provided cookies.
 * The cookies come from a real browser session, bypassing anti-bot.
 */
async function callShopeeApi(keyword, pageNum, cookieString, options = {}) {
  const offset = (pageNum - 1) * 60;
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

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}`,
    'X-Shopee-Language': 'id',
    'X-API-SOURCE': 'pc',
    'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'Cookie': cookieString,
  };

  log.info(`API call: page ${pageNum}, newest=${offset}`);

  const resp = await fetch(url, { headers });
  log.info(`API status=${resp.status}`);

  if (resp.status === 403) {
    log.error('API returned 403 — cookie may be expired. Please refresh your Shopee cookie.');
    return { items: [], error: 'COOKIE_EXPIRED' };
  }

  if (!resp.ok) {
    log.warning(`API returned ${resp.status}`);
    return { items: [], error: `HTTP_${resp.status}` };
  }

  const json = await resp.json();

  // Anti-bot error
  if (json.error !== undefined && json.error !== 0) {
    log.warning(`API error code: ${json.error}`);
    return { items: [], error: `API_${json.error}` };
  }

  // Standard response
  if (json.items && Array.isArray(json.items)) {
    return { items: json.items, total: json.total_count || json.items.length };
  }

  // Alt: data.items
  if (json.data?.items && Array.isArray(json.data.items)) {
    return { items: json.data.items, total: json.total_count || json.data.items.length };
  }

  log.info(`Unexpected shape: ${JSON.stringify(Object.keys(json)).slice(0, 200)}`);
  return { items: [], error: 'UNKNOWN_SHAPE' };
}

/* ──────────────────────────────────────────────
   Main
   ────────────────────────────────────────────── */

await Actor.init();

const input = await Actor.getInput();
const {
  keyword,
  cookie,
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
if (!cookie) throw new Error('Input "cookie" is required. Get it from your browser: shopee.co.id → DevTools → Application → Cookies → copy as string');

log.info(`Shopee scrape: "${keyword}" (${maxPages} pages, minRating=${minRating})`);

const allProducts = [];
const seenIds = new Set();
let cookieExpired = false;

for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
  if (cookieExpired) {
    log.warning(`Skipping page ${pageNum} — cookie expired`);
    break;
  }

  const result = await callShopeeApi(keyword, pageNum, cookie, {
    sortBy, sortByAsc, minPrice, maxPrice, officialShop, shopeeVerified, location,
  });

  if (result.error === 'COOKIE_EXPIRED') {
    cookieExpired = true;
    break;
  }

  if (result.items.length === 0) {
    log.info(`Page ${pageNum}: 0 items — stopping pagination`);
    break;
  }

  log.info(`Page ${pageNum}: ${result.items.length} items (total=${result.total})`);

  for (const item of result.items) {
    const product = normalizeProduct(item, { keyword, page: pageNum });
    if (product && !seenIds.has(product.productId)) {
      seenIds.add(product.productId);
      product.position = allProducts.length + 1;
      allProducts.push(product);
    }
  }

  // Delay between pages
  if (pageNum < maxPages) {
    const delay = 1000 + Math.random() * 2000;
    log.info(`Waiting ${Math.round(delay)}ms before next page...`);
    await new Promise(r => setTimeout(r, delay));
  }
}

// Post-fetch filters
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
