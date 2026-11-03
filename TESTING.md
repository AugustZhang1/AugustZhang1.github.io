# Testing

## App type

Static personal portfolio served directly from HTML, CSS and vanilla JavaScript.
`index.html` is the root page: Canvas 2D rendering, inline application JavaScript and
animation plugins in `anims/*.js`. No application server, database,
compilation step, credentials or seed data are required. The npm dependencies
are not needed to serve these pages.

## Setup (once)

Verified on Windows PowerShell with Python 3.13.14, Node 24.18.0 and npm 11.16.0.
Run from the repository root. All tooling, copied manifests and test artifacts
below go into the system temp directory; the repository manifests stay untouched.

```powershell
$qaDir = Join-Path ([IO.Path]::GetTempPath()) ('portfolio-qa-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qaDir | Out-Null
Copy-Item package.json,package-lock.json -Destination $qaDir
Push-Location $qaDir
npm ci --ignore-scripts --no-audit --no-fund --offline=false --cache "$qaDir/npm-cache"
New-Item -ItemType Directory -Path "$qaDir/browser" -Force | Out-Null
npm install --prefix "$qaDir/browser" --no-save --package-lock=false --ignore-scripts --no-audit --no-fund --offline=false --cache "$qaDir/npm-cache" playwright@1.61.1
Pop-Location
$env:CHROMIUM_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright/chromium-1248/chrome-win64/chrome.exe'
```

Both installs succeeded (11 locked dependency packages, 2 browser-tool packages).
Lifecycle scripts are deliberately disabled. Initial installation with the
sandbox's offline cache failed with `ENOTCACHED`; enabling network access and
using the temporary cache succeeded. Registry access is needed for a fresh setup.

`CHROMIUM_PATH` is a test-only override pointing to an existing Chromium binary.
This run used the preinstalled browser above, because Playwright 1.61.1's default
browser revision was absent. Its compatibility was proved by the test below.
On another machine, supply the path to its installed Chromium. `%LOCALAPPDATA%`
and the system temp directory are OS locations; the app requires no environment
variables. No secrets belong in this file.

## Run

In a dedicated terminal, from the repository root:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Ready when the terminal reports serving on port 8000 and the following returns
`200` in a second terminal:

```powershell
(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/index.html).StatusCode
```

URLs: `http://127.0.0.1:8000/` and
`http://127.0.0.1:8000/index.html`.
If 8000 is already occupied, check that this exact URL serves this checkout before
reusing it. Stop a server you started with Ctrl+C in its terminal. Do not stop a
server owned by someone else. The verification run started and stopped its own
server.

## Automated checks

These commands were actually run against the copied manifests in `$qaDir`:

```powershell
Push-Location $qaDir
npm run build
npm test
npm run lint
Pop-Location
```

All three fail with `Missing script`; there is no configured build, unit-test or
lint runner. `npm run` at the root succeeds and lists no scripts. These are
absence checks, not passing test suites. Serving the site does not require them.
The Playwright smoke check below supplies observable browser coverage.

## End to end

Keep the server running. Save the following JavaScript block as
`$qaDir/e2e.cjs` (outside the repo), then run it in the setup terminal:

```powershell
node "$qaDir/e2e.cjs"
```

It checks the root page/theme persistence and the galaxy page in both themes at
1440x900 and 390x844. Every project opens through its direct URL, populates a
detail panel, closes through Back, and opens/closes through the console helpers.
Escape is also checked. It collects browser exceptions, console errors, failed
requests and HTTP errors, writes screenshots and `results.json` into `$qaDir`,
and closes Chromium even on assertion failure. Exit 0 means all assertions
passed and no collected errors occurred; exit 1 requires inspection of the log
and artifacts. The 1.8-second dwell samples animation execution; it does not
prove every frame or every nested canvas interaction.

`?open=<key>&dtmax=0.7` opens a project and allows animation time to advance under
headless frame throttling. Supported keys in this recipe: `league`, `minecraft`,
`rag`, `arbitrage`, `audiobook`, `ark-eagle`, `medihub`,
`arkproject`, `jobapply`, `sinai`, `senseway`, `reels`, `clerk`, `pet`. Browser-console helpers are
`__galaxy.open(key)` and `__galaxy.close()`. The actual theme button is
`#themeBtn`; the stored preference is localStorage key `theme`. Each viewport
uses a fresh browser context. No accounts, remote APIs or seed step are needed;
project data is embedded in the page.

