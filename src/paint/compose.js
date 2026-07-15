// The compositor. Three reveal masks (graphite, figure color, background
// color) gate what the viewer sees of the sketch layer and the image. The
// graphite multiplies into the paper so it reads drawn; the color arrives
// through its masks, feathered at the figure's silhouette so washes bleed a
// few soft pixels across the line the way wet paint does.

export function createCompositor(env) {
  const { W, H, paper, colorL, sketchL, clips, makeLayer } = env;

  const maskS = makeLayer();
  const maskCF = makeLayer();
  const maskCB = makeLayer();
  const scrA = makeLayer();
  const scrB = makeLayer();
  const compS = makeLayer();
  const compC = makeLayer();

  const cS = maskS.getContext("2d");
  const cCF = maskCF.getContext("2d");
  const cCB = maskCB.getContext("2d");

  function reset() {
    cS.clearRect(0, 0, W, H);
    cCF.clearRect(0, 0, W, H);
    cCB.clearRect(0, 0, W, H);
  }

  function fillAll() {
    for (const c of [cCF, cCB]) {
      c.fillStyle = "#fff";
      c.fillRect(0, 0, W, H);
    }
    cS.fillStyle = "#fff";
    cS.fillRect(0, 0, W, H);
  }

  /** The per-frame drying pass: cumulative, the way wet paper actually dries. */
  function dryStep(pd) {
    if (pd <= 0) return;
    for (const c of [cCF, cCB]) {
      c.save();
      c.globalAlpha = pd * 0.5;
      c.fillStyle = "#fff";
      c.fillRect(0, 0, W, H);
      c.restore();
    }
  }

  function compose(ctx, pd) {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);

    // graphite, fading a little as the washes dry over it
    const sc = compS.getContext("2d");
    sc.clearRect(0, 0, W, H);
    sc.drawImage(sketchL, 0, 0);
    sc.globalCompositeOperation = "destination-in";
    sc.drawImage(maskS, 0, 0);
    sc.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1 - pd * 0.35;
    ctx.drawImage(compS, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // color through the reveal masks, clipped to each side of the silhouette
    const a = scrA.getContext("2d");
    a.clearRect(0, 0, W, H);
    a.drawImage(maskCF, 0, 0);
    if (clips) {
      a.globalCompositeOperation = "destination-in";
      a.drawImage(clips.clipF, 0, 0);
      a.globalCompositeOperation = "source-over";
      const b = scrB.getContext("2d");
      b.clearRect(0, 0, W, H);
      b.drawImage(maskCB, 0, 0);
      b.globalCompositeOperation = "destination-in";
      b.drawImage(clips.clipB, 0, 0);
      b.globalCompositeOperation = "source-over";
      a.drawImage(scrB, 0, 0);
    } else {
      a.drawImage(maskCB, 0, 0);
    }

    const cc = compC.getContext("2d");
    cc.clearRect(0, 0, W, H);
    cc.drawImage(colorL, 0, 0);
    cc.globalCompositeOperation = "destination-in";
    cc.drawImage(scrA, 0, 0);
    cc.globalCompositeOperation = "source-over";
    ctx.drawImage(compC, 0, 0);
  }

  return { cS, cCF, cCB, reset, fillAll, dryStep, compose };
}
