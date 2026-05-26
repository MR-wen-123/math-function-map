# Monotonicity · Dynamic Function Map

A browser-based tool for visualizing and analyzing mathematical functions. Supports f(x) / g(x) comparison, symbolic differentiation, monotonicity and rate-of-change analysis, plus interactive probes and draggable control points on the graph. Well suited to composite functions, rational expressions, radicals, and absolute values common in secondary-school calculus.

[中文说明](README.md)

## Features Overview

- **Multiple function types**: linear, quadratic, cubic, exponential, logarithmic, power, and custom expressions
- **Coefficient editing**: integers, decimals, and fractions (e.g. `1/2`, `-3/4`, `1 1/2`); drag control points on the graph to adjust parameters
- **Custom expressions**: `sin`, `cos`, `tan`, `ln`, `log`, `sqrt`, `abs`, `exp`, constants `pi` / `e`; implicit multiplication such as `2x`, `x(x-1)`, `2sin(x)`; symbol toolbar and **example** chips for one-click input
- **Domain inference**: poles, `√(quadratic)`, `ln`, etc. are summarized as intervals for plotting and analysis (e.g. `sqrt(x**2-1)` → (−∞,−1]∪[1,+∞))
- **Domain restriction**: separate left/right endpoints for f(x) and g(x) (including `±∞`)
- **Dual-function comparison**: plot f and g on the same canvas with separate formulas, derivatives, monotonicity, and rate analysis
- **Symbolic derivatives**: simplified f′(x) / g′(x) when parseable (including piecewise rules for `|quadratic|`); complex forms may fall back to a numerical note
- **Graph analysis**: monotonic interval coloring, derivative curves, rate-of-change coloring, critical points; high-frequency functions get a compact summary and fewer on-canvas labels
- **Display toggles**: show/hide critical points, probe/tangent, and drag handles independently
- **Canvas interaction**: wheel zoom (centered on cursor), drag-to-pan, click for probe and tangent, **Reset view**; adaptive ticks and refined viewport behavior
- **Coordinate labels**: toggle coordinate text on the graph
- **Layout controls**: resize side panels and graph height; rounded panels; collapsible side panels and graph area
- **Formula typesetting**: built-in [KaTeX](https://katex.org/) for functions and derivatives—**no external CDN**

## Quick Start

If `vendor/katex/` is already in the repo, open the page directly. Otherwise:

```bash
npm install
# copies KaTeX into vendor/katex/ (also runs on postinstall)
```

### Option 1: Multi-file version (development)

Open `index.html` (keep `vendor/katex/` alongside it), or serve via a local static server.

```bash
# Example: Python built-in server
python -m http.server 8080
# Visit http://localhost:8080/index.html
```

### Option 2: Single-file version (distribution)

Open `standalone.html` directly—no server; **KaTeX and fonts are inlined** for offline use.

Regenerate after `npm install`:

```bash
npm run build
```

## Custom Expression Syntax

| Syntax | Meaning |
|--------|---------|
| `x**2` or `x^2` | x² |
| `x(x-1)` | x·(x−1) (not “call x”) |
| `1/(x(x-1))` | 1/(x²−x) |
| `log(x)` | common logarithm log₁₀(x) |
| `ln(x)` | natural logarithm |
| `exp(x)`, `e**(sqrt(x))` | exponential |

Under **custom f(x)**, the **Examples** section provides common composite-function forms (e.g. `√(x²−1)`, `|x²−2x−3|`, `1/(x(x−1))`). Click a chip to fill the input; hover for a short hint.

## Interface

| Area | Contents |
|------|----------|
| **Left · Parameters** | Function type, coefficients, custom expression, examples, domain, compare g(x), view range, display toggles |
| **Center · Graph** | Canvas plot; resize height; collapsible graph area |
| **Right · Analysis** | KaTeX formulas and derivatives, domain, monotonicity, rate of change, critical points; collapsible |

**Desktop (wide)**: three columns with the graph in the center.  
**Narrow (≤1100px)**: stacked layout; hold **Ctrl** (Mac: **⌘**) while scrolling over the graph to zoom.

## Graph Controls

### Wheel and page scrolling

| Scenario | Wheel over the graph | Ctrl / ⌘ + wheel over the graph |
|----------|----------------------|----------------------------------|
| Narrow (≤1100px) | Scroll the page | Zoom the view |
| Wide, page taller than viewport | Scroll the page | Zoom the view |
| Wide, everything fits on one screen | Zoom the view | Zoom the view |

When zooming, the center follows the cursor inside the plot area.

### Other actions

1. **Drag** (empty area): pan the coordinate system
2. **Click**: place a probe; show f/g values, tangent, and rate of change
3. **Drag control points** (handles on the curve): adjust coefficients
4. **Reset view**: restore the default range
5. **Coordinate labels**: toggle coordinate text

## Development and Tests

```bash
npm run vendor          # copy KaTeX to vendor/ only
npm run build           # copy KaTeX and build standalone.html
npm run test:composite  # custom expression evaluation regression
npm run test:zhihu      # composite monotonicity examples regression
npm run test:domain     # domain display regression
```

## Project Structure

```
dynamic-function-map/
├── index.html
├── standalone.html         # npm run build; KaTeX inlined
├── package.json
├── build-standalone.mjs
├── scripts/
│   ├── copy-katex.mjs
│   ├── inline-katex.mjs
│   ├── test-composite.mjs
│   ├── test-zhihu-monotonicity.mjs
│   └── test-domain.mjs
├── vendor/katex/
├── css/style.css
├── js/
│   ├── math-engine.js      # parse, domain, derivative, monotonicity, LaTeX
│   ├── plotter.js
│   └── app.js
├── README.md
└── README.en.md
```

## Technology Stack

- Plain HTML / CSS / JavaScript
- Canvas 2D API
- Custom AST expression parser, domain inference, and symbolic differentiation (`math-engine.js`)
- KaTeX 0.16 (`vendor/katex/`, inlined in standalone)

## Browser Support

Use a recent Chrome, Edge, Firefox, or Safari. Requires Canvas, `matchMedia`, and optionally `ResizeObserver` and `visualViewport`.
