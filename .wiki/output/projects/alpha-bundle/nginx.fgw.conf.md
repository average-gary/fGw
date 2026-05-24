---
title: "nginx server block: fgw.virginiafreedom.tech"
type: ops-doc
generated: 2026-05-24
---

# nginx server block: fgw.virginiafreedom.tech

## Context

This file is the **nginx server-block snippet for the alpha web bundle** of
the Powder Keg compost-marketplace SPA. It ships to the chapter server at
`/etc/nginx/sites-available/fgw.virginiafreedom.tech`, is symlinked into
`/etc/nginx/sites-enabled/fgw.virginiafreedom.tech`, then activated with
`nginx -t && systemctl reload nginx`. The cert paths assume Let's Encrypt
issued the cert via certbot **before** the first reload — `certbot --nginx
-d fgw.virginiafreedom.tech` writes both `fullchain.pem` and `privkey.pem`
under `/etc/letsencrypt/live/fgw.virginiafreedom.tech/` and rewrites the
server block in-place to reference them. After issuance, certbot's
`certbot.timer` systemd unit handles renewal.

## Server block

```nginx
# ----------------------------------------------------------------------------
# fgw.virginiafreedom.tech — Powder Keg alpha web SPA
# Last updated: 2026-05-24
# Cert: Let's Encrypt; renewed automatically by certbot.timer (systemd)
# ----------------------------------------------------------------------------

# :80 — HTTP-to-HTTPS redirect only. ACME http-01 challenge from certbot
# is handled in this same block via the well-known location below.
server {
    listen      80;
    listen      [::]:80;
    server_name fgw.virginiafreedom.tech;

    # Allow certbot's http-01 challenge to renew without TLS hop.
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    # Everything else: 301 to HTTPS.
    location / {
        return 301 https://$host$request_uri;
    }
}

# :443 — TLS-terminating SPA host.
server {
    listen      443 ssl http2;
    listen      [::]:443 ssl http2;
    server_name fgw.virginiafreedom.tech;

    ssl_certificate     /etc/letsencrypt/live/fgw.virginiafreedom.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fgw.virginiafreedom.tech/privkey.pem;

    # HSTS — HTTPS only. One-year max-age; safe to enable now since the
    # subdomain has never served plain HTTP content.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Content Security Policy. Each source documented inline.
    #
    #   default-src 'self'
    #     Tightest sensible default — everything must be locally hosted unless
    #     explicitly allowed by a more specific directive below.
    #
    #   connect-src 'self' wss://chat.virginiafreedom.tech https://chat.virginiafreedom.tech
    #     wss:// — the SPA opens a NIP-01/NIP-42 WebSocket to the Pyramid
    #              relay via NDK. Without this, no relay traffic at all.
    #     https:// — NIP-86 admin RPCs are POSTs to the relay's HTTPS root
    #              with `application/nostr+json+rpc` content-type. See
    #              `src/lib/pyramid.ts` `nip86Call`. Also covers the
    #              `/u/{pubkey}` and `/` (NIP-11) info-document fetches.
    #     'self' — same-origin XHR (none today, but keeps `fetch('/...')`
    #              working for future static config).
    #
    #   img-src 'self' data: blob: https:
    #     data: — inline data-URLs (small bundled icons).
    #     blob: — EXIF-stripped photo previews from the local FileReader
    #              pipeline before Blossom upload.
    #     https: — Blossom-served listing photos from any host the relay
    #              admin allowlists; the chapter currently uses
    #              `cdn.satellite.earth` and `blossom.primal.net`. Permissive
    #              `https:` here matches the user-content mental model and
    #              avoids hard-coding a Blossom host.
    #
    #   style-src 'self' 'unsafe-inline'
    #     'unsafe-inline' — Tailwind v3 emits dynamic <style> blocks at
    #              runtime for arbitrary class names. Tightenable in Wave 11
    #              by switching to a hash- or nonce-based CSP (SPEC-058+).
    #
    #   script-src 'self'
    #     No inline scripts; Vite's bundle is a single ES module reference
    #     in index.html. Strict.
    #
    #   font-src 'self' data:
    #     data: — Tailwind/Leaflet ship a few inline data-URL fonts.
    add_header Content-Security-Policy "default-src 'self'; connect-src 'self' wss://chat.virginiafreedom.tech https://chat.virginiafreedom.tech; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:;" always;

    # Document root — `rsync dist/ ...:/var/www/fgw.virginiafreedom.tech/`
    root  /var/www/fgw.virginiafreedom.tech;
    index index.html;

    # Hashed bundle assets (Vite emits content-hashed filenames under
    # /assets/). Immutable; cache for one year.
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        # Re-emit security headers on this location since add_header in nginx
        # does not inherit when a child block declares its own.
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        try_files $uri =404;
    }

    # index.html — never cache. Updates ship on the next page load.
    location = /index.html {
        add_header Cache-Control "no-cache" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }

    # Downloads — desktop installers (.dmg/.msi/.AppImage/.deb) + Android APK.
    # Force download; short cache (installers can be replaced).
    location /downloads/ {
        add_header Content-Disposition "attachment" always;
        add_header Cache-Control "public, max-age=300" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        try_files $uri =404;
    }

    # SPA fallback. The app uses <HashRouter>, so every URL path resolves to
    # index.html and the client parses `#/...` after load.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # gzip is assumed enabled in the surrounding nginx.conf (`gzip on;`,
    # `gzip_types text/plain text/css application/javascript application/json
    # image/svg+xml;`). If not, add it globally rather than duplicating per
    # server block.
}
```

## Deploy command sequence

Run these on the chapter server (or from a local machine where noted) **in
order**. Replace `<server>` with the chapter server's hostname or IP and
`<maintainer-email>` with the operator's contact address (Let's Encrypt
sends expiry warnings here).

1. **DNS** (chapter operator action; one-time): create A and AAAA records
   for `fgw.virginiafreedom.tech` pointing at the server's IPv4/IPv6.
2. **Document root**:
   ```sh
   mkdir -p /var/www/fgw.virginiafreedom.tech/downloads
   ```
3. **Upload the SPA** (run from the local repo after `pnpm vite build`):
   ```sh
   rsync -av --delete dist/ root@<server>:/var/www/fgw.virginiafreedom.tech/
   ```
4. **Place the nginx file** at `/etc/nginx/sites-available/fgw.virginiafreedom.tech`
   (copy the fenced block above into the file as-is).
5. **Enable the site**:
   ```sh
   ln -s ../sites-available/fgw.virginiafreedom.tech /etc/nginx/sites-enabled/
   ```
6. **Issue the TLS cert** (certbot will rewrite the `:443` block in-place
   to point at the freshly issued PEMs; the values shown in this snippet
   already match certbot's defaults, so the result should be a no-op edit):
   ```sh
   certbot --nginx -d fgw.virginiafreedom.tech \
     --non-interactive --agree-tos -m <maintainer-email>
   ```
7. **Test + reload**:
   ```sh
   nginx -t && systemctl reload nginx
   ```
8. **Verify**:
   ```sh
   curl -I https://fgw.virginiafreedom.tech/
   ```
   Expected: `HTTP/2 200`, plus a `Content-Security-Policy:` header
   containing `wss://chat.virginiafreedom.tech`.

