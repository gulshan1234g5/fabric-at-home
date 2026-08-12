// FabricAtHome — search: pure, DOM-free search + filter over fabrics & showrooms.
// Kept separate from app.js so it is unit-testable with `node test_search.js`.
// 2026 marketplace research: search-first entry + real-time filter response +
// useful zero-results ("remove filters / try a nearby area") instead of a dead end.

(function () {
  "use strict";

  function normalize(q) {
    return String(q || "").trim().toLowerCase();
  }

  // Showroom match: name, area, owner, any offer.
  function matchShowroom(v, q) {
    if (!q) return true;
    const hay = [v.name, v.area, v.owner || "", (v.offers || []).join(" ")]
      .join(" ").toLowerCase();
    return hay.includes(q);
  }

  // Fabric match: name, material, pattern against a lowercase query.
  function itemText(it) {
    return it.name + " " + (it.material || "") + " " + (it.pattern || "");
  }

  // Combined search. Returns:
  //   { query, showrooms:[...], fabrics:[{category, items:[...]}], total }
  function search(catalog, showrooms, rawQuery) {
    const q = normalize(rawQuery);
    const result = { query: rawQuery || "", showrooms: [], fabrics: [], total: 0 };

    if (!q) return result;

    result.showrooms = (showrooms || []).filter((v) => matchShowroom(v, q));

    const catKeys = Object.keys(catalog || {});
    for (const cat of catKeys) {
      const items = (catalog[cat] || []).filter((it) => itemText(it).toLowerCase().includes(q));
      if (items.length) {
        result.fabrics.push({ category: cat, items });
        result.total += items.length;
      }
    }
    result.total += result.showrooms.length;
    return result;
  }

  // Filter array of fabrics (already relevant) down to those a vendor carries.
  function filterByVendor(fabricsByCategory, vendorId, showroomCatalog) {
    const ids = (showroomCatalog && showroomCatalog[vendorId]) || [];
    return fabricsByCategory
      .map((g) => ({ category: g.category, items: g.items.filter((it) => ids.includes(it.id)) }))
      .filter((g) => g.items.length);
  }

  window.FAHSearch = { search, matchShowroom, normalize, filterByVendor };
  if (typeof globalThis !== "undefined" && !globalThis.FAHSearch) globalThis.FAHSearch = window.FAHSearch;
})();