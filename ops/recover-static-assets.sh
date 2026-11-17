#!/bin/sh
# Recover hashed assets from retained Docker builds without starting those builds.
set -eu
archive=/srv/backpagenew/recovered-static
mkdir -p "$archive/public" "$archive/admin"
for image in $(docker image ls -aq | sort -u); do
  container=$(docker create "$image" node 2>/dev/null) || continue
  docker cp "$container:/app/.next/static/." "$archive/public/" 2>/dev/null || true
  docker cp "$container:/app/admin/.next/static/." "$archive/admin/" 2>/dev/null || true
  docker rm "$container" >/dev/null
done
docker cp "$archive/public/." backpagenew-frontend:/app/.next/static/
docker cp "$archive/admin/." backpagenew-admin:/app/admin/.next/static/
echo 'Recovered retained public and admin assets.'
