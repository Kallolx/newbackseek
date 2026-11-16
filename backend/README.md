# Backend setup

This service is separate from the current frontend preview. It includes session authentication, member ads, 50-item public feeds, media uploads, an image worker, reports, verification submissions, administrator lists, status changes, impersonation, bumping, distribution and audit records. Frontend forms and admin screens still require API integration before production cutover.

## Configuration

Copy `.env.example` to `.env`, replace every placeholder and keep the file outside Git. Use one random database password in both DB_PASSWORD and DATABASE_URL (URL-encode special characters in the URL). Set NODE_ENV=production and SITE_ORIGIN=https://backpagenew.com on the VPS.

Use two R2 buckets:

* `backpagenew-private`: originals and verification photos. Disable public access and r2.dev. Never attach a public custom domain.
* `backpagenew-public`: processed ad images only. Attach media.backpagenew.com and set MEDIA_PUBLIC_URL to that address.

Create an R2 token restricted to object read/write on those two buckets. Add the credentials to `.env`. Configure private-bucket CORS to allow PUT from the site origin with Content-Type. Presigned uploads expire in five minutes. Verify actual file size and type on completion; the worker decodes and limits pixel dimensions before publishing derivatives.

R2 storage alone does not resize images. The worker produces 160/480/1280-pixel WebP variants with automatic orientation and stripped metadata. Worker concurrency is one, with a CPU and memory limit. Serve variants using responsive image sizes and lazy loading; do not use originals on listing pages.

## Start isolated services

From backend/: `docker compose --env-file .env -f compose.yml up --build -d`

PostgreSQL and Valkey have no published ports. The API binds only to 127.0.0.1:4000. Migrations run transactionally before services start. Database and queue files persist in named volumes. Do not delete these volumes during upgrades.

Run directory seed from the repository root with backend dependencies installed and DATABASE_URL pointing to the database: `node --env-file=backend/.env backend/src/seed.mjs`. For container deployment, copy the src/directory source files into the migration image first or run this command from a one-off repository container; the backend image intentionally contains no frontend source.

Create the first admin with ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD environment variables, then run `node --env-file-if-exists=.env src/create-admin.mjs`. There are no default administrator credentials. Remove the bootstrap password from your environment afterward.

Health: GET /api/health; dependency readiness: GET /api/ready. Public feed: GET /api/ads?cityId=1&category=appliances&page=1. Each result contains at most 50 summaries and a hasMore flag. Search uses a PostgreSQL full-text index. Placements share one ad and one set of images across cities. Deep offset pages should migrate to cursor pagination when traffic/data warrants it.

All mutation requests require Origin matching SITE_ORIGIN, including API clients/tests. Sessions use opaque tokens hashed in PostgreSQL and HttpOnly same-site cookies. Admin actions require a server-side role check. Impersonated sessions cannot use admin routes, and can return through /api/account/impersonation/stop.

## Production cutover checklist

Complete real frontend integrations before routing public /api requests here. Replace sessionStorage preview login and posts; connect list/gallery feeds, upload progress, reports and all admin actions. Configure email verification, password reset delivery, Google OAuth and CAPTCHA server validation before accepting public registrations. These external integrations are not enabled by this starter.

Add a Caddy /api/* reverse proxy to the API only after integration tests pass. Keep account/admin/API responses uncached at Cloudflare; cache public browse pages with publish/edit invalidation. Review public registration abuse protection, retention for private verification documents, database backups and restore testing before launch. PostgreSQL running on one VPS needs recoverable backups even when images live in R2.

Run `npm test` for password/session tests. Full API integration tests require a disposable PostgreSQL and Valkey instance; never point destructive test fixtures at production data.
