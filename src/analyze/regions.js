// Regions: where one pigment ends and the next begins.
//
// The engine paints one region at a time, the way a person does, so the
// segmentation decides the whole performance. The automatic path is k-means
// over (L*, a*, b*, x, y): color in a perceptual space, position as a nudge
// toward spatial coherence. When a figure mask is present, figure and
// background cluster separately, and the labels get sharper (a face can only
// be on the figure). Every region comes back with computed tags so the
// choreography can be steered with words: "face", "figure", "sky", "dark".

const XN = 95.047,
  YN = 100.0,
  ZN = 108.883;

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fLab(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

export function rgbToLab(r, g, b) {
  const rl = srgbToLinear(r),
    gl = srgbToLinear(g),
    bl = srgbToLinear(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) * 100;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) * 100;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) * 100;
  const fx = fLab(x / XN),
    fy = fLab(y / YN),
    fz = fLab(z / ZN);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Sample the image on the cell grid and compute per-cell features. */
function cellFeatures(imageData, W, H, DS, EW, EH) {
  const { data } = imageData;
  const cells = [];
  for (let ey = 0; ey < EH; ey++)
    for (let ex = 0; ex < EW; ex++) {
      const px = Math.min(W - 1, ex * DS + (DS >> 1));
      const py = Math.min(H - 1, ey * DS + (DS >> 1));
      const q = (py * W + px) * 4;
      const r = data[q],
        g = data[q + 1],
        b = data[q + 2];
      const [L, a, bb] = rgbToLab(r, g, b);
      cells.push({ x: px, y: py, ex, ey, L, a, b: bb, rgb: [r, g, b] });
    }
  return cells;
}

/**
 * Weighted k-means over (L, a, b, sx, sy). The spatial weight keeps clusters
 * contiguous enough to paint as one pass without forcing them into blobs.
 */
function kmeansLab(cells, k, W, H, rng, spatialWeight = 0.35) {
  if (!cells.length) return [];
  k = Math.max(1, Math.min(k, Math.floor(cells.length / 60) || 1));
  const scale = 100 / Math.max(W, H); // position mapped onto the L range
  const feat = (c) => [
    c.L,
    c.a,
    c.b,
    c.x * scale * spatialWeight * 3,
    c.y * scale * spatialWeight * 3,
  ];

  // k-means++ style init: first center at random, then spread by distance
  const centers = [feat(cells[rng.int(cells.length)])];
  while (centers.length < k) {
    let best = null,
      bestD = -1;
    for (let t = 0; t < 24; t++) {
      const c = feat(cells[rng.int(cells.length)]);
      let d = Infinity;
      for (const ct of centers) d = Math.min(d, dist2(c, ct));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    centers.push(best);
  }

  let assign = new Array(cells.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let i = 0; i < cells.length; i++) {
      const f = feat(cells[i]);
      let bi = 0,
        bd = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const d = dist2(f, centers[j]);
        if (d < bd) {
          bd = d;
          bi = j;
        }
      }
      if (assign[i] !== bi) {
        assign[i] = bi;
        moved = true;
      }
    }
    const sums = centers.map(() => [0, 0, 0, 0, 0, 0]);
    for (let i = 0; i < cells.length; i++) {
      const f = feat(cells[i]);
      const s = sums[assign[i]];
      for (let d = 0; d < 5; d++) s[d] += f[d];
      s[5]++;
    }
    for (let j = 0; j < centers.length; j++) {
      if (!sums[j][5]) continue;
      centers[j] = sums[j].slice(0, 5).map((v) => v / sums[j][5]);
    }
    if (!moved) break;
  }

  const groups = centers.map(() => []);
  for (let i = 0; i < cells.length; i++) groups[assign[i]].push(cells[i]);
  return groups.filter((g) => g.length);
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
  return s;
}

/** Fold clusters below minShare of the layer into their nearest sibling by color. */
function mergeSmall(groups, minShare) {
  const total = groups.reduce((s, g) => s + g.length, 0);
  const keep = [];
  const small = [];
  for (const g of groups) (g.length / total < minShare ? small : keep).push(g);
  if (!keep.length) return groups;
  for (const g of small) {
    const m = meanLab(g);
    let best = keep[0],
      bd = Infinity;
    for (const kg of keep) {
      const km = meanLab(kg);
      const d = dist2([m.L, m.a, m.b], [km.L, km.a, km.b]);
      if (d < bd) {
        bd = d;
        best = kg;
      }
    }
    best.push(...g);
  }
  return keep;
}

