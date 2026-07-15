// The graphite layer. A color-dodge of the image against a blur of its own
// inverse: the classic photocopy-to-pencil trick. Midtones wash out, edges
// survive as strokes, and a faint diagonal hatch tints the paper so the
// reveal reads as drawn rather than printed.

export function boxBlur(a, w, h, r) {
  const out = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      out[row + x] = sum / (2 * r + 1);
      sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  const out2 = new Float32Array(a.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += out[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out2[y * w + x] = sum / (2 * r + 1);
      sum += out[Math.min(h - 1, y + r + 1) * w + x] - out[Math.max(0, y - r) * w + x];
    }
  }
  return out2;
}

export function grayOf(imageData) {
  const { data, width, height } = imageData;
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++)
    g[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return g;
}

export function buildSketchLayer(gray, W, H, makeLayer) {
  const inv = new Float32Array(gray.length);
  for (let p = 0; p < gray.length; p++) inv[p] = 255 - gray[p];
  const blur = boxBlur(boxBlur(inv, W, H, 7), W, H, 7);

  const layer = makeLayer();
  const ctx = layer.getContext("2d");
  const out = ctx.createImageData(W, H);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const d = 255 - blur[p];
    let v = d <= 0 ? 255 : Math.min(255, (gray[p] * 255) / d);
    v = 255 - (255 - v) * 1.35; // deepen the strokes a touch
    out.data[i] = Math.max(0, Math.min(255, v * 0.97 + 8));
    out.data[i + 1] = Math.max(0, Math.min(255, v * 0.96 + 6));
    out.data[i + 2] = Math.max(0, Math.min(255, v * 0.94 + 4));
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  // the hatch tint: faint diagonals so the graphite has a hand in it
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = "#4a4038";
  ctx.lineWidth = 1;
  for (let x = -H; x < W; x += 7) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return layer;
}
