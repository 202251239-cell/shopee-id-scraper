/**
 * Shopee Indonesia Product Search Scraper v1
 *
 * Intercepts REST API responses from Shopee's internal search API
 * instead of parsing DOM. Much more reliable and faster.
 *
 * Shopee API: shopee.co.id/api/v4/search/search_items
 * Response format: { items: [{ item_basic: {...}, shop: {...} }], total_count: N }
 */

import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';
import { log } from 'crawlee';

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

/**
 * Build the Shopee search URL with all filter parameters.
 */
function buildSearchUrl(input) {
  const { keyword, sortBy, sortByAsc, minPrice, maxPrice, officialShop, shopeeVerified, location } = input;
  const params = new URLSearchParams();

  params.set('keyword', keyword || '');

  // Sort parameters
  if (sortBy && sortBy !== 'relevancy') {
    params.set('sort_by', sortBy);
    params.set('order', sortByAsc ? 'desc' : 'asc');
  }

  // Price filters
  if (minPrice && minPrice > 0) params.set('min_price', String(minPrice));
  if (maxPrice && maxPrice > 0) params.set('max_price', String(maxPrice));

  // Official shop filter
  if (officialShop) params.set('official_shop', '1');

  // Shopee verified filter
  if (shopeeVerified) params.set('shopee_verified', '1');

  // Location filter
  if (location) params.set('city', location);

  return `https://shopee.co.id/search?${params.toString()}`;
}

/**
 * Convert Shopee's cent-based pricing to IDR integer.
 * Shopee API returns prices as price * 100000 (5 decimal places).
 */
function toIDR(shopeePrice) {
  if (shopeePrice === null || shopeePrice === undefined || shopeePrice === '') return null;
  if (typeof shopeePrice === 'number') {
    // Shopee stores prices with 5 decimal places of precision
    return Math.round(shopeePrice / 100000);
  }
  // If it's a string, try to parse
  if (typeof shopeePrice === 'string') {
    const cleaned = shopeePrice.replace(/[^0-9]/g, '');
    if (cleaned) return Math.round(parseInt(cleaned, 10) / 100000) || null;
  }
  return null;
}

/**
 * Format IDR price to display string: Rp24.900
 */
function formatPriceText(idr) {
  if (!idr) return null;
  return `Rp${idr.toLocaleString('id-ID')}`;
}

/**
 * Extract product data from a single Shopee API item.
 * Shopee wraps each product as { item_basic: {...}, shop: {...} }
 */
