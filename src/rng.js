// Seeded randomness. Every random draw in the library goes through one of
// these, so a given (seed, options) pair always produces the same painting.

export function makeRng(seed) {
  // mulberry32: small, fast, good enough for brush jitter
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next;
  rng.range = (lo, hi) => lo + next() * (hi - lo);
  rng.int = (n) => (next() * n) | 0;
  rng.pick = (arr) => arr[(next() * arr.length) | 0];
  // sum of three uniforms, roughly gaussian in [-1, 1]
  rng.gauss = () => (next() + next() + next() - 1.5) / 1.5;
  return rng;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
