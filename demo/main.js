import { paint } from "../src/index.js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");

const state = {
  image: "./philip.jpg",
  mask: "./philip-mask.png",
  focus: [],
  painting: null,
};

// Philip's portrait keeps its original narration; anything else gets the
// generated captions from the engine.
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
    paper: $("paper").value,
    respectReducedMotion: false,
    onCaption: (text) => ($("caption").textContent = text),
    onProgress: (t, total) => ($("progress").value = total ? t / total : 0),
    onReady: ({ regions }) => renderLegend(regions),
  };
}

function renderLegend(regions) {
  const legend = $("legend");
  legend.innerHTML = "";
  for (const r of regions) {
    const chip = document.createElement("span");
    const dot = document.createElement("i");
    dot.style.background = `rgb(${regionColor(r.name)})`;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(`${r.name} ${(r.area * 100).toFixed(0)}%`));
    legend.appendChild(chip);
  }
}

// stable-ish chip colors by name hash, only for the legend
function regionColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return hslToRgb(h, 0.45, 0.55).join(",");
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

function start() {
  state.painting?.dispose();
  state.painting = paint(canvas, currentOptions());
}

/* ---------- wiring ---------- */

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
$("paper").addEventListener("change", start);
$("seed").addEventListener("change", start);

$("dice").addEventListener("click", () => {
  $("seed").value = (Math.random() * 0xffffffff) >>> 0;
  start();
});

$("paint").addEventListener("click", start);

let paused = false;
$("pause").addEventListener("click", () => {
  if (!state.painting) return;
  paused = !paused;
  if (paused) state.painting.pause();
  else state.painting.resume();
  $("pause").textContent = paused ? "resume" : "pause";
});

$("finish").addEventListener("click", () => state.painting?.finish());

$("imageFile").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  state.image = URL.createObjectURL(f);
  state.mask = null; // an uploaded picture has no mask until one is supplied
  state.focus = [];
  start();
});

$("maskFile").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  state.mask = URL.createObjectURL(f);
  start();
});

$("useDemo").addEventListener("click", () => {
  state.image = "./philip.jpg";
  state.mask = "./philip-mask.png";
  state.focus = [];
  start();
});

// public-domain paintings: already painterly, so the automatic path shines
for (const btn of document.querySelectorAll("[data-stock]")) {
  btn.addEventListener("click", () => {
    state.image = "./" + btn.dataset.stock;
    state.mask = null;
    state.focus = [];
    start();
  });
}

canvas.addEventListener("click", (e) => {
  if (!$("focusMode").checked) return;
  const r = canvas.getBoundingClientRect();
  state.focus.push({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  start();
});

$("clearFocus").addEventListener("click", () => {
  state.focus = [];
  start();
});

/* ---------- GIF export: sample the plan with seek(), deterministic ---------- */

$("gif").addEventListener("click", async () => {
  const p = state.painting;
  if (!p || !p.total) return;
  $("gif").disabled = true;
  $("gif").textContent = "rendering…";
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

  const gif = GIFEncoder();
  for (let i = 0; i <= frames; i++) {
    p.seek((i / frames) * p.total);
    sctx.drawImage(canvas, 0, 0, w, h);
    const { data } = sctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: i === frames ? 1500 : 90 });
    await new Promise((r) => setTimeout(r));
  }
  gif.finish();

  const blob = new Blob([gif.bytes()], { type: "image/gif" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "autoportrait.gif";
  a.click();

  p.seek(wasTime);
  p.resume();
  $("gif").disabled = false;
  $("gif").textContent = "export GIF";
});

start();
