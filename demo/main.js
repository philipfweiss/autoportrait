import { paint } from "../src/index.js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");

const SAMPLES = {
  philip: { image: "./philip.jpg", mask: "./philip-mask.png" },
  vermeer: { image: "./stock/vermeer.jpg", mask: null },
  vangogh: { image: "./stock/vangogh.jpg", mask: null },
  homer: { image: "./stock/homer.jpg", mask: null },
};

const state = {
  ...SAMPLES.philip,
  focus: [],
  painting: null,
  total: 0,
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
    paper: $("paper").value,
    respectReducedMotion: false,
    onCaption: (text) => ($("caption").textContent = text),
    onProgress: (t, total) => {
      if (!state.scrubbing) $("scrub").value = total ? Math.round((t / total) * 1000) : 0;
      $("time").textContent = `${t.toFixed(1)}s / ${total.toFixed(1)}s`;
    },
    onReady: ({ regions, total }) => {
      state.total = total;
      renderLegend(regions);
    },
  };
}

function renderLegend(regions) {
  const legend = $("legend");
  legend.innerHTML = "";
  for (const r of [...regions].sort((a, b) => b.area - a.area)) {
    const chip = document.createElement("span");
    chip.title = `tags: ${r.tags.join(", ")}`;
    const dot = document.createElement("i");
    dot.style.background = `rgb(${r.color.join(",")})`;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(`${r.name} · ${(r.area * 100).toFixed(0)}%`));
    legend.appendChild(chip);
  }
}

function start() {
  state.painting?.dispose();
  state.paused = false;
  $("pause").textContent = "❚❚";
  state.painting = paint(canvas, currentOptions());
}

/* ---------- dials ---------- */

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
$("finish").addEventListener("click", () => state.painting?.finish());

/* ---------- picture sources ---------- */

for (const btn of document.querySelectorAll("[data-sample]")) {
  btn.addEventListener("click", () => {
    Object.assign(state, SAMPLES[btn.dataset.sample]);
    state.focus = [];
    markSample(btn);
    start();
  });
}

function markSample(active) {
  for (const b of document.querySelectorAll("[data-sample]"))
    b.classList.toggle("active", b === active);
}
markSample(document.querySelector('[data-sample="philip"]'));

// A file input never fires change for the same file twice unless its value is
// cleared, so clear it after every read. Old object URLs are revoked.
function takeFile(input, assign) {
  const f = input.files[0];
  input.value = "";
  if (!f) return;
  const url = URL.createObjectURL(f);
  assign(url);
  markSample(null);
  state.focus = [];
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

/* ---------- focus points ---------- */

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

/* ---------- timeline: pause and scrub ---------- */

$("pause").addEventListener("click", () => {
  if (!state.painting) return;
  state.paused = !state.paused;
  if (state.paused) state.painting.pause();
  else state.painting.resume();
  $("pause").textContent = state.paused ? "▶" : "❚❚";
});

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
    download(new Blob([gif.bytes()], { type: "image/gif" }), "autoportrait.gif");
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
    // record a full live replay at the current dials
    await new Promise((resolve) => {
      const opts = currentOptions();
      const prevFinish = opts.onFinish;
      state.painting.dispose();
      state.painting = paint(canvas, {
        ...opts,
        onFinish: () => {
          prevFinish?.();
          setTimeout(resolve, 400);
        },
      });
    });
    rec.stop();
    await done;
    download(new Blob(chunks, { type: "video/webm" }), "autoportrait.webm");
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
      paper: $("paper").value,
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
    download(new Blob([html], { type: "text/html" }), "autoportrait.html");
  }),
);

start();
