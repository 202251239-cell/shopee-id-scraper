# Shopee Indonesia Product Search Scraper

Scrape product search results from **Shopee Indonesia** (`shopee.co.id`) with 41+ data fields per product.

## Features

- **41+ output fields**: product ID, name, pricing (5 fields), shop info (9 fields), ratings, sales, category, and more
- **Keyword search**: search by any keyword with sorting and filtering
- **Price filters**: min/max price in IDR
- **Shop filters**: official shop only, Shopee verified only
- **Location filter**: filter by seller city
- **Rating filter**: post-fetch minimum rating filter
- **Multi-page**: scrape up to 50 pages (~3,000 products per keyword)
- **Deduplication**: automatically removes duplicate products across pages
- **Fast**: direct API calls, no browser rendering needed

## Input

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keyword` | string | ✅ | Search keyword (e.g. "headset gaming") |
| `cookie` | string | ✅ | Raw cookie string from your browser session |
| `maxPages` | integer | No | Pages to scrape (1-50, default: 1) |
| `minRating` | number | No | Minimum rating filter (0-5, default: 0) |
| `sortBy` | select | No | Sort by: relevancy, ctro, price, sales |
| `minPrice` | integer | No | Min price in IDR |
| `maxPrice` | integer | No | Max price in IDR |
| `officialShop` | boolean | No | Official shop only |
| `shopeeVerified` | boolean | No | Shopee verified only |
| `location` | string | No | Seller city filter |

## How to Get Cookie

1. Open [shopee.co.id](https://shopee.co.id) in your browser and log in
2. Open Developer Tools (F12)
3. Go to **Application** → **Cookies** → `shopee.co.id`
4. Copy all cookies as a string: `name1=value1; name2=value2; ...`
5. Paste into the `cookie` input field

> **Note**: Cookies expire after some time. If scraping fails with 403, refresh your cookie.

## Output Fields

Each product in the dataset includes:

- **Context**: keyword, page, position
- **Product**: productId, name, url
- **Pricing**: price, priceText, priceMin, priceMax, originalPrice, discount, discountPercent, currency
- **Media**: imageUrl, imageUrls
- **Shop**: shopId, shopName, shopUrl, shopCity, shopRating, responseRate, responseTime, followerCount, isOfficialShop, isShopeeVerified
- **Ratings**: rating, ratingStar, reviewCount
- **Sales**: historicalSold, sold, stock
- **Category**: categoryId, categoryName
- **Other**: itemType, likedCount, commentCount, isAd, flashSale, liked, fetchedAt

## Output Example

```json
{
  "keyword": "headset gaming",
  "page": 1,
  "position": 1,
  "productId": 123456789,
  "name": "Headset Gaming RGB LED USB 3.5mm",
  "price": 49000,
  "priceText": "Rp49.000",
  "originalPrice": 99000,
  "discount": 50000,
  "discountPercent": 50,
  "currency": "IDR",
  "imageUrl": "https://cf.shopee.co.id/file/abc123",
  "url": "https://shopee.co.id/product/98765/123456789",
  "shopId": 98765,
  "shopName": "GameZone Official",
  "shopCity": "Jakarta Barat",
  "shopRating": 4.9,
  "isOfficialShop": true,
  "rating": 4.8,
  "reviewCount": 150,
  "sold": "500+",
  "stock": 100
}
```

## Pricing

Pay-per-item: $0.001 per product scraped.

## Limitations

- **Cookie required**: Shopee's anti-bot blocks server-side requests. A valid browser cookie is required.
- **Cookie expiry**: Cookies expire periodically. Refresh when you get 403 errors.
- **Rate limiting**: Scraping too fast may trigger rate limits. The actor includes random delays between pages.

## Legal

This actor only extracts publicly available listing data from Shopee. Use responsibly and comply with Shopee's terms of service and applicable laws.
