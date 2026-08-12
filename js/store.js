// FabricAtHome — store: localStorage persistence + domain logic
// State: { visits: [], orders: [] }. All logic is pure & mock-friendly.

(function () {
  "use strict";

  const KEY = "fah.state.v1";

  // ---- Helpers -------------------------------------------------------------

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!Array.isArray(s.visits) || !Array.isArray(s.orders)) return null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function seed() {
    const now = Date.now();
    const day = 86400000;
    return {
      visits: [
        {
          id: "v-1001",
          showroomId: "sh3",
          customer: { name: "Ravi Nair", phone: "+91 98xxx x4809" },
          address: { line: "14, 4th Cross, Jayanagar 4th Block", pincode: "560011", note: "Green gate, 2nd floor" },
          slot: new Date(now - 2 * day).toISOString(),
          status: "completed",
          crewId: "cr2",
          assignedAt: new Date(now - 2 * day).toISOString(),
          arrivedAt: new Date(now - 2 * day + 26 * 60000).toISOString(),
          dealId: "o-2001"
        },
        {
          id: "v-1002",
          showroomId: "sh1",
          customer: { name: "Sana Kapoor", phone: "+91 97xxx x2210" },
          address: { line: "B-802, Palm Meadows, Koramangala", pincode: "560034", note: "Knock twice, intercom 0802" },
          slot: new Date(now - 5 * day).toISOString(),
          status: "completed",
          crewId: "cr1",
          assignedAt: new Date(now - 5 * day).toISOString(),
          arrivedAt: new Date(now - 5 * day + 31 * 60000).toISOString(),
          dealId: "o-2002"
        }
      ],
      orders: [
        {
          id: "o-2001",
          visitId: "v-1001",
          showroomId: "sh3",
          itemIds: ["u2", "c4"],
          lineTotal: 10490,
          commissionRate: FAH.COMMISSION_RATE,
          commission: Math.round(10490 * FAH.COMMISSION_RATE),
          createdAt: new Date(now - 2 * day).toISOString(),
          status: "completed"
        },
        {
          id: "o-2002",
          visitId: "v-1002",
          showroomId: "sh1",
          itemIds: ["c1", "b1"],
          lineTotal: 7290,
          commissionRate: FAH.COMMISSION_RATE,
          commission: Math.round(7290 * FAH.COMMISSION_RATE),
          createdAt: new Date(now - 5 * day).toISOString(),
          status: "completed"
        }
      ]
    };
  }

  function getState() {
    return load() || seed();
  }

  function persist(state) {
    save(state);
  }

  // ---- Visit lifecycle -----------------------------------------------------

  const STATUS_FLOW = ["assigned", "on-the-way", "arrived", "completed"];

  function createVisit(showroomId, customer, address, slot) {
    const state = getState();
    const id = "v-" + (1000 + state.visits.length + 1) + "-" + Date.now().toString(36);
    const visit = {
      id,
      showroomId,
      customer,
      address,
      slot: new Date(slot).toISOString(),
      status: "assigned",
      crewId: pickCrew(),
      assignedAt: new Date().toISOString(),
      arrivedAt: null
    };
    state.visits.unshift(visit);
    persist(state);
    return visit;
  }

  function pickCrew() {
    return FAH.crews[(stateVisitCounter() % FAH.crews.length)].id;
  }

  // deterministic-ish crew pick without storing extra counter state
  function stateVisitCounter() {
    const raw = localStorage.getItem(KEY + ".cc") || "0";
    const n = parseInt(raw, 10) || 0;
    localStorage.setItem(KEY + ".cc", String(n + 1));
    return n;
  }

  function advanceVisit(visitId) {
    const state = getState();
    const v = state.visits.find((x) => x.id === visitId);
    if (!v) return null;
    const i = STATUS_FLOW.indexOf(v.status);
    if (i < 0 || i >= STATUS_FLOW.length - 1) return v;
    v.status = STATUS_FLOW[i + 1];
    if (v.status === "arrived") v.arrivedAt = new Date().toISOString();
    persist(state);
    return v;
  }

  // ---- Orders --------------------------------------------------------------

  function itemAmount(itemId, showroomId) {
    for (const cat of Object.keys(FAH.catalog)) {
      const it = FAH.catalog[cat].find((x) => x.id === itemId);
      if (it) {
        const mod = (FAH.priceMod[showroomId] && FAH.priceMod[showroomId][itemId]) || 1;
        return Math.round(it.pricePerMeter * mod);
      }
    }
    return 0;
  }

  function createOrder(visit, selections) {
    const state = getState();
    const itemIds = selections.map((s) => s.itemId);
    const lineTotal = selections.reduce((sum, s) => sum + itemAmount(s.itemId, visit.showroomId) * s.qty, 0);
    const order = {
      id: "o-" + (2000 + state.orders.length + 1) + "-" + Date.now().toString(36),
      visitId: visit.id,
      showroomId: visit.showroomId,
      itemIds,
      lineTotal,
      commissionRate: FAH.COMMISSION_RATE,
      commission: Math.round(lineTotal * FAH.COMMISSION_RATE),
      createdAt: new Date().toISOString(),
      status: "completed"
    };
    state.orders.unshift(order);
    const v = state.visits.find((x) => x.id === visit.id);
    if (v) {
      v.status = "completed";
      v.dealId = order.id;
    }
    persist(state);
    return order;
  }

  function totalCommission() {
    return getState().orders.reduce((s, o) => s + (o.commission || 0), 0);
  }

  function ordersFor(showroomId) {
    return getState().orders.filter((o) => o.showroomId === showroomId);
  }

  // ---- Lookups -------------------------------------------------------------

  function showroomById(id) {
    return FAH.showrooms.find((s) => s.id === id) || null;
  }

  function itemsFor(showroom, categoryId) {
    const ids = FAH.showroomCatalog[showroom.id] || [];
    const items = [];
    for (const cat of Object.keys(FAH.catalog)) {
      if (categoryId && cat !== categoryId) continue;
      for (const it of FAH.catalog[cat]) {
        if (ids.includes(it.id)) items.push(it);
      }
    }
    return items;
  }

  function categoryName(id) {
    const c = FAH.categories.find((x) => x.id === id);
    return c ? c.name : id;
  }

  function fmtINR(n) {
    return "₹" + Number(n).toLocaleString("en-IN");
  }

  function fmtSlot(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }

  // Next N bookable slots (30-min increments from now, 10:00–20:00).
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
    getState,
    persist,
    createVisit,
    advanceVisit,
    createOrder,
    totalCommission,
    ordersFor,
    showroomById,
    itemsFor,
    itemAmount,
    categoryName,
    fmtINR,
    fmtSlot,
    nextSlots,
    STATUS_FLOW
  };
})();