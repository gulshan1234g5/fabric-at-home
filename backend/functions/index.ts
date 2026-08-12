/**
 * FabricAtHome — Edge Functions (Supabase / Deno)
 * Deploy with: supabase functions deploy create-order create-payment settle-payout
 */

/** POST create-order — record deal, split 3% commission, create payment + T+1 settlement.
 *  Body: { visitId, selections: [{itemId, qty}] }
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const { visitId, selections } = await req.json();

  const supabase = supabaseClient();
  const { data: visit, error: vErr } = await supabase
    .from("visits").select("id, vendor_id, status").eq("id", visitId).single();
  if (vErr || visit.status !== "arrived") return json({ error: "visit not open" }, 400);

  let lineTotal = 0;
  for (const sel of selections || []) {
    const { data: vi } = await supabase
      .from("vendor_items")
      .select("item_id, price_mod, catalog!inner(price_per_meter)")
      .eq("vendor_id", visit.vendor_id).eq("item_id", sel.itemId).single();
    const ppu = Math.round((vi?.catalog?.price_per_meter ?? 0) * (vi?.price_mod ?? 1));
    lineTotal += ppu * (sel.qty || 0);
  }
  if (lineTotal <= 0) return json({ error: "empty order" }, 400);

  const commission = Math.round(lineTotal * 0.03);
  const vendorShare = lineTotal - commission;

  const { data: order, error: oErr } = await supabase
    .from("orders")
    .insert({
      visit_id: visitId, vendor_id: visit.vendor_id,
      item_ids: selections.map((s) => s.itemId),
      line_total: lineTotal, commission_rate: 0.03,
      commission, vendor_share: vendorShare
    })
    .select().single();
  if (oErr) return json({ error: oErr.message }, 500);

  await supabase.from("visits")
    .update({ status: "completed", deal_id: order.id })
    .eq("id", visitId);

  await supabase.from("settlements").insert({
    order_id: order.id, vendor_id: visit.vendor_id,
    vendor_share: vendorShare, status: "scheduled",
    settle_by: new Date(Date.now() + 86400000).toISOString()
  });

  return json({ order, commission, vendorShare });
});

/** POST p/order — create Razorpay order (customer pays vendor share flow).
 *  Production: use Razorpay Route (linked accounts) to collect customer payment
 *  into escrow and split platform commission + T+1 vendor payout automatically.
 */
Deno.serve("payment-order", async (req) => {
  const body = await req.json();
  const rzp = Razorpay({ key_id: Deno.env.get("RZP_KEY_ID"), key_secret: Deno.env.get("RZP_KEY_SECRET") });
  const { id } = await rzp.orders.create({
    amount: body.amount * 100, currency: "INR",
    notes: { visitId: body.visitId }
  });
  return json({ orderId: id, amount: body.amount, method: "upi" });
});

/** POST settle-payout — mark settlement paid (RazorpayX transfer / manual).
 *  Body: { settlementId }
 */
Deno.serve("settle-payout", async (req) => {
  const { settlementId } = await req.json();
  const supabase = supabaseClient();
  await supabase.from("settlements")
    .update({ status: "paid", settlement_ref: "rzpx_" + Date.now() })
    .eq("id", settlementId);
  return json({ ok: true });
});

// ---- helpers ----
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
function supabaseClient() {
  const { createClient } = globalThis.supabase || {};
  // imported @supabase/supabase-js in real deployment
  return createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
}