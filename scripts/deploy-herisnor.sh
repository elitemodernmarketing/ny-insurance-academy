#!/usr/bin/env sh
# Rebuild and publish the app to https://herisnor.com/fa/ (this server). Safe to re-run; only touches /home/herisnor/public_html/fa.
# The nginx block for /fa/ was added once to /etc/nginx/sites-enabled/herisnor.com.conf (see README "Hosting").
set -eu
cd "$(dirname "$0")/.."
VITE_BASE=/fa/ npx vite build --outDir dist-fa
sudo -n rsync -a --delete dist-fa/ /home/herisnor/public_html/fa/
sudo -n chown -R herisnor:herisnor /home/herisnor/public_html/fa
HOST_MAP="herisnor.com 65.108.194.39" node scripts/smoke-url.mjs https://herisnor.com/fa/
