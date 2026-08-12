// Load the live site in REAL headless Chrome, capture console + page errors.
// Uses /usr/bin/chromium-headless-shell directly (no playwright browser needed).
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = '/tmp/fah_chrome_dump';
fs.mkdirSync(OUT, { recursive: true });

try {
  const cmd = [
    'chromium-headless-shell',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=430,900',
    '--virtual-time-budget=6000',
    '--enable-logging=stderr',
    '--v=0',
    '--user-data-dir=/tmp/fah_chrome_profile',
    '--dump-dom',
    'https://gulshan1234g5.github.io/fabric-at-home/'
  ].join(' ');
  const dom = execSync(cmd, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
  fs.writeFileSync(path.join(OUT, 'dom.html'), dom);
  console.log('DUMP_DOM length:', dom.length);
  const hasHero = dom.includes('Fabric, brought to your home');
  const hasShowrooms = dom.includes('showroom-card');
  const hasCats = dom.includes('cat-card');
  console.log('hero text present:', hasHero);
  console.log('showroom cards present:', hasShowrooms);
  console.log('category cards present:', hasCats);
  if (!hasHero) {
    // show what's actually rendered
    const body = dom.slice(0, 1200);
    console.log('--- first 1200 chars ---');
    console.log(body);
  }
} catch (e) {
  console.log('STDERR / ERROR:');
  console.log(String(e.stderr || e.message).slice(0, 3000));
  process.exit(1);
}