```javascript
const { chromium } = require('./browser/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const keys = 'league minecraft rag arbitrage audiobook ark-eagle medihub arkproject jobapply sinai senseway reels clerk pet'.split(' ');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH});
  const failures = [];
  try {
    for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
      const context = await browser.newContext({viewport,colorScheme:'light'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push('pageerror: '+e.message));
      page.on('console', m => {if(m.type()==='error' && !(m.location().url||'').endsWith('/favicon.ico')) errors.push('console: '+m.text());});
      page.on('requestfailed', r => errors.push('requestfailed: '+r.url()+' '+r.failure()?.errorText));
      page.on('response', r => {if(r.status()>=400 && !r.url().endsWith('/favicon.ico')) errors.push('HTTP '+r.status()+': '+r.url());});
      const base = 'http://127.0.0.1:8000';
      assert.equal((await page.goto(base+'/')).status(),200);
      await page.locator('#themeBtn').click();
      assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),'dark');
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
      console.log(viewport.width+' root/theme OK');
      for (const theme of ['light','dark']) {
        await page.addInitScript(t=>localStorage.setItem('theme',t),theme);
        assert.equal((await page.goto(base+'/index.html?dtmax=0.7')).status(),200);
        await page.waitForFunction(()=>window.__galaxy && Object.keys(window.GALAXY_ANIMS).length===14);
        assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
        await page.locator('#themeBtn').click();
        assert.equal(await page.evaluate(()=>localStorage.getItem('theme')),theme==='light'?'dark':'light');
        await page.locator('#themeBtn').click();
        for (const key of keys) {
          assert.equal((await page.goto(base+'/index.html?open='+key+'&dtmax=0.7')).status(),200);
          await page.waitForFunction(()=>document.querySelector('#detail').classList.contains('open'));
          assert.ok((await page.locator('#dTitle').textContent()).trim());
          await page.waitForTimeout(1800);
          await page.screenshot({path:path.join(__dirname,viewport.width+'-'+theme+'-'+key+'.png')});
          await page.locator('#backBtn').click();
          await page.waitForFunction(()=>!document.querySelector('#detail').classList.contains('open'));
          await page.evaluate(k=>window.__galaxy.open(k),key);
          await page.waitForFunction(()=>document.querySelector('#detail').classList.contains('open'));
          await page.evaluate(()=>window.__galaxy.close());
          await page.waitForFunction(()=>!document.querySelector('#detail').classList.contains('open'));
          console.log(viewport.width+' '+theme+' '+key+' open/back/helpers OK');
        }
        await page.evaluate(()=>window.__galaxy.open('league'));
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('#detail').classList.contains('open'));
      }
      const unique = [...new Set(errors)];
      console.log(viewport.width+' errors: '+JSON.stringify(unique));
      failures.push(...unique.map(e=>viewport.width+': '+e));
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify(failures,null,2));
  if(failures.length) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
```

Verification results (2026-11-03): all 56 project/viewport/theme combinations (14 galaxies) passed the interaction assertions and `results.json` was `[]`. The script ignores the browser's automatic `/favicon.ico` 404.

## Search quality

Semantic search uses precomputed embeddings in `embeddings.js`. Run
`node tools/search-eval.cjs` from the repository root; it runs 13 gold queries
through the page's own scoring code and exits 1 on any failure. After editing chunk text or
project metadata, regenerate the embeddings first (see the header of `tools/embed.py`).

## Needs a human

Visual approval of canvas animation, motion comfort and layout on real devices
remains a human check. Screenshots were captured as evidence; no judgment of
page content or visual design was made. This smoke recipe does not cover every
canvas hit target, drag/zoom path, search, nested solar-system state, full
accessibility, other browser engines, or external destination behavior. External
links and email were not opened. The prototype was being edited concurrently;
rerun this recipe after changes settle. No credentials, services, test accounts
or editor plugins were needed for the automated run.


