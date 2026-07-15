// The smoke test: the painting is deterministic, progresses, and throws no
// errors. Run with `npm test` (playwright chromium must be installed).

import assert from "node:assert/strict";
import { withPage } from "../tools/_browser.mjs";

await withPage(async (page, errors, base) => {
  await page.goto(`${base}/test.html`);

  const a = await page.evaluate(() => window.run(1));
  const b = await page.evaluate(() => window.run(1));
  const c = await page.evaluate(() => window.run(2));

  assert.deepEqual(a, b, "same seed must repaint the same painting");
  assert.notDeepEqual(a, c, "a different seed must paint a different painting");
  assert.ok(new Set(a).size > 1, "checkpoints must differ (the painting progresses)");
  assert.ok(
    a.every((h) => h !== 0),
    "no checkpoint may be blank",
  );
  assert.deepEqual(errors, [], "no page or console errors");

  console.log("smoke ok");
  console.log("  seed 1:", a.join(", "));
  console.log("  seed 2:", c.join(", "));
});
