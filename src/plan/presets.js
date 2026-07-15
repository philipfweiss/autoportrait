// Presets: named schedules. Each is an ordering vocabulary plus timing
// habits. A preset is only a starting point; order, focus, and the plan
// callback all override it.

export const presets = {
  // the figure first, the world after: how a portrait sitting actually goes
  portraitist: {
    order: ["face", "hair", "figure", "background", "sky", "greenery", "water"],
    detail: "face", // the finest brush returns here at the end
    sketchOrder: "subject-out",
  },
  // the world first, the figure placed into it
  landscapist: {
    order: ["sky", "greenery", "water", "background", "figure", "hair", "face"],
    detail: "face",
    sketchOrder: "background-first",
  },
  // a full drawing, then washes from light to dark regardless of subject
  printmaker: {
    order: [], // resolved by lightness instead of names
    byLightness: true,
    detail: null,
    sketchOrder: "sweep",
    sketchShare: 0.45, // the drawing gets a longer act
  },
};

export function resolvePreset(name) {
  if (!name) return presets.portraitist;
  const p = presets[name];
  if (!p)
    throw new Error(
      `autoportrait: unknown preset "${name}" (have: ${Object.keys(presets).join(", ")})`,
    );
  return p;
}
