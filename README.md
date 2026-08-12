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
| **Buyer flow** | Location-first discovery, 4 categories, trust cards (rating·deals·Verified), 3-step booking (address → 30-min slot → confirm), live status (assigned → on-the-way → arrived), deal recording + UPI, post-visit review |
| **Vendor apps** | Earnings dashboard (gross / 3% commission / net), orders, T+1 settlements, reviews received, public showroom page |
| **Admin ops** | Platform commission ledger, GMV & escrow, pending payouts (mark paid), vendor KYC/verification queue |
| **Trust engine** | Rating + count on every card, Verified/Insured badges, 3-dimension reviews (punctuality/quality/communication), review teasers |
| **Payments** | UPI at completion; 3% commission split; T+1 settlement records; Razorpay Route scaffolding in `backend/` |
| **Legal** | DPDP-lean privacy policy + terms of use (in-app) |

## Roles (demo accounts)

Account → role switcher (`Account` tab):

- **Buyer** — full discovery → booking → live → deal → review journey
- **Vendor** (`Manish Thar`, Thar Interior Studio) — earnings, orders, settlements
- **Admin** — platform ledger, payouts, vendor verification

## Architecture

```
js/data.js        FAH — seeded catalog, vendors (with GPS coords), roles, 3% rate
js/provider.js    storage adapter + auth/session (local mock now)
js/store.js       domain logic: visits, orders, commission split, settlements, reviews
js/geo.js         real GPS + haversine distance + ETA + location states + area override
js/app.js         SPA views + role wiring
backend/          Supabase schema + RLS, Edge Functions, Razorpay Route, go-live README
```

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

**Taking it live:** the DB schema in `backend/schema.sql` mirrors the JS
contract exactly. Create a Supabase project, run the SQL, deploy the edge
functions, add your Razorpay keys, then flip `window.FH_BACKEND.enabled` in
`index.html`. No UI rewrite needed — RLS enforces buyer/vendor/admin isolation
on the server. See `backend/README.md`.

## Tests

```sh
node test_store.js    # 29 logic tests: booking, 3% split, settlements, reviews
node test_dom.js      # 34 render tests: every view, every role, full journey
node test_geo.js      # 10 GPS tests: haversine, distance, ETA, states, overrides
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