## Smoke checklist (post-deploy)

Run from a real phone browser **and** a desktop browser (Firefox or
Chromium with DevTools open):

- [ ] Visit `https://fgw.virginiafreedom.tech/` — onboarding screen renders
      (no blank page, no console errors blocking boot).
- [ ] Paste a test `nsec...` into the onboarding key input → key is accepted
      and the app advances to the chapter-pick / membership screen.
- [ ] DevTools → Network tab: confirm `POST https://chat.virginiafreedom.tech/`
      requests fire with `Content-Type: application/nostr+json+rpc`. These
      are the NIP-86 membership-poller calls (`listallowedpubkeys`,
      `listbannedpubkeys`).
- [ ] DevTools → Network tab: confirm a WebSocket connection opens to
      `wss://chat.virginiafreedom.tech/` and stays open (NIP-01 subscriptions).
- [ ] Publish one test listing — listing appears in the local feed and
      survives a page reload (relay round-trip succeeded).
- [ ] DevTools → Console: no CSP violations logged. If any appear, the CSP
      header above needs an additional source.

## Known issues / known good states

- **Main JS chunk is ~838 KB** (~254 KB gzipped) per `pnpm vite build`
  on commit `cd90988`. First load on cellular is noticeably slow; cached
  loads are fine. Tracked as a Wave-11 candidate (assess-r1 § B3 / SPEC-058).
- **CSP `style-src 'unsafe-inline'`** is required by Tailwind v3's runtime
  style emission. Tightenable in Wave 11 via hash- or nonce-based CSP once
  the build is migrated.
- **CSP `img-src https:`** is intentionally permissive to accommodate
  user-content from any Blossom host the chapter allowlists. If the chapter
  pins a fixed Blossom host (e.g. `cdn.satellite.earth`), this can narrow.
- **`<maintainer-email>` is a placeholder** in the certbot command — fill
  in the operator's address before running step 6.
