# FabricAtHome

Local marketplace for fabric showrooms. Buyers pick a category, browse a
showroom's catalog, book an **at-home visit** — a verified rep arrives
**within ~30 minutes** carrying the full curtain & sofa-fabric catalog. The
platform takes **3% commission** only on completed deals.

**Live now:** https://gulshan1234g5.github.io/fabric-at-home/

## Run locally

```sh
cd /root/fabric-at-home
python3 -m http.server 8080   # open http://localhost:8080
```

Installable PWA: open the URL → browser menu → "Add to Home screen". Works
offline after first load (service worker caches all assets).

## What's in this build (research-informed, production-shaped)

| Layer | What it does |
|---|---|
| **Customer flow** | Location-first discovery (real GPS), 4 categories, trust cards (rating·deals·Verified), 3-step booking (address → 30-min slot → confirm), live status (assigned → on-the-way → arrived), free cancellation before the rep leaves, deal recording + UPI, post-visit review |
| **Clear pricing** | Every showroom shows its **installation charge** (₹ADJUST additional, never free); deal summary itemises fabrics → installation → total you pay. Our 3% is charged to the showroom, never hidden in your price |
| **Trust engine** | Rating + count on every card, Verified/Insured badges, 3-dimension reviews (punctuality/quality/communication), review teasers |
| **Payments** | UPI at completion; vendor pays 3% commission (never hidden in your price); T+1 settlement records; Razorpay Route scaffolding in `backend/` |
| **Legal** | DPDP-lean privacy policy + terms of use (Discover → About) |

> **Customer-only build.** This is the buyer-facing app: discover → book →
> track → deal → review. No signup to browse; bookings work as a guest until
> the Supabase backend adds phone auth. (Vendor/admin surfaces were removed;
> they live in the earlier commits for ops later.)

## Roles (demo accounts)

Customer-only. No accounts on the customer side — browse and book as a guest.
Vendor/admin ops are covered by the Supabase backend schema in `backend/`.

> History: V2 had in-app buyer/vendor/admin demo switcher; removed in the
> customer-only build per product direction. Ops surfaces remain in git
> history and in the backend schema for later use.

## Architecture

```
js/data.js        FAH — seeded catalog, vendors (with GPS coords), roles, 3% rate
js/search.js      FAHSearch — pure search/filter (fabrics, showrooms, zero-state)
js/db.js          FAHDB — IndexedDB local-first layer (+ offline queue contract)
js/provider.js    storage adapter + session (idb → local fallback), boot/refresh, multi-tab sync
js/store.js       domain logic: visits, orders, commission split, settlements, reviews
js/geo.js         real GPS + haversine distance + ETA + location states + area override
js/app.js         SPA views + search-first home, transitions, haptics, error boundary
backend/          Supabase schema + RLS, Edge Functions, Razorpay Route, go-live README
```

## Local-first data (research-aligned)

- **Device owns the data.** The working copy lives in memory (instant reads),
  durably mirrors to **IndexedDB** (`js/db.js`), and `localStorage` is only the
  floor for file:// or headless environments. A full reload rehydrates from IDB.
- **Multi-tab sync** via BroadcastChannel — a change in one tab refreshes the
  others, the local-first "server is a sync peer" idea applied to tab replicas.
- **Offline honesty.** An offline banner appears (no fake promises); the intact
  local copy is what stays; a pull-to-refresh re-reads the durable copy.
- **Backend-ready contract.** `FAHDB` keeps an offline mutation queue and the
  provider exposes `boot/refresh/onSync/onNetwork` — the same surface the
  Supabase adapter will use. Swapping `FH_BACKEND.enabled = true` wires the
  network path with zero UI rewrite.

## Search-enabled discovery

Search-first entry on Home searches showrooms (name/area/offers) **and** fabrics
(name/material/pattern) in real time with a useful zero-results state. Honest
demand signals ("N deals this month") are computed from the local ledger.

## PWA & accessibility (research-aligned)

- Installable: manifest with `id`, 192/512 `any` + `maskable` icons, `lang`/`dir`,
  `display_override`, app `shortcuts` (`#orders`, `#nearby` deep links).
- **Accessible install & update bars** (`beforeinstallprompt` → real `<button>`;
  new-version bar applies a waiting service worker on tap).
- Service worker **v7**: split shell/runtime/page caches with
  stale-while-revalidate + network-first navigation + offline shell fallback.
- Skeleton shimmers during async loads, View Transitions (native + reduced-motion
  fallback), pull-to-refresh, haptic ticks, focus management, `:focus-visible`
  rings, WCAG-leaning contrast on primary actions.
- Skip-link, main landmark focus on nav, screen-reader labels on app bar.

## GPS / location

- On the **live site (https)** `navigator.geolocation` runs for real: showrooms
  are sorted by your actual position, distances computed by haversine × 1.3
  road factor, ETA from a 20 km/h urban assumption, and the hero label is
  reverse-geocoded (free BigDataCloud, no key).
- **Status chip** in the hero shows `Locating…` → `✓ Live GPS` → `GPS off`.
- **file:// or permission-denied** → graceful fallback to the default area;
  the "Change" link opens a sheet with **Use my current location** + 4 manual
  area overrides (virtual origin) so discovery always works.
- Plain `GPS off` labels never claim a fix they don't have.

## PWA & accessibility (research-aligned)

- Installable: manifest with 192/512 `any` + `maskable` icons, `lang`/`dir`,
  `display_override`, app `shortcuts` (`#orders`, `#nearby` deep links).
- **Accessible install button** (`beforeinstallprompt` → real `<button>` with
  `aria-disabled` + polite `role="status"` announce on accept/dismiss).
- Skip-link, `:focus-visible` rings, main landmark focus on nav, screen-reader
  labels on app bar. Offline via service worker (cache-first, v5).

## Cancellation

Free cancels while a visit is still **assigned** (before the rep leaves);
once **on-the-way** or later, cancellation isn't allowed — stated in-terms and
enforced in the store (`cancelVisit` guard).

**Taking it live:** the DB schema in `backend/schema.sql` mirrors the JS
contract exactly. Create a Supabase project, run the SQL, deploy the edge
functions, add your Razorpay keys, then flip `window.FH_BACKEND.enabled` in
`index.html`. No UI rewrite needed — RLS enforces buyer/vendor/admin isolation
on the server. See `backend/README.md`.

## Tests

```sh
node test_store.js    # 35 logic tests: booking, 3% split, cancel, settlements, install fee
node test_dom.js      # 35 render tests: customer journey, every view, GPS
node test_geo.js      # 10 GPS tests: haversine, distance, ETA, states, overrides
node test_search.js   # 12 search tests: fabrics, showrooms, zero-results, case-insensitivity
```

## Design

Warm-neutral monochrome (`--ink #2B2620` / `--bg #F6F4EF`), single terracotta
accent (`--accent #C1583B`), dense calm cards, zero ornament, mobile-first.

## Commission

`FAH.COMMISSION_RATE = 0.03` in `js/data.js`. On every completed deal the store
writes `lineTotal`, `commission` (3%), `vendorShare` (97%), a UPI payment
record, and a T+1 settlement. Aggregates power the buyer/vendor/admin ledgers.

## Compliance runway (before real money)

1. Vendor KYC + verification queue (admin screen exists) — required by
   Zerodha-style trust norms and marketplace practice.
2. Payments via Razorpay (RBI PA) using **Route** linked accounts — commission
   + T+1 payouts, GST-invoice both ways, TCS on commission → GSTR-8.
3. DPDP: consent, data deletion, retention policy.
4. Real dispatch (crew + geofencing) or honest ~30-min degradation.