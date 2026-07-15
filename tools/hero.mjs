// Regenerate the README's hero gif: the demo portrait painting itself,
// seed 42, at the painting's real duration (about 48 seconds). `npm run hero`.

import { writeFileSync } from "node:fs";
import { withPage } from "./_browser.mjs";

const OUT = new URL("../docs/media/hero.gif", import.meta.url).pathname;

await withPage(async (page, errors, base) => {
  await page.goto(`${base}/render.html`);
  page.setDefaultTimeout(300000);

  const b64 = await page.evaluate(() => window.renderHero(120, 340));
  writeFileSync(OUT, Buffer.from(b64, "base64"));
  console.log(
    `wrote docs/media/hero.gif (${(Buffer.from(b64, "base64").length / 1e6).toFixed(1)} MB)`,
  );

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
});
