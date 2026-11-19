# BackpageNew SEO: what you do, step by step

Everything technical is already built and live (see "What the site does for you"). The steps below are the things only
the owner can do, because they need your Google, Bing and Cloudflare accounts. Do them once, in this order.

## A. One-time setup (about 45 minutes)

### 1. Google Search Console (most important)
1. Go to https://search.google.com/search-console and sign in with the Google account you want to own the site.
2. Click **Add property** → choose **Domain** → type `backpagenew.com` → Continue.
3. Google shows a **TXT record** (starts with `google-site-verification=`). Copy it.
4. Cloudflare → your domain → **DNS** → **Add record**: Type `TXT`, Name `@`, Content = the value you copied → Save.
5. Back in Google click **Verify** (if it fails, wait 2 minutes and retry).
6. Left menu → **Sitemaps** → type `sitemap.xml` → **Submit**. It should say "Success".
7. Left menu → **URL Inspection** → paste `https://backpagenew.com/` → **Request indexing**.
   Repeat for `/backpage-alternative`, `/personals`, `/dating`, `/classifieds`, `/about` and 5–10 busy city pages.

### 2. Bing Webmaster Tools (also feeds DuckDuckGo, Yahoo and ChatGPT search)
1. Go to https://www.bing.com/webmasters and sign in.
2. Choose **Import from Google Search Console** (one click). If you prefer, add the site manually and paste Bing's code in
   **Admin → SEO → Connect → Bing**.
3. **Sitemaps** → submit `https://backpagenew.com/sitemap.xml`.
4. IndexNow is already on: new and changed ads reach Bing within minutes by themselves.

### 3. Cloudflare settings
- **Caching → Configuration → Crawler Hints**: turn **On** (free; tells search engines when pages change).
- **Security → Bots**: make sure **Verified bots** are allowed (default). Googlebot and Bingbot must never be blocked.
  Check **Security → Events** after a week for anything blocking them.
- **SSL/TLS → Edge Certificates → Always Use HTTPS**: On.
- **Rules → Cache Rules**: keep the rule you already made (ad lists and ad pages are never cached).
- DNS: the `www` record must exist and be proxied (orange). The site now sends `www` visitors to `backpagenew.com`.

### 4. Optional: free visitor statistics
Cloudflare → **Analytics & Logs → Web Analytics** → add the site → copy the token → **Admin → SEO → Connect → Cloudflare
Web Analytics token**. (Or add a Google Analytics 4 ID there.)

## B. Every week (10 minutes)
1. Google Search Console → **Pages**: look at "Why pages aren't indexed". "Crawled – currently not indexed" on city+category
   pages with no ads is normal (the site keeps empty pages out on purpose).
2. Google Search Console → **Performance**: see which searches bring visitors; write more about the ones that work.
3. **Admin → SEO → Overview**: keep the score green.
4. Bing Webmaster Tools → check for crawl errors.

## C. What really moves rankings (be realistic)
- Nobody can promise position #1. Google decides. A new site usually takes **weeks to months** to rank, and
  "new backpage" is a competitive phrase. The site name "BackpageNew" itself should rank quickly once indexed.
- **Links from other websites** are the biggest factor: create official profiles (X, Facebook page, Reddit, YouTube,
  Instagram), add them in **Admin → SEO → Brand → Official profiles**, and get listed in directories and on relevant blogs.
- **Real text on pages**: in **Admin → SEO → Pages**, write 150–300 unique words for your busiest 20 cities and the 4
  countries. Add a new blog article every week or two.
- **Real ads**: pages with ads rank; empty pages do not. Fill the busiest cities first (use the Post planner).
- Adult-oriented sites are treated more strictly by Google (SafeSearch, advertising rules). Keep the Guidelines enforced,
  keep the age rating tags on (Admin → SEO → Indexing) and never allow content involving minors or exploitation.

## What the site does for you (already live)
- `robots.txt`, a sitemap index, and sitemaps for pages, countries/states/cities, city+category pages that have ads, and every
  published ad (with pictures). All controlled from **Admin → SEO**.
- One main address per ad (canonical), real 404/410 for removed ads, 301/308 redirects, `www` → main address.
- Unique titles and descriptions for every country, state, city, category and ad; Open Graph and Twitter cards.
- Structured data: Organization, WebSite, BreadcrumbList, CollectionPage/ItemList, FAQPage, BlogPosting, WebPage.
- City pages with live counts, nearby cities, category counts and FAQs. Landing pages for "new Backpage", personals, dating,
  classifieds and about.
- IndexNow (Bing and others), `llms.txt`, age-rating tags, `noindex` for account and login pages.
- Admin controls: title/description templates with Google preview, per-page overrides (title, description, H1, text,
  canonical, noindex, share image), redirects (301/302/308/410), indexing rules, AI-crawler switches, verification codes,
  analytics, URL inspector, health score.