function normalizeProduct(item, ctx = {}) {
  if (!item) return null;

  const ib = item.item_basic || item;
  const shop = item.shop || {};

  // Product identity
  const productId = ib.itemid || item.itemid || null;
  const name = ib.name || item.name || null;

  if (!name) return null; // skip items without a name

  // Pricing — Shopee returns prices in cents (×100000)
  const price = toIDR(ib.price || item.price);
  const priceMin = toIDR(ib.price_min || item.price_min);
  const priceMax = toIDR(ib.price_max || item.price_max);

  // Original price (before discount)
  let originalPrice = toIDR(ib.price_before_discount || item.price_before_discount);

  // Discount
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

  // If we have originalPrice but no price, or vice versa, compute what we can
  if (!originalPrice && discount && price) {
    originalPrice = price + discount;
  }

  // Image
  const image = ib.image || item.image || null;
  const imageUrl = image ? `https://cf.shopee.co.id/file/${image}` : null;

  // Images array
  const images = ib.images || item.images || [];
  const imageUrls = Array.isArray(images)
    ? images.map(img => `https://cf.shopee.co.id/file/${img}`)
    : [];

  // Product URL
  const shopId = ib.shopid || item.shopid || shop.shopid || null;
  const url = (productId && shopId)
    ? `https://shopee.co.id/product/${shopId}/${productId}`
    : null;

  // Shop info
  const shopName = shop.name || ib.shop_name || null;
  const shopUrl = shopId ? `https://shopee.co.id/shop/${shopId}` : null;
  const shopCity = shop.city || ib.shop_city || null;
  const shopRating = shop.shop_rating || ib.shop_rating || null;
  const responseRate = shop.response_rate || ib.response_rate || null;
  const responseTime = shop.response_time || ib.response_time || null;
  const followerCount = shop.follower_count || ib.follower_count || null;
  const isOfficialShop = !!(ib.shopee_verified || shop.is_official_shop || item.is_official_shop);
  const isShopeeVerified = !!(shop.shopee_verified || ib.shopee_verified || item.shopee_verified);

  // Rating
  const itemRating = ib.item_rating || item.item_rating || {};
  const ratingStar = itemRating.rating_star || 0;
  const ratingCount = itemRating.rating_count || [];
  const reviewCount = Array.isArray(ratingCount)
    ? ratingCount.reduce((sum, r) => sum + (parseInt(r, 10) || 0), 0)
    : 0;

  // Sales
  const historicalSold = ib.historical_sold || item.historical_sold || null;
  const sold = ib.sold || item.sold || null;
  const stock = ib.stock || item.stock || null;

  // Category
  const categoryId = ib.catid || item.catid || null;
  const categoryName = ib.cat_name || item.cat_name || null;

  // Other fields
  const itemType = ib.item_type || item.item_type || null;
  const likedCount = ib.liked_count || item.liked_count || null;
  const commentCount = ib.comment_count || item.comment_count || null;
  const isAd = !!(ib.is_ad || item.is_ad || item.adid);
  const flashSale = !!(ib.flash_sale || item.flash_sale);
  const liked = !!(ib.liked || item.liked);

  return {
    // Context
    keyword: ctx.keyword || null,
    page: ctx.page || null,
    position: ctx.position || null,
    // Product identity
    productId,
    name,
    // Pricing
    price,
    priceText: formatPriceText(price),
    priceMin,
    priceMax,
    originalPrice,
    discount,
    discountPercent,
    currency: 'IDR',
    // Media
    imageUrl,
    imageUrls,
    // Links
    url,
    // Shop
    shopId,
    shopName,
    shopUrl,
    shopCity,
    shopRating,
    responseRate,
    responseTime,
    followerCount,
    isOfficialShop,
    isShopeeVerified,
    // Ratings
    rating: ratingStar,
    ratingStar,
    reviewCount,
    // Sales & stock
    historicalSold,
    sold,
    stock,
    // Category
    categoryId,
    categoryName,
    // Other
    itemType,
    likedCount,
    commentCount,
    isAd,
    flashSale,
    liked,
    // Metadata
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Extract products from a Shopee API response.
 * Handles multiple known response shapes.
 */
function extractProductsFromApiResponse(json, ctx = {}) {
  if (!json || typeof json !== 'object') return { products: [], source: 'invalid' };

  const products = [];
  let positionCounter = 0;

  // Debug: log top-level keys and items structure
  const topKeys = Object.keys(json);
  log.info(`Response keys: ${JSON.stringify(topKeys)}`);
  if (json.items) {
    const itemsType = Array.isArray(json.items) ? 'array' : typeof json.items;
    const itemsLen = Array.isArray(json.items) ? json.items.length : Object.keys(json.items).length;
    log.info(`items type=${itemsType} len=${itemsLen}`);
    if (itemsLen > 0 && itemsType === 'object' && !Array.isArray(json.items)) {
      log.info(`items subkeys: ${JSON.stringify(Object.keys(json.items))}`);
    }
    if (Array.isArray(json.items) && json.items.length > 0) {
      log.info(`First item keys: ${JSON.stringify(Object.keys(json.items[0]))}`);
    }
  }

  // Shape 1: Standard Shopee search response { items: [...], total_count: N }
  if (Array.isArray(json.items) && json.items.length > 0) {
    for (const item of json.items) {
      positionCounter++;
      const product = normalizeProduct(item, { ...ctx, position: positionCounter });
      if (product) products.push(product);
    }
    if (products.length > 0) {
      log.info(`Matched standard items array: ${products.length} products (total_count=${json.total_count || 'N/A'})`);
      return { products, source: 'items_array', totalCount: json.total_count };
    }
  }

  // Shape 2: { items: { product: [...], total_count: N } } (some v4 variants)
  if (json.items && typeof json.items === 'object' && !Array.isArray(json.items)) {
    if (Array.isArray(json.items.product)) {
      for (const item of json.items.product) {
        positionCounter++;
        const product = normalizeProduct(item, { ...ctx, position: positionCounter });
        if (product) products.push(product);
      }
      if (products.length > 0) {
        log.info(`Matched items.product shape: ${products.length} products`);
        return { products, source: 'items_product', totalCount: json.items.total_count };
      }
    }
  }

  // Shape 3: { data: { items: [...] } }
  if (Array.isArray(json.data?.items) && json.data.items.length > 0) {
    for (const item of json.data.items) {
      positionCounter++;
      const product = normalizeProduct(item, { ...ctx, position: positionCounter });
      if (product) products.push(product);
    }
    if (products.length > 0) {
      log.info(`Matched data.items shape: ${products.length} products`);
      return { products, source: 'data_items', totalCount: json.data.total_count };
    }
  }

  // Shape 4: { recommend: { product: [...] } } or other nested shapes
  for (const key of ['recommend', 'data', 'result']) {
    const container = json[key];
    if (container && typeof container === 'object') {
      const candidates = [
        container.product,
        container.items,
        container.products,
        container.data,
      ].filter(Array.isArray);

      for (const arr of candidates) {
        for (const item of arr) {
          positionCounter++;
          const product = normalizeProduct(item, { ...ctx, position: positionCounter });
          if (product) products.push(product);
        }
        if (products.length > 0) {
          log.info(`Matched ${key} nested shape: ${products.length} products`);
          return { products, source: `nested_${key}` };
        }
      }
    }
  }

  return { products: [], source: 'none' };
}

/* ──────────────────────────────────────────────
   Main Actor
   ────────────────────────────────────────────── */

Actor.main(async () => {
  const input = await Actor.getInput();
  if (!input || !input.keyword) {
    throw new Error('Input "keyword" is required');
  }

  const maxPages = Math.min(input.maxPages || 1, 50);
  const minRating = parseFloat(input.minRating) || 0;
  const baseUrl = buildSearchUrl(input);

  log.info(`Starting Shopee Indonesia scrape: "${input.keyword}" (${maxPages} pages, minRating=${minRating})`);
  log.info(`Base URL: ${baseUrl}`);

  let totalScraped = 0;
  let totalSkipped = 0;
  const seenIds = new Set(); // dedup across pages

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    // Shopee can be slow to load; generous timeout
    requestHandlerTimeoutSecs: 120,

    async requestHandler({ page, request, proxyInfo }) {
      const currentPage = request.userData.page || 1;
      log.info(`Processing page ${currentPage}...`);

      // Setup response interception for Shopee API
      const PRODUCT_WAIT_MS = 45000;
      const capturedResponses = [];
      let allProducts = [];

      page.on('response', async (response) => {
        const url = response.url();
        const ct = response.headers()['content-type'] || '';

        // Capture JSON responses from Shopee's search API endpoints
        if (ct.includes('json') && (
          url.includes('search_items') ||
          url.includes('api/v4/search') ||
          url.includes('api/v4/item') ||
          url.includes('search/search_items') ||
          url.includes('shopee.co.id/api/')
        )) {
          try {
            const json = await response.json();
            capturedResponses.push({ url, json });
            log.info(`Captured API response: ${url.slice(0, 120)}...`);

            // Debug: log response structure for search_items
            if (url.includes('search_items')) {
              const keys = Object.keys(json || {});
              log.info(`[DEBUG search_items] top keys: ${JSON.stringify(keys)}`);
              if (json.items) {
                const isArray = Array.isArray(json.items);
                log.info(`[DEBUG search_items] items isArray=${isArray} len=${isArray ? json.items.length : 'N/A'}`);
                if (isArray && json.items.length > 0) {
                  log.info(`[DEBUG search_items] first item keys: ${JSON.stringify(Object.keys(json.items[0]))}`);
                } else if (!isArray) {
                  log.info(`[DEBUG search_items] items is object, subkeys: ${JSON.stringify(Object.keys(json.items))}`);
                }
              } else {
                log.info(`[DEBUG search_items] no items key found`);
              }
            }

            // Stream-extract: stop waiting as soon as products arrive
            if (allProducts.length === 0) {
              const extractCtx = { keyword: input.keyword, page: currentPage };
              const { products, source } = extractProductsFromApiResponse(json, extractCtx);
              if (products.length > 0) {
                allProducts = products;
                log.info(`Found ${products.length} products from ${source}`);
              }
            }
          } catch { /* not json or parse error */ }
        }
      });

      // Navigate to the search page
      const searchUrl = `${baseUrl}&page=${currentPage}`;
      log.info(`Navigating to: ${searchUrl}`);

      try {
        await page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      } catch (err) {
        log.warning(`Navigation error on page ${currentPage}: ${err.message}`);
        // Continue to wait for API responses even if navigation "failed"
        // (Shopee may still have loaded the data via XHR)
      }

      // Event-driven wait: poll until product-bearing response arrives
      log.info('Waiting for product data...');
      const deadline = Date.now() + PRODUCT_WAIT_MS;
      while (allProducts.length === 0 && Date.now() < deadline) {
        await page.waitForTimeout(1000);
      }

      log.info(`Captured ${capturedResponses.length} API responses`);

      // Fallback: sweep everything captured in case streaming check missed
      if (allProducts.length === 0) {
        for (const { url, json } of capturedResponses) {
          const extractCtx = { keyword: input.keyword, page: currentPage };
          const { products, source } = extractProductsFromApiResponse(json, extractCtx);
          if (products.length > 0) {
            allProducts = products;
            log.info(`Fallback found ${products.length} products from ${source}`);
            break;
          }
        }
      }

      // Fallback: try DOM extraction
      if (allProducts.length === 0) {
        log.info('No API products found, trying DOM extraction...');
        try {
          allProducts = await page.evaluate((ctx) => {
            const results = [];
            // Shopee product cards typically use data-sqe or class patterns
            const cards = document.querySelectorAll(
              '[data-sqe="item"], .shopee-search-item-result__item, [class*="col-xs-2"]'
            );

            for (let i = 0; i < cards.length; i++) {
              const card = cards[i];
              const link = card.querySelector('a[href*="/product/"]') || card.querySelector('a');
              if (!link) continue;

              const nameEl = card.querySelector('[data-sqe="name"], .ie3A\\+n, .shopee-search-item-result__item-name, [class*="product-name"]');
              const priceEl = card.querySelector('[data-sqe="current-price"], .ZEgDH9, .shopee-search-item-result__item-price, [class*="price"]');

              const name = nameEl?.textContent?.trim() || link.getAttribute('aria-label') || null;
              const priceText = priceEl?.textContent?.trim() || null;
              const href = link.getAttribute('href') || '';

              if (name && name.length > 3) {
                results.push({
                  name,
                  priceText,
                  url: href.startsWith('http') ? href : `https://shopee.co.id${href}`,
                  page: ctx.page,
                  keyword: ctx.keyword,
                  position: i + 1,
                });
              }
            }
            return results;
          }, { page: currentPage, keyword: input.keyword });

          log.info(`DOM fallback: found ${allProducts.length} products`);
        } catch (domErr) {
          log.warning(`DOM extraction failed: ${domErr.message}`);
        }
      }

      // Apply post-fetch filters (rating filter isn't in API params, so filter here)
      let filteredProducts = allProducts;
      if (minRating > 0) {
        filteredProducts = filteredProducts.filter(p => (p.rating || 0) >= minRating);
        const skipped = allProducts.length - filteredProducts.length;
        if (skipped > 0) {
          log.info(`Filtered out ${skipped} products with rating < ${minRating}`);
          totalSkipped += skipped;
        }
      }

      // Dedup across pages
      const newProducts = [];
      for (const product of filteredProducts) {
        const id = product.productId || `${product.name}_${product.price}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          newProducts.push(product);
        }
      }

      if (newProducts.length < filteredProducts.length) {
        log.info(`Dedup: ${filteredProducts.length - newProducts.length} duplicates removed on page ${currentPage}`);
      }

      // Push to dataset
      if (newProducts.length > 0) {
        await Actor.pushData(newProducts);
        totalScraped += newProducts.length;
        log.info(`Pushed ${newProducts.length} new products to dataset (total: ${totalScraped})`);
      } else {
        log.info(`No new products on page ${currentPage}`);
      }

      // Add delay between pages to avoid rate limiting
      if (currentPage < maxPages) {
        const delay = 2000 + Math.random() * 2000; // 2-4 second random delay
        log.info(`Waiting ${Math.round(delay / 1000)}s before next page...`);
        await page.waitForTimeout(delay);
      }
    },

    async failedRequestHandler({ request }, error) {
      const page = request.userData.page || '?';
      log.error(`Page ${page} failed after retries: ${error.message}`);
    },
  });

  // Build request list for all pages
  const requests = [];
  for (let i = 1; i <= maxPages; i++) {
    requests.push({
      url: `${baseUrl}&page=${i}`,
      userData: { page: i },
    });
  }

  await crawler.run(requests);

  // Write run summary
  const summary = {
    keyword: input.keyword,
    maxPages,
    sortBy: input.sortBy || 'relevancy',
    minPrice: input.minPrice || null,
    maxPrice: input.maxPrice || null,
    minRating: minRating || null,
    officialShop: input.officialShop || false,
    shopeeVerified: input.shopeeVerified || false,
    location: input.location || null,
    totalProductsScraped: totalScraped,
    totalFiltered: totalSkipped,
    uniqueProducts: seenIds.size,
    completedAt: new Date().toISOString(),
  };

  await Actor.setValue('SUMMARY', summary);
  log.info(`Scrape complete: ${totalScraped} products scraped, ${totalSkipped} filtered out`);
  log.info('Summary written to key-value store under SUMMARY key');
});
