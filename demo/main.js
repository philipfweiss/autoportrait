import "@fontsource-variable/eb-garamond";
import "@fontsource-variable/inter";
import { paint } from "../src/index.js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");

// BASE_URL survives any hosting shape: dev root, a subpath, with or without
// the trailing slash on the page URL. Never use page-relative asset paths.
const B = import.meta.env.BASE_URL;

const SAMPLES = {
  philip: { image: B + "philip.jpg", mask: B + "philip-mask.png" },
  vermeer: { image: B + "stock/vermeer.jpg", mask: null },
  vangogh: { image: B + "stock/vangogh.jpg", mask: null },
  homer: { image: B + "stock/homer.jpg", mask: null },
};

for (const img of document.querySelectorAll("img[data-src]")) img.src = B + img.dataset.src;

const state = {
  sample: "philip",
  ...SAMPLES.philip,
  focus: [],
  painting: null,
  total: 0,
  schedule: [],
  paper: "#fbf6ea",
  chipFor: new Map(),
  scrubbing: false,
  paused: false,
};

function currentOptions() {
  return {
    image: state.image,
    mask: state.mask,
    seed: Number($("seed").value) >>> 0,
    preset: $("preset").value,
    focus: state.focus.length ? state.focus : null,
    tempo: Number($("tempo").value),
    regions: { k: Number($("k").value) },
    brushes: { big: Number($("big").value), small: Number($("small").value) },
    acts: { sketch: Number($("sketch").value), wash: Number($("wash").value) },
    paper: state.paper,
    respectReducedMotion: false,
    onCaption: (text) => ($("caption").textContent = text),
    onProgress: (t, total) => {
      if (!state.scrubbing) $("scrub").value = total ? Math.round((t / total) * 1000) : 0;
      $("time").textContent = `${t.toFixed(1)}s / ${total.toFixed(1)}s`;
      highlightActive(t);
    },
    onReady: ({ regions, total, schedule }) => {
      state.total = total;
      state.schedule = schedule.filter((g) => g.kind === "wash" && g.region);
      renderLegend(regions);
      renderActsBar(schedule, total);
    },
  };
}

/* ---------- the legend: regions numbered in paint order, lit while painting ---------- */

function renderLegend(regions) {
  const firstAt = new Map();
  for (const g of state.schedule) if (!firstAt.has(g.region)) firstAt.set(g.region, g.t0);
  const ordered = [...regions].sort(
    (a, b) => (firstAt.get(a.name) ?? Infinity) - (firstAt.get(b.name) ?? Infinity),
  );
  const legend = $("legend");
  legend.innerHTML = "";
  state.chipFor = new Map();
  ordered.forEach((r, i) => {
    const chip = document.createElement("span");
    chip.title = `tags: ${r.tags.join(", ")} · ${(r.area * 100).toFixed(0)}% of the picture`;
    const dot = document.createElement("i");
    dot.style.background = `rgb(${r.color.join(",")})`;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(`${i + 1} · ${r.name}`));
    legend.appendChild(chip);
    state.chipFor.set(r.name, chip);
  });
}

function highlightActive(t) {
  let active = null;
  for (const g of state.schedule) if (t >= g.t0 && t <= g.t1) active = g.region;
  for (const [name, chip] of state.chipFor) chip.classList.toggle("painting", name === active);
}

/* the act track under the scrubber: the same colors as the README legend */
function renderActsBar(schedule, total) {
  const sketchEnd = Math.max(0, ...schedule.filter((g) => g.kind === "sketch").map((g) => g.t1));
  const washEnd = Math.max(
    sketchEnd,
    ...schedule.filter((g) => g.kind === "wash").map((g) => g.t1),
  );
  const a = ((sketchEnd / total) * 100).toFixed(1);
  const b = ((washEnd / total) * 100).toFixed(1);
  $("acts").style.background =
    `linear-gradient(to right, #6b6257 0 ${a}%, #a75b34 ${a}% ${b}%, #3e7d74 ${b}% 100%)`;
}

/* ---------- focus pins ---------- */

function renderPins() {
  const pins = $("pins");
  pins.innerHTML = "";
  state.focus.forEach((f, i) => {
    const pin = document.createElement("button");
    pin.className = "pin";
    pin.type = "button";
    pin.title = "remove this focus point";
    pin.style.left = `${f.x * 100}%`;
    pin.style.top = `${f.y * 100}%`;
    pin.textContent = String(i + 1);
    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      state.focus.splice(i, 1);
      renderPins();
      start();
    });
    pins.appendChild(pin);
  });
}

