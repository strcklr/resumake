// Composes public/og.png and public/apple-touch-icon.png from page images made by og-image.sh.
// Usage: node scripts/og-image.mjs <dir with classic-1.png, modern-1.png, executive-1.png> <out dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// Playwright isn't a dependency of the editor: use a global install (NODE_PATH=$(npm root -g)).
const { chromium } = createRequire(import.meta.url)('playwright');

const [dir, out] = process.argv.slice(2);
const page = (theme) => `data:image/png;base64,${readFileSync(join(dir, `${theme}-1.png`)).toString('base64')}`;

const card = `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Georgia, 'Times New Roman', serif;
         background: linear-gradient(135deg, #f4f7fb 0%, #e3ebf5 100%); color: #14253a; }
  .text { position: absolute; left: 72px; top: 92px; width: 520px; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 40px; font-weight: 700; }
  .logo { width: 60px; height: 60px; border-radius: 13px; background: #235a8c; color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 36px; }
  h1 { margin-top: 44px; font-size: 62px; line-height: 1.05; letter-spacing: -0.01em; }
  p { margin-top: 26px; font: 500 26px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #3d5068; }
  .url { position: absolute; left: 72px; bottom: 56px; font: 600 22px system-ui, sans-serif; color: #235a8c; }
  .pages img { position: absolute; width: 330px; border-radius: 4px;
               box-shadow: 0 2px 6px rgb(15 30 50 / 0.18), 0 18px 40px rgb(15 30 50 / 0.22); }
  .p1 { left: 640px; top: 120px; transform: rotate(-6deg); }
  .p2 { left: 760px; top: 70px; transform: rotate(1deg); }
  .p3 { left: 880px; top: 130px; transform: rotate(7deg); }
</style></head><body>
  <div class="text">
    <div class="brand"><span class="logo">r</span>resumake</div>
    <h1>Your resume, written once.</h1>
    <p>YAML in; PDF, Word, HTML and Markdown out. Seven themes, live preview, all in your browser.</p>
  </div>
  <div class="url">resumake.chasestrickler.com</div>
  <div class="pages">
    <img class="p1" src="${page('classic')}"><img class="p2" src="${page('modern')}"><img class="p3" src="${page('executive')}">
  </div>
</body></html>`;

const icon = `<!doctype html><html><body style="margin:0;width:180px;height:180px;background:#235a8c;display:flex;
  align-items:center;justify-content:center;font:100px Georgia,serif;color:#fff">r</body></html>`;

const browser = await chromium.launch();
try {
  const p = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(card);
  await p.screenshot({ path: join(out, 'og.png') });
  await p.setViewportSize({ width: 180, height: 180 });
  await p.setContent(icon);
  await p.screenshot({ path: join(out, 'apple-touch-icon.png') });
} finally {
  await browser.close();
}
