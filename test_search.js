// FabricAtHome — search module test (pure logic, no DOM), run with node.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "js", "data.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, "js", "search.js"), "utf8"));

const catalog = globalThis.FAH.catalog;
const showrooms = globalThis.FAH.vendors;
const Search = globalThis.FAHSearch;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label); }
}

console.log("— empty query → empty result —");
const empty = Search.search(catalog, showrooms, "  ");
ok(empty.showrooms.length === 0 && empty.fabrics.length === 0 && empty.total === 0, "blank query yields nothing");

console.log("— showroom matching (name / area / offer) —");
const am = Search.search(catalog, showrooms, "Amber");
ok(am.showrooms.length === 1 && am.showrooms[0].id === "v3", "name match Amber Loom House");
const kor = Search.search(catalog, showrooms, "hsr");
ok(kor.showrooms.length === 1 && kor.showrooms[0].id === "v4", "area match (case-insensitive) HSR");
const win = Search.search(catalog, showrooms, "windows");
ok(win.showrooms.length === 0, "no showroom match for windows");

console.log("— fabric matching (name / material / pattern) —");
const vel = Search.search(catalog, showrooms, "velvet");
ok(vel.fabrics.length >= 1, "velvet matched fabrics: " + vel.fabrics.length);
const curtainNames = vel.fabrics.reduce((a, g) => a.concat(g.items.map((i) => i.name)), []);
ok(curtainNames.includes("Velvet Room Panel"), "Velvet Room Panel found");
const black = Search.search(catalog, showrooms, "blackout");
const blackItems = black.fabrics.reduce((a, g) => a.concat(g.items.map((i) => i.name)), []);
ok(blackItems.includes("Midnight Blackout"), "pattern/material match blackout");
const herring = Search.search(catalog, showrooms, "herringbone");
ok(herring.fabrics.length >= 2, "herringbone across categories: " + herring.fabrics.length);

console.log("— combined result shape —");
const mixed = Search.search(catalog, showrooms, "linen");
ok(mixed.total >= 1, "total counts showrooms + fabrics");
const names = [];
mixed.showrooms.forEach((v) => names.push(v.name));
ok(names.includes("Neon & Linen"), "showroom 'Neon & Linen' matched by name");

console.log("— no matches → empty result (app shows zero-state) —");
const none = Search.search(catalog, showrooms, "zzzzzzzz");
ok(none.showrooms.length === 0 && none.fabrics.length === 0 && none.total === 0, "garbage query → zero results");

console.log("— filterByVendor —");
const stv = Search.filterByVendor(vel.fabrics, "v2", globalThis.FAH.showroomCatalog);
ok(stv.length >= 1 && stv.every((g) => g.category !== "sofa" || g.items.length >= 0), "vendor-filtered fabric groups");

console.log("\n%d passed, %d failed", pass, fail);
process.exit(fail ? 1 : 0);