canvas.addEventListener("click", (e) => {
  if (!$("focusMode").checked) return;
  const r = canvas.getBoundingClientRect();
  state.focus.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  renderPins();
  start();
});

$("clearFocus").addEventListener("click", (e) => {
  e.preventDefault();
  state.focus = [];
  renderPins();
  start();
});

/* ---------- run ---------- */

function start() {
  state.painting?.dispose();
  state.paused = false;
  $("pause").textContent = "❚❚";
  state.painting = paint(canvas, currentOptions());
}

for (const [id, out, fmt] of [
  ["tempo", "tempoOut", (v) => `${Number(v).toFixed(1)}×`],
  ["k", "kOut", (v) => v],
  ["big", "bigOut", (v) => v],
  ["small", "smallOut", (v) => v],
  ["sketch", "sketchOut", (v) => `${v}s`],
  ["wash", "washOut", (v) => `${v}s`],
]) {
  $(id).addEventListener("input", () => ($(out).textContent = fmt($(id).value)));
  $(id).addEventListener("change", start);
}
$("preset").addEventListener("change", start);
$("seed").addEventListener("change", start);
for (const btn of document.querySelectorAll("#papers button")) {
  btn.style.background = btn.dataset.paper;
  btn.addEventListener("click", () => {
    state.paper = btn.dataset.paper;
    markPaper();
    start();
  });
}
function markPaper() {
  for (const b of document.querySelectorAll("#papers button"))
    b.classList.toggle("active", b.dataset.paper === state.paper);
}
markPaper();
$("dice").addEventListener("click", rollSeed);
$("paint").addEventListener("click", start);
$("finish").addEventListener("click", () => state.painting?.finish());

function rollSeed() {
  $("seed").value = (Math.random() * 0xffffffff) >>> 0;
  start();
}

/* ---------- picture sources ---------- */

for (const btn of document.querySelectorAll("[data-sample]")) {
  btn.addEventListener("click", () => {
    state.sample = btn.dataset.sample;
    Object.assign(state, SAMPLES[state.sample]);
    state.focus = [];
    renderPins();
    markSample(btn);
    start();
  });
}

function markSample(active) {
  for (const b of document.querySelectorAll("[data-sample]"))
    b.classList.toggle("active", b === active);
}

// A file input never fires change for the same file twice unless its value is
// cleared, so clear it after every read. Old object URLs are revoked.
function takeFile(input, assign) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  assign(URL.createObjectURL(f));
  state.sample = null;
  markSample(null);
  state.focus = [];
  renderPins();
  start();
}

$("imageFile").addEventListener("change", (e) =>
  takeFile(e.target, (url) => {
    if (state.image?.startsWith("blob:")) URL.revokeObjectURL(state.image);
    state.image = url;
    state.mask = null; // a new picture invalidates the old mask
  }),
);

$("maskFile").addEventListener("change", (e) =>
  takeFile(e.target, (url) => {
    if (state.mask?.startsWith("blob:")) URL.revokeObjectURL(state.mask);
    state.mask = url;
  }),
);

/* ---------- timeline: pause and scrub ---------- */

function togglePause() {
  if (!state.painting) return;
  state.paused = !state.paused;
  if (state.paused) state.painting.pause();
  else state.painting.resume();
  $("pause").textContent = state.paused ? "▶" : "❚❚";
}

$("pause").addEventListener("click", togglePause);

$("scrub").addEventListener("pointerdown", () => {
  state.scrubbing = true;
  state.painting?.pause();
});
$("scrub").addEventListener("input", () => {
  if (!state.painting || !state.total) return;
  state.painting.seek((Number($("scrub").value) / 1000) * state.total);
});
$("scrub").addEventListener("pointerup", () => {
  state.scrubbing = false;
  if (!state.paused) state.painting?.resume();
});

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (e.key === " ") {
    e.preventDefault();
    togglePause();
  } else if (e.key === "r") {
    start();
  } else if (e.key === "s") {
    rollSeed();
  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    if (!state.painting || !state.total) return;
    e.preventDefault();
    const dt = state.total * 0.02 * (e.key === "ArrowRight" ? 1 : -1);
    state.painting.pause();
    state.painting.seek(Math.max(0, Math.min(state.total, state.painting.time + dt)));
    if (!state.paused) state.painting.resume();
  }
});

