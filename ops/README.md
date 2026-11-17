# Static assets across deployments

The frontend and admin copy their hashed Next.js assets into separate persistent
Docker volumes before starting. Caddy serves these volumes directly, so cached
HTML and open browser tabs continue to find assets from previous releases.
Do not delete `public_static` or `admin_static` during routine deployments.

Build both applications before recreating them. Their startup commands add new
assets without replacing existing hashed files. HTML caching remains independent
of this archive; account and API responses must never be cached publicly.

For recovery on an existing installation, run `sudo sh ops/recover-static-assets.sh`
before removing old Docker images. It collects static assets only into
`/srv/backpagenew/recovered-static`. After the persistent volumes are mounted, copy
the public and admin directories into their respective `/app/static-archive/`
directories using `docker cp`, then set their ownership to `1001:1001`.
