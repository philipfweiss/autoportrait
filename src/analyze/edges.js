// The edge field. Gradients on a downsampled grid give every cell a
// magnitude (is there an edge here) and a tangent (which way it runs).
// Contour strokes advect along the tangents, so the pencil follows the
// forms in the image instead of scribbling at random.

import { boxBlur } from "./luminance.js";

export function buildEdgeField(gray, W, H, DS) {
  const EW = Math.floor(W / DS);
  const EH = Math.floor(H / DS);
  const small = new Float32Array(EW * EH);
  for (let y = 0; y < EH; y++)
    for (let x = 0; x < EW; x++) {
      let s = 0;
      for (let dy = 0; dy < DS; dy++)
        for (let dx = 0; dx < DS; dx++) s += gray[(y * DS + dy) * W + (x * DS + dx)];
      small[y * EW + x] = s / (DS * DS);
    }
  const sm = boxBlur(small, EW, EH, 1);
  const mag = new Float32Array(EW * EH);
  const ang = new Float32Array(EW * EH);
  for (let y = 1; y < EH - 1; y++)
    for (let x = 1; x < EW - 1; x++) {
      const i = y * EW + x;
      const gx =
        sm[i + 1] -
        sm[i - 1] +
        0.5 * (sm[i - EW + 1] - sm[i - EW - 1]) +
        0.5 * (sm[i + EW + 1] - sm[i + EW - 1]);
      const gy =
        sm[i + EW] -
        sm[i - EW] +
        0.5 * (sm[i + EW - 1] - sm[i - EW - 1]) +
        0.5 * (sm[i + EW + 1] - sm[i - EW + 1]);
      mag[i] = Math.hypot(gx, gy);
      // rotate the gradient a quarter turn: strokes run along edges, not across
      ang[i] = Math.atan2(gy, gx) + Math.PI / 2;
    }
  return { mag, ang, EW, EH, DS };
}

export function tangentAt(field, x, y, fallback) {
  const { mag, ang, EW, EH, DS } = field;
  const ex = Math.min(EW - 2, Math.max(1, Math.round(x / DS)));
  const ey = Math.min(EH - 2, Math.max(1, Math.round(y / DS)));
  const i = ey * EW + ex;
  return mag[i] > 6 ? ang[i] : fallback;
}

export function edgeMagAt(field, ex, ey) {
  return field.mag[ey * field.EW + ex];
}
