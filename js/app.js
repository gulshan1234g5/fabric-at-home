// FabricAtHome — app: SPA router + views
// Research-informed: trust signals at every step, 3-step booking,
// real-time availability, location-first, price-first, rebooking.

(function () {
  "use strict";

  const S = window.FAHStore;
  const data = window.FAH;

  // ---- Router --------------------------------------------------------------

  let currentRoute = { name: "home", params: {} };

  function navigate(name, params) {
    currentRoute = { name, params: params || {} };
    window.scrollTo(0, 0);
    render();
  }

  // ---- DOM helpers ---------------------------------------------------------

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") node.className = attrs[k];
        else if (k === "dataset") Object.assign(node.dataset, attrs[k]);
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          node.addEventListener(k.slice(2), attrs[k]);
        } else node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => {
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function div(attrs, children) { return el("div", attrs, children); }
  const h = {
    esc(s) { return String(s == null ? "" : s); }
  };

  // ---- Shared widgets ------------------------------------------------------

  function trustRow(showroom) {
    return div({ class: "trust" }, [
      el("span", { class: "trust-star" }, ["★"]),
      el("b", {}, [String(showroom.rating)]),
      el("span", { class: "muted" }, [" (" + showroom.deals + " deals)"]),
      el("span", { class: "badge-verified" }, ["Verified"])
    ]);
  }

  function distRow(showroom) {
    return div({ class: "dist" }, [
      el("span", { class: "dot" }),
      el("span", {}, [showroom.distanceKm + " km"]),
      el("span", { class: "muted" }, ["· ~" + showroom.minsAway + " min away"])
    ]);
  }

  function swatchRow(colors) {
    const sw = div({ class: "swatches" });
    colors.forEach((c) => {
      sw.appendChild(el("span", { class: "swatch", style: "background:" + c, title: c }));
    });
    return sw;
  }

  function priceTag(item, shId) {
    return el("span", { class: "price-tag" }, [S.fmtINR(S.itemAmount(item.id, shId)) + "/m"]);
  }

  function categoryChip(id, active) {
    const cat = data.categories.find((c) => c.id === id);
    return el("button", {
      class: "chip" + (active ? " is-active" : ""),
      "data-chip": id
    }, [cat.name]);
  }

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.remove("show");
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.add("hide"); }, 2400);
    setTimeout(() => { t.hidden = true; t.classList.remove("show", "hide"); }, 3000);
  }

  // ---- View: HOME (location-first discovery) -------------------------------

  function viewHome() {
    const state = S.getState();
    const activeVisits = state.visits.filter((v) => v.status !== "completed");
    const showrooms = [...data.showrooms].sort((a, b) => a.distanceKm - b.distanceKm);

    const categoryGrid = div({ class: "cat-grid" });
    data.categories.forEach((cat) => {
      categoryGrid.appendChild(div({
        class: "cat-card",
        dataset: { nav: "category", id: cat.id }
      }, [
        el("span", { class: "cat-swatch", style: "background:" + catColor(cat.id) }, ["·"]),
        el("b", {}, [cat.name]),
        el("span", { class: "muted small" }, [cat.itemCount + " fabrics"]),
        div({ class: "cat-sub" }, [cat.subtitle])
      ]));
    });

    const shopList = div({ class: "list" });
    showrooms.forEach((sh) => {
      const cats = sh.categories.map((c) => categoryChip(c, false));
      shopList.appendChild(div({
        class: "card showroom-card",
        dataset: { nav: "showroom", id: sh.id }
      }, [
        div({ class: "showroom-top" }, [
          div({ class: "showroom-head" }, [
            el("h3", {}, [sh.name]),
            trustRow(sh)
          ]),
          div({ class: "showroom-meta" }, [distRow(sh)])
        ]),
        div({ class: "showroom-offers" }, sh.offers.map((o) =>
          el("span", { class: "offer" }, ["↳ " + o]))),
        div({ class: "cat-row" }, cats),
        el("button", { class: "btn ghost sm", dataset: { nav: "showroom", id: sh.id } }, ["View catalog"])
      ]));
    });

    const body = [
      sectionHero(),
      sectionTitled("Fabric categories", categoryGrid),
      sectionTitled("Nearby showrooms", shopList)
    ];

    if (activeVisits.length) {
      const live = div({ class: "live-strip", dataset: { nav: "live", id: activeVisits[0].id } });
      activeVisits.forEach((v) => {
        const sh = S.showroomById(v.showroomId);
        live.appendChild(div({ class: "live-row", dataset: { nav: "live", id: v.id } }, [
          el("span", { class: "live-pulse" }),
          el("span", {}, [sh.name]),
          el("span", { class: "muted cap" }, [v.status]),
          el("button", { class: "btn tiny terracotta" }, ["Track"])
        ]));
      });
      body.unshift(sectionTitled("Active visits", live));
    }

    return div({ class: "stack" }, body);
  }

  function sectionHero() {
    return div({ class: "hero" }, [
      el("div", { class: "hero-head" }, [
        el("span", { class: "pin" }, ["⌖"]),
        el("span", {}, ["Koramangala, Bengaluru"]),
        el("span", { class: "hero-check" }, ["✓ GPS"]),
        el("a", { class: "link small", href: "#", dataset: { reloc: "1" } }, ["Change"])
      ]),
      el("h2", {}, ["Fabric, brought to your home."]),
      el("p", { class: "hero-sub" }, [
        "Pick a fabric, book a visit — a verified showroom rep arrives ",
        el("b", {}, ["within ~30 minutes"]),
        " carrying the full catalog. No store-hopping."
      ]),
      div({ class: "hero-cta" }, [
        el("span", { class: "promise-num" }, ["~30"]),
        el("span", { class: "small muted" }, ["min avg. arrival at your booked slot"])
      ])
    ]);
  }

  function sectionTitled(title, content) {
    return div({ class: "section" }, [
      el("h2", { class: "section-title" }, [title]),
      content
    ]);
  }

  function catColor(id) {
    return {
      curtains: "#C1583B", sofa: "#8A7355", blinds: "#6B6255", upholstery: "#4A4036"
    }[id] || "#C1583B";
  }

  // ---- View: CATEGORY (filtered showrooms + catalog preview) ----------------

  function viewCategory(id) {
    const showrooms = data.showrooms.filter((sh) => sh.categories.includes(id))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    const list = div({ class: "list" });

    showrooms.forEach((sh) => {
      const items = S.itemsFor(sh, id).slice(0, 3);
      const prev = div({ class: "prev-row" });
      items.forEach((it) => {
        prev.appendChild(div({ class: "prev" }, [
          swatchRow(it.colors),
          el("span", { class: "small" }, [it.name]),
          el("span", { class: "price-tag sm" }, [S.fmtINR(S.itemAmount(it.id, sh.id))])
        ]));
      });
      list.appendChild(div({
        class: "card",
        dataset: { nav: "showroom", id: sh.id }
      }, [
        el("h3", {}, [sh.name]),
        trustRow(sh),
        distRow(sh),
        prev,
        el("button", { class: "btn ghost sm", dataset: { nav: "showroom", id: sh.id } }, ["Book from " + sh.name])
      ]));
    });

    return div({ class: "stack" }, [
      sectionTitled(data.categories.find((c) => c.id === id).name, list),
      div({ class: "chips sticky", dataset: { chips: "1" } },
        data.categories.map((c) => categoryChip(c.id, c.id === id)))
    ]);
  }

  // ---- View: SHOWROOM (catalog + trust + book) ------------------------------

  function viewShowroom(id) {
    const sh = S.showroomById(id);
    if (!sh) return emptyState();

    const state = S.getState();
    const shDeals = S.ordersFor(id).length;
    const items = S.itemsFor(sh, null);
    const byCat = {};
    items.forEach((it) => {
      const cat = Object.keys(data.catalog).find((k) => data.catalog[k].includes(it));
      (byCat[cat] = byCat[cat] || []).push(it);
    });

    const catTabs = div({ class: "chips", dataset: { shTabs: "1", shId: id } });
    Object.keys(byCat).forEach((cat, i) => catTabs.appendChild(categoryChip(cat, i === 0)));

    const catPanels = div({ class: "cat-panels" });
    Object.keys(byCat).forEach((cat) => {
      const list = div({ class: "list" });
      byCat[cat].forEach((it) => {
        list.appendChild(div({ class: "card fabric-card", dataset: { item: it.id } }, [
          div({ class: "fabric-swatch-lg", style: "background:" + it.colors[0] }),
          div({ class: "fabric-info" }, [
            el("b", {}, [it.name]),
            el("span", { class: "muted small" }, [it.material + " · " + it.pattern]),
            swatchRow(it.colors),
            priceTag(it, sh.id)
          ])
        ]));
      });
      const panel = div({ class: "cat-panel", dataset: { panel: cat } }, [list]);
      catPanels.appendChild(panel);
    });

    const rebook = state.orders.filter((o) => o.showroomId === id).length
      ? div({ class: "rebook", dataset: { rebook: "1", id: sh.id } }, [
          el("span", {}, ["Previously booked with " + sh.name + " — rebook the same visit in one tap."]),
          el("button", { class: "btn sm terracotta", dataset: { nav: "book", id: sh.id, rebook: "1" } }, ["Rebook"])
        ])
      : null;

    return div({ class: "stack" }, [
      div({ class: "sh-hero" }, [
        el("h2", {}, [sh.name]),
        trustRow(sh),
        distRow(sh),
        div({ class: "showroom-offers" }, sh.offers.map((o) =>
          el("span", { class: "offer" }, ["↳ " + o]))),
        div({ class: "sh-stats" }, [
          statCell(sh.rating.toFixed(1), "rating"),
          statCell(sh.deals, "deals done"),
          statCell(sh.established, "since"),
          statCell(shDeals, "your deals")
        ]),
        el("button", { class: "btn primary", dataset: { nav: "book", id: sh.id } },
          ["Book a home visit"]),
        div({ class: "sh-promise" }, [
          el("span", { class: "live-pulse" }),
          el("span", { class: "small" }, ["Rep available now — arrival in ~" + sh.minsAway + " min from slot"])
        ])
      ]),
      catTabs,
      catPanels,
      rebook
    ]);
  }

  function statCell(val, label) {
    return div({ class: "stat" }, [
      el("b", {}, [String(val)]),
      el("span", { class: "muted small" }, [label])
    ]);
  }

  // ---- View: BOOK (3-step: showroom confirmed → address+slot → confirm) ----

  function viewBook(showroomId, rebook) {
    const sh = S.showroomById(showroomId);
    if (!sh) return emptyState();

    const slots = S.nextSlots(6);
    const catTabs = div({ class: "chips", dataset: { shTabs: "1", shId: sh.id } });
    Object.keys(data.catalog).forEach((cat, i) => catTabs.appendChild(categoryChip(cat, i === 0)));

    const body = div({ class: "stack" }, [
      div({ class: "book-intro" }, [
        el("span", { class: "step-num" }, ["1 of 3"]),
        el("h2", {}, ["Book a home visit"]),
        el("p", { class: "muted" }, [
          "From " + sh.name + " (" + sh.distanceKm + " km). A verified rep arrives within ~30 min of your slot with the full catalog."
        ])
      ]),

      sectionTitled("Your address", div({ class: "card form" }, [
        labelRow("Full address", el("input", { class: "input", id: "bk-addr", placeholder: "House no, street, area", required: "" })),
        labelRow("Pincode", el("input", { class: "input", id: "bk-pin", placeholder: "e.g. 560034", inputmode: "numeric", maxlength: "6" })),
        labelRow("Delivery note (optional)", el("input", { class: "input", id: "bk-note", placeholder: "Landmark, floor, gate code" }))
      ])),

      sectionTitled("Pick a time slot", div({ class: "card form" }, [
        el("div", { class: "slots" },
          slots.map((s, i) => el("button", {
            class: "slot" + (i === 0 ? " is-active" : ""),
            "data-slot": s.iso, id: "slot-" + i
          }, [
            el("span", { class: "small muted" }, [s.date]),
            el("b", {}, [s.label])
          ]))),
        div({ class: "promise-box" }, [
          el("span", { class: "live-pulse" }),
          el("span", { class: "small" }, [
            "Promise: rep arrives ",
            el("b", {}, ["within ~30 minutes"]),
            " of this slot. On the way — live tracking in the app."
          ])
        ])
      ])),

      sectionTitled("Confirm", div({ class: "card form confirm-box" }, [
        div({ class: "confirm-line" }, [el("span", {}, [sh.name]), el("span", { class: "muted" }, [sh.area])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Visit fee"]), el("b", {}, ["₹0 · free"])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Commission"]), el("span", { class: "muted" }, ["3% only on completed deals"])]),
        el("button", { class: "btn primary lg", id: "bk-submit" }, ["Confirm visit — " + (rebook ? "rebooking" : "book now")])
      ]))
    ]);

    return body;
  }

  function labelRow(label, input) {
    return div({ class: "field" }, [el("label", {}, [label]), input]);
  }

  // ---- View: LIVE (assigned → on-the-way → arrived → completed) ------------

  function viewLive(id) {
    const state = S.getState();
    const v = state.visits.find((x) => x.id === id);
    if (!v) return emptyState();

    const sh = S.showroomById(v.showroomId);
    const crew = data.crews.find((c) => c.id === v.crewId);
    const flow = ["assigned", "on-the-way", "arrived"];

    const timeline = div({ class: "timeline" });
    flow.forEach((stage, idx) => {
      const done = S.STATUS_FLOW.indexOf(v.status) > idx;
      const active = v.status === stage;
      timeline.appendChild(div({
        class: "tl-step" + (done ? " is-done" : "") + (active ? " is-active" : "")
      }, [
        el("span", { class: "tl-node" }, [(done || active) ? "●" : "○"]),
        div({ class: "tl-body" }, [
          el("b", { class: "cap" }, [stageLabel(stage)]),
          el("span", { class: "small muted" }, [stageDesc(stage, sh)])
        ])
      ]));
    });

    const actions = div({ class: "actions" });
    if (v.status === "assigned" || v.status === "on-the-way") {
      actions.appendChild(el("button", { class: "btn ghost", dataset: { advance: id } }, ["Simulate: rep is " + (v.status === "assigned" ? "on the way" : "arriving")]));
    }
    if (v.status === "arrived") {
      actions.appendChild(el("button", { class: "btn primary lg", dataset: { deal: id } }, ["Record deal (3% commission)"]));
    }

    return div({ class: "stack" }, [
      div({ class: "live-hero", dataset: { liveRefresh: "1", id } }, [
        el("span", { class: "live-pulse-lg" }),
        el("h2", {}, [statusTitle(v)]),
        el("p", { class: "muted" }, [statusSub(v, sh)]),
        timeline
      ]),
      sectionTitled("Visit details", div({ class: "card form detail-grid" }, [
        infoCell("Showroom", sh ? sh.name : ""),
        infoCell("Rep", crew ? crew.name + " (" + crew.transport + ")" : ""),
        infoCell("Slot", S.fmtSlot(v.slot)),
        infoCell("Address", v.address.line + ", " + v.address.pincode),
        infoCell("Note", v.address.note || "—"),
        infoCell("Status", v.status)
      ])),
      actions
    ]);
  }

  function stageLabel(stage) {
    return { assigned: "Assigned", "on-the-way": "On the way", arrived: "Arrived", completed: "Completed" }[stage] || stage;
  }
  function stageDesc(stage, sh) {
    return {
      assigned: "A rep from " + (sh ? sh.name : "") + " has accepted your visit.",
      "on-the-way": "Rep is travelling to your address now.",
      arrived: "Rep has arrived. Browse fabrics together.",
      completed: "Visit finished. Deal recorded."
    }[stage] || "";
  }
  function statusTitle(v) {
    if (v.status === "arrived") return "Rep is at your door";
    if (v.status === "on-the-way") return "Rep is on the way";
    if (v.status === "completed") return "Visit completed";
    return "Visit assigned";
  }
  function statusSub(v, sh) {
    if (v.status === "arrived") return "They're carrying the " + (sh ? sh.name : "") + " catalog — take your time.";
    if (v.status === "on-the-way") return "Arriving within ~30 minutes of your booked slot. Live updates below.";
    if (v.status === "completed") return "Thanks for booking with FabricAtHome.";
    return "Your slot: " + S.fmtSlot(v.slot) + ". Rep confirmation received.";
  }

  function infoCell(label, val) {
    return div({ class: "info-cell" }, [
      el("span", { class: "muted small cap" }, [label]),
      el("span", {}, [val])
    ]);
  }

  // ---- View: BOOK-DEAL (after arrival, record the transaction) -------------

  function viewDeal(visitId) {
    const state = S.getState();
    const v = state.visits.find((x) => x.id === visitId);
    if (!v || v.status !== "arrived") return emptyState("Visit not open for recording.");

    const sh = S.showroomById(v.showroomId);
    const items = S.itemsFor(sh, null);
    const picker = div({ class: "list" });

    items.forEach((it) => {
      picker.appendChild(div({ class: "card fabric-card pick", dataset: { pick: it.id, price: S.itemAmount(it.id, sh.id) } }, [
        div({ class: "fabric-swatch-lg", style: "background:" + it.colors[0] }),
        div({ class: "fabric-info" }, [
          el("b", {}, [it.name]),
          el("span", { class: "muted small" }, [it.material]),
          priceTag(it, sh.id)
        ]),
        div({ class: "qty" }, [
          el("button", { class: "qty-btn", dataset: { qty: it.id, d: "-1" } }, ["−"]),
          el("b", { "data-qty-out": it.id }, ["0"]),
          el("button", { class: "qty-btn", dataset: { qty: it.id, d: "1" } }, ["+"]),
          el("span", { class: "unit muted small" }, ["(m)"])
        ])
      ]));
    });

    return div({ class: "stack" }, [
      div({ class: "book-intro" }, [
        el("span", { class: "step-num" }, ["Deal at door"]),
        el("h2", {}, ["Record the order"]),
        el("p", { class: "muted" }, ["Select what was chosen. Platform commission is 3% of the line total."])
      ]),
      sectionTitled("Selected fabrics", picker),
      sectionTitled("Summary", div({ class: "card form deal-sum" }, [
        div({ class: "confirm-line" }, [el("span", {}, ["Line total"]), el("b", id("dl-total"), ["₹0"])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Commission (3%)"]), el("b", id("dl-com"), ["₹0"])]),
        el("button", { class: "btn primary lg", id: "dl-submit", dataset: { finalize: visitId } }, ["Confirm deal & complete visit"])
      ]))
    ]);
  }

  // ---- View: ORDERS (history + commission) ---------------------------------

  function viewOrders() {
    const state = S.getState();
    const orders = state.orders;
    const totalCom = S.totalCommission();
    const openVisits = state.visits.filter((v) => v.status !== "completed");

    const stats = div({ class: "earn-card" }, [
      div({ class: "earn-main" }, [
        el("span", { class: "muted cap" }, ["Total platform commission earned"]),
        el("h2", {}, [S.fmtINR(totalCom)]),
        el("span", { class: "muted small" }, [orders.length + " completed deals · 3% per deal"])
      ]),
      div({ class: "earn-break" }, [
        el("div", { class: "earn-line" }, [
          el("span", {}, ["Deals"]),
          el("b", {}, [String(orders.length)])
        ]),
        el("div", { class: "earn-line" }, [
          el("span", {}, ["Avg deal value"]),
          el("b", {}, [orders.length ? S.fmtINR(Math.round(orders.reduce((s, o) => s + o.lineTotal, 0) / orders.length)) : "₹0"])
        ]),
        el("div", { class: "earn-line" }, [
          el("span", {}, ["Avg commission"]),
          el("b", {}, [orders.length ? S.fmtINR(Math.round(totalCom / orders.length)) : "₹0"])
        ])
      ])
    ]);

    const liveSec = openVisits.length
      ? sectionTitled("Live", div({ class: "list" },
          openVisits.map((v) => {
            const sh = S.showroomById(v.showroomId);
            return div({ class: "card", dataset: { nav: "live", id: v.id } }, [
              el("b", {}, [sh ? sh.name : ""]),
              el("span", { class: "muted small" }, [v.status + " · " + S.fmtSlot(v.slot)]),
              el("button", { class: "btn tiny terracotta" }, ["Track"])
            ]);
          })))
      : null;

    const orderList = div({ class: "list" });
    if (!orders.length) {
      orderList.appendChild(div({ class: "empty" }, ["No deals yet — complete a visit to earn commission."]));
    }
    orders.forEach((o) => {
      const sh = S.showroomById(o.showroomId);
      const names = o.itemIds.map((iid) => itemName(iid)).join(", ");
      orderList.appendChild(div({ class: "card order-card" }, [
        div({ class: "order-head" }, [
          el("b", {}, [sh ? sh.name : ""]),
          el("span", { class: "muted small" }, [new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })])
        ]),
        el("span", { class: "muted small" }, [names]),
        div({ class: "order-amounts" }, [
          el("span", {}, ["Deal " + S.fmtINR(o.lineTotal)]),
          el("span", { class: "com-pos" }, ["+ " + S.fmtINR(o.commission) + " (3%)"])
        ])
      ]));
    });

    const body = [stats];
    if (liveSec) body.push(liveSec);
    body.push(sectionTitled("Order history", orderList));

    return div({ class: "stack" }, body);
  }

  function itemName(iid) {
    for (const k of Object.keys(data.catalog)) {
      const it = data.catalog[k].find((x) => x.id === iid);
      if (it) return it.name;
    }
    return iid;
  }

  function emptyState(msg) {
    return div({ class: "empty" }, [msg || "Nothing here yet."]);
  }

  function id(n) { return { id: n }; }

  // ---- Render --------------------------------------------------------------

  function render() {
    const view = document.getElementById("view");
    const body = document.body;
    const tab = { home: false, orders: false };

    let content;
    switch (currentRoute.name) {
      case "category":
        content = viewCategory(currentRoute.params.id);
        tab.home = true;
        break;
      case "showroom":
        content = viewShowroom(currentRoute.params.id);
        tab.home = true;
        break;
      case "book":
        content = viewBook(currentRoute.params.id, currentRoute.params.rebook);
        tab.home = true;
        break;
      case "live":
        content = viewLive(currentRoute.params.id);
        tab.home = true;
        break;
      case "deal":
        content = viewDeal(currentRoute.params.id);
        tab.home = true;
        break;
      case "orders":
        content = viewOrders();
        tab.orders = true;
        break;
      case "home":
      default:
        content = viewHome();
        tab.home = true;
        break;
    }

    view.replaceChildren(content);
    document.getElementById("tab-home").classList.toggle("is-active", tab.home);
    document.getElementById("tab-orders").classList.toggle("is-active", tab.orders);
    document.getElementById("backBtn").hidden = currentRoute.name === "home";
    body.classList.toggle("has-subview", currentRoute.name !== "home");

    wireEvents();
  }

  // ---- Event wiring --------------------------------------------------------

  function wireEvents() {
    document.querySelectorAll("[data-nav]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = b.dataset;
        navigate(d.nav, d.nav === "book" ? { id: d.id, rebook: d.rebook ? "1" : "" } : { id: d.id });
      });
    });
    document.querySelectorAll(".cat-card").forEach((c) => {
      c.addEventListener("click", () => navigate("category", { id: c.dataset.id }));
    });

    // category page chips
    document.querySelectorAll("[data-chips] .chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        navigate("category", { id: chip.dataset.chip });
      });
    });

    // showroom page tabs
    const tabs = document.querySelectorAll("[data-shtabs] .chip");
    if (tabs.length) {
      tabs.forEach((chip) => {
        chip.addEventListener("click", () => setShowroomTab(chip));
      });
    }

    // slot selection
    document.querySelectorAll(".slot").forEach((s) => {
      s.addEventListener("click", () => {
        document.querySelectorAll(".slot").forEach((x) => x.classList.remove("is-active"));
        s.classList.add("is-active");
      });
    });

    // booking submit
    const sub = document.getElementById("bk-submit");
    if (sub) sub.addEventListener("click", submitBooking);

    // rebook shorthand
    document.querySelectorAll("[data-rebook]").forEach((r) => { /* anchor used on card */ });

    // live advance
    document.querySelectorAll("[data-advance]").forEach((b) => {
      b.addEventListener("click", () => {
        S.advanceVisit(b.dataset.advance);
        if (S.getState().visits.find((v) => v.id === b.dataset.advance).status === "arrived") {
          toast("Rep has arrived");
        }
        render();
      });
    });
    document.querySelectorAll("[data-deal]").forEach((b) => {
      b.addEventListener("click", () => navigate("deal", { id: b.dataset.deal }));
    });

    // deal qty + finalize
    document.querySelectorAll("[data-qty]").forEach((b) => {
      b.addEventListener("click", () => {
        const it = b.dataset.qty;
        const d = parseInt(b.dataset.d, 10);
        const out = document.querySelector('[data-qty-out="' + it + '"]');
        let q = parseInt(out.textContent, 10) || 0;
        q = Math.max(0, q + d);
        out.textContent = q;
        const card = b.closest(".pick");
        card.classList.toggle("is-picked", q > 0);
        updateDealSum();
      });
    });
    const finBtn = document.querySelector("[data-finalize]");
    if (finBtn) finBtn.addEventListener("click", finalizeDeal);

    // relocation link
    document.querySelectorAll("[data-reloc]").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); toast("Location change — coming in a later build"); });
    });
  }

  function setShowroomTab(chip) {
    const holder = chip.closest("[data-shtabs]");
    const shId = holder.dataset.shId;
    holder.querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    const cat = chip.dataset.chip;
    document.querySelectorAll(".cat-panel").forEach((p) => {
      p.classList.toggle("is-open", p.dataset.panel === cat);
    });
  }

  function submitBooking() {
    const addr = document.getElementById("bk-addr").value.trim();
    const pin = document.getElementById("bk-pin").value.trim();
    const note = document.getElementById("bk-note").value.trim();
    const slotBtn = document.querySelector(".slot.is-active");
    const showroomId = currentRoute.params.id;
    const sh = S.showroomById(showroomId);

    if (!addr) { toast("Enter your full address first"); return; }
    if (!pin || pin.length < 5) { toast("Enter a valid pincode"); return; }
    if (!slotBtn) { toast("Pick a time slot"); return; }

    const visit = S.createVisit(
      showroomId,
      { name: "You", phone: "+91 98xxx xxxxx" },
      { line: addr, pincode: pin, note: note || "" },
      new Date(slotBtn.dataset.slot)
    );
    toast("Visit confirmed — rep on the way");
    navigate("live", { id: visit.id });
  }

  function finalizeDeal() {
    const visitId = document.querySelector("[data-finalize]").dataset.finalize;
    const state = S.getState();
    const v = state.visits.find((x) => x.id === visitId);
    const selections = [];

    document.querySelectorAll(".pick").forEach((card) => {
      const it = card.dataset.pick;
      const qty = parseInt(card.querySelector("[data-qty-out]").textContent, 10) || 0;
      if (qty > 0) selections.push({ itemId: it, qty });
    });

    if (!selections.length) { toast("Select at least one fabric"); return; }
    const order = S.createOrder(v, selections);
    toast("Deal recorded · " + S.fmtINR(order.commission) + " commission earned");
    navigate("live", { id: visitId });
  }

  function updateDealSum() {
    let total = 0;
    document.querySelectorAll(".pick").forEach((card) => {
      const qty = parseInt(card.querySelector("[data-qty-out]").textContent, 10) || 0;
      total += qty * (parseInt(card.dataset.price, 10) || 0);
    });
    const com = Math.round(total * FAH.COMMISSION_RATE);
    const t = document.getElementById("dl-total");
    const c = document.getElementById("dl-com");
    if (t) t.innerHTML = "&nbsp;" + S.fmtINR(total).replace("₹", "");
    if (c) c.innerHTML = "&nbsp;" + S.fmtINR(com).replace("₹", "");
  }

  // ---- Boot ----------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    const back = document.getElementById("backBtn");
    back.addEventListener("click", () => navigate("home"));
    document.getElementById("tab-orders").addEventListener("click", () => navigate("orders"));
    render();
  });

  // Test hook — also handy for embedding/debugging.
  window.__FAH_APP__ = {
    navigate,
    render,
    viewHome,
    viewCategory,
    viewShowroom,
    viewBook,
    viewLive,
    viewDeal,
    viewOrders
  };
})();