// Shared launcher for the test and the media generators: a vite dev server
// over the repo plus a headless chromium page, torn down together.

import { spawn } from "node:child_process";
import { chromium } from "playwright";

export async function withPage(fn, { port = 4411 } = {}) {
  const vite = spawn("npx", ["vite", "demo", "--port", String(port), "--strictPort"], {
    stdio: "ignore",
    detached: false,
  });
  try {
    await waitFor(`http://localhost:${port}/`);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    try {
      return await fn(page, errors, `http://localhost:${port}`);
    } finally {
      await browser.close();
    }
  } finally {
    vite.kill();
  }
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server at ${url} never came up`);
}
