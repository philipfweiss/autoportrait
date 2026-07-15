// The marks, rendered. Strokes and stamps draw into REVEAL MASKS, never in
// color: white marks accumulate in an offscreen layer, and the compositor
// shows the image (or the graphite) wherever the mask has been touched.
// That inversion is the engine's one big trick. Nobody has to know how to
// mix paint; the photo already knows its colors.

export function drawStroke(ctx, s, t) {
  const n = Math.max(2, Math.ceil(s.pts.length * t));
  ctx.save();
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.w;
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = s.blur;
  ctx.beginPath();
  ctx.moveTo(s.pts[0].x, s.pts[0].y);
  for (let i = 1; i < n; i++) {
    const p = s.pts[i],
      q = s.pts[i - 1];
    ctx.quadraticCurveTo(q.x, q.y, (q.x + p.x) / 2, (q.y + p.y) / 2);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBloom(ctx, st) {
  ctx.save();
  ctx.globalAlpha = st.a;
  for (const l of st.lobes) {
    const g = ctx.createRadialGradient(
      st.x + l.ox,
      st.y + l.oy,
      l.rr * 0.1,
      st.x + l.ox,
      st.y + l.oy,
      l.rr,
    );
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.75, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(st.x + l.ox, st.y + l.oy, l.rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
