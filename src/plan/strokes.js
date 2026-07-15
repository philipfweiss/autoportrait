// Stroke construction: the marks themselves. Contours ride the edge field,
// hatches sweep in loose zigzags, wash stamps are wet blooms whose lobes are
// precomputed so a seeded painting replays exactly.

import { tangentAt } from "../analyze/edges.js";

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function makeContour(x, y, field, rng) {
  const pts = [{ x: x + (rng() - 0.5) * 6, y: y + (rng() - 0.5) * 6 }];
  let ang = tangentAt(field, x, y, rng() * Math.PI);
  if (rng() < 0.5) ang += Math.PI;
  const segs = 3 + rng.int(4);
  for (let i = 0; i < segs; i++) {
    const last = pts[pts.length - 1];
    const a2 = tangentAt(field, last.x, last.y, ang);
    const flip = Math.abs(angDiff(a2, ang)) > Math.PI / 2 ? Math.PI : 0;
    ang = ang + angDiff(a2 + flip, ang) * 0.55 + (rng() - 0.5) * 0.25;
    const len = 12 + rng() * 16;
    pts.push({ x: last.x + Math.cos(ang) * len, y: last.y + Math.sin(ang) * len });
  }
  return { pts, w: 10 + rng() * 8, blur: 5 };
}

export function makeHatch(x, y, rng) {
  const base = -0.55 + (rng() - 0.5) * 0.25;
  const pts = [{ x, y }];
  let dir = 1;
  const rows = 3 + rng.int(3);
  for (let i = 0; i < rows; i++) {
    const last = pts[pts.length - 1];
    const len = 60 + rng() * 70;
    pts.push({ x: last.x + Math.cos(base) * len * dir, y: last.y + Math.sin(base) * len * dir });
    const l2 = pts[pts.length - 1];
    pts.push({
      x: l2.x + Math.cos(base + Math.PI / 2) * 16,
      y: l2.y + Math.sin(base + Math.PI / 2) * 16,
    });
    dir *= -1;
  }
  return { pts, w: 30 + rng() * 26, blur: 22 };
}

/**
 * A wash stamp: one press of a loaded brush. The lobes (the blobby sub-circles
 * that make it read as water, not airbrush) are rolled here, at plan time.
 */
export function makeStamp(x, y, r, a, ang, elong, rng) {
  const lobes = [];
  const n = 5 + rng.int(3);
  for (let i = 0; i < n; i++) {
    const along = (i / (n - 1) - 0.5) * r * elong;
    lobes.push({
      ox: Math.cos(ang) * along + (rng() - 0.5) * r * 0.5,
      oy: Math.sin(ang) * along + (rng() - 0.5) * r * 0.5,
      rr: r * (0.55 + rng() * 0.45),
    });
  }
  return { x, y, r, a, lobes };
}

/** Greedy nearest-neighbor: turns a bag of stamps into one brush journey. */
export function pathOrder(st) {
  if (st.length < 3) return st;
  const rest = st.slice().sort((a, b) => a.y + a.x * 0.5 - (b.y + b.x * 0.5));
  const out = [rest.shift()];
  while (rest.length) {
    const last = out[out.length - 1];
    let bi = 0,
      bd = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = dist(last, rest[i]);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}

/** Plain spatial k-means: splits a region into brush-sized sub-areas. */
export function kmeansXY(cells, k, rng) {
  if (k <= 1 || cells.length < 120) return [cells];
  const sorted = cells.slice().sort((a, b) => a.x + a.y - (b.x + b.y));
  let centers = [];
  for (let i = 0; i < k; i++) {
    const s = sorted[Math.floor(((i + 0.5) * sorted.length) / k)];
    centers.push({ x: s.x, y: s.y });
  }
  let groups = [];
  for (let it = 0; it < 8; it++) {
    groups = centers.map(() => []);
    for (const c of cells) {
      let bi = 0,
        bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = (c.x - centers[i].x) ** 2 + (c.y - centers[i].y) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      groups[bi].push(c);
    }
    for (let i = 0; i < k; i++) {
      if (!groups[i].length) continue;
      let sx = 0,
        sy = 0;
      for (const c of groups[i]) {
        sx += c.x;
        sy += c.y;
      }
      centers[i] = { x: sx / groups[i].length, y: sy / groups[i].length };
    }
  }
  return groups.filter((g) => g.length > 40);
}

export function centroid(cells) {
  let sx = 0,
    sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / cells.length, y: sy / cells.length };
}
