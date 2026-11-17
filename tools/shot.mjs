import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'tools', '.shots');
fs.mkdirSync(SHOTS, { recursive: true });

const url = process.argv[2] || 'html/index.html';
const name = process.argv[3] || 'shot';
const width = +(process.argv[4] || 1440);
const height = +(process.argv[5] || 950);
const full = process.argv[6] === 'full';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--allow-file-access-from-files', '--font-render-hinting=none', '--force-color-profile=srgb']
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));

const target = url.startsWith('http') || url.startsWith('file:') ? url : 'file:///' + path.join(ROOT, url).replace(/\\/g, '/');
await page.goto(target, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise((r) => setTimeout(r, 900));

const info = await page.evaluate(() => {
  const de = document.documentElement;
  const overflow = de.scrollWidth > window.innerWidth + 1;
  const bad = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.right > window.innerWidth + 2 && getComputedStyle(el).position !== 'fixed' && !el.closest('.bg')) {
      const cs = getComputedStyle(el);
      if (cs.overflowX === 'visible' && cs.position !== 'absolute') bad.push(el.tagName + '.' + (el.className.baseVal ?? el.className).toString().slice(0, 40) + ' right=' + Math.round(r.right));
    }
  });
  return {
    title: document.title,
    scrollW: de.scrollWidth, innerW: window.innerWidth, overflow,
    scrollH: de.scrollHeight,
    bad: bad.slice(0, 12),
    fonts: [...document.fonts].map((f) => f.family + ' ' + f.status).slice(0, 6)
  };
});

await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: full });
console.log(JSON.stringify({ target, ...info, errors: errors.slice(0, 20) }, null, 1));
await browser.close();