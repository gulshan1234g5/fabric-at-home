-- FabricAtHome — Supabase schema (production-shaped)
-- Postgres + Row Level Security. Mirrors js/provider.js contract so the
-- frontend goes live by flipping window.FH_BACKEND.enabled = true.
--
-- Apply: Supabase Dashboard → SQL Editor → paste → Run (idempotent).

create extension if not exists "pgcrypto";

-- ===== Role helpers =====
create type public.app_role as enum ('buyer', 'vendor', 'admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'buyer',
  name text,
  phone text,
  vendor_id uuid,
  created_at timestamptz not null default now()
);

-- ===== Vendors (showrooms) =====
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id),
  name text not null,
  owner text,
  phone text,
  gstin text,
  verified boolean not null default false,
  insured boolean not null default false,
  area text,
  distance_km numeric,
  mins_away numeric,
  rating numeric not null default 0,
  deals int not null default 0,
  established int,
  categories text[] not null default '{}',
  offers text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ===== Catalog (shared price vocabulary, ₹/meter) =====
create table public.catalog (
  id text primary key,
  category text not null,
  name text not null,
  material text,
  pattern text,
  colors text[] not null default '{}',
  price_per_meter int not null
);

-- Vendor offering: which catalog items a vendor carries + per-item price modifier
create table public.vendor_items (
  vendor_id uuid references public.vendors(id) on delete cascade,
  item_id text references public.catalog(id) on delete cascade,
  price_mod numeric not null default 1,
  primary key (vendor_id, item_id)
);

-- ===== Visits (the core entity) =====
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references public.profiles(id),
  vendor_id uuid references public.vendors(id),
  status text not null default 'assigned'
    check (status in ('assigned','on-the-way','arrived','completed','cancelled')),
  crew_id text,
  slot timestamptz not null,
  address jsonb not null,
  assigned_at timestamptz,
  arrived_at timestamptz,
  payment_id text,
  deal_id text,
  review_id text,
  created_at timestamptz not null default now()
);

-- ===== Orders (deals) with commission split =====
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.visits(id),
  vendor_id uuid references public.vendors(id),
  item_ids text[] not null default '{}',
  line_total int not null,
  commission_rate numeric not null,
  commission int not null,
  vendor_share int not null,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

-- ===== Payments (UPI via Razorpay) =====
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.visits(id),
  rzp_order_id text,
  rzp_payment_id text,
  method text not null default 'UPI',
  status text not null check (status in ('created','paid','refunded')),
  amount int not null,
  created_at timestamptz not null default now()
);

-- ===== Settlements (T+1 vendor payout ledger) =====
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  vendor_id uuid references public.vendors(id),
  vendor_share int not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','paid','failed')),
  settlement_ref text,
  settle_by timestamptz,
  created_at timestamptz not null default now()
);

-- ===== Reviews (trust engine) =====
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references public.visits(id),
  vendor_id uuid references public.vendors(id),
  reviewer text,
  rating int not null check (rating between 1 and 5),
  dims jsonb default '{}',
  comment text,
  created_at timestamptz not null default now()
);

create index idx_visits_buyer on public.visits(buyer_id);
create index idx_visits_vendor on public.visits(vendor_id);
create index idx_orders_vendor on public.orders(vendor_id);
create index idx_reviews_vendor on public.reviews(vendor_id);
create index idx_settlements_vendor on public.settlements(vendor_id);

-- ===== Row Level Security =====
alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_items enable row level security;
alter table public.catalog enable row level security;
alter table public.visits enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.settlements enable row level security;
alter table public.reviews enable row level security;

-- Public read: catalog, vendors (only verified), their items, reviews
drop policy if exists "catalog public read" on public.catalog;
create policy "catalog public read" on public.catalog for select using (true);

drop policy if exists "vendors public read" on public.vendors;
create policy "vendors public read" on public.vendors for select using (verified = true or role_is('admin'));

drop policy if exists "vendor_items public read" on public.vendor_items;
create policy "vendor_items public read" on public.vendor_items for select using (true);

drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read" on public.reviews for select using (true);

-- Buyer: read own visits/orders/payments; write own visits + reviews
drop policy if exists "visits buyer own" on public.visits;
create policy "visits buyer own" on public.visits
  for select using (buyer_id = auth.uid() or role_is('admin'));

drop policy if exists "visits buyer insert" on public.visits;
create policy "visits buyer insert" on public.visits
  for insert with check (buyer_id = auth.uid());

drop policy if exists "orders buyer own" on public.orders;
create policy "orders buyer own" on public.orders
  for select using (visit_buyer(visit_id) = auth.uid() or role_is('admin') or vendor_owns(vendor_id));

drop policy if exists "payments buyer own" on public.payments;
create policy "payments buyer own" on public.payments
  for select using (visit_buyer(visit_id) = auth.uid() or role_is('admin'));

drop policy if exists "reviews buyer insert" on public.reviews;
create policy "reviews buyer insert" on public.reviews
  for insert with check (visit_buyer(visit_id) = auth.uid());

-- Vendor: read orders/settlements/reviews for own vendor, update own visit status
drop policy if exists "visits vendor update" on public.visits;
create policy "visits vendor update" on public.visits
  for update using (vendor_owns(vendor_id)) with check (status in ('assigned','on-the-way','arrived','completed'));

drop policy if exists "settlements vendor read" on public.settlements;
create policy "settlements vendor read" on public.settlements
  for select using (vendor_owns(vendor_id) or role_is('admin'));

drop policy if exists "vendor own update" on public.vendors;
create policy "vendor own update" on public.vendors
  for update using (role_is('vendor') and owner_id = auth.uid() and not verified);

-- Admin: full access to everything
do $$
begin
  for tbl in array['vendors','visits','orders','payments','settlements','reviews','profiles']
  loop
    execute format(
      'drop policy if exists %I on public.%I', 'admin_all_' || tbl, tbl);
    execute format(
      'create policy %I on public.%I for all using (role_is(''admin'')) with check (role_is(''admin''))',
      'admin_all_' || tbl, tbl);
  end loop;
end $$;

-- ===== Helper SQL functions (used by policies + edge functions) =====
create or replace function public.role_is(r public.app_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = r
  );
$$;

create or replace function public.vendor_owns(v uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.vendor_id = v
  );
$$;

create or replace function public.visit_buyer(vid uuid)
returns uuid language sql stable as $$
  select buyer_id from public.visits where id = vid;
$$;

-- Commission split (kept on the DB so client can never fudge the take)
create or replace function public.calc_split(line_total int)
returns table(commission int, vendor_share int) language sql immutable as $$
  select round(line_total * 0.03), line_total - round(line_total * 0.03);
$$;

-- ===== Auto-review re-prompt + vendor rating update trigger =====
create or replace function public.after_review()
returns trigger language plpgsql as $$
begin
  update public.visits set review_id = new.id where id = new.visit_id;
  update public.vendors v set
    deals = deals + 1,
    rating = round(((v.rating * v.deals) + new.rating) / (v.deals + 1) * 10) / 10
  where v.id = new.vendor_id;
  return new;
end;
$$;

drop trigger if exists trg_review on public.reviews;
create trigger trg_review after insert on public.reviews
  for each row execute function public.after_review();