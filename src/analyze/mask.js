// The optional figure mask. A matting model's verdict (white figure on black)
// splits the painting into two layers that reveal independently, so the
// background can fill in behind an already finished figure. The full-res
// clips are feathered a few pixels: wet paint creeps over a line, and a
// hard silhouette would read as a sticker.

export function buildClips(maskImage, W, H, EW, EH, makeLayer) {
  if (!maskImage) return null;

  const mc = makeLayer(EW, EH);
  const mcx = mc.getContext("2d");
  mcx.drawImage(maskImage, 0, 0, EW, EH);
  const md = mcx.getImageData(0, 0, EW, EH).data;

  const figCell = new Uint8Array(EW * EH);
  for (let i = 0; i < EW * EH; i++) figCell[i] = md[i * 4] > 127 ? 1 : 0;

  // alpha ramp preserved for the feather
  const tt = makeLayer(EW, EH);
  const tx = tt.getContext("2d");
  const tim = tx.createImageData(EW, EH);
  for (let i = 0; i < EW * EH; i++) {
    tim.data[i * 4] = tim.data[i * 4 + 1] = tim.data[i * 4 + 2] = 255;
    tim.data[i * 4 + 3] = md[i * 4];
  }
  tx.putImageData(tim, 0, 0);

  const clipF = makeLayer(W, H);
  const fx = clipF.getContext("2d");
  fx.filter = "blur(5px)";
  fx.drawImage(tt, 0, 0, W, H);
  fx.filter = "none";

  const clipB = makeLayer(W, H);
  const bx = clipB.getContext("2d");
  bx.fillStyle = "#fff";
  bx.fillRect(0, 0, W, H);
  bx.globalCompositeOperation = "destination-out";
  bx.drawImage(clipF, 0, 0);
  bx.globalCompositeOperation = "source-over";

  return { figCell, clipF, clipB };
}
