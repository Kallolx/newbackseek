# Backend setup

This service powers the public BackpageNew account flows: opaque cookie sessions, email/password registration and login, Cloudflare Turnstile validation, Zoho email verification, Google OAuth, member ads, media uploads, an image worker, reports, private verification submissions, administrator lists, status changes, impersonation, bumping, distribution and audit records.

## Configuration

Copy `.env.example` to `.env`, replace every placeholder and keep the file outside Git. Use one random database password in both DB_PASSWORD and DATABASE_URL (URL-encode special characters in the URL). Set NODE_ENV=production, SITE_ORIGIN=https://backpagenew.com and ADMIN_ORIGIN=https://admin.backpagenew.com on the VPS.

Use two R2 buckets:

* `backpagenew-private`: originals and verification photos. Disable public access and r2.dev. Never attach a public custom domain.
* `backpagenew-public`: processed ad images only. Attach media.backpagenew.com and set MEDIA_PUBLIC_URL to that address.

Create an R2 token restricted to object read/write on those two buckets. Add the credentials to `.env`. Configure private-bucket CORS to allow PUT from the site origin with Content-Type. Presigned uploads expire in five minutes. Verify actual file size and type on completion; the worker decodes and limits pixel dimensions before publishing derivatives.

R2 storage alone does not resize images. The worker produces 160/480/1280-pixel WebP variants with automatic orientation and stripped metadata. Worker concurrency is one, with a CPU and memory limit. Serve variants using responsive image sizes and lazy loading; do not use originals on listing pages.

## Start isolated services

From backend/: `docker compose --env-file .env -f compose.yml up --build -d`. For the production stack run from the repository root: `docker compose --env-file backend/.env --profile backend --profile admin -f docker-compose.production.yml up --build -d`.

PostgreSQL and Valkey have no published ports. The API binds only to 127.0.0.1:4000. Migrations run transactionally before services start. Database and queue files persist in named volumes. Do not delete these volumes during upgrades.

The migration service imports the existing city/category directory automatically through a read-only source mount. Re-running it is safe. For local execution from the repository root with DATABASE_URL pointing to the database, run `node --env-file=backend/.env backend/src/seed.mjs`.

Create the first admin with ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD environment variables, then run `node --env-file-if-exists=.env src/create-admin.mjs`. There are no default administrator credentials. Remove the bootstrap password from your environment afterward.

Health: GET /api/health; dependency readiness: GET /api/ready. Public feed: GET /api/ads?cityId=1&category=appliances&page=1. Each result contains at most 50 summaries and a hasMore flag. Search uses a PostgreSQL full-text index. Placements share one ad and one set of images across cities. Deep offset pages should migrate to cursor pagination when traffic/data warrants it.

All mutation requests require an allowed site Origin, including API clients/tests. Sessions use opaque tokens hashed in PostgreSQL and HttpOnly same-site cookies. Public and administrator sessions use separate host-only cookie names; `/api/admin/*` is only accepted from the admin reverse proxy and still requires a server-side administrator role check. Impersonated sessions cannot use admin routes, and can return through `/api/account/impersonation/stop`.

## Separate admin application

`admin/` is an independently built Next application that reuses the existing admin screen source rather than copying it. It runs only in the `admin` Compose profile on port 3001. Caddy routes `admin.backpagenew.com` to that container and adds the trusted admin context header for its API proxy. Add a proxied Cloudflare `A` record for `admin` pointing to the VPS before enabling the profile. Keep the admin subdomain behind Cloudflare Access before granting anyone administrator credentials.

The first administrator is intentionally created only from the command line using `create-admin.mjs`; public registration cannot create one, and public login rejects administrator accounts. Use `https://admin.backpagenew.com/login` to sign in once DNS, Caddy, API and the admin container are live.

## Production cutover checklist

The public registration, login, Google sign-in, email verification, account listings, ad submission and private verification-photo flows use the API. Password-reset delivery, public feed loading, reports, and all remaining admin-screen actions should be completed before a broad public launch.

Add a Caddy /api/* reverse proxy to the API only after integration tests pass. Keep account/admin/API responses uncached at Cloudflare; cache public browse pages with publish/edit invalidation. Review public registration abuse protection, retention for private verification documents, database backups and restore testing before launch. PostgreSQL running on one VPS needs recoverable backups even when images live in R2.

Run `npm test` for password/session tests. Full API integration tests require a disposable PostgreSQL and Valkey instance; never point destructive test fixtures at production data.
