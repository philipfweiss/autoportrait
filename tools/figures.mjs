// Regenerate the README's figures from the library itself. Run after any
// engine change: `npm run figures`.

import { writeFileSync } from "node:fs";
import { withPage } from "./_browser.mjs";

const OUT = new URL("../docs/media/", import.meta.url).pathname;

const save = (name, dataUrl) => {
  writeFileSync(OUT + name, Buffer.from(dataUrl.split(",")[1], "base64"));
  console.log("wrote docs/media/" + name);
};

await withPage(async (page, errors, base) => {
  await page.goto(`${base}/render.html`);
  page.setDefaultTimeout(120000);

  save("stages.png", await page.evaluate(() => window.renderStages([0.08, 0.2, 0.38, 0.62, 1])));
  save("edge-field.png", await page.evaluate(() => window.renderEdgeField()));
  save("regions.png", await page.evaluate(() => window.renderRegions()));
  save("path.png", await page.evaluate(() => window.renderPath()));

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
});
