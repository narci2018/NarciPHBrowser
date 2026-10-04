// The warm-up driver: connects to a running automation server and visits a
// list of sites so cookies, cache and history accumulate in the profile's
// real browser data. This file is the app's own, not upstream code.
//
// Usage (one process per warm-up):
//   node warmup.js <driverDir> <wsEndpoint> <jobJson>
// where jobJson is
//   {"sites": ["https://…"], "secondsPerSite": 20, "gotoTimeoutMs": 30000}
//
// Progress is one JSON line per site on stdout:
//   {"progress":{"url":"…","ok":true}}
// and the last line carries the whole run:
//   {"results":[…]}
// A connect failure is one line {"error":"…"} and exit code 1. Per-site
// failures are entries with ok:false and a short error, never a crash: one
// dead site must not strand the rest of the run.

const driverDir = process.argv[2];
const endpoint = process.argv[3];
let job;
try {
  job = JSON.parse(process.argv[4]);
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: `the warm-up job is not valid JSON: ${error}` }) + "\n",
  );
  process.exit(1);
}

const sites = Array.isArray(job.sites) ? job.sites : [];
const secondsPerSite = Math.max(0, Number(job.secondsPerSite ?? 20));
const gotoTimeoutMs = Math.max(1000, Number(job.gotoTimeoutMs ?? 30000));

const { firefox } = require(driverDir);

(async () => {
  let browser;
  try {
    browser = await firefox.connect(endpoint);
    // The profile's own context is where its cookies live; a fresh context
    // would be a separate cookie jar and the warm-up would write nothing the
    // profile keeps. The server has exactly one.
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = await context.newPage();

    const results = [];
    for (const site of sites) {
      const entry = { url: String(site), ok: false };
      try {
        await page.goto(entry.url, { timeout: gotoTimeoutMs, waitUntil: "domcontentloaded" });
        // The dwell is the point: cookies set in page JS and on unload only
        // land when the page is given time to run.
        await page.waitForTimeout(secondsPerSite * 1000);
        entry.ok = true;
      } catch (error) {
        entry.error = String(error && error.message ? error.message : error).slice(0, 300);
      }
      results.push(entry);
      process.stdout.write(JSON.stringify({ progress: entry }) + "\n");
    }

    await page.close();
    process.stdout.write(JSON.stringify({ results }) + "\n");
    // A connected browser is disconnected here, not killed: the automation
    // server owns the process and shuts it down cleanly, flushing the
    // profile's data to disk.
    await browser.close();
    process.exit(0);
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        error: String(error && error.message ? error.message : error).slice(0, 300),
      }) + "\n",
    );
    process.exit(1);
  }
})();
