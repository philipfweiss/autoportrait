// autoportrait: a canvas library that paints your picture in front of the
// visitor. Graphite first, then watercolor, one pigment at a time.
//
//   import { paint } from "autoportrait";
//   const painting = paint(canvas, { image: "me.jpg", seed: 42 });
//
// The image should already look painterly for the best effect (see the README
// on making one). The engine's job is the performance, not the style.

import { makeRng, randomSeed } from "./rng.js";
import { grayOf, buildSketchLayer } from "./analyze/luminance.js";
import { buildEdgeField } from "./analyze/edges.js";
import { buildClips } from "./analyze/mask.js";
import { buildRegions } from "./analyze/regions.js";
import { buildPlan } from "./plan/choreography.js";
import { createCompositor } from "./paint/compose.js";
import { createRunner } from "./paint/run.js";

export { presets } from "./plan/presets.js";
export { makeRng, randomSeed };

const DS = 4;

const DEFAULTS = {
  mask: null,
  seed: null,
  preset: "portraitist",
  order: null,
  focus: null, // [{x, y}] in fractions of the canvas
  tempo: 1,
  acts: { sketch: 13, wash: 30, dry: 2.4 },
  brushes: { big: 110, small: 55 },
  regions: { k: 7 },
  paper: "#fbf6ea",
  resolution: 1000, // long edge of the internal painting
  autostart: true,
  respectReducedMotion: true,
  plan: null,
  onCaption: null,
  onProgress: null,
  onFinish: null,
  onReady: null,
};

function loadImage(src) {
  if (typeof src !== "string") return Promise.resolve(src);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`autoportrait: could not load image ${src}`));
    img.src = src;
  });
}

export function paint(canvas, options = {}) {
  if (!options.image) throw new Error("autoportrait: options.image is required");
  const opts = {
    ...DEFAULTS,
    ...options,
    acts: { ...DEFAULTS.acts, ...(options.acts || {}) },
    brushes: { ...DEFAULTS.brushes, ...(options.brushes || {}) },
    regions: { ...DEFAULTS.regions, ...(options.regions || {}) },
  };
  const seed = opts.seed == null ? randomSeed() : opts.seed >>> 0;
  const rng = makeRng(seed);

  let runner = null;
  let paletteFn = () => [];
  const pending = [];
  const emit = (event, ...args) => {
    const cb = opts["on" + event[0].toUpperCase() + event.slice(1)];
    if (cb) cb(...args);
  };

  const ready = (async () => {
    const [img, maskImg] = await Promise.all([
      loadImage(opts.image),
      opts.mask ? loadImage(opts.mask) : Promise.resolve(null),
    ]);

    // internal size: the image's shape, capped at opts.resolution on the long edge
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.min(1, opts.resolution / Math.max(iw, ih));
    const W = Math.round(iw * s);
    const H = Math.round(ih * s);
    canvas.width = W;
    canvas.height = H;

    const makeLayer = (w = W, h = H) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    };

    const colorL = makeLayer();
    colorL.getContext("2d").drawImage(img, 0, 0, W, H);
    const imageData = colorL.getContext("2d").getImageData(0, 0, W, H);

    const gray = grayOf(imageData);
    const sketchL = buildSketchLayer(gray, W, H, makeLayer);
    const field = buildEdgeField(gray, W, H, DS);
    const clips = buildClips(maskImg, W, H, field.EW, field.EH, makeLayer);
    const regions = buildRegions(
      imageData,
      W,
      H,
      DS,
      field.EW,
      field.EH,
      clips ? clips.figCell : null,
      opts.regions.k,
      rng,
    );

    const analysis = { W, H, field, regions, clips };
    const planOpts = {
      ...opts,
      focus: opts.focus ? opts.focus.map((f) => ({ x: f.x * W, y: f.y * H })) : null,
    };
    let plan = buildPlan(analysis, planOpts, rng);
    if (typeof opts.plan === "function") plan = opts.plan(plan) || plan;

    const compositor = createCompositor({
      W,
      H,
      paper: opts.paper,
      colorL,
      sketchL,
      clips,
      makeLayer,
    });
    runner = createRunner(canvas.getContext("2d"), plan, compositor, emit);

    paletteFn = () => {
      const c = colorL.getContext("2d");
      return regions.map((r) => {
        const d = c.getImageData(
          Math.min(W - 4, r.mean.x | 0),
          Math.min(H - 4, r.mean.y | 0),
          4,
          4,
        ).data;
        let rr = 0,
          g = 0,
          b = 0;
        for (let i = 0; i < d.length; i += 4) {
          rr += d[i];
          g += d[i + 1];
          b += d[i + 2];
        }
        const n = d.length / 4;
        return { region: r.name, rgb: [Math.round(rr / n), Math.round(g / n), Math.round(b / n)] };
      });
    };

    const reduced =
      opts.respectReducedMotion &&
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    emit("ready", {
      seed,
      regions: regions.map((r) => ({ name: r.name, tags: [...r.tags], area: r.area })),
    });
    if (opts.autostart) {
      if (reduced) runner.seek(plan.total);
      else runner.play(0);
    }
    for (const fn of pending.splice(0)) fn();
    return painting;
  })();

  const whenReady = (fn) => (runner ? fn() : pending.push(fn));

  const painting = {
    seed,
    ready,
    get finished() {
      return runner ? runner.finished : false;
    },
    get time() {
      return runner ? runner.time : 0;
    },
    get total() {
      return runner ? runner.total : 0;
    },
    play: () => whenReady(() => runner.play(0)),
    repaint: () => whenReady(() => runner.play(0)),
    pause: () => whenReady(() => runner.pause()),
    resume: () => whenReady(() => runner.resume()),
    seek: (t) => whenReady(() => runner.seek(t)),
    finish: () => whenReady(() => runner.finish()),
    palette: () => paletteFn(),
    dispose: () => runner && runner.dispose(),
  };
  return painting;
}
