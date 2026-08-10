# AGUYB Studios — SEO Reference Files

This folder is the working reference for the site's SEO/GEO strategy. It is
**not** consumed by a build step (the site is static HTML, not a framework
with file-based routing), so these files won't automatically generate pages
or metadata. Treat them as the source of truth Claude (or anyone editing the
site) checks before writing a new page, so keyword targeting, location
claims, and service descriptions stay consistent instead of drifting.

- `keywords.json` — the target keyword database: category, keyword, search
  intent, location, priority, target URL, status. Update `status` as pages
  ship (`planned` → `built` → `live`).
- `locations.json` — every location AGUYB claims, split into `serviceArea`
  (real, currently served, backed by the `coverage_areas` Wix Data
  collection) and `centralFlorida` (broader region referenced narratively,
  no dedicated page yet, per the guideline's "don't claim a physical
  presence you don't have" rule).
- `services.json` — the service/pillar taxonomy: pillar name, description,
  target URL, status, and which existing site sections/Wix collections back
  it up.

## Canonical domain

`https://www.aguybstudios.com` (with `www`) — every canonical tag, sitemap
URL, robots.txt reference, and JSON-LD `url`/`image` field must use this
exact form. Confirmed live and matching the legacy site's own canonical
before the switch.

## Rule for adding a new page

1. Check `keywords.json` for the target keyword + intent + priority.
2. Check `locations.json` / `services.json` so location and service claims
   stay factual (real coverage area, real pricing from Wix `pricing_tiers`,
   real services from Wix `services`).
3. Build the page with: one H1, unique title (`Primary Keyword | AGUYB
   Studios`), unique meta description, self-referencing canonical, Service +
   FAQPage + BreadcrumbList JSON-LD as applicable, internal links to related
   service/location pages, and a direct-answer "What is X" section near the
   top for AI/GEO readability.
4. Add the URL to `sitemap.xml`.
5. Update `keywords.json` status to `live`.
6. Never create a page that's just an existing page with the city name
   swapped — see `locations.json` notes.
