# BackpageNew

Local classifieds directory and admin prototype built with Next.js and TypeScript.

## Run locally

Use Node.js 24.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Run `npm run lint`, `npm run build`, and `npm run typecheck` to check changes. Use `npm start` to serve a production build.

## Directory data

Location data lives in `src/directory/reference-locations.json` and category definitions live in `src/directory/service-groups.ts`. City URLs include their country and region so cities with the same name can coexist.

## Deploy to Vercel

Import the GitHub repository into Vercel. Use the repository root and the auto-detected Next.js preset. The project uses the default install and build commands and pins Node.js 24. The current prototype requires no environment variables.

The public listings and `/admin` use sample data. Admin changes are kept in memory for the current browser session, and `/admin` has no staff authentication. Account forms do not authenticate users.

## Member preview

Use sample details on `/auth` to open `/myaccount`. The preview includes shared List/Gallery post cards, 10 ads per page, ad details, pause/restore controls, account settings, and `/myaccount/post` with linked location/category choices and up to six picture previews. Pictures are resized locally for the preview. The header switches to My account and Logout.

Member data and pictures are stored only in this tab's `sessionStorage`. Passwords are never stored or verified. Logout clears the preview. Publishing does not create public ads, and verification does not send email. Replace this client-side preview with server authentication, authorization, persistent storage, verified uploads, and email services before launching member access.
