// The clock. One requestAnimationFrame loop advances the plan monotonically;
// seek() rebuilds the canvas at any moment by replaying the plan from zero,
// which is cheap enough because every mark is already decided.

import { drawStroke, drawBloom } from "./brushes.js";

const progress = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function createRunner(ctx, plan, compositor, emit) {
  const { groups, captions, dry, total } = plan;
  let done = groups.map(() => 0);
  let rafId = null;
  let start = null;
  let tNow = 0;
  let finished = false;
  let captionIdx = -1;

  function targetCtx(g) {
    if (g.kind === "sketch") return compositor.cS;
    return g.clip === "fig" ? compositor.cCF : compositor.cCB;
  }

  /** Draw every mark due by t. Monotonic; seek() resets counters first. */
  function advanceTo(t) {
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const dst = targetCtx(g);
      if (g.kind === "sketch") {
        const p = easeInOut(progress(t, g.t0, g.t1));
        const target = Math.floor(p * g.strokes.length);
        while (done[gi] < target) drawStroke(dst, g.strokes[done[gi]++], 1);
        if (done[gi] < g.strokes.length && p > 0)
          drawStroke(dst, g.strokes[done[gi]], p * g.strokes.length - target);
      } else {
        const p = easeOut(progress(t, g.t0, g.t1));
        const target = Math.floor(p * g.stamps.length);
        while (done[gi] < target) drawBloom(dst, g.stamps[done[gi]++]);
      }
    }
  }

  function emitCaptions(t) {
    let idx = -1;
    for (let i = 0; i < captions.length; i++) if (t >= captions[i].t) idx = i;
    if (idx !== captionIdx && idx >= 0) {
      captionIdx = idx;
      emit("caption", captions[idx].text, captions[idx].phase);
    }
  }

  function frame(ts) {
    if (start == null) start = ts;
    const t = (ts - start) / 1000;
    tNow = t;
    advanceTo(t);
    const pd = progress(t, dry[0], dry[1]);
    compositor.dryStep(pd);
    compositor.compose(ctx, pd);
    emitCaptions(t);
    emit("progress", Math.min(t, total), total);
    if (t < total + 0.2) rafId = requestAnimationFrame(frame);
    else finish();
  }

  function stopRaf() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function finish() {
    if (finished) return;
    finished = true;
    stopRaf();
    compositor.fillAll();
    compositor.compose(ctx, 1);
    tNow = total;
    emit("progress", total, total);
    emit("finish");
  }

  return {
    get finished() {
      return finished;
    },
    get time() {
      return Math.min(tNow, total);
    },
    get total() {
      return total;
    },
    play(fromT = 0) {
      finished = false;
      stopRaf();
      compositor.reset();
      done = groups.map(() => 0);
      captionIdx = -1;
      if (fromT > 0) {
        advanceTo(fromT);
        compositor.dryStep(Math.min(1, progress(fromT, dry[0], dry[1]) * 1.4));
      }
      start = performance.now() - fromT * 1000;
      rafId = requestAnimationFrame(frame);
    },
    pause() {
      stopRaf();
    },
    resume() {
      if (finished) return;
      this.play(tNow);
    },
    /** Rebuild the canvas at an arbitrary moment without running the clock. */
    seek(t) {
      t = Math.max(0, Math.min(total, t));
      stopRaf();
      finished = false;
      compositor.reset();
      done = groups.map(() => 0);
      advanceTo(t);
      const pd = progress(t, dry[0], dry[1]);
      compositor.dryStep(Math.min(1, pd * 1.4));
      compositor.compose(ctx, pd);
      tNow = t;
      if (t >= total) finish();
    },
    finish,
    dispose: stopRaf,
  };
}