function meanLab(cells) {
  let L = 0,
    a = 0,
    b = 0,
    x = 0,
    y = 0,
    r = 0,
    g = 0,
    bl = 0;
  for (const c of cells) {
    L += c.L;
    a += c.a;
    b += c.b;
    x += c.x;
    y += c.y;
    r += c.rgb[0];
    g += c.rgb[1];
    bl += c.rgb[2];
  }
  const n = cells.length;
  return {
    L: L / n,
    a: a / n,
    b: b / n,
    x: x / n,
    y: y / n,
    rgb: [(r / n) | 0, (g / n) | 0, (bl / n) | 0],
  };
}

/** Human-usable tags for a cluster, derived from its color and place. */
function tagRegion(m, isFigure, H, figureTop) {
  const tags = new Set();
  tags.add(isFigure ? "figure" : "background");
  if (m.L > 65) tags.add("light");
  if (m.L < 35) tags.add("dark");
  if (m.b < -12 || (m.a < -8 && m.b < 0)) tags.add("cool");
  if (m.a > 8 || m.b > 18) tags.add("warm");
  if (!isFigure && m.b < -10 && m.y < H * 0.4) tags.add("sky");
  if (!isFigure && m.a < -14) tags.add("greenery");
  if (!isFigure && m.b < -10 && m.y > H * 0.5) tags.add("water");

  // skin prior: warm midtones on the upper part of the figure
  if (
    isFigure &&
    m.L > 35 &&
    m.L < 88 &&
    m.a > 6 &&
    m.a < 34 &&
    m.b > 8 &&
    m.b < 40 &&
    m.y < figureTop + (H - figureTop) * 0.45
  )
    tags.add("face");
  if (isFigure && m.L < 35) tags.add("hair");
  return tags;
}

function nameRegion(tags, index) {
  for (const n of ["face", "hair", "sky", "water", "greenery"]) if (tags.has(n)) return n;
  if (tags.has("figure")) return "figure";
  return `background-${index + 1}`;
}

/**
 * The public entry: cluster the image into paintable regions.
 * figCell is the optional per-cell figure mask from mask.js.
 */
export function buildRegions(imageData, W, H, DS, EW, EH, figCell, k, rng) {
  const cells = cellFeatures(imageData, W, H, DS, EW, EH);

  let layers;
  if (figCell) {
    const fig = [],
      bg = [];
    for (const c of cells) (figCell[c.ey * EW + c.ex] ? fig : bg).push(c);
    // budget the clusters by area, at least two per layer when both exist
    const kf = Math.max(2, Math.round((k * fig.length) / cells.length) || 2);
    const kb = Math.max(2, k - kf);
    layers = [
      { cells: fig, isFigure: true, k: kf },
      { cells: bg, isFigure: false, k: kb },
    ];
  } else {
    layers = [{ cells, isFigure: false, k }];
  }

  const regions = [];
  for (const layer of layers) {
    if (!layer.cells.length) continue;
    const figureTop = layer.isFigure ? Math.min(...layer.cells.map((c) => c.y)) : 0;
    const groups = mergeSmall(kmeansLab(layer.cells, layer.k, W, H, rng), 0.02);
    for (const g of groups) {
      const m = meanLab(g);
      const tags = tagRegion(m, layer.isFigure, H, figureTop);
      regions.push({
        cells: g.map((c) => ({ x: c.x, y: c.y })),
        mean: m,
        color: m.rgb,
        isFigure: layer.isFigure,
        tags,
        area: g.length / cells.length,
      });
    }
  }

  // stable ids and names; duplicate names get numbered (face, face-2)
  const counts = {};
  regions.forEach((r, i) => {
    let name = nameRegion(r.tags, i);
    counts[name] = (counts[name] || 0) + 1;
    if (counts[name] > 1) name = `${name}-${counts[name]}`;
    r.name = name;
    r.id = i;
  });
  return regions;
}
