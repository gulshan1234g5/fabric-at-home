// FabricAtHome — store: domain logic over the provider (V2)
// Production-shaped: buyer booking, dispatch state machine, order + 3%
// commission split, reviews, vendor earnings, settlement ledger.

(function () {
  "use strict";

  const P = window.FAHProvider;

  // ---- State / persistence -------------------------------------------------

  function defaultState() {
    const now = Date.now();
    const day = 86400000;
    return {
      meta: { schema: 2, seededAt: new Date().toISOString() },
      showrooms: JSON.parse(JSON.stringify(FAH.vendors)),
      visits: [
        {
          id: "v-1001", showroomId: "v3",
          customer: { name: "Ravi Nair", phone: "+91 98xxx x4809" },
          address: { line: "14, 4th Cross, Jayanagar 4th Block", pincode: "560011", note: "Green gate, 2nd floor" },
          slot: new Date(now - 2 * day).toISOString(),
          status: "completed",
          crewId: "cr2",
          assignedAt: new Date(now - 2 * day).toISOString(),
          arrivedAt: new Date(now - 2 * day + 26 * 60000).toISOString(),
          paymentId: "p-1001", dealId: "o-2001", reviewId: null
        },
        {
          id: "v-1002", showroomId: "v1",
          customer: { name: "Sana Kapoor", phone: "+91 97xxx x2210" },
          address: { line: "B-802, Palm Meadows, Koramangala", pincode: "560034", note: "Knock twice, intercom 0802" },
          slot: new Date(now - 5 * day).toISOString(),
          status: "completed",
          crewId: "cr1",
          assignedAt: new Date(now - 5 * day).toISOString(),
          arrivedAt: new Date(now - 5 * day + 31 * 60000).toISOString(),
          paymentId: "p-1002", dealId: "o-2002", reviewId: null
        }
      ],
      orders: [
        {
          id: "o-2001", visitId: "v-1001", showroomId: "v3",
          itemIds: ["u2", "c4"], lineTotal: 10490,
          commissionRate: FAH.COMMISSION_RATE,
          commission: Math.round(10490 * FAH.COMMISSION_RATE),
          vendorShare: 10490 - Math.round(10490 * FAH.COMMISSION_RATE),
          createdAt: new Date(now - 2 * day).toISOString(), status: "completed"
        },
        {
          id: "o-2002", visitId: "v-1002", showroomId: "v1",
          itemIds: ["c1", "b1"], lineTotal: 7290,
          commissionRate: FAH.COMMISSION_RATE,
          commission: Math.round(7290 * FAH.COMMISSION_RATE),
          vendorShare: 7290 - Math.round(7290 * FAH.COMMISSION_RATE),
          createdAt: new Date(now - 5 * day).toISOString(), status: "completed"
        }
      ],
      payments: [
        { id: "p-1001", visitId: "v-1001", amount: 10490, method: "UPI", status: "paid", createdAt: new Date(now - 2 * day).toISOString() },
        { id: "p-1002", visitId: "v-1002", amount: 7290, method: "UPI", status: "paid", createdAt: new Date(now - 5 * day).toISOString() }
      ],
      reviews: [
        { id: "r-3001", visitId: "v-1001", showroomId: "v3", reviewer: "Ravi Nair",
          rating: 5, dims: { punctuality: 5, quality: 5, communication: 4 },
          comment: "Rep carried full range, measured both windows. Clean and on time.",
          createdAt: new Date(now - 2 * day + 2 * 3600000).toISOString() },
        { id: "r-3002", visitId: "v-1002", showroomId: "v1", reviewer: "Sana Kapoor",
          rating: 4, dims: { punctuality: 4, quality: 5, communication: 4 },
          comment: "Good fabrics, arrived slightly late but worth it.",
          createdAt: new Date(now - 5 * day + 2 * 3600000).toISOString() }
      ],
      settlements: [
        { id: "s-9001", orderId: "o-2001", showroomId: "v3", vendorShare: 10490 - Math.round(10490 * FAH.COMMISSION_RATE), status: "paid", createdAt: new Date(now - 1 * day).toISOString() },
        { id: "s-9002", orderId: "o-2002", showroomId: "v1", vendorShare: 7290 - Math.round(7290 * FAH.COMMISSION_RATE), status: "paid", createdAt: new Date(now - 4 * day).toISOString() }
      ]
    };
  }

  function getState() {
    const s = P.readState();
    return s && s.meta && s.meta.schema === 2 ? s : defaultState();
  }
  function save(s) { P.writeState(s); }

  // ---- Lookups -------------------------------------------------------------

  function vendorById(id) {
    return getState().showrooms.find((v) => v.id === id) || null;
  }
  function itemAmount(itemId, vendorId) {
    for (const cat of Object.keys(FAH.catalog)) {
      const it = FAH.catalog[cat].find((x) => x.id === itemId);
      if (it) {
        const mod = (FAH.priceMod[vendorId] && FAH.priceMod[vendorId][itemId]) || 1;
        return Math.round(it.pricePerMeter * mod);
      }
    }
    return 0;
  }
  function itemsFor(vendor, categoryId) {
    const ids = FAH.showroomCatalog[vendor.id] || [];
    const out = [];
    for (const cat of Object.keys(FAH.catalog)) {
      if (categoryId && cat !== categoryId) continue;
      for (const it of FAH.catalog[cat]) if (ids.includes(it.id)) out.push(it);
    }
    return out;
  }
  function itemName(iid) {
    for (const k of Object.keys(FAH.catalog)) {
      const it = FAH.catalog[k].find((x) => x.id === iid);
      if (it) return it.name;
    }
    return iid;
  }
  function categoryName(id) {
    const c = FAH.categories.find((x) => x.id === id);
    return c ? c.name : id;
  }

  // ---- Visit lifecycle -----------------------------------------------------

  const STATUS_FLOW = ["assigned", "on-the-way", "arrived", "completed"];
  let crewCounter = 0;

  function createVisit(showroomId, customer, address, slot) {
    const s = getState();
    const id = "v-" + (1000 + s.visits.length + Date.now().toString(36));
    const crew = FAH.crews[crewCounter++ % FAH.crews.length];
    const v = {
      id, showroomId, customer, address,
      slot: new Date(slot).toISOString(),
      status: "assigned", crewId: crew.id,
      assignedAt: new Date().toISOString(), arrivedAt: null,
      paymentId: null, dealId: null, reviewId: null
    };
    s.visits.unshift(v);
    save(s);
    return v;
  }

  function advanceVisit(visitId) {
    const s = getState();
    const v = s.visits.find((x) => x.id === visitId);
    if (!v) return null;
    const i = STATUS_FLOW.indexOf(v.status);
    if (i < 0 || i >= STATUS_FLOW.length - 1) return v;
    v.status = STATUS_FLOW[i + 1];
    if (v.status === "arrived") v.arrivedAt = new Date().toISOString();
    save(s);
    return v;
  }

  // ---- Payment (UPI intent record; Razorpay wires in backend) --------------

  function createPayment(visit, amount) {
    const s = getState();
    const p = {
      id: "p-" + (1000 + s.payments.length + Date.now().toString(36)),
      visitId: visit.id, amount, method: "UPI", status: "paid",
      createdAt: new Date().toISOString()
    };
    s.payments.unshift(p);
    const v = s.visits.find((x) => x.id === visit.id);
    if (v) v.paymentId = p.id;
    save(s);
    return p;
  }

  // ---- Order (deal) with 3% commission split -------------------------------

  function createOrder(visit, selections) {
    const s = getState();
    const lineTotal = selections.reduce((t, sel) => t + itemAmount(sel.itemId, visit.showroomId) * sel.qty, 0);
    const commission = Math.round(lineTotal * FAH.COMMISSION_RATE);
    const order = {
      id: "o-" + (2000 + s.orders.length + 1) + "-" + Date.now().toString(36),
      visitId: visit.id, showroomId: visit.showroomId,
      itemIds: selections.map((x) => x.itemId),
      lineTotal, commissionRate: FAH.COMMISSION_RATE,
      commission, vendorShare: lineTotal - commission,
      createdAt: new Date().toISOString(), status: "completed"
    };
    s.orders.unshift(order);
    const v = s.visits.find((x) => x.id === visit.id);
    if (v) { v.status = "completed"; v.dealId = order.id; }

    // Payment + settlement record (T+1 vendor settlement) — same state object
    const payment = {
      id: "p-" + (1000 + s.payments.length + Date.now().toString(36)),
      visitId: visit.id, amount: lineTotal, method: "UPI", status: "paid",
      createdAt: new Date().toISOString()
    };
    s.payments.unshift(payment);
    if (v) v.paymentId = payment.id;

    s.settlements.unshift({
      id: "s-9" + (Date.now().toString(36)),
      orderId: order.id, showroomId: visit.showroomId,
      vendorShare: order.vendorShare, status: "scheduled",
      createdAt: new Date().toISOString(),
      settleBy: new Date(Date.now() + FAH.SETTLEMENT_T_DAYS * 86400000).toISOString()
    });
    save(s);
    return order;
  }

  // ---- Reviews (trust engine, auto-prompt after completed deal) ------------

  function createReview(visit, rating, dims, comment) {
    const s = getState();
    const r = {
      id: "r-" + (3000 + s.reviews.length + 1) + "-" + Date.now().toString(36),
      visitId: visit.id, showroomId: visit.showroomId,
      reviewer: visit.customer.name || "Guest",
      rating, dims, comment,
      createdAt: new Date().toISOString()
    };
    s.reviews.unshift(r);
    const v = s.visits.find((x) => x.id === visit.id);
    if (v) v.reviewId = r.id;
    // bump vendor rating
    const vd = s.showrooms.find((x) => x.id === visit.showroomId);
    if (vd) {
      const old = vd.rating * vd.deals;
      vd.deals += 1;
      vd.rating = Math.round(((old + rating) / vd.deals) * 10) / 10;
    }
    save(s);
    return r;
  }

  function reviewsFor(vendorId) {
    return getState().reviews.filter((r) => r.showroomId === vendorId);
  }

  // ---- Money helpers -------------------------------------------------------

  function totalCommission() {
    return getState().orders.reduce((t, o) => t + (o.commission || 0), 0);
  }
  function ordersFor(vendorId) {
    return getState().orders.filter((o) => o.showroomId === vendorId);
  }
  function vendorEarnings(vendorId) {
    const orders = ordersFor(vendorId);
    return {
      orders: orders.length,
      gross: orders.reduce((t, o) => t + o.lineTotal, 0),
      commission: orders.reduce((t, o) => t + o.commission, 0),
      net: orders.reduce((t, o) => t + o.vendorShare, 0)
    };
  }
  function settlementsFor(vendorId) {
    return getState().settlements.filter((s) => s.showroomId === vendorId);
  }
  function settleStats() {
    const s = getState();
    return {
      pendingOrders: s.orders.length,
      scheduledPayouts: s.settlements.filter((x) => x.status === "scheduled").length,
      paidPayouts: s.settlements.filter((x) => x.status === "paid").length,
      ordersValue: s.orders.reduce((t, o) => t + o.lineTotal, 0)
    };
  }

  // ---- Formatting ----------------------------------------------------------

  function fmtINR(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
  function fmtSlot(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  function fmtDateOnly(iso) {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  function nextSlots(count) {
    const out = [];
    const now = new Date();
    now.setSeconds(0, 0);
    const start = new Date(now);
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30);
    let t = new Date(start);
    while (out.length < count) {
      const h = t.getHours();
      if (h >= 10 && h < 20) {
        out.push({
          label: t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          date: t.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
          iso: t.toISOString()
        });
      }
      t = new Date(t.getTime() + 30 * 60000);
    }
    return out;
  }

  window.FAHStore = {
    getState, save,
    vendorById, itemAmount, itemsFor, itemName, categoryName,
    createVisit, advanceVisit, createPayment,
    createOrder, totalCommission, ordersFor,
    reviewsFor, createReview,
    vendorEarnings, settlementsFor, settleStats,
    fmtINR, fmtSlot, fmtDateOnly, nextSlots,
    STATUS_FLOW
  };
})();