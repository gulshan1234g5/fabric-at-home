// FabricAtHome — app: SPA views + wiring (V2, production-shaped)
// Role-aware: buyer / vendor / admin surfaces. Research-informed trust
// signals, 3-step booking, real-time availability, price-first.

(function () {
  "use strict";

  const S = window.FAHStore;
  const data = window.FAH;

  // ---- Router --------------------------------------------------------------

  let route = { name: "home", params: {} };

  function navigate(name, params) {
    route = { name, params: params || {} };
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
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function div(attrs, children) { return el("div", attrs, children); }
  function btn(label, attrs) { return el("button", attrs, [label]); }

  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    t.className = "toast show";
    setTimeout(() => t.className = "toast hide", 2400);
    setTimeout(() => { t.hidden = true; }, 3000);
  }

  // ---- Shared widgets ------------------------------------------------------

  function trustRow(v) {
    return div({ class: "trust" }, [
      el("span", { class: "trust-star" }, ["★"]),
      el("b", {}, [String(v.rating)]),
      el("span", { class: "muted" }, [" (" + v.deals + " deals)"]),
      v.verified ? el("span", { class: "badge-verified" }, ["Verified"]) : el("span", { class: "badge-unverified" }, ["New"]),
      v.insured ? el("span", { class: "badge-insured" }, ["Insured"]) : null
    ]);
  }
  function distRow(v) {
    const km = geoDistance(v);
    return div({ class: "dist" }, [
      el("span", { class: "dot" }),
      el("span", {}, [km + " km"]),
      el("span", { class: "muted" }, ["· ~" + geoMins(v) + " min away"])
    ]);
  }
  // wrap geo so tests without FAHGeo stay safe
  function geoDistance(v) {
    if (typeof window.FAHGeo !== "undefined") return window.FAHGeo.distanceToVendor(v).toFixed(1);
    return v.distanceKm;
  }
  function geoMins(v) {
    if (typeof window.FAHGeo !== "undefined") return window.FAHGeo.minsAwayTo(v);
    return v.minsAway || 10;
  }
  function geoSorted() {
    if (typeof window.FAHGeo !== "undefined") return window.FAHGeo.sortedShowrooms();
    return null; // caller falls back to seed
  }
  function swatchRow(colors) {
    const sw = div({ class: "swatches" });
    colors.forEach((c) => sw.appendChild(el("span", { class: "swatch", style: "background:" + c, title: c })));
    return sw;
  }
  function priceTag(item, vendorId) {
    return el("span", { class: "price-tag" }, [S.fmtINR(S.itemAmount(item.id, vendorId)) + "/m"]);
  }
  function catChip(id, active) {
    const c = data.categories.find((x) => x.id === id);
    return el("button", { class: "chip" + (active ? " is-active" : ""), "data-chip": id }, [c.name]);
  }
  function catColor(id) {
    return { curtains: "#C1583B", sofa: "#8A7355", blinds: "#6B6255", upholstery: "#4A4036" }[id] || "#C1583B";
  }
  function section(title, content) {
    return div({ class: "section" }, [
      el("h2", { class: "section-title" }, [title]),
      content
    ]);
  }
  function stars(n) {
    const out = div({ class: "stars" });
    for (let i = 1; i <= 5; i++) {
      out.appendChild(el("span", { class: "star" + (i <= Math.round(n) ? " on" : "") }, ["★"]));
    }
    return out;
  }

  // ---- View: HOME (buyer discovery) ----------------------------------------

  function viewHome() {
    const st = S.getState();
    const geoList = geoSorted();
    const sortable = geoList || [...st.showrooms].sort((a, b) => a.distanceKm - b.distanceKm);
    const activeVisits = st.visits.filter((v) => v.status !== "completed");

    const catGrid = div({ class: "cat-grid" });
    data.categories.forEach((c) => {
      catGrid.appendChild(div({ class: "cat-card", dataset: { nav: "category", id: c.id } }, [
        el("span", { class: "cat-swatch", style: "background:" + catColor(c.id) }, ["·"]),
        el("b", {}, [c.name]),
        el("span", { class: "muted small" }, [c.itemCount + " fabrics"]),
        div({ class: "cat-sub" }, [c.subtitle])
      ]));
    });

    const list = div({ class: "list" });
    sortable.forEach((v) => {
      list.appendChild(div({ class: "card showroom-card", dataset: { nav: "showroom", id: v.id } }, [
        div({ class: "showroom-top" }, [
          div({ class: "showroom-head" }, [el("h3", {}, [v.name]), trustRow(v)]),
          div({ class: "showroom-meta" }, [distRow(v)])
        ]),
        div({ class: "showroom-offers" }, v.offers.map((o) => el("span", { class: "offer" }, ["↳ " + o]))),
        div({ class: "cat-row" }, v.categories.map((c) => catChip(c, false))),
        // latest review teaser (trust at a glance)
        (function () {
          const rv = S.reviewsFor(v.id)[0];
          return rv ? div({ class: "review-teaser" }, [
            stars(rv.rating),
            el("span", { class: "muted small" }, ["\u201C" + rv.comment.slice(0, 46) + "\u201D"])
          ]) : null;
        })(),
        btn("View catalog", { class: "btn ghost sm", dataset: { nav: "showroom", id: v.id } })
      ]));
    });

    const body = [heroSection(), customerStrip()];
    if (activeVisits.length) {
      const live = div({ class: "live-strip" });
      activeVisits.forEach((v) => {
        const vd = S.vendorById(v.showroomId);
        live.appendChild(div({ class: "live-row", dataset: { nav: "live", id: v.id } }, [
          el("span", { class: "live-pulse" }),
          el("span", {}, [vd ? vd.name : ""]),
          el("span", { class: "muted cap" }, [v.status]),
          btn("Track", { class: "btn tiny terracotta", dataset: { nav: "live", id: v.id } })
        ]));
      });
      body.push(section("Active visits", live));
    }
    body.push(section("Fabric categories", catGrid));
    body.push(section("Nearby showrooms", list));

    return div({ class: "stack" }, body);
  }

  function heroSection() {
    const loc = heroLocationWidget();
    return div({ class: "hero" }, [
      div({ class: "hero-head" }, [
        el("span", { class: "pin" }, ["⌖"]),
        el("span", { class: "hero-place", id: "hero-place" }, [loc.place]),
        el("span", { class: "hero-check", id: "hero-check" }, [loc.chip]),
        el("a", { class: "link small", href: "#", dataset: { reloc: "1" } }, ["Change"])
      ]),
      el("h2", {}, ["Fabric, brought to your home."]),
      el("p", { class: "hero-sub" }, [
        "Pick a fabric, book a visit — a verified showroom rep arrives ",
        el("b", {}, ["within ~30 minutes"]),
        " with the full catalog. No store-hopping."
      ]),
      div({ class: "hero-cta" }, [
        el("span", { class: "promise-num" }, ["~30"]),
        el("span", { class: "small muted" }, ["min avg. arrival at your booked slot"])
      ]),
      locationSheet()
    ]);
  }

  function heroLocationWidget() {
    if (typeof window.FAHGeo === "undefined") return { place: "Koramangala, Bengaluru", chip: "Offline" };
    const g = window.FAHGeo;
    const st = g.status();
    if (st === "live") return { place: g.placeLabel(), chip: "✓ Live GPS" };
    if (st === "denied") return { place: g.placeLabel() + " (default)", chip: "GPS off" };
    return { place: g.placeLabel(), chip: "Locating…" };
  }

  function locationSheet() {
    if (typeof window.FAHGeo === "undefined") return null;
    const g = window.FAHGeo;
    const areas = g.predefinedAreas();
    return div({ class: "loc-sheet", id: "loc-sheet", hidden: true }, [
      el("div", { class: "loc-sheet-title" }, ["Your location"]),
      div({ class: "loc-row", dataset: { usegps: "1" } }, [
        el("span", { class: "live-pulse" }),
        el("span", {}, ["Use my current location (GPS)"]),
        btn("Use", { class: "btn tiny terracotta", dataset: { usegps: "1" } })
      ]),
      el("div", { class: "loc-section-cap" }, ["Or pick an area (manual override)"]),
      div({ class: "loc-areas" },
        areas.map((a) => btn(a, { class: "btn ghost sm", dataset: { area: a } })))
    ]);
  }

  function placeLabel() {
    if (typeof window.FAHGeo === "undefined") return "Koramangala, Bengaluru";
    return window.FAHGeo.placeLabel() + (window.FAHGeo.status() === "denied" ? " (default)" : "");
  }

  // Customer reassurance strip — replaces the role switcher now that the app
  // is customer-only. Trust + promise, no credentials needed.
  function customerStrip() {
    return div({ class: "role-strip" }, [
      div({ class: "role-line" }, [
        el("span", { class: "trust-mark" }, ["✓"]),
        el("span", {}, ["Free visit · verified showrooms only · 3% platform fee only on completed deals"]),
        div({ class: "strip-caption" }, [
          el("span", { class: "muted small" }, ["No signup to browse — book in 3 steps."]),
          btn("How it works", { class: "btn tiny ghost", dataset: { nav: "legal", id: "terms" } })
        ])
      ])
    ]);
  }

  // ---- View: CATEGORY --------------------------------------------------------

  function viewCategory(id) {
    const cats = data.categories;
    const list = div({ class: "list" });
    S.getState().showrooms.filter((v) => v.categories.includes(id))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .forEach((v) => {
        const items = S.itemsFor(v, id).slice(0, 3);
        const prev = div({ class: "prev-row" });
        items.forEach((it) => {
          prev.appendChild(div({ class: "prev" }, [
            swatchRow(it.colors),
            el("span", { class: "small" }, [it.name]),
            el("span", { class: "price-tag sm" }, [S.fmtINR(S.itemAmount(it.id, v.id))])
          ]));
        });
        list.appendChild(div({ class: "card", dataset: { nav: "showroom", id: v.id } }, [
          el("h3", {}, [v.name]),
          trustRow(v),
          distRow(v),
          prev,
          btn("Book from " + v.name, { class: "btn ghost sm", dataset: { nav: "showroom", id: v.id } })
        ]));
      });
    const title = cats.find((c) => c.id === id)?.name || "Category";
    return div({ class: "stack" }, [
      section(title, list),
      div({ class: "chips sticky", dataset: { chips: "1" } }, cats.map((c) => catChip(c.id, c.id === id)))
    ]);
  }

  // ---- View: SHOWROOM ---------------------------------------------------------

  function viewShowroom(id) {
    const v = S.vendorById(id);
    if (!v) return emptyState("Showroom not found.");
    const st = S.getState();
    const items = S.itemsFor(v, null);
    const byCat = {};
    items.forEach((it) => {
      const c = Object.keys(data.catalog).find((k) => data.catalog[k].includes(it));
      (byCat[c] = byCat[c] || []).push(it);
    });
    const reviews = S.reviewsFor(id);

    const tabs = div({ class: "chips", dataset: { shtabs: "1", shId: id } });
    Object.keys(byCat).forEach((c, i) => tabs.appendChild(catChip(c, i === 0)));

    const panels = div({ class: "cat-panels" });
    Object.keys(byCat).forEach((c) => {
      const list = div({ class: "list" });
      byCat[c].forEach((it) => {
        list.appendChild(div({ class: "card fabric-card", dataset: { item: it.id } }, [
          div({ class: "fabric-swatch-lg", style: "background:" + it.colors[0] }),
          div({ class: "fabric-info" }, [
            el("b", {}, [it.name]),
            el("span", { class: "muted small" }, [it.material + " · " + it.pattern]),
            swatchRow(it.colors),
            priceTag(it, id)
          ])
        ]));
      });
      panels.appendChild(div({ class: "cat-panel", dataset: { panel: c } }, [list]));
    });

    const rebook = st.orders.filter((o) => o.showroomId === id).length
      ? div({ class: "rebook", dataset: { rebook: "1", id } }, [
          el("span", {}, ["Previously booked — rebook the same visit in one tap."]),
          btn("Rebook", { class: "btn sm terracotta", dataset: { nav: "book", id, rebook: "1" } })
        ])
      : null;

    const reviewSec = reviews.length ? section("Reviews", div({ class: "list" },
      reviews.map((r) => div({ class: "card review-card" }, [
        div({ class: "review-head" }, [
          el("b", {}, [r.reviewer]),
          el("span", { class: "muted small" }, [S.fmtDateOnly(r.createdAt)])
        ]),
        stars(r.rating),
        div({ class: "review-dims" }, data.reviewDim.map((d) => {
          const score = r.dims ? r.dims[d] : r.rating;
          return el("span", { class: "dim-item" }, [d + " " + score + "/5"]);
        })),
        el("p", { class: "muted small" }, [r.comment])
      ])))) : null;

    return div({ class: "stack" }, [
      div({ class: "sh-hero" }, [
        el("h2", {}, [v.name]),
        trustRow(v),
        distRow(v),
        el("p", { class: "muted small" }, ["Owner " + v.owner + " · GSTIN " + (v.gstin || "—")]),
        div({ class: "showroom-offers" }, v.offers.map((o) => el("span", { class: "offer" }, ["↳ " + o]))),
        div({ class: "sh-stats" }, [
          statCell(v.rating.toFixed(1), "rating"),
          statCell(v.deals, "deals done"),
          statCell(v.established, "since"),
          statCell(st.orders.filter((o) => o.showroomId === id).length, "your deals")
        ]),
        btn("Book a home visit", { class: "btn primary", dataset: { nav: "book", id } }),
        div({ class: "sh-promise" }, [
          el("span", { class: "live-pulse" }),
          el("span", { class: "small" }, ["Rep available now — arrival in ~" + v.minsAway + " min from slot"])
        ])
      ]),
      tabs,
      panels,
      reviewSec,
      rebook
    ]);
  }

  function statCell(val, label) {
    return div({ class: "stat" }, [
      el("b", {}, [String(val)]),
      el("span", { class: "muted small" }, [label])
    ]);
  }

  // ---- View: BOOK (3-step) -----------------------------------------------------

  function viewBook(id, rebook) {
    const v = S.vendorById(id);
    if (!v) return emptyState("Showroom not found.");
    const slots = S.nextSlots(6);

    return div({ class: "stack" }, [
      div({ class: "book-intro" }, [
        el("span", { class: "step-num" }, ["1 of 3"]),
        el("h2", {}, ["Book a home visit"]),
        el("p", { class: "muted" }, [
          "From " + v.name + " (" + v.distanceKm + " km). Verified rep arrives within ~30 min of your slot with the full catalog."
        ])
      ]),
      section("Your address", div({ class: "card form" }, [
        fieldRow("Full address", el("input", { class: "input", id: "bk-addr", placeholder: "House no, street, area" })),
        fieldRow("Pincode", el("input", { class: "input", id: "bk-pin", placeholder: "e.g. 560034", inputmode: "numeric", maxlength: "6" })),
        fieldRow("Delivery note (optional)", el("input", { class: "input", id: "bk-note", placeholder: "Landmark, floor, gate code" }))
      ])),
      section("Pick a time slot", div({ class: "card form" }, [
        div({ class: "slots" },
          slots.map((s, i) => el("button", { class: "slot" + (i === 0 ? " is-active" : ""), "data-slot": s.iso }, [
            el("span", { class: "small muted" }, [s.date]),
            el("b", {}, [s.label])
          ]))),
        div({ class: "promise-box" }, [
          el("span", { class: "live-pulse" }),
          el("span", { class: "small" }, ["Promise: rep arrives ", el("b", {}, ["within ~30 minutes"]), " of this slot. Live tracking in the app."])
        ])
      ])),
      section("Confirm", div({ class: "card form confirm-box" }, [
        div({ class: "confirm-line" }, [el("span", {}, [v.name]), el("span", { class: "muted" }, [v.area])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Visit fee"]), el("b", {}, ["₹0 · free"])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Commission"]), el("span", { class: "muted" }, ["3% only on completed deals"])]),
        btn(rebook ? "Confirm — rebooking" : "Confirm visit", { class: "btn primary lg", id: "bk-submit" })
      ]))
    ]);
  }

  function fieldRow(label, input) {
    return div({ class: "field" }, [el("label", {}, [label]), input]);
  }

  // ---- View: LIVE (status state machine) ----------------------------------------

  function viewLive(id) {
    const st = S.getState();
    const v = st.visits.find((x) => x.id === id);
    if (!v) return emptyState("Visit not found.");
    const vd = S.vendorById(v.showroomId);
    const crew = data.crews.find((c) => c.id === v.crewId);
    const flow = ["assigned", "on-the-way", "arrived"];

    const tl = div({ class: "timeline" });
    flow.forEach((stage) => {
      const done = S.STATUS_FLOW.indexOf(v.status) > flow.indexOf(stage);
      const active = v.status === stage;
      tl.appendChild(div({ class: "tl-step" + (done ? " is-done" : "") + (active ? " is-active" : "") }, [
        el("span", { class: "tl-node" }, [(done || active) ? "●" : "○"]),
        div({ class: "tl-body" }, [
          el("b", { class: "cap" }, [stageLabel(stage)]),
          el("span", { class: "small muted" }, [stageDesc(stage, vd)])
        ])
      ]));
    });

    const actions = div({ class: "actions" });
    if (v.status === "assigned" || v.status === "on-the-way") {
      actions.appendChild(btn("Simulate: " + (v.status === "assigned" ? "rep is on the way" : "rep is arriving"), {
        class: "btn ghost", dataset: { advance: id }
      }));
    }
    if (v.status === "arrived" && !v.dealId) {
      actions.appendChild(btn("Record deal — UPI payment", { class: "btn primary lg", dataset: { nav: "deal", id } }));
    }
    if (v.status === "completed") {
      actions.appendChild(div({ class: "completed-box" }, [
        el("span", { class: "ok-icon" }, ["✓"]),
        el("span", {}, ["Visit completed"]),
        v.dealId ? div({ class: "small muted" }, ["Deal " + S.fmtINR(st.orders.find((o) => o.id === v.dealId)?.lineTotal || 0) + " · commission split applied"]) : null
      ]));
      if (v.reviewId) {
        actions.appendChild(div({ class: "muted small centered" }, ["Thanks for the review."]));
      } else {
        actions.appendChild(btn("Leave a review", { class: "btn ghost", dataset: { nav: "review", id } }));
      }
    }

    const detail = div({ class: "card form detail-grid" }, [
      infoCell("Showroom", vd ? vd.name : ""),
      infoCell("Rep", crew ? crew.name + " (" + crew.transport + ")" : ""),
      infoCell("Slot", S.fmtSlot(v.slot)),
      infoCell("Address", v.address.line + ", " + v.address.pincode),
      infoCell("Note", v.address.note || "—"),
      infoCell("Status", v.status),
      infoCell("Payment", v.paymentId ? "Paid · UPI" : "At door")
    ]);

    return div({ class: "stack" }, [
      div({ class: "live-hero" }, [
        el("span", { class: "live-pulse-lg" }),
        el("h2", {}, [statusTitle(v)]),
        el("p", { class: "muted" }, [statusSub(v, vd)]),
        tl
      ]),
      section("Visit details", detail),
      actions
    ]);
  }

  function stageLabel(s) { return { assigned: "Assigned", "on-the-way": "On the way", arrived: "Arrived" }[s] || s; }
  function stageDesc(s, vd) {
    return { assigned: "Rep from " + (vd ? vd.name : "") + " accepted.", "on-the-way": "Travelling to you now.", arrived: "At your door — browse together." }[s] || "";
  }
  function statusTitle(v) {
    if (v.status === "arrived") return "Rep is at your door";
    if (v.status === "on-the-way") return "Rep is on the way";
    if (v.status === "completed") return "Visit completed";
    return "Visit assigned";
  }
  function statusSub(v, vd) {
    if (v.status === "arrived") return "Carrying the " + (vd ? vd.name : "") + " catalog — take your time.";
    if (v.status === "on-the-way") return "Arriving within ~30 minutes of your booked slot.";
    if (v.status === "completed") return "Thanks for booking with FabricAtHome.";
    return "Slot " + S.fmtSlot(v.slot) + ". Rep confirmed.";
  }
  function infoCell(l, val) {
    return div({ class: "info-cell" }, [el("span", { class: "muted small cap" }, [l]), el("span", {}, [val])]);
  }

  // ---- View: DEAL (record order + UPI) ------------------------------------------

  function viewDeal(visitId) {
    const st = S.getState();
    const v = st.visits.find((x) => x.id === visitId);
    if (!v || v.status !== "arrived") return emptyState("Visit not open for recording.");
    const vd = S.vendorById(v.showroomId);
    const items = S.itemsFor(vd, null);

    const picker = div({ class: "list" });
    items.forEach((it) => {
      picker.appendChild(div({ class: "card fabric-card pick", dataset: { pick: it.id, price: S.itemAmount(it.id, vd.id) } }, [
        div({ class: "fabric-swatch-lg", style: "background:" + it.colors[0] }),
        div({ class: "fabric-info" }, [
          el("b", {}, [it.name]),
          el("span", { class: "muted small" }, [it.material]),
          priceTag(it, vd.id)
        ]),
        div({ class: "qty" }, [
          btn("−", { class: "qty-btn", dataset: { qty: it.id, d: "-1" } }),
          el("b", { "data-qty-out": it.id }, ["0"]),
          btn("+", { class: "qty-btn", dataset: { qty: it.id, d: "1" } }),
          el("span", { class: "unit muted small" }, ["(m)"])
        ])
      ]));
    });

    return div({ class: "stack" }, [
      div({ class: "book-intro" }, [
        el("span", { class: "step-num" }, ["Deal at door"]),
        el("h2", {}, ["Record the order"]),
        el("p", { class: "muted" }, ["Select fabrics + metres. Payment by UPI at the door; the 3% platform commission is split automatically."])
      ]),
      section("Selected fabrics", picker),
      section("Summary", div({ class: "card form deal-sum" }, [
        div({ class: "confirm-line" }, [el("span", {}, ["Line total"]), el("b", { id: "dl-total" }, ["₹0"])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Commission (3%)"]), el("b", { id: "dl-com" }, ["₹0"])]),
        div({ class: "confirm-line" }, [el("span", {}, ["Vendor gets"]), el("span", { id: "dl-vendor", class: "muted" }, ["₹0"])]),
        btn("Confirm deal & pay UPI", { class: "btn primary lg", id: "dl-submit", dataset: { finalize: visitId } })
      ]))
    ]);
  }

  // ---- View: REVIEW (post-deal trust engine) --------------------------------------

  function viewReview(visitId) {
    const st = S.getState();
    const v = st.visits.find((x) => x.id === visitId);
    if (!v) return emptyState("Visit not found.");
    const vd = S.vendorById(v.showroomId);
    const dims = div({ class: "review-dims-input" });
    data.reviewDim.forEach((d) => {
      dims.appendChild(div({ class: "dim-row", "data-dim": d }, [
        el("span", { class: "cap small" }, [d]),
        gradePicker(d)
      ]));
    });

    return div({ class: "stack" }, [
      div({ class: "book-intro" }, [
        el("span", { class: "step-num" }, ["Almost done"]),
        el("h2", {}, ["How was your visit?"]),
        el("p", { class: "muted" }, ["Your review powers " + (vd ? vd.name : "") + "'s trust score. Takes 20 seconds."])
      ]),
      section("Overall rating", div({ class: "card form" }, [overallPicker()])),
      section("Per-dimension", div({ class: "card form" }, [dims])),
      section("Comment (optional)", div({ class: "card form" }, [
        el("textarea", { class: "input area", id: "rv-comment", placeholder: "Was the rep on time? Fabric quality? Showroom knowledge?" })
      ])),
      btn("Submit review", { class: "btn primary lg", id: "rv-submit", dataset: { review: visitId } })
    ]);
  }

  function gradePicker(dim) {
    const wrap = div({ class: "grade", "data-grade": dim });
    for (let i = 1; i <= 5; i++) {
      wrap.appendChild(el("button", { class: "grade-btn", "data-grade-btn": i, "data-grade-dim": dim }, [String(i)]));
    }
    return wrap;
  }
  function overallPicker() {
    const wrap = div({ class: "grade big", "data-grade": "overall" });
    for (let i = 1; i <= 5; i++) {
      wrap.appendChild(el("button", { class: "grade-btn", "data-grade-btn": i, "data-grade-dim": "overall" }, ["★"]));
    }
    return wrap;
  }

  function line(l, val) {
    return div({ class: "earn-line" }, [el("span", {}, [l]), el("b", {}, [val])]);
  }

  // ---- View: LEGAL -------------------------------------------------------------------

  function viewLegal(id) {
    const isPrivacy = id === "privacy";
    const title = isPrivacy ? "Privacy policy" : "Terms of use";
    const lines = isPrivacy ? privLines() : termLines();
    return div({ class: "stack" }, [
      div({ class: "book-intro" }, [el("h2", {}, [title]), el("p", { class: "muted" }, ["Effective 2026 · V1 placeholder, DPDP-lean"])]),
      div({ class: "card form" }, lines.map((l) => div({ class: "legal-line" }, [
        el("b", { class: "small cap" }, [l.h]),
        el("p", { class: "muted small" }, [l.b])
      ])))
    ]);
  }
  function privLines() {
    return [
      { h: "What we collect", b: "Location (to show nearby showrooms), address for the visit, phone for dispatch and order updates, and payment records." },
      { h: "Why", b: "Fulfilment of the visit + deal, order history, reviews, and fraud prevention. Processed on lawful bases under the DPDP Act 2023." },
      { h: "Sharing", b: "Limited to the selected showroom (your address + slot), and payment processors for the transaction. Never sold." },
      { h: "Your rights", b: "Access, correct, and delete your data. A simple 'delete my data' flow ships before public launch." },
      { h: "Retention", b: "Transaction + settlement records kept per statutory tax/GST requirements; profiles removable on request." }
    ];
  }
  function termLines() {
    return [
      { h: "Marketplace role", b: "FabricAtHome connects buyers with independent showrooms. The platform is an intermediary and charges a 3% commission only on completed deals." },
      { h: "Booking promise", b: "Reps arrive within ~30 minutes of the booked slot as a best-effort promise. Delays tracked; cancellations supported before 'on-the-way'." },
      { h: "Payments", b: "Paid by UPI at completion. Funds route via a licensed payment aggregator; vendor payout on T+1." },
      { h: "Quality", b: "Fabric claims (material, pattern, price) are the showroom's responsibility. Dispute flow and refunds via the admin desk." },
      { h: "Liability", b: "Platform liability capped to the commission on the disputed deal. Showrooms remain independent merchants with their own GSTIN." }
    ];
  }

  // ---- View: ORDERS (buyer) -------------------------------------------------------------

  function viewOrders() {
    const st = S.getState();
    const orders = st.orders;
    const openVisits = st.visits.filter((v) => v.status !== "completed");

    const stats = div({ class: "earn-card" }, [
      div({ class: "earn-main" }, [
        el("span", { class: "cap" }, ["Your fabric visits"]),
        el("h2", {}, [String(orders.length)]),
        el("span", { class: "small" }, ["completed deals · you pay the showroom directly; our " + (FAH.COMMISSION_RATE * 100) + "% fee comes from the showroom, never hidden in your price"])
      ]),
      div({ class: "earn-break" }, [
        line("Completed visits", String(orders.length)),
        line("Total spent", orders.length ? S.fmtINR(orders.reduce((t, o) => t + o.lineTotal, 0)) : "₹0"),
        line("Avg deal", orders.length ? S.fmtINR(Math.round(orders.reduce((t, o) => t + o.lineTotal, 0) / orders.length)) : "₹0")
      ])
    ]);

    const liveSec = openVisits.length ? section("Live", div({ class: "list" },
      openVisits.map((v) => div({ class: "card", dataset: { nav: "live", id: v.id } }, [
        el("b", {}, [S.vendorById(v.showroomId)?.name || ""]),
        el("span", { class: "muted small" }, [v.status + " · " + S.fmtSlot(v.slot)]),
        btn("Track", { class: "btn tiny terracotta", dataset: { nav: "live", id: v.id } })
      ]))
    )) : null;

    const orderList = div({ class: "list" },
      orders.length ? orders.map((o) => {
        const vd = S.vendorById(o.showroomId);
        const visit = st.visits.find((x) => x.id === o.visitId);
        return div({ class: "card order-card" }, [
          div({ class: "order-head" }, [
            el("b", {}, [vd ? vd.name : ""]),
            el("span", { class: "muted small" }, [S.fmtDateOnly(o.createdAt)])
          ]),
          div({ class: "muted small" }, [o.itemIds.map((i) => S.itemName(i)).join(", ")]),
          div({ class: "order-amounts" }, [
            el("span", {}, ["Deal " + S.fmtINR(o.lineTotal)]),
            el("span", { class: "com-pos" }, ["+ " + S.fmtINR(o.commission) + " (3%)"])
          ]),
          (function () {
            if (visit && !visit.reviewId) {
              return btn("Rate this visit", { class: "btn tiny ghost", dataset: { nav: "review", id: visit.id } });
            }
            if (visit && visit.reviewId) return el("span", { class: "muted small" }, ["Reviewed ✓"]);
            return null;
          })()
        ]);
      }) : [div({ class: "empty" }, ["No deals yet — complete a visit to earn commission."])]);

    const body = [stats];
    if (liveSec) body.push(liveSec);
    body.push(section("Order history", orderList));
    return div({ class: "stack" }, body);
  }

  function emptyState(msg) {
    return div({ class: "empty" }, [msg || "Nothing here yet."]);
  }

  // ---- Render ------------------------------------------------------------------------

  function render() {
    const view = document.getElementById("view");
    const isHome = route.name === "home";

    let content;
    const tab = { left: isHome, mid: route.name === "orders" };
    switch (route.name) {
      case "category": content = viewCategory(route.params.id); break;
      case "showroom": content = viewShowroom(route.params.id); break;
      case "book": content = viewBook(route.params.id, route.params.rebook); break;
      case "live": content = viewLive(route.params.id); break;
      case "deal": content = viewDeal(route.params.id); break;
      case "review": content = viewReview(route.params.id); break;
      case "orders": content = viewOrders(); break;
      case "legal": content = viewLegal(route.params.id); break;
      default: content = viewHome(); tab.left = true; break;
    }

    view.replaceChildren(content);

    const tabHome = document.getElementById("tab-home");
    const tabWork = document.getElementById("tab-work");
    const tabAbout = document.getElementById("tab-about") || document.getElementById("tab-acct");
    tabHome.classList.toggle("is-active", tab.left);
    tabWork.classList.toggle("is-active", tab.mid);
    tabAbout.classList.toggle("is-active", route.name === "legal");
    tabWork.textContent = "Orders";

    document.getElementById("backBtn").hidden = isHome;
    document.body.classList.toggle("has-subview", !isHome);

    wireEvents();
  }

  // ---- Wiring ---------------------------------------------------------------------------

  function wireEvents() {
    document.querySelectorAll("[data-nav]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = b.dataset;
        const params = d.nav === "book" ? { id: d.id, rebook: d.rebook ? "1" : "" } : { id: d.id };
        navigate(d.nav, params);
      });
    });
    document.querySelectorAll(".cat-card").forEach((c) => {
      c.addEventListener("click", () => navigate("category", { id: c.dataset.id }));
    });
    document.querySelectorAll("[data-chips] .chip").forEach((chip) => {
      chip.addEventListener("click", () => navigate("category", { id: chip.dataset.chip }));
    });
    document.querySelectorAll("[data-shtabs] .chip").forEach((chip) => {
      chip.addEventListener("click", () => setShowroomTab(chip));
    });
    document.querySelectorAll(".slot").forEach((s) => {
      s.addEventListener("click", () => {
        document.querySelectorAll(".slot").forEach((x) => x.classList.remove("is-active"));
        s.classList.add("is-active");
      });
    });
    const sub = document.getElementById("bk-submit");
    if (sub) sub.addEventListener("click", submitBooking);

    document.querySelectorAll("[data-advance]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.dataset.advance;
        const v = S.advanceVisit(id);
        toast(v.status === "arrived" ? "Rep has arrived" : "Status updated");
        render();
      });
    });
    document.querySelectorAll("[data-qty]").forEach((b) => {
      b.addEventListener("click", () => {
        const it = b.dataset.qty;
        const d = parseInt(b.dataset.d, 10);
        const out = document.querySelector('[data-qty-out="' + it + '"]');
        let q = (parseInt(out.textContent, 10) || 0) + d;
        q = Math.max(0, q);
        out.textContent = String(q);
        const card = b.closest(".pick");
        card.classList.toggle("is-picked", q > 0);
        updateDealSum();
      });
    });
    const finBtn = document.querySelector("[data-finalize]");
    if (finBtn) finBtn.addEventListener("click", finalizeDeal);

    // review grading
    document.querySelectorAll(".grade-btn").forEach((b) => {
      b.addEventListener("click", () => selectGrade(b));
    });
    const rv = document.querySelector("[data-review]");
    if (rv) rv.addEventListener("click", submitReview);

    // location: Change toggle + GPS use + manual area pick
    document.querySelectorAll("[data-reloc]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const sheet = document.getElementById("loc-sheet");
        if (sheet) sheet.hidden = !sheet.hidden;
        else toast("Location — coming with the backend");
      });
    });
    document.querySelectorAll("[data-usegps]").forEach((b) => {
      b.addEventListener("click", () => {
        if (typeof window.FAHGeo === "undefined") return toast("GPS unavailable here");
        const sheet = document.getElementById("loc-sheet");
        if (sheet) sheet.hidden = true;
        window.FAHGeo.clearManual();
        window.FAHGeo.request(() => render());
        toast("Finding your location…");
      });
    });
    document.querySelectorAll("[data-area]").forEach((b) => {
      b.addEventListener("click", () => {
        if (typeof window.FAHGeo === "undefined") return;
        const sheet = document.getElementById("loc-sheet");
        if (sheet) sheet.hidden = true;
        window.FAHGeo.setManualArea(b.dataset.area);
        toast("Showing showrooms near " + b.dataset.area);
        render();
      });
    });
  }

  function setShowroomTab(chip) {
    const holder = chip.closest("[data-shtabs]");
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

    if (!addr) return toast("Enter your full address first");
    if (!pin || pin.length < 5) return toast("Enter a valid pincode");
    if (!slotBtn) return toast("Pick a time slot");

    const visit = S.createVisit(
      route.params.id,
      { name: "Guest", phone: "+91 98xxx xxxxx" },
      { line: addr, pincode: pin, note: note || "" },
      new Date(slotBtn.dataset.slot)
    );
    toast("Visit confirmed — rep on the way");
    navigate("live", { id: visit.id });
  }

  function finalizeDeal() {
    const visitId = document.querySelector("[data-finalize]").dataset.finalize;
    const st = S.getState();
    const v = st.visits.find((x) => x.id === visitId);
    if (!v) return;
    const selections = [];
    document.querySelectorAll(".pick").forEach((card) => {
      const it = card.dataset.pick;
      const qty = parseInt(card.querySelector("[data-qty-out]").textContent, 10) || 0;
      if (qty > 0) selections.push({ itemId: it, qty });
    });
    if (!selections.length) return toast("Select at least one fabric");
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
    const vdEl = document.getElementById("dl-vendor");
    if (t) t.textContent = S.fmtINR(total);
    if (c) c.textContent = "− " + S.fmtINR(com);
    if (vdEl) vdEl.textContent = S.fmtINR(total - com);
  }

  function selectGrade(btn) {
    const dim = btn.dataset.gradeDim;
    const val = btn.dataset.gradeBtn;
    const wrap = btn.closest(".grade");
    wrap.dataset.value = val;
    wrap.querySelectorAll(".grade-btn").forEach((g) => {
      g.classList.toggle("is-active", parseInt(g.dataset.gradeBtn, 10) <= parseInt(val, 10));
    });
  }

  function submitReview() {
    const visitId = document.querySelector("[data-review]").dataset.review;
    const st = S.getState();
    const v = st.visits.find((x) => x.id === visitId);
    if (!v) return;
    const overall = readGrade("overall");
    if (!overall) return toast("Pick an overall rating");
    const dims = {};
    data.reviewDim.forEach((d) => { dims[d] = parseInt(readGrade(d), 10) || overall; });
    const comment = document.getElementById("rv-comment")?.value.trim() || "";
    S.createReview(v, overall, dims, comment);
    toast("Review submitted — builds " + S.vendorById(v.showroomId)?.name + "'s trust score");
    navigate("live", { id: visitId });
  }
  function readGrade(dim) {
    const g = document.querySelector('[data-grade="' + dim + '"]');
    return g ? g.dataset.value : null;
  }

  // ---- Boot --------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("backBtn").addEventListener("click", () => navigate("home"));
    document.getElementById("tab-home").addEventListener("click", () => navigate("home"));
    document.getElementById("tab-work").addEventListener("click", () => navigate("orders"));
    document.getElementById("tab-about").addEventListener("click", () => navigate("legal", { id: "terms" }));

    // GPS: request on load; re-render when it resolves (re-sorts showrooms).
    if (typeof window.FAHGeo !== "undefined") {
      window.FAHGeo.request(() => {
        const place = document.getElementById("hero-place");
        const chip = document.getElementById("hero-check");
        if (place) place.textContent = window.FAHGeo.placeLabel();
        if (chip) chip.textContent =
          window.FAHGeo.status() === "live" ? "✓ Live GPS"
          : window.FAHGeo.status() === "denied" ? "GPS off"
          : "Locating…";
        render();
      });
    }

    render();
  });

  // Test hook
  window.__FAH_APP__ = {
    navigate, render,
    viewHome, viewCategory, viewShowroom, viewBook, viewLive, viewDeal, viewReview,
    viewOrders, viewLegal
  };
})();