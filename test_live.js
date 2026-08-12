// Load the DEPLOYED (live) JS files and run them headless to catch runtime errors.
const fs = require('fs');
const https = require('https');
const vm = require('vm');

function fetch(url) {
  return new Promise((res, rej) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => d += c);
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}

(async () => {
  const BASE = 'https://gulshan1234g5.github.io/fabric-at-home';
  const files = ['js/data.js', 'js/provider.js', 'js/store.js', 'js/geo.js', 'js/app.js'];
  const srcs = {};
  for (const f of files) srcs[f] = await fetch(BASE + '/' + f);

  // minimal DOM shim
  class El {
    constructor(t) { this.tagName = 'DIV'; this.children = []; this._attrs = {}; this._cls = []; this.dataset = {}; this.id = ''; this._text = ''; this.value = ''; this.parent = null; this.classList = { toggle() {}, add() {}, remove() {}, has: () => false }; }
    setAttribute(k, v) { this._attrs[k] = v; if (k === 'id') this.id = v; if (k === 'class') this._cls = String(v).split(' ').filter(Boolean); if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; }
    appendChild(c) { if (typeof c === 'string') c = { _text: c, children: [] }; c.parent = this; this.children.push(c); return c; }
    addEventListener() {}
    replaceChildren(...cs) { this.children = []; cs.forEach(c => this.appendChild(c)); }
    get hidden() { return false; } set hidden(v) {}
  }
  Object.defineProperty(El.prototype, 'textContent', { get() { if (!this.children.length) return this._text || ''; return this.children.map(c => c.children ? c.textContent : (c._text || '')).join(''); }, set(v) { this._text = String(v); } });
  const viewEl = new El(); viewEl.id = 'view';
  const tabs = new El(); 
  const docEls = { 'view': viewEl, 'tab-home': new El(), 'tab-work': new El(), 'tab-about': new El(), 'backBtn': new El(), 'toast': new El(), 'install-bar': new El(), 'install-btn': new El(), 'install-dismiss': new El(), 'hero-place': new El(), 'hero-check': new El() };
  const sandbox = {
    window: { scrollTo() {}, addEventListener() {}, location: { hash: '' } },
    navigator: { geolocation: { getCurrentPosition: (ok) => ok({ coords: { latitude: 12.9352, longitude: 77.6245, accuracy: 25 } }) } },
    location: { hash: '' },
    document: {
      getElementById: (id) => docEls[id] || new El(),
      querySelectorAll: () => [], querySelector: () => null,
      createElement: (t) => new El(), createTextNode: (s) => ({ _text: s, children: [] }),
      addEventListener: () => {}, body: new El(), scrollTo: () => {}, requestAnimationFrame: () => 0
    },
    FH_BACKEND: { enabled: false },
    localStorage: (() => { const m = {}; return { getItem: k => k in m ? m[k] : null, setItem: (k, v) => { m[k] = String(v); } }; })(),
    console, Date, Math, String, Number, Object, Array, JSON, parseInt, parseFloat, RegExp, setTimeout, clearTimeout, confirm: () => true
  };
  vm.createContext(sandbox);
  for (const f of ['js/data.js', 'js/provider.js', 'js/store.js', 'js/geo.js']) {
    try { vm.runInContext(srcs[f], sandbox); } catch (e) { console.log('LOAD ERROR', f, e.message); }
  }
  try { vm.runInContext(srcs['js/app.js'], sandbox); } catch (e) { console.log('RUNTIME ERROR in app.js:', e.message); process.exit(1); }

  const App = sandbox.window.__FAH_APP__;
  if (!App) { console.log('No test hook exposed — check app boot'); process.exit(1); }
  try {
    App.navigate('home');
    console.log('navigate home OK — view children:', viewEl.children.length);
    App.navigate('orders');
    console.log('navigate orders OK — view children:', viewEl.children.length);
    App.navigate('showroom', { id: 'v3' });
    console.log('navigate showroom OK — view children:', viewEl.children.length);
    console.log('ALL ROUTES RENDER OK ✅');
  } catch (e) {
    console.log('RENDER ERROR:', e.message);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });