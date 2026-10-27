const { chromium } = require('playwright'); const fs = require('fs');
const OUT = require('path').resolve(__dirname, '../../report/diagrams') + '/';
(async () => {
  const b = await chromium.launch();
  for (const d of process.argv.slice(2)) {
    const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('requestfailed', r => errs.push('fail ' + r.url().slice(0, 100)));
    await p.goto('http://localhost:5199/?d=' + d);
    await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await p.waitForTimeout(2500);
    fs.writeFileSync(OUT + d + '.png', Buffer.from(await p.evaluate(() => window.exportPng()), 'base64'));
    fs.writeFileSync(OUT + d + '.tldr.json', await p.evaluate(() => window.exportTldr()));
    console.log(d, 'ok', errs.slice(0, 3));
    await p.close();
  }
  await b.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
