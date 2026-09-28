// Capture real VoxDive app screenshots to disk (headless Chrome) for the demo video.
import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, '../.tools/frames');
fs.mkdirSync(outDir, { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name), clip: { x: 0, y: 0, width: 1280, height: 720 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=1300,820'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

// 1. Cover
await page.goto('file://' + path.resolve(__dirname, '../docs/cover.html'), { waitUntil: 'networkidle0' });
await sleep(600);
await shot(page, '1_cover.png');
console.log('shot cover');

// 2. Landing (empty app)
await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
await sleep(1200);
await shot(page, '2_landing.png');
console.log('shot landing');

// 3. Loaded transcript (Try the sample → wait for chapters to populate)
await page.click('#btnLoadSample');
await page.waitForFunction(() => document.querySelectorAll('#chaptersList button').length > 0, { timeout: 20000 });
await sleep(800);
await shot(page, '3_loaded.png');
console.log('shot loaded');

// 4. Grounded answer with citation
await page.click('#copilotInput');
await page.type('#copilotInput', 'How do river interceptors work?');
await page.keyboard.press('Enter');
await page.waitForFunction(() => {
  const el = document.getElementById('copilotAnswer');
  return el && !el.classList.contains('hidden') && el.textContent.length > 20;
}, { timeout: 15000 });
await sleep(600);
await shot(page, '4_answer.png');
console.log('shot answer');

// 5. Refusal (off-topic question)
await page.click('#copilotInput');
await page.type('#copilotInput', 'Who painted the Mona Lisa?');
await page.keyboard.press('Enter');
await sleep(1500);
await shot(page, '5_refusal.png');
console.log('shot refusal');

await browser.close();
console.log('DONE frames in', outDir);
