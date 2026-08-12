# FabricAtHome

Local marketplace where nearby fabric showrooms list and customers book an at-home visit. A verified showroom rep arrives **within ~30 minutes** carrying the curtain & sofa-fabric catalogs, so buyers choose fabric at home.

**V1 = seeded mock data only.** Real dispatch, vendor accounts, gig-worker payments, and payments come later. Everything runs offline in the browser via `localStorage`.

## Run it

```sh
cd /root/fabric-at-home
python3 -m http.server 8080        # any static server works
# open http://<host>:8080
```

No build step, no dependencies.

## Flow (research-informed)

1. **Home (location-first discovery)** — fabric categories (curtains / sofa fabric / blinds / upholstery) + nearby showrooms sorted by distance, with rating·deals·Verified on every card.
2. **Category → catalog preview** — showrooms carrying that category with swatch previews + ₹/m prices.
3. **Showroom detail** — trust first (rating, deals, since, your deals), full fabric catalog with per-meter prices, then **Book a visit**.
4. **Booking (3 steps: address → slot → confirm)** — the ~30-min promise is stated at every step; 4–6 real 30-min slots from now.
5. **Live status** — assigned → on-the-way → arrived (3-step timeline). A `Simulate` button walks dispatch for the V1 mock.
6. **Deal at door** — pick fabrics + metres, line total, platform **3% commission** auto-computed, visit completes.
7. **Orders** — commission ledger (total earned, deal count, avg deal/commission) + full order history. One-tap **Rebook** for repeat showrooms.

## Trust model (per industry research)

- Rating **and** count visible on the listing card (never score without count).
- Verified badge on every card, not buried in the profile.
- Real names + transport for dispatched crew.
- Price visible before booking; no signup wall; ≤3-step booking.
- Commission **3% only on completed deals** — shown before booking and again at the deal screen.

## Files

```
index.html          app shell (app bar, view, tab bar, toast)
css/styles.css      design system (warm-neutral mono + terracotta accent)
js/data.js          FAH — seeded categories/showrooms/catalog/price mods
js/store.js         FAHStore — localStorage state, visit flow, 3% commission
js/app.js           FAHApp — SPA views + wiring (window.__FAH_APP__ test hook)
test_store.js       logic tests   (node test_store.js   → 23 pass)
test_dom.js         render tests  (node test_dom.js     → 24 pass)
test_browser.js     Playwright E2E (needs a browser binary)
```

## Design

Monochrome warm-neutral palette (`--ink #2B2620`, `--bg #F6F4EF`), single terracotta accent (`--accent #C1583B`), dense calm cards, zero ornament, mobile-first (max 520px).

## Commission

`COMMISSION_RATE = 0.03` in `js/data.js`. Logic in `store.js` (`createOrder`): line total × 3%, rounded, stored per order, aggregated in the Orders ledger.