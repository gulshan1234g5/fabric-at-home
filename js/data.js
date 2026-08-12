// FabricAtHome — seeded local mock data (V1)
// No network, no server: everything the app needs lives here.

const FAH = {

  // Commission rate charged by the platform per completed deal.
  COMMISSION_RATE: 0.03, // 3%

  MIN_SLOT_GAP_MIN: 30, // the "~30 min" promise

  categories: [
    { id: "curtains",    name: "Curtains",      subtitle: "Drapes, sheers, blackout", itemCount: 4 },
    { id: "sofa",        name: "Sofa fabric",   subtitle: "Durable, stain-guard",     itemCount: 5 },
    { id: "blinds",      name: "Blinds",        subtitle: "Roller, roman, vertical",  itemCount: 3 },
    { id: "upholstery",  name: "Upholstery",    subtitle: "Chairs, headboards, more", itemCount: 4 }
  ],

  // Catalog items belong to a category and are shared across showrooms,
  // each showroom offering its own subset + prices.
  catalog: {
    curtains: [
      { id: "c1", name: "Linen Weave Drape", material: "100% cotton linen",   pattern: "plain",    colors: ["#E7DFD2", "#B8AFA1", "#6B6255"], pricePerMeter: 349 },
      { id: "c2", name: "Velvet Room Panel", material: "Polyester velvet",     pattern: "plain",    colors: ["#8A7355", "#4A4036", "#A8947A"], pricePerMeter: 649 },
      { id: "c3", name: "Hearth Check",       material: "Cotton blend",        pattern: "check",    colors: ["#EDE6DA", "#C1583B", "#3F3A33"], pricePerMeter: 429 },
      { id: "c4", name: "Midnight Blackout",  material: "Triple-layer blackout", pattern: "plain",  colors: ["#2F2B27", "#5C4632"], pricePerMeter: 529 }
    ],
    sofa: [
      { id: "s1", name: "Cloud Boucle",       material: "Woven boucle",         pattern: "texture",  colors: ["#EFE9DE"], pricePerMeter: 899 },
      { id: "s2", name: "Heritage Twill",     material: "Poly-cotton twill",    pattern: "herringbone", colors: ["#B7AB97", "#7A6F5D", "#4A453D"], pricePerMeter: 749 },
      { id: "s3", name: "Terra Slub",         material: "Cotton slub",          pattern: "slub",     colors: ["#C1583B", "#D9896B", "#8E4A33"], pricePerMeter: 679 },
      { id: "s4", name: "Guard Plus Suede",   material: "Microsuede, stain-repellent", pattern: "plain", colors: ["#6F6A60", "#403D37", "#9C9689"], pricePerMeter: 999 },
      { id: "s5", name: "Mist Stripe",        material: "Cotton-linen",         pattern: "stripe",   colors: ["#E4DCCD", "#8B8172"], pricePerMeter: 599 }
    ],
    blinds: [
      { id: "b1", name: "Ripple Roller",      material: "PVC / flame-retardant", pattern: "plain",   colors: ["#F1EBDF", "#B9B0A1", "#5A5248"], pricePerMeter: 1199 },
      { id: "b2", name: "Roman Fold Natural", material: "Linen-look",            pattern: "plain",   colors: ["#DCCEB7", "#A0886B"], pricePerMeter: 1399 },
      { id: "b3", name: "Studio Vertical",    material: "PVC vertical strips",   pattern: "fabric-stripe", colors: ["#EDE6DA", "#97765A", "#3C3731"], pricePerMeter: 999 }
    ],
    upholstery: [
      { id: "u1", name: "Studio Velvet",      material: "Cotton velvet",        pattern: "plain",    colors: ["#5E5348", "#948A7C", "#C7B9A4"], pricePerMeter: 1249 },
      { id: "u2", name: "Herringbone Heat",   material: "Wool blend",           pattern: "herringbone", colors: ["#8B7A63", "#4E453A"], pricePerMeter: 1349 },
      { id: "u3", name: "Weathered Linen",    material: "Crinkled linen",       pattern: "texture",  colors: ["#EAE3D4", "#C0B39E"], pricePerMeter: 1049 },
      { id: "u4", name: "Saddle Woven",       material: "Flat-woven jacquard",  pattern: "jacquard", colors: ["#9C6B46", "#6E4A2E", "#3A312A"], pricePerMeter: 1299 }
    ]
  },

  // Nearby showrooms. "minsAway" is a live promise: a rep reaches the customer
  // within ~30 minutes of the booked slot.
  showrooms: [
    {
      id: "sh1",
      name: "Thar Interior Studio",
      area: "Sector 15, Koramangala",
      distanceKm: 1.2,
      minsAway: 9,
      rating: 4.8,
      deals: 240,
      established: 2014,
      categories: ["curtains", "sofa", "blinds"],
      offers: ["Free floor sample", "Free installation"]
    },
    {
      id: "sh2",
      name: "Weave & Wick",
      area: "Indiranagar 100ft Rd",
      distanceKm: 2.6,
      minsAway: 14,
      rating: 4.6,
      deals: 132,
      established: 2019,
      categories: ["curtains", "sofa", "upholstery"],
      offers: ["Custom stitching in 48h"]
    },
    {
      id: "sh3",
      name: "Amber Loom House",
      area: "Jayanagar 4th Block",
      distanceKm: 3.1,
      minsAway: 18,
      rating: 4.9,
      deals: 310,
      established: 2011,
      categories: ["sofa", "upholstery", "curtains"],
      offers: ["Designer consultation free"]
    },
    {
      id: "sh4",
      name: "Neon & Linen",
      area: "HSR Layout",
      distanceKm: 0.8,
      minsAway: 6,
      rating: 4.5,
      deals: 88,
      established: 2021,
      categories: ["blinds", "curtains"],
      offers: ["Same-day blinds"]
    }
  ],

  // Which catalog items each showroom carries.
  showroomCatalog: {
    sh1: ["c1", "c2", "c3", "s1", "s2", "s3", "b1", "b2"],
    sh2: ["c1", "c4", "s2", "s4", "s5", "u1", "u3"],
    sh3: ["s2", "s3", "s4", "u1", "u2", "u4", "c3", "c4"],
    sh4: ["b1", "b2", "b3", "c2", "c4"]
  },

  // Showroom-specific price markup (multiplier on base price) per item id.
  priceMod: {
    sh1: { c3: 0.92, s3: 1.05 },
    sh2: { s4: 1.1 },
    sh3: { u2: 0.95 },
    sh4: { b2: 0.9 }
  },

  customers: [
    { id: "cu1", name: "Amit Rao",   initials: "AR" },
    { id: "cu2", name: "Sana Kapoor", initials: "SK" },
    { id: "cu3", name: "Ravi Nair",  initials: "RN" }
  ],
  crews: [
    { id: "cr1", name: "Imran",  transport: "cycle" },
    { id: "cr2", name: "Deepak", transport: "moped" },
    { id: "cr3", name: "Farhan", transport: "ev-moped" }
  ]
};

if (typeof window !== "undefined") window.FAH = FAH;
if (typeof globalThis !== "undefined" && !globalThis.FAH) globalThis.FAH = FAH;