/* ---------- exports ---------- */

function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function busy(btn, label, fn) {
  const was = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
}

$("png").addEventListener("click", () =>
  busy($("png"), "saving…", async () => {
    const p = state.painting;
    if (!p || !state.total) return;
    const wasTime = p.time;
    p.pause();
    p.seek(state.total);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    download(blob, `autoportrait-${$("seed").value}.png`);
    p.seek(wasTime);
    if (!state.paused) p.resume();
  }),
);

$("gif").addEventListener("click", () =>
  busy($("gif"), "rendering…", async () => {
    const p = state.painting;
    if (!p || !state.total) return;
    const wasTime = p.time;
    p.pause();
    const frames = 72;
    const scale = 480 / Math.max(canvas.width, canvas.height);
    const w = Math.round(canvas.width * scale);
    const h = Math.round(canvas.height * scale);
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const sctx = small.getContext("2d");

    // shared palette from keyframes, same trick as the README hero
    const samples = [];
    for (const f of [0.15, 0.5, 1]) {
      p.seek(f * state.total);
      sctx.drawImage(canvas, 0, 0, w, h);
      samples.push(sctx.getImageData(0, 0, w, h).data);
    }
    const merged = new Uint8Array(samples.reduce((s, a) => s + a.length, 0));
    let off = 0;
    for (const s of samples) {
      merged.set(s, off);
      off += s.length;
    }
    const palette = quantize(merged, 256);

    const gif = GIFEncoder();
    for (let i = 0; i <= frames; i++) {
      p.seek((i / frames) * state.total);
      sctx.drawImage(canvas, 0, 0, w, h);
      const { data } = sctx.getImageData(0, 0, w, h);
      gif.writeFrame(applyPalette(data, palette), w, h, {
        ...(i === 0 ? { palette } : {}),
        delay: i === frames ? 1800 : 90,
      });
      await new Promise((r) => setTimeout(r));
    }
    gif.finish();
    download(new Blob([gif.bytes()], { type: "image/gif" }), `autoportrait-${$("seed").value}.gif`);
    p.seek(wasTime);
    if (!state.paused) p.resume();
  }),
);

$("video").addEventListener("click", () =>
  busy($("video"), "recording…", async () => {
    const p = state.painting;
    if (!p || !state.total) return;
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(250);
    await new Promise((resolve) => {
      const opts = currentOptions();
      state.painting.dispose();
      state.painting = paint(canvas, {
        ...opts,
        onFinish: () => setTimeout(resolve, 400),
      });
    });
    rec.stop();
    await done;
    download(new Blob(chunks, { type: "video/webm" }), `autoportrait-${$("seed").value}.webm`);
  }),
);

$("html").addEventListener("click", () =>
  busy($("html"), "packing…", async () => {
    const toDataUri = async (src) => {
      if (!src) return null;
      const blob = await (await fetch(src)).blob();
      return await new Promise((r) => {
        const fr = new FileReader();
        fr.onload = () => r(fr.result);
        fr.readAsDataURL(blob);
      });
    };
    const opts = {
      image: await toDataUri(state.image),
      mask: await toDataUri(state.mask),
      seed: Number($("seed").value) >>> 0,
      preset: $("preset").value,
      focus: state.focus.length ? state.focus : undefined,
      tempo: Number($("tempo").value),
      regions: { k: Number($("k").value) },
      brushes: { big: Number($("big").value), small: Number($("small").value) },
      acts: { sketch: Number($("sketch").value), wash: Number($("wash").value) },
      paper: state.paper,
    };
    const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>autoportrait</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:${opts.paper}">
<canvas id="autoportrait" style="max-width:min(92vw,640px);height:auto"></canvas>
<script type="module">
import { paint } from "https://cdn.jsdelivr.net/gh/philipfweiss/autoportrait@main/src/index.js";
paint(document.getElementById("autoportrait"), ${JSON.stringify(opts, null, 2)});
</script>
</body>
</html>
`;
    download(new Blob([html], { type: "text/html" }), `autoportrait-${$("seed").value}.html`);
  }),
);

/* ---------- boot ---------- */

markPaper();
markSample(state.sample ? document.querySelector(`[data-sample="${state.sample}"]`) : null);
renderPins();
start();
