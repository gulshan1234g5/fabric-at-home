# FabricAtHome — Backend (Supabase + Razorpay)

The frontend runs fully on mock/localStorage data. To take it live you deploy
this backend, add a thin Supabase adapter, flip one flag, and swap in your
Razorpay keys. Nothing in the UI needs to change.

## 1. Create a Supabase project (free tier)

1. https://supabase.com → New project (any region; ap-south works for IN).
2. SQL Editor → paste `backend/schema.sql` → Run. Idempotent.
3. Auth → set up provider (phone OTP is what FabricAtHome wants; email works too).

## 2. Seed the reference data

```sql
insert into catalog (id, category, name, material, pattern, colors, price_per_meter) values
  ('c1','curtains','Linen Weave Drape','100% cotton linen','plain','{"#E7DFD2","#B8AFA1","#6B6255"}',349),
  ('c2','curtains','Velvet Room Panel','Polyester velvet','plain','{"#8A7355","#4A4036","#A8947A"}',649),
  ('s1','sofa','Cloud Boucle','Woven boucle','texture','{"#EFE9DE"}',899),
  ('s2','sofa','Heritage Twill','Poly-cotton twill','herringbone','{"#B7AB97","#7A6F5D","#4A453D"}',749),
  ('b1','blinds','Ripple Roller','PVC / flame-retardant','plain','{"#F1EBDF","#B9B0A1","#5A5248"}',1199),
  ('b2','blinds','Roman Fold Natural','Linen-look','plain','{"#DCCEB7","#A0886B"}',1399),
  ('u1','upholstery','Studio Velvet','Cotton velvet','plain','{"#5E5348","#948A7C","#C7B9A4"}',1249),
  ('u2','upholstery','Herringbone Heat','Wool blend','herringbone','{"#8B7A63","#4E453A"}',1349);
```

## 3. Deploy edge functions

```sh
npx supabase login
npx supabase link --project-ref <ref>
npx supabase functions deploy create-order payment-order settle-payout
# secrets
npx supabase secrets set RZP_KEY_ID=... RZP_KEY_SECRET=...
```

## 4. Payments — Razorpay Route (marketplace money movement)

- Create a **Razorpay Dashboard** account (Requires: business KYC — one-time).
- Enable **Routes/Transfers** (Marketplace tag) via your Razorpay relationship
  manager. Docs: https://razorpay.com/docs/payments/route/
- For each vendor: **create a linked account** (KYC) → their funds settle to
  their bank. You keep the 3% commission on your own account.
- Flow per order:
  1. `payment-order` → Razorpay order (UPI, zero MDR).
  2. Customer pays → funds collected to vendor's linked account (escrow).
  3. `razorpay` webhook (payment captured) → update `payments` table.
  4. `create-order` webhook path → compute split via `calc_split()`; insert order.
  5. Cron (daily): mark `settlements` scheduled → T+1 → `settle-payout`
     (RazorpayX transfer) → status `paid`.

> Compliance you must ship before real money: Terms, Privacy (DPDP), GST
> invoices (vendor GSTIN → buyer), TCS on commission (GSTR-8), dispute flow.

## 5. Frontend swap

In `index.html` set:

```js
window.FH_BACKEND = { enabled: true, url: "<project-url>", anonKey: "<anon-key>" };
```

Then ship a `js/provider/supabase.js` implementing the same surface as
`localAdapter` (`load`/`save`) using `supabase-js` + RLS. The DB is already
policy-protected so clients can only touch their own rows.

## Go-live checklist (money-safety)

- [ ] Vendor KYC + verification queue (admin screen exists in-app)
- [ ] Auto-complete visit only after payment captured (webhook, idempotent)
- [ ] Settlement holds for return/dispute window before T+1 release
- [ ] Commission & TCS reporting (GSTR-8 export)
- [ ] DPDP: consent, data deletion, retention policy
- [ ] Real 30-min dispatch (crew + geofencing) or honest degradation