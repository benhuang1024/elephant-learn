import puppeteer from 'puppeteer-core';
import path from 'node:path';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const base = 'file:///' + path.join(ROOT, 'html').replace(/\\/g, '/') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 950 });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
const which = process.argv[2] || 'rl';
if (which === 'rl') {
  await page.goto(base + 'labs/request-lifecycle.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  console.log('SHARED loaded:', await page.evaluate(() => !!window.SHARED));
  await page.click('#rlSend');
  await new Promise((r) => setTimeout(r, 8000));
  console.log('status:', await page.$eval('#rlStatus', (e) => e.textContent));
  console.log('tag:', await page.$eval('#rlTag', (e) => e.textContent));
  console.log('log tail:', await page.$eval('#rlLog', (e) => e.textContent.slice(-400)));
  console.log('track states:', await page.$$eval('.rl-stop', (els) => els.map((e) => e.className.replace('rl-stop', '').trim() + ':' + e.querySelector('.rl-state').textContent).join(' | ')));
} else if (which === 'k8s') {
  await page.goto(base + 'labs/k8s-port.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 2500));
  await page.click('#k8sHpa', { force: true }).catch(async () => { await page.$eval('#k8sHpa', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); }); });
  console.log('hpa checked:', await page.$eval('#k8sHpa', (e) => e.checked));
  await page.$eval('#k8sLoad', (e) => { e.value = 400; e.dispatchEvent(new Event('input')); });
  await new Promise((r) => setTimeout(r, 2500));
  console.log('desired:', await page.$eval('#k8sDesired', (e) => e.textContent), 'load out:', await page.$eval('#k8sLoadOut', (e) => e.textContent));
  console.log('events:', await page.$eval('#k8sEvents', (e) => e.textContent.slice(0, 300)));
}
await browser.close();