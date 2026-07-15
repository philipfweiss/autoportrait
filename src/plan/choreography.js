// Choreography: the painting as a schedule. Everything a viewer reads as
// intent (the head before the shoulders, the sky before the sea, the eyes
// saved for last) is decided here, before a single frame renders.
//
// Levers, from easiest to sharpest:
//   preset  -> a named schedule (portraitist, landscapist, printmaker)
//   order   -> a list of region names/tags that overrides the preset
//   focus   -> points the painting radiates from when words don't fit
//   plan    -> a callback handed the finished group list, free to reorder it

import { edgeMagAt } from "../analyze/edges.js";
import { makeContour, makeHatch, makeStamp, pathOrder, kmeansXY, centroid } from "./strokes.js";
import { resolvePreset } from "./presets.js";

const clampN = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));

/** Order regions by an ordering vocabulary, focus points, or lightness. */
function orderRegions(regions, preset, opts) {
  const remaining = new Set(regions);
  const out = [];

  const takeMatching = (token) => {
    const matched = [...remaining]
      .filter((r) => r.name === token || r.name.startsWith(token + "-") || r.tags.has(token))
      .sort((a, b) => b.area - a.area);
    for (const r of matched) {
      remaining.delete(r);
      out.push(r);
    }
  };

  if (opts.order && opts.order.length) {
    for (const token of opts.order) takeMatching(token);
  } else if (opts.focus && opts.focus.length) {
    const near = (r) =>
      Math.min(...opts.focus.map((f) => Math.hypot(r.mean.x - f.x, r.mean.y - f.y)));
    [...remaining]
      .sort((a, b) => near(a) - near(b))
      .forEach((r) => {
        remaining.delete(r);
        out.push(r);
      });
  } else if (preset.byLightness) {
    [...remaining]
      .sort((a, b) => b.mean.L - a.mean.L)
      .forEach((r) => {
        remaining.delete(r);
        out.push(r);
      });
  } else {
    for (const token of preset.order) takeMatching(token);
  }

  // leftovers: figure before background, big before small
  [...remaining]
    .sort((a, b) => (b.isFigure ? 1 : 0) - (a.isFigure ? 1 : 0) || b.area - a.area)
    .forEach((r) => out.push(r));
  return out;
}

/** A short pigment word for the captions, from the region's mean color. */
export function pigmentWord(mean) {
  const { L, a, b } = mean;
  if (L > 82 && Math.abs(a) < 10 && Math.abs(b) < 16) return "pale cream";
  if (L < 30) return "dark umber";
  if (a < -14) return "sap green";
  if (b < -14 && a < 4) return "a wash of blue";
  if (b < -6 && a < -4) return "teal";
  if (b > 26 && a < 14) return "pale gold";
  if (a > 16) return "warm sienna";
  if (Math.abs(a) < 8 && Math.abs(b) < 10) return "a warm gray";
  return "a soft wash";
}

/**
 * Build the full plan: sketch groups, wash groups, detail passes, captions.
 * Returns { groups, captions, dry: [d0, d1], total }.
 */
export function buildPlan(analysis, opts, rng) {
  const { W, H, field, regions, clips } = analysis;
  const preset = resolvePreset(opts.preset);
  const ordered = orderRegions(regions, preset, opts);
  const tempo = opts.tempo > 0 ? opts.tempo : 1;
  const acts = opts.acts;

  // per-cell region lookup for binning sketch strokes
  const EW = field.EW;
  const cellRegion = new Int16Array(EW * field.EH).fill(-1);
  regions.forEach((r, ri) => {
    for (const c of r.cells) {
      const ex = Math.min(EW - 1, Math.round(c.x / field.DS));
      const ey = Math.min(field.EH - 1, Math.round(c.y / field.DS));
      cellRegion[ey * EW + ex] = ri;
    }
  });
  const regionAt = (x, y) => {
    const ex = Math.min(EW - 1, Math.max(0, Math.round(x / field.DS)));
    const ey = Math.min(field.EH - 1, Math.max(0, Math.round(y / field.DS)));
    return cellRegion[ey * EW + ex];
  };

  const groups = [];
  const captions = [];
  let t = 0;

  /* ---------- act one: graphite ---------- */
  const sketchSecs = (acts.sketch ?? 13) / tempo;
  if (sketchSecs > 0) {
    // contours wherever the edge field is loud, binned by region
    const bins = ordered.map(() => []);
    const step = 5;
    for (let ey = 2; ey < field.EH - 2; ey += step)
      for (let ex = 2; ex < EW - 2; ex += step) {
        if (edgeMagAt(field, ex, ey) <= 14) continue;
        const x = ex * field.DS,
          y = ey * field.DS;
        const ri = cellRegion[ey * EW + ex];
        const oi = ri < 0 ? bins.length - 1 : ordered.findIndex((r) => r.id === ri);
        bins[Math.max(0, oi)].push(makeContour(x, y, field, rng));
      }

    let binOrder = bins.map((strokes, i) => ({ strokes, i }));
    if (preset.sketchOrder === "background-first") binOrder = binOrder.slice().reverse();
    if (preset.sketchOrder === "sweep") {
      const all = bins
        .flat()
        .sort((a, b) => a.pts[0].y + a.pts[0].x * 0.3 - (b.pts[0].y + b.pts[0].x * 0.3));
      binOrder = [{ strokes: all, i: 0 }];
    } else {
      for (const b of binOrder) {
        if (!b.strokes.length) continue;
        const c = centroid(b.strokes.map((s) => s.pts[0]));
        b.strokes.sort(
          (a, s) =>
            Math.hypot(a.pts[0].x - c.x, a.pts[0].y - c.y) +
            rng() * 90 -
            (Math.hypot(s.pts[0].x - c.x, s.pts[0].y - c.y) + rng() * 90),
        );
      }
    }

    // hatching: the shading sweep after the contours
    const hatches = [];
    const grid = 8;
    for (let gy = 0; gy < grid; gy++)
      for (let gx = 0; gx < grid; gx++) {
        const x = ((gx + 0.5 + (rng() - 0.5) * 0.7) * W) / grid;
        const y = ((gy + 0.5 + (rng() - 0.5) * 0.7) * H) / grid;
        const n = 2 + rng.int(3);
        for (let i = 0; i < n; i++) hatches.push(makeHatch(x, y, rng));
      }
    hatches.sort(
      (a, b) =>
        a.pts[0].y + a.pts[0].x * 0.3 + rng() * 120 - (b.pts[0].y + b.pts[0].x * 0.3 + rng() * 120),
    );

    const contourSecs = sketchSecs * 0.68;
    const totalStrokes = binOrder.reduce((s, b) => s + b.strokes.length, 0) || 1;
    for (const b of binOrder) {
      if (!b.strokes.length) continue;
      const dur = Math.max(0.4, contourSecs * (b.strokes.length / totalStrokes));
      groups.push({ kind: "sketch", strokes: b.strokes, t0: t, t1: t + dur });
      t += dur * 0.94; // slight overlap: the pencil never fully stops
    }
    captions.push({ t: 0, phase: "sketch", text: "graphite: placing the drawing" });

    groups.push({ kind: "sketch", strokes: hatches, t0: t, t1: t + sketchSecs * 0.32 });
    captions.push({ t, phase: "sketch", text: "hatching the shadows" });
    t += sketchSecs * 0.32;

    // the artist steps back
    captions.push({ t, phase: "sketch", text: "stepping back to check the drawing" });
    t += 2.0 / tempo;
  }

  /* ---------- act two: watercolor ---------- */
  const washSecs = (acts.wash ?? 30) / tempo;
  const weight = (r) => Math.sqrt(r.cells.length);
  const totalWeight = ordered.reduce((s, r) => s + weight(r), 0) || 1;

  for (const region of ordered) {
    const secs = Math.max(0.7, washSecs * (weight(region) / totalWeight));
    let clusters = kmeansXY(region.cells, clampN(region.cells.length / 2600, 1, 4), rng);
    if (opts.focus && opts.focus.length) {
      const near = (cl) => {
        const c = centroid(cl);
        return Math.min(...opts.focus.map((f) => Math.hypot(c.x - f.x, c.y - f.y)));
      };
      clusters.sort((a, b) => near(a) - near(b));
    } else {
      clusters.sort((a, b) => {
        const ca = centroid(a),
          cb = centroid(b);
        return ca.y + ca.x * 0.35 - (cb.y + cb.x * 0.35);
      });
    }

    const totalSize = clusters.reduce((s, c) => s + c.length, 0) || 1;
    let first = true;
    for (const cl of clusters) {
      const t0 = t + 0.15;
      const t1 = t + Math.max(0.5, secs * (cl.length / totalSize));
      t = t1;
      const nBig = clampN(cl.length / 300, 6, 24);
      const nSmall = clampN(cl.length / 210, 8, 30);
      const stamps = [];
      for (let i = 0; i < nBig; i++) {
        const c = cl[rng.int(cl.length)];
        stamps.push(
          makeStamp(
            c.x + (rng() - 0.5) * 24,
            c.y + (rng() - 0.5) * 24,
            opts.brushes.big * (0.7 + rng() * 0.5),
            0.17,
            (rng() - 0.5) * 0.6,
            1.6 + rng() * 1.2,
            rng,
          ),
        );
      }
      const wet = pathOrder(stamps.splice(0));
      const refine = [];
      for (let i = 0; i < nSmall; i++) {
        const c = cl[rng.int(cl.length)];
        refine.push(
          makeStamp(
            c.x + (rng() - 0.5) * 14,
            c.y + (rng() - 0.5) * 14,
            opts.brushes.small * (0.7 + rng() * 0.5),
            0.3,
            rng() * Math.PI,
            rng() * 0.9,
            rng,
          ),
        );
      }
      groups.push({
        kind: "wash",
        stamps: wet.concat(pathOrder(refine)),
        t0,
        t1,
        clip: clips && region.isFigure ? "fig" : "bg",
        region: region.name,
      });
      if (first) {
        captions.push({
          t: t0,
          phase: "wash",
          text: `${pigmentWord(region.mean)} for the ${region.name}`,
        });
        first = false;
      }
    }
  }

  /* ---------- the detail pass: the finest brush returns ---------- */
  const detailRegion =
    preset.detail && ordered.find((r) => r.name === preset.detail || r.tags.has(preset.detail));
  if (detailRegion) {
    const xs = detailRegion.cells.map((c) => c.x);
    const ys = detailRegion.cells.map((c) => c.y);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    const cx = (x0 + x1) / 2,
      bw = x1 - x0,
      bh = y1 - y0;
    const spots = [
      {
        x: cx,
        y: y0 + bh * 0.38,
        sx: bw * 0.3,
        sy: bh * 0.09,
        cap: `the finest brush: the ${detailRegion.name}`,
      },
      { x: cx, y: y0 + bh * 0.62, sx: bw * 0.2, sy: bh * 0.08, cap: null },
    ];
    for (const sp of spots) {
      const t0 = t + 0.15,
        t1 = t + 1.7 / tempo;
      t = t1;
      let stamps = [];
      for (let i = 0; i < 42; i++)
        stamps.push(
          makeStamp(
            sp.x + rng.gauss() * sp.sx,
            sp.y + rng.gauss() * sp.sy,
            14 + rng() * 26,
            0.5,
            rng() * Math.PI,
            rng() * 0.6,
            rng,
          ),
        );
      groups.push({
        kind: "wash",
        stamps: pathOrder(stamps),
        t0,
        t1,
        clip: clips && detailRegion.isFigure ? "fig" : "bg",
        region: detailRegion.name,
      });
      if (sp.cap) captions.push({ t: t0, phase: "detail", text: sp.cap });
    }
  }

  /* ---------- drying ---------- */
  const drySecs = (acts.dry ?? 2.4) / tempo;
  const dry = [t + 0.4, t + 0.4 + drySecs];
  captions.push({ t: dry[0], phase: "done", text: "signed and drying" });

  return { groups, captions, dry, total: dry[1] };
}
