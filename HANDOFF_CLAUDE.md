# BackpageNew — Claude Project Handoff

This is the operational handoff for BackpageNew. Read it before changing code, deploying, touching DNS, or modifying production data.

## 1. Project identity

- Repository: https://github.com/Kallolx/newbackseek.git
- Local workspace: E:\Projects\Testing Projects\nazim-backseek
- Main branch: main
- Production commit at handoff: 9e54e6a
- Product: BackpageNew, a location-based local classifieds/personal-ads site.
- Public domain: https://backpagenew.com
- Public www domain: https://www.backpagenew.com
- Separate admin domain: https://admin.backpagenew.com
- Public media domain: https://media.backpagenew.com
- Hosting: RackNerd VPS, New York, USA.
- VPS IPv4: 192.255.228.253
- VPS SSH user: backpagenew
- VPS app directory: /srv/backpagenew/app
- Windows SSH key: C:\Users\khksn\.ssh\backpagenew-codex

Never commit credentials, production cookies, database dumps, R2 secrets, OAuth secrets, SMTP passwords, or private verification photos.

## 2. Architecture

The system is a monorepo with two independent Next.js frontends and one Fastify backend.

~~~text
Browser
  -> Cloudflare proxy/TLS
  -> Caddy on VPS (:80/:443)
     backpagenew.com       -> frontend :3000
     admin.backpagenew.com -> admin :3001
     /api/*                -> Fastify API :4000
     media.backpagenew.com -> Cloudflare R2 public bucket

Fastify API
  -> PostgreSQL 18: users, ads, locations, sessions, reports, audit
  -> Valkey 8: BullMQ queue
  -> R2 private bucket: originals and verification photos
  -> R2 public bucket: processed WebP ad images
  -> Zoho SMTP
  -> Google OAuth
  -> Cloudflare Turnstile

Worker
  -> reads private R2 originals
  -> creates 160px thumb, 480px card, 1280px full WebP
  -> writes derivatives to public R2
~~~

The public and admin frontends are separate containers and separate authentication contexts.

## 3. Frontends and routes

### Public application

Source: src/ and src/app/.

- / — home and location browser.
- /browse/... — country, region, city, category listings.
- /browse/.../:id — public ad details.
- /auth — login and signup.
- /post — authenticated member ad posting.
- /myaccount — member account.
- /myaccount/posts/:id — same details component as public, with owner controls.
- /myaccount/posts/:id/edit — owner edit form.
- /privacy and /terms — legal pages.

### Admin application

Separate Next app: admin/. It is hosted only at admin.backpagenew.com.

- /login — administrator login.
- /admin — overview.
- /admin/ads — all ads.
- /admin/users — users.
- /admin/reports — reports.
- /admin/verification — verification submissions.
- /admin/publish — ad publishing.
- /admin/bump — bump by Post ID.
- /admin/distribution — distribute by Post ID.
- /admin/media — media management.
- /admin/audit — audit records.
- /admin/health — system health.

Caddy redirects old public /admin paths to the admin host. Do not use the public host as an admin security boundary.

### UI rules already implemented

- Public and member details use the same post-detail.tsx and photo-gallery.tsx.
- Cards have bounded image heights and use CDN variants.
- Detail gallery has a fixed responsive frame, blurred side fill, controls, counter, and thumbnails.
- Member post form: pictures stay on the phone (local previews only) until Submit. Then each ORIGINAL file is POSTed to /api/media/upload (raw body, ≤15 MB, 2 at a time, progress in the submit button). The API checks it with sharp (JPG/PNG/WebP/AVIF; HEIC and SVG refused with a clear message), stores it privately and queues the worker, which converts to WebP (160/480/1280) and deletes the original. The phone never decodes or re-encodes photos. A rejected picture stops the save, its tile shows Failed, and the next Submit sends only that picture. Unattached uploads are still swept after 24 h.
- Admin mobile navigation is a dark floating five-item bar: Home, Ads, Create, Users, More.
- More opens a compact content-height bottom sheet, not a full-height modal.
- Destructive actions are red and confirmed.
- Toasts are compact dark pills with white text/icons, above the mobile admin bar.
- Do not restore the removed read-only login-email field. Public contact email is an optional ad field separate from login email.

## 4. Backend

Source: backend/src/. Runtime: Node 24, Fastify 5, PostgreSQL driver, Valkey/IORedis, BullMQ, Zod.

- API listens on 4000 and is published only to 127.0.0.1:4000.
- Caddy adds the public/admin app context header; backend still checks role and session.
- Sessions are opaque random tokens stored hashed in PostgreSQL and sent in HttpOnly cookies.
- Public and admin cookies are separate host-only names.
- Mutations require an allowed Origin.
- Public registration cannot create admins.
- Public login rejects admins.
- Email verification is required for protected member actions.

Main API groups:

Health/metadata:
- GET /api/health
- GET /api/ready
- GET /api/locations
- GET /api/categories

Auth:
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/logout
- GET /api/auth/google/start
- GET /api/auth/google/callback
- GET /api/auth/verify-email
- POST /api/auth/resend-verification
- POST /api/auth/resend-verification-public
- POST /api/auth/request-password-reset
- POST /api/auth/reset-password

Public/media:
- GET /api/ads
- GET /api/ads/:id
- POST /api/media/:id/complete
- GET /api/media/:id
- POST /api/reports

Member:
- GET/POST /api/account/ads
- GET/PATCH/DELETE /api/account/ads/:id
- POST /api/account/ads/:id/status
- POST /api/account/verification
- GET /api/auth/impersonate
- POST /api/account/impersonation/stop

Admin APIs are in backend/src/admin-routes.mjs and the admin section of backend/src/app.mjs. They support live collections, publishing/editing, Post ID lookup, bump, distribution, users, reports, verification review, media deletion, impersonation, audit, and health.

## 5. Database

PostgreSQL 18 runs in the db container with persistent volume postgres_data. Never delete this volume during normal deployment.

Migrations in backend/migrations/:

- 001_initial.sql — base schema, locations/categories, ads, media, sessions.
- 002_auth_identities.sql — Google/auth identities.
- 003_admin_management.sql — admin management and audit.
- 004_password_reset.sql — reset tokens.
- 005_verified_sessions.sql — verified sessions.
- 006_reuse_deleted_identities.sql — deleted email/username/Google identities may register again; active/suspended identities remain unique.
- 007_ad_contact_email.sql — optional public contact email on ads.
- 008_performance_and_upload_cleanup.sql — hot-path indexes and media.ever_attached for the abandoned-upload sweep.

Migrations are transactional and rerunnable. Never use production database for tests.

## 6. R2 image storage

Private bucket: backpagenew-private
- Originals and private verification photos.
- No public r2.dev access or public custom domain.
- Presigned uploads expire in five minutes.
- Verification photos stay private.

Public bucket: backpagenew-public
- Only processed ad-image variants.
- Custom domain media.backpagenew.com.
- Public objects have immutable cache headers.
- Typical path: /public/{media-id}/{thumb|card|full}.webp.

backend/src/worker.mjs uses Sharp to auto-orient, strip metadata, constrain dimensions, and create 160/480/1280 WebP variants. Never use originals in listing pages. Do not call Next image optimization against the media domain; use direct CDN URLs.

## 7. Production environment keys

Secrets live only in /srv/backpagenew/app/backend/.env. Do not print values or commit the file.

Current key names:

~~~text
NODE_ENV
PORT
SITE_ORIGIN
ADMIN_ORIGIN
DB_PASSWORD
DATABASE_URL
REDIS_URL
R2_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BUCKET
MEDIA_PUBLIC_URL
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
EMAIL_FROM
CAPTCHA_PROVIDER
TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
~~~

Conceptual production values:

- SITE_ORIGIN=https://backpagenew.com
- ADMIN_ORIGIN=https://admin.backpagenew.com
- R2_BUCKET=backpagenew-private
- R2_PUBLIC_BUCKET=backpagenew-public
- MEDIA_PUBLIC_URL=https://media.backpagenew.com
- Public Google callback: https://backpagenew.com/api/auth/google/callback
- Admin callback: https://admin.backpagenew.com/api/admin/auth/google/callback
- EMAIL_FROM is a verified BackpageNew sender.

The root frontend receives the Turnstile site key at Docker build time. The Turnstile secret remains backend-only.

## 8. Cloudflare, Hostinger, Zoho, Google

Cloudflare is authoritative. Hostinger nameservers:

- blair.ns.cloudflare.com
- west.ns.cloudflare.com

Important DNS records conceptually:

- @ A 192.255.228.253, proxied.
- www CNAME backpagenew.com, proxied.
- admin A 192.255.228.253, proxied.
- media CNAME to the R2 custom-domain target, DNS-only as required.
- Zoho MX mx.zoho.com priority 10, mx2.zoho.com priority 20, mx3.zoho.com priority 50, all DNS-only.
- Zoho verification, SPF, DKIM (zoho._domainkey), and DMARC (_dmarc) TXT records, DNS-only.

Cloudflare SSL/TLS is Full (strict). Do not change to Flexible. Error 525 means inspect Caddy/origin TLS and container status.

Keep the old Cloudflare public-directory cache rule disabled. Public HTML must revalidate; account/API responses must not be publicly cached. If an old unstyled page appears, inspect cache rules and purge Cloudflare cache from the dashboard. Never delete static volumes.

Zoho mailboxes include admin@backpagenew.com and support@backpagenew.com. SMTP uses a Zoho app password in SMTP_PASSWORD, not the normal mailbox password.

Google OAuth can be owned by any Google account; it does not require admin@backpagenew.com to be a Google Workspace account.

OAuth origins:
- https://backpagenew.com
- https://www.backpagenew.com
- https://admin.backpagenew.com

OAuth callbacks:
- https://backpagenew.com/api/auth/google/callback
- https://admin.backpagenew.com/api/admin/auth/google/callback

Turnstile uses one public site key and backend secret. If the UI says security check unavailable, verify build-time site key and backend secret.

## 9. VPS commands

From Windows PowerShell:

~~~powershell
ssh -i "$env:USERPROFILE\.ssh\backpagenew-codex" backpagenew@192.255.228.253
~~~

On the VPS:

~~~bash
cd /srv/backpagenew/app
git status --short
git log -1 --oneline
docker compose --env-file backend/.env --profile backend --profile admin ps
docker compose --env-file backend/.env --profile backend --profile admin logs --tail=100 api
docker compose --env-file backend/.env --profile backend --profile admin logs --tail=100 worker
docker compose --env-file backend/.env --profile backend --profile admin logs --tail=100 caddy
curl -fsS https://backpagenew.com/api/health
curl -fsS https://backpagenew.com/api/ready
curl -I https://backpagenew.com
curl -I https://admin.backpagenew.com/login
~~~

Production Compose services:

- frontend — public Next app, localhost 3000.
- admin — separate Next app, localhost 3001.
- db — PostgreSQL 18.
- valkey — Valkey 8 with append-only queue persistence.
- migrate — migrations and directory seed.
- api — Fastify API, localhost 4000.
- worker — image processing worker, 4 parallel jobs, 1.5 GB and two CPUs.
- caddy — public TLS/reverse proxy.

## 10. Deployment procedure

The admin saved-page importer (`src/app/admin/saved-post-import.ts`, `site-rule-trainer.tsx`, `import-center.tsx`) reads Chrome MHTML/`.bin` archives locally in the browser. The embedded HTML is parsed inertly and embedded pictures remain local until the final ad publish action. MegaPersonals has its original extractor; CallEscort and MyEscort have built-in layouts. For other domains, the admin chooses a saved page, selects field/picture matches in “Teach layout”, and saves a domain rule through `/api/admin/import-rules`. Rules live in `admin_import_rules` (migration `026_import_rules.sql`) and apply to later files from that domain and its subdomains. Never render or run archived markup. New site layouts require human review before an ad is published.

Docker on the VPS needs sudo, and the live Compose project is `app` using docker-compose.production.yml. From /srv/backpagenew/app:

~~~bash
C="sudo docker compose -p app -f docker-compose.production.yml --env-file backend/.env --profile backend --profile admin"
git fetch origin
git checkout main
git pull --ff-only origin main
# Back up before any migration
F=/srv/backpagenew/backups/pre-$(git rev-parse --short HEAD)-$(date +%Y%m%d-%H%M%S).dump
sudo docker exec app-db-1 pg_dump -U backpagenew -d backpagenew -Fc > "$F" && chmod 600 "$F"
# migrate has its OWN image: always build it with api/worker or new migrations will not run
$C build frontend admin migrate api worker
$C up -d db
# --no-deps: without it Compose also recreates the database (a few seconds of downtime).
$C up -d --no-deps --force-recreate migrate
$C up -d --no-deps --force-recreate frontend admin api worker
$C up -d --force-recreate caddy   # only when Caddyfile changed
$C ps
~~~

Verify the latest migration actually applied:

~~~bash
sudo docker exec app-db-1 psql -U backpagenew -d backpagenew -Atc "select name from migrations order by name desc limit 1"
~~~

Recreate Caddy when Caddyfile changes. Do not use down -v, docker volume prune, or delete public_static, admin_static, postgres_data, queue_data, caddy_data, or caddy_config.

Persistent static asset volumes:

- public_static -> frontend /app/static-archive -> Caddy /srv/static/public
- admin_static -> admin /app/static-archive -> Caddy /srv/static/admin

At startup, each frontend copies new hashed Next assets into its archive. This protects old tabs/cached HTML. For legacy recovery use ops/recover-static-assets.sh before deleting old images. See ops/README.md.

## 11. First admin

There are no default admin credentials. On the VPS:

~~~bash
cd /srv/backpagenew/app/backend
export ADMIN_EMAIL='admin@backpagenew.com'
export ADMIN_USERNAME='backpagenewadmin'
export ADMIN_PASSWORD='new-random-password-at-least-16-characters'
node --env-file=.env src/create-admin.mjs
unset ADMIN_EMAIL ADMIN_USERNAME ADMIN_PASSWORD
~~~

The script hashes the password and inserts an email-verified administrator. Remove bootstrap values immediately.

## 12. Tests

Before deployment:

~~~bash
npm ci
npm run typecheck
npm run lint
npm run build
node --test tests/session.test.cjs tests/picture-selection.test.cjs
~~~

Browser tests use isolated fixtures, never production accounts:

~~~powershell
$env:BPN_PLAYWRIGHT_MODULE='E:\Projects\Testing Projects\nazim-backseek\artifacts\browser-tests\node_modules\playwright'
node tests/card-images-browser-smoke.cjs
node tests/owner-ad-browser-smoke.cjs
~~~

Backend disposable regression:

~~~bash
docker compose -p bpn-admin-regression -f backend/compose.test.yml up --build --abort-on-container-exit --exit-code-from tests
docker compose -p bpn-admin-regression -f backend/compose.test.yml down --remove-orphans
~~~

## 12b. Security layer (country blocking, origin lock)

- Admin → Security (admin.backpagenew.com/admin/security) controls country blocking (BD preselected, off by default), Tor (T1), unknown (XX), optional admin-panel blocking, an IP allowlist and "Cloudflare-only". Settings live in table security_settings (migration 009); changes are audited as security.settings.
- Enforcement 1 (origin): Caddy forward_auth calls GET /api/internal/geo-gate (hidden from the internet by Caddy) on every request except /_next/static. It reads CF-IPCountry / CF-Connecting-IP / CF-Ray. Without CF-Ray the request is treated as a direct hit and refused when Cloudflare-only is on.
- Enforcement 2 (edge): when CLOUDFLARE_API_TOKEN (Zone WAF Edit + Zone Read, this zone only) and CLOUDFLARE_ZONE_ID are in backend/.env, the API maintains one WAF custom rule (ref bpn_geo_block). REQUIRED before re-enabling the Cloudflare page-cache rule, otherwise cached HTML bypasses the origin gate.
- Origin lock: ops/security/cloudflare-origin-lock.sh (systemd bpn-origin-lock.service + daily timer) drops every connection to ports 80/443 that is not from Cloudflare, in Docker's DOCKER-USER chain. SSH is unaffected. Emergency undo: sudo sh /srv/backpagenew/app/ops/security/cloudflare-origin-lock.sh remove
- Consequence: you cannot curl the server IP directly any more; test through the domain, or on the VPS use http://127.0.0.1:3000 / :4000.
- Rate limits key on CF-Connecting-IP (real visitor), not the proxy address.
- Never print or commit the Cloudflare token.
- Admin VPN (Admin → VPN page): WireGuard on the VPS, UDP 51820, clients 10.66.66.0/24, full tunnel via the New York IP (ADMIN_VPN_IP in backend/.env). Devices live in table vpn_devices (migration 011); ops/security/vpn-sync.sh (bpn-vpn-sync.service) applies them to wg0 every 5 s and reports status into vpn_server. Client private keys are shown once in the page and never stored. wg0.conf holds only [Interface]; never add peers by hand (the sync removes them). Server setup: sudo sh ops/security/vpn-setup.sh.

## 12c. Public page speed

- /browse/* is rendered live on every visit (force-dynamic). Saved ISR copies previously made new ads look missing in cities nobody had visited; never reintroduce page caching there without a working purge. Lists and ad pages are server-rendered with their data. The site server reads the API at API_INTERNAL_URL (http://api:4000). After any successful write to /api/account/ads or /api/admin/{ads,users,media}, the API calls http://frontend:3000/bpn-internal/revalidate with REVALIDATE_SECRET (backend/.env, shared with the frontend through Compose). /bpn-internal is hidden by Caddy. 60 s time-based fallback.
- If the site server cannot reach the API, pages still render and the browser loads the data itself.
- 40 ads per page. Feeds use placements_public_feed_idx; placements.category_slug/published are copies kept exact by triggers (migration 012). Never update those columns by hand.
- The API caches public reads briefly (backend/src/public-cache.mjs), clears them on every write, and serves the last good answer if the database errors.
- Adult listings are in the HTML but hidden by CSS until 18+ is confirmed (html[data-adult=yes], set by an inline head script from sessionStorage).

## 12d. Admin Media and Cloudflare connection

- Admin → Media: plain summary (status banner, pictures, space used of R2 free tier, saved by optimizing, added this week); R2/worker/size details folded under "Technical details".
- APIs: GET /api/admin/storage (DB stats + R2 bucket scan cached 10 min in Redis key bpn:storage:scan; ?scan=1 forces), GET /api/admin/pictures (20/page; status ready|processing|failed; placement in_ad|not_in_ad; sort newest|oldest|largest|smallest; counts for chips), POST /api/admin/pictures/delete and /retry ({ids:[≤100]}). Pictures still queued/processing are skipped on delete; retry only re-queues failed ones.
- media.original_bytes (camera size sent by the post form) and media.processed_at (migration 013) drive the savings and processing-time figures; older rows have no original size.
- Cloudflare edge connection: run `sudo bash ops/security/set-cloudflare.sh` on the VPS (asks for the token hidden + Zone ID, verifies, saves, restarts api). Works with account tokens (cfat_…). Token permissions: Zone → Zone → Read and App Security → Zone WAF Rules → Edit, scoped to Specified Domains → backpagenew.com. The panel owns the WAF custom rules with refs bpn_geo_block and bpn_admin_lock; do not edit them in Cloudflare.

## 12e. Ad page gallery loading

- PhotoGallery shows the medium (card, 480 px) picture immediately while the large (1280 px) one downloads, then fades the large one in. Switching pictures shows a preview at once if the target is not downloaded yet.
- The picture on screen loads with high priority; the next picture's medium preview is fetched as soon as the current preview shows, and after the large one is in the others are downloaded quietly in order (next, previous, then the rest). The thumbnail strip is low priority.
- Worker now writes WebP quality 74 (was 78) to make new pictures lighter; existing pictures are unchanged.

## 12f. Manager portal (manager.backpagenew.com) and Team page

- Managers are users with role 'manager' (migration 015: users.display_name, users.permissions text[], created_by, last_login_at). Administrators create, edit, suspend, reset and remove them in Admin → Team (/api/admin/team*). Team routes are admin-host and admin-role only.
- manager.backpagenew.com is served by the same admin container. Caddy sends X-Backpagenew-App manager (API) and X-Gate-App manager (geo gate). The API's appContext() returns 'admin' | 'manager' | 'public'. Both portals use the host-only cookie __Host-bpn-admin-session, so the sign-ins stay separate.
- Login: /api/admin/auth/login accepts role 'admin' on the admin host only and role 'manager' on the manager host only. Public login, Google and password reset are member-only. Admin Google sign-in was removed (email + password only).
- Server enforcement: the `admin` preHandler checks backend/src/team.mjs `managerMay()` on the manager host. Every route a manager may use is listed there with the permissions that open it. A route not on the list is admin-only (fail closed). When adding a new admin route, add it to that list or managers cannot use it. Sign in as user (impersonation) and Team always stay admin-only.
- Permission keys: overview, ads, publish, bump, distribute, users, media, reports, verification, health, security, vpn. The default for new managers is everything except users.
- MANAGER_ORIGIN defaults to ADMIN_ORIGIN with admin. → manager.; it is allowed by the origin check. Security settings apply to the manager host exactly as to the admin host: protectAdmin adds it to the country rule, and adminAllowlistOnly adds it to the bpn_admin_lock edge rule and the gate.
- DNS: Cloudflare A record `manager` → 192.255.228.253, Proxied. Caddy gets the certificate over HTTP-01 through Cloudflare.
- Test: backend/test/team.test.mjs (unit + integration); tests/manager-portal-smoke.cjs (browser, mocked API).

## 12g. Account settings, wallet, content pages

- Account → Settings (src/member/account-settings.tsx, backend/src/account-security.mjs, migration 017): profile facts, change/set password (signs out other devices), two-step verification (TOTP via any authenticator app + 10 one-time backup codes, hashed), signed-in devices (sessions now store user_agent/ip/country) with per-device and "all others" sign-out, delete account (DELETE + password + code when 2-step is on; ads deleted, sessions removed).
- Login with 2-step on: /api/auth/login (and the Google callback) return/redirect without a session and set a 5-minute httpOnly ticket cookie (bpn-2fa, Redis key bpn:2fa:*); /api/auth/login/two-factor finishes (5 wrong codes kill the ticket). A TOTP code works once (users.totp_last_counter). Pure TOTP code lives in backend/src/totp.mjs (RFC 6238 test vectors in test/account-security.test.mjs).
- users.password_set=false for Google accounts that never chose a password: they can set one without the current password.
- Account → Wallet (src/member/wallet.tsx) is a DESIGN ONLY: no API, no payment addresses. "Coming soon" screen after choosing amount + coin. Do not show real or sample addresses until payments are actually implemented.
- Public pages: /blog (+5 articles in src/content/blog.ts; photos hotlinked from images.unsplash.com), /contact (POST /api/contact → contact_messages table + email to CONTACT_EMAIL, default support@backpagenew.com, reply-to the sender), /guidelines, /refund-policy.
- Security: the manager portal has its own switches (protect_manager, manager_allowlist_only; migration 016 copied the admin values). The gate receives X-Gate-App manager. The lockout check uses the portal the saver is on.

## 12h. Post planner (Admin → Post planner)

- Cards = rows in ad_drafts (migration 018): status draft | scheduled | queued | publishing | published | failed; payload = the same fields as Ad Publish (adSchema in backend/src/ad-writer.mjs); media_ids = pictures uploaded through the normal form. Each person sees only their own cards; max 20 open cards (PLANNER_LIMIT).
- API (backend/src/planner.mjs): GET/POST /api/admin/planner, PATCH /:id, POST /:id/schedule {publishAt|null}, /:id/publish, /publish-all (drafts + failed → queue; scheduled keep their time), /:id/duplicate (without pictures), DELETE /:id. Team permission key: planner.
- Publishing happens in the WORKER (worker.mjs runPlanner every 10 s → publishDueDrafts): claims due rows with SKIP LOCKED, waits for pictures still processing (retries every 10 s, gives up after ~10 min), calls insertAd (the same code as Ad Publish, audited as ad.publish with details.planner), then bumps the public cache. Cards stuck in "publishing" for 10 min go back to the queue. Failures show the reason on the card.
- The abandoned-upload sweep skips pictures that are on an open card.
- UI: src/app/admin/planner.tsx (reuses Publisher with heading/submitLabel/removableSaved). Tests: backend/test/planner.test.mjs, tests/planner-smoke.cjs.

## 12i. SEO (Admin → SEO, permission key `seo`, off by default for managers)

- Owner steps (Search Console, Bing, Cloudflare) are in SEO_OWNER_GUIDE.md.
- Settings live in seo_settings (one jsonb row, defaults in backend/src/seo.mjs SEO_DEFAULTS and a fallback copy in src/lib/seo-core.ts: keep them in step), per-page overrides in seo_pages (key = path), redirects in seo_redirects, IndexNow log in seo_submissions (migration 019).
- API (backend/src/seo.mjs): GET /api/seo/config (settings + overrides; the site reads it with a 2-minute cache, tag `seo`, refreshed when the admin saves via /bpn-internal/revalidate), GET /api/seo/stats?href= (live counts for city/region/country text), robots.txt, sitemap.xml index, sitemap-locations.xml, sitemap-listings-{cc}.xml, sitemap-ads-{n}.xml (5000 per file, with pictures), llms.txt, /{indexnow-key}.txt. Caddy sends exactly those paths to the API; /sitemap-pages.xml is a Next route (static pages + blog).
- An ad in many cities has ONE canonical address: the city with the lowest id (API field canonicalHref; sitemap uses the same rule). Requests for the ad under another city/category are redirected (308) when the ad is not placed there, otherwise they carry a canonical tag to the main address. Missing ads return a real 404.
- City + category pages with fewer published ads than indexing.minAdsForListing are `noindex` and left out of the sitemap.
- Redirects are applied inside /api/internal/geo-gate (the same forward_auth call Caddy already makes for each page request), so there is no extra request. 301/302/307/308 send Location; 410 shows a "removed" page.
- The worker runs flushIndexNow every 2 minutes: ads changed since the cursor (Redis key bpn:indexnow:cursor) are sent to api.indexnow.org. The first run only sets the cursor. "Send everything" is in Admin → SEO → Tools.
- Page code: src/lib/seo.ts (metadata + JSON-LD builders), src/lib/seo-core.ts (templates; also used by the admin preview), src/content/pages.ts (landing page text and the static page list), src/components/info-page.tsx, seo-blocks.tsx, json-ld.tsx. Titles never use a global template suffix: every page sets its own absolute title.
- The public-cache revalidate hook previously called a path that did not exist (/_bpn/revalidate); it now calls /bpn-internal/revalidate.
- Tests: backend/test/seo.test.mjs, tests/seo-admin-smoke.cjs.
- Migration 020 seeds 150–300 word local texts for 20 cities into seo_pages.intro (Phoenix, Las Vegas, Denver, Charlotte, New Orleans, San Antonio, Minneapolis, Pittsburgh, Tucson, Cleveland, Omaha, Indianapolis, Buffalo, Kansas City, Los Angeles, New York, Chicago, Houston, Atlanta, Miami). Insert-only: admin edits are never overwritten. More cities: write them in Admin → SEO → Pages.

## 13. Important pitfalls

1. Keep public HTML revalidation and account/API no-store behavior.
2. Keep Zoho MX/TXT and R2 custom-domain records DNS-only where required.
3. Full (strict) Cloudflare mode requires working Caddy origin TLS. Certificates renew over HTTP-01 through Cloudflare (origin lock allows Cloudflare only); check Caddy logs for renewal errors around day 60 of each certificate.
4. Admin context headers are not authorization; backend role/session checks remain mandatory.
5. Use direct media CDN URLs; Next remote optimizer is not configured for media.backpagenew.com.
6. Pictures upload on Submit only (to our API, not straight to R2); ads attach pictures that are still queued/processing and the worker finishes them.
7. Never expose a member login email as an ad contact email.
8. Existing owner city placements are preserved during edit.
9. Bump and distribution are separate Post ID pages and show only the cover image.
10. The original README describes the old in-memory prototype; this handoff and backend README describe the live architecture.

## 14. Safe Claude workflow

1. Read this file, backend/README.md, ops/README.md, Caddyfile, and docker-compose.production.yml.
2. Inspect git status --short and preserve unrelated changes. The worktree may intentionally show D backend/.env.example; do not restore or stage it without owner instruction.
3. Make the smallest focused change.
4. Run typecheck, lint, build, and relevant isolated tests.
5. Commit clearly on main unless another branch is requested.
6. Push origin/main only after verification.
7. Pull on the VPS, build affected images, run the migration-aware Compose deployment, recreate Caddy if routing changed, then check health, readiness, public pages, member auth, and admin login.
8. Report commit, deployment, tests, and any user-side action needed. Do not claim Cloudflare cache was purged unless it actually was.

## 15. Release state at handoff

Completed:

- Persistent hashed static assets across deployments.
- Live backend auth, verification, password reset, Google OAuth, Turnstile, and admin separation.
- Zoho SMTP integration points and verified DNS records.
- R2 private/public image pipeline and WebP worker.
- Shared public/member gallery and contact facts.
- Owner edit, pause/resubmit, and delete controls.
- Live admin collections, publishing, bump, distribution, users, reports, verification, media, audit, and health.
- Dark compact mobile admin navigation and compact bottom sheet.
- Compact responsive toast system.
- Deferred public/admin image upload processing.

Verify live DNS, Cloudflare rules, container status, and backend/.env contents without printing secrets before changing anything.

