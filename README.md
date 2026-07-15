<p align="center">
  <img src="docs/media/hero.gif" width="420" alt="A watercolor portrait painting itself: a graphite sketch appears first, then washes of color arrive one pigment at a time, the face before the background." />
</p>

# autoportrait

**autoportrait** is a zero-dependency canvas library that renders an image as
a painting performance. It computes a graphite underdrawing whose strokes
follow the image's edge field, segments the image with k-means in CIELAB,
and lays watercolor washes one region at a time in a painter's order: subject
before background, the finest brush last. The animation above is the engine
painting its demo portrait at real speed, about 48 seconds. Everything runs
in the browser from the pixels alone, there is no model at runtime, and a
seeded PRNG makes any painting reproducible stroke for stroke.

I built it for [my site](https://philipweiss.net), where it paints me for
every visitor.

[Playground](https://philipfweiss.github.io/autoportrait/) ·
[How it works](#how-it-works) ·
[Choreography](#choreography-what-gets-painted-first) ·
[The dials](#the-dials)

## Quick start

```html
<canvas id="c"></canvas>
<script type="module">
  import { paint } from "autoportrait";

  paint(document.getElementById("c"), { image: "me.jpg" });
</script>
```

That is the whole integration. With no other options the engine segments the
image on its own, sketches for about thirteen seconds, lays washes for thirty,
and lets the painting dry. Everything else on this page is a dial you may
ignore.

Two inputs make it much better, and both are optional:

1. **A painterly source image.** The engine performs your pixels as they are,
   so a photograph paints like a photograph. See
   [making the input painterly](#making-the-input-painterly).
2. **A figure mask.** With a subject/background mask the two layers paint
   independently, the background can arrive behind a finished figure, and
   labels like `face` become available to the choreography. One command
   produces it: [`tools/make_mask.py`](tools/make_mask.py).

## Why

I wanted the portrait on my personal site to arrive the way a painting does:
drawn, considered, and a little slow. Loading a JPEG takes eighty
milliseconds and tells the visitor nothing about how a picture gets made.
Watching the sketch go down, the washes pool, and the eyes arrive last tells
a small true story about attention. Then I wanted the same trick for any
image, with the painter's decisions exposed as parameters, and that library
is this repo.

## How it works

The pipeline runs entirely in the browser, ahead of the first frame. Analysis
decides what the image contains, planning decides every mark and its moment,
and the runtime just replays the plan against a clock. Because every mark is
decided up front, the painting can seek to any instant, and a seed makes the
whole performance reproducible.

<p align="center">
  <img src="docs/media/stages.png" alt="Five stages of the painting: early sketch, full sketch, figure washes over the drawing, background arriving, the finished painting." />
</p>

### 1. The graphite

The sketch layer is the old photocopy trick, color dodge. Take luminance
$L(x,y)$, blur its inverse, and divide:

$$
S(x,y) = \min\left(255,\; \frac{255 \cdot L(x,y)}{255 - \widetilde{(255 - L)}(x,y)}\right)
$$

where $\widetilde{\cdot}$ is a box blur applied twice. Flat areas cancel to
paper white and survive only where intensity changes quickly, which is
exactly where a pencil would have worked. A faint diagonal hatch multiplies
in so the layer reads as hand shading rather than a filter.

### 2. The edge field

<img src="docs/media/edge-field.png" align="right" width="300" alt="The portrait reduced to thousands of short pencil ticks, each following the local edge direction." />

Contour strokes need a direction. On a grid downsampled by 4, central
differences give a gradient $(g_x, g_y)$, and each cell stores its magnitude
and the tangent

$$
\theta = \mathrm{atan2}(g_y, g_x) + \tfrac{\pi}{2},
$$

the gradient rotated a quarter turn, so strokes run along edges instead of
across them. A stroke starts wherever magnitude is loud, then walks four to
seven segments, at each step blending its heading toward the local tangent
with a little jitter. The pencil follows the forms in the image; nobody told
it where the jaw is.

<br clear="right" />

### 3. Regions

The engine paints one region at a time, so segmentation decides the whole
performance. The automatic path is k-means over five-dimensional features

$$
\phi(c) = (L^{\ast},\; a^{\ast},\; b^{\ast},\; \lambda x,\; \lambda y)
$$

sampled per grid cell: color in CIELAB, where Euclidean distance roughly
matches perceived color difference, plus position at a weight $\lambda$ small
enough to encourage contiguity without forcing blobs. Initialization is
k-means++ style with a seeded generator, clusters below two percent of their
layer fold into their nearest sibling by color, and each survivor gets tags
computed from its statistics: `figure` or `background`, `light`, `dark`,
`warm`, `cool`, `sky`, `water`, `greenery`. A skin prior (warm midtones on
the upper part of the figure) promotes one cluster to `face`. Those names are
the vocabulary the choreography understands.

<p align="center">
  <img src="docs/media/regions.png" width="480" alt="The portrait divided into labeled regions: face, figure, and several background clusters, each shown in its mean color." />
</p>

With a mask, figure and background cluster separately and reveal through
separate compositing layers. The mask's edge is feathered a few pixels on
purpose: wet paint creeps over a line, and a hard silhouette reads as a
sticker.

### 4. The plan

<img src="docs/media/path.png" align="right" width="260" alt="One region split into four sub-areas, with the brush's travel path drawn through each as connected dots." />

Each region splits into one to four spatial sub-areas (plain k-means on
position), and each sub-area receives two passes of wash stamps: a wet pass
of large blooms, then a refining pass of small ones. Stamp positions are
random within the sub-area, but their order is a greedy nearest-neighbor
walk, so the brush travels instead of teleporting. Every stamp's bloom
lobes are rolled at plan time from the seeded generator; the renderer adds
no randomness of its own, which is what makes a seed reproduce a painting
exactly.

<br clear="right" />

### 5. The reveal

The renderer never mixes color. Strokes and stamps are white marks
accumulating in offscreen reveal masks, and the compositor shows the sketch
layer or the source image wherever its mask has been touched, multiplied
into the paper tone. The image already knows its colors; the engine's job is
the order and the manner of their arrival. Drying is a per-frame pass that
raises the masks toward full reveal while the graphite fades a third of the
way back into the paper.

## Choreography: what gets painted first

I started with my own portrait and one strong opinion: the face goes first.
Then I wanted the opposite for landscapes, and a lever instead of an opinion.
There are four, from bluntest to sharpest:

**Presets.** A named schedule. `portraitist` paints the subject before the
world and returns to the face with the finest brush at the end. `landscapist`
paints the world first and places the figure into it. `printmaker` finishes
the entire drawing, then lays washes from light to dark regardless of
subject, like a print taking successive impressions.

```js
paint(canvas, { image, preset: "landscapist" });
```

**An order list.** Region names and tags, painted in the order given.
Anything unlisted follows afterward.

```js
paint(canvas, { image, mask, order: ["figure", "face", "sky", "background"] });
```

**Focus points.** Coordinates as fractions of the canvas. Regions paint in
order of distance from the nearest point, and sub-areas within each region
do the same, so the painting radiates from wherever you point.

```js
paint(canvas, { image, focus: [{ x: 0.3, y: 0.6 }] });
```

**The plan callback.** The finished plan, handed to you before the first
frame: an array of stroke groups with times, kinds, and region names. Reorder
it, stretch it, delete the sketch, interleave two regions. The engine will
perform whatever you return.

```js
paint(canvas, {
  image,
  plan(p) {
    p.groups.reverse(); // paint the whole thing backwards, why not
    return p;
  },
});
```

## The dials

| option                 | default         | what it does                                                     |
| ---------------------- | --------------- | ---------------------------------------------------------------- |
| `seed`                 | random          | reproduces a painting exactly; same seed, same performance       |
| `preset`               | `"portraitist"` | the named schedule above                                         |
| `order`                | none            | region names/tags, overrides the preset's ordering               |
| `focus`                | none            | points the painting radiates from                                |
| `plan`                 | none            | callback over the final stroke plan                              |
| `tempo`                | `1`             | global speed multiplier                                          |
| `acts.sketch`          | `13`            | seconds of graphite; `0` skips the drawing                       |
| `acts.wash`            | `30`            | seconds of watercolor                                            |
| `acts.dry`             | `2.4`           | seconds of drying at the end                                     |
| `brushes.big`          | `110`           | radius of the wet pass, in canvas pixels                         |
| `brushes.small`        | `55`            | radius of the refining pass                                      |
| `regions.k`            | `7`             | target cluster count for the automatic segmentation              |
| `paper`                | `"#fbf6ea"`     | the sheet the painting sits on                                   |
| `mask`                 | none            | figure mask; enables layered reveal and figure labels            |
| `resolution`           | `1000`          | internal long-edge resolution                                    |
| `autostart`            | `true`          | paint on load, or wait for `.play()`                             |
| `respectReducedMotion` | `true`          | `prefers-reduced-motion` visitors get the finished painting      |
| `onCaption`            | none            | narration events ("warm sienna for the face") as the brush moves |
| `onProgress`           | none            | `(t, total)` every frame                                         |
| `onReady`              | none            | fires with `{ seed, regions }` once analysis is done             |

The returned painting object carries the controls: `pause()`, `resume()`,
`seek(t)`, `repaint()`, `finish()`, `palette()` (the region swatches), and
`dispose()`.

## Making the input painterly

The engine performs pixels; it does not restyle them. The demo portrait was
made painterly before the engine ever saw it, with an image model (I used
GPT's image generation), from a prompt of roughly this shape:

> A loose watercolor painting of this photo, warm palette, soft wet-on-wet
> washes, paper texture visible at the edges, no hard photographic detail.

Whatever produces the painting, aim for soft edges and pooled color; the
performance sells the rest. If you would rather stay offline,
[`tools/watercolorize.py`](tools/watercolorize.py) is a classical filter
(edge-preserving smoothing, edge darkening, paper grain). It is honest work
and it looks like a filter. The image model looks like a painting.

## The repo

```
src/            the library (ES modules, zero dependencies)
demo/           the playground: upload a picture, turn the dials, export a GIF
tools/          make_mask.py, watercolorize.py, and the README media generators
test/           deterministic smoke test (npm test)
docs/media/     the figures above, rendered by the engine itself
```

```bash
npm install
npm run dev        # the playground, on localhost
npm test           # paints twice with one seed, asserts identical pixels
npm run figures    # regenerate the README figures from the current engine
npm run hero       # regenerate the hero gif
```

Every figure in this README was rendered by the library from a fixed seed,
so the documentation cannot drift from the engine without the diff saying so.

## License

MIT. The demo portrait is me, painted; you are welcome to run the engine on
it locally, and I would rather you not reuse the image itself elsewhere.
