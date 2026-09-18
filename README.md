# Shopee Indonesia Product Search Scraper

Scrape product search results from [Shopee Indonesia](https://shopee.co.id) — one of Southeast Asia's largest e-commerce platforms with 200M+ monthly visitors.

## What It Extracts

**35+ fields per product:**

| Category | Fields |
|----------|--------|
| Context | keyword, page, position |
| Product | productId, name, url, imageUrl, imageUrls |
| Pricing | price, priceText, priceMin, priceMax, originalPrice, discount, discountPercent, currency |
| Shop | shopId, shopName, shopUrl, shopCity, shopRating, responseRate, responseTime, followerCount, isOfficialShop, isShopeeVerified |
| Ratings | rating, ratingStar, reviewCount |
| Sales | historicalSold, sold, stock |
| Category | categoryId, categoryName |
| Other | itemType, likedCount, commentCount, isAd, flashSale, liked |
| Metadata | fetchedAt |

## How It Works

This actor uses **PlaywrightCrawler** to load the Shopee search page in a real browser, then intercepts the REST API responses from `shopee.co.id/api/v4/search/search_items` to extract product data. This approach:

- **Bypasses anti-bot detection** — runs inside a real Chromium browser
- **Captures structured JSON** — no fragile DOM parsing
- **Handles dynamic loading** — works with Shopee's SPA rendering

## Use Cases

- **Price monitoring**: Track product prices over time for dropshipping decisions
- **Market research**: Analyze pricing trends, discount patterns, and competitor positioning
- **Product research**: Find trending products, high-rated items, or specific niches
- **Competitive intelligence**: Monitor official shop offerings vs regular sellers
- **Data enrichment**: Feed structured product data into analytics pipelines

## Pricing

**Pay-per-event**: you pay only for products actually written to the dataset.

| Apify plan tier | Price per product |
|-----------------|-------------------|
| Free | $0.001 |
| Bronze | $0.0009 |
| Silver | $0.0008 |
| Gold+ | $0.0007 |

A 50-product search costs ~$0.05 on the free tier. The run summary is stored in the key-value store — not billed.

## Input Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `keyword` | ✅ | — | Search keywords (e.g., "laptop gaming") |
| `maxPages` | | 1 | Pages to scrape (1–50, each = up to 60 products) |
| `sortBy` | | Relevancy | Sort: relevancy, ctime (newest), sales (best selling), price |
| `sortByAsc` | | true | Sort direction (ascending for price) |
| `minPrice` | | — | Minimum price filter (IDR) |
| `maxPrice` | | — | Maximum price filter (IDR) |
| `minRating` | | — | Minimum product rating (1–4) |
| `officialShop` | | false | Official shops only |
| `shopeeVerified` | | false | Shopee-verified sellers only |
| `location` | | — | Filter by seller city |

## Output Example

```json
{
  "keyword": "headset gaming",
  "page": 1,
  "position": 1,
  "productId": 123456789,
  "name": "Earphone Gaming Stereo Bass Headset with Mic",
  "price": 24900,
  "priceText": "Rp24.900",
  "priceMin": 19900,
  "priceMax": 34900,
  "originalPrice": 49900,
  "discount": 25000,
  "discountPercent": 50,
  "currency": "IDR",
  "imageUrl": "https://cf.shopee.co.id/file/abc123",
  "imageUrls": ["https://cf.shopee.co.id/file/abc123"],
  "url": "https://shopee.co.id/product/78901/123456789",
  "shopId": 78901,
  "shopName": "Toko Official Brand",
  "shopUrl": "https://shopee.co.id/shop/78901",
  "shopCity": "Jakarta",
  "shopRating": 4.9,
  "responseRate": 98,
  "responseTime": "within hours",
  "followerCount": 15000,
  "isOfficialShop": true,
  "isShopeeVerified": true,
  "rating": 4.8,
  "ratingStar": 4.8,
  "reviewCount": 256,
  "historicalSold": 15000,
  "sold": 320,
  "stock": 500,
  "categoryId": 11042,
  "categoryName": "Headset & Earphone",
  "itemType": 0,
  "likedCount": 450,
  "commentCount": 89,
  "isAd": false,
  "flashSale": false,
  "liked": false,
  "fetchedAt": "2026-09-18T05:30:00.000Z"
}
```

## Rate Limits & Best Practices

- Max 60 products per page, max 50 pages per run (3000 products)
- Built-in 2-4 second random delay between pages to avoid rate limiting
- Automatic retry on navigation failures
- If Shopee blocks the request, the actor will wait and retry automatically
- Products are deduped across pages automatically

## Local Development

```bash
npm install
npm run start
```

## Building & Deploying

```bash
# Build the Docker image
apify create

# Or deploy directly
apify push
```

## About

Built by [RGamer-Z](https://github.com/202251239-cell). Part of the [Apify Store](https://apify.com/store).

For issues or feature requests, open a GitHub issue or contact via Apify.
