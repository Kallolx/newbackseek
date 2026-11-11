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
