#!/usr/bin/env sh
# NY Insurance Licensing Academy — macOS/Linux launcher. Serves the built app at http://localhost:4173
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npx vite build && npx vite preview --port 4173 --strictPort
