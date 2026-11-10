# Chui Labs design spec

Use this file as design instructions for any Chui Labs product. It was taken from Second Look (Nov 2026), where it is implemented in `frontend/src/theme.ts`, `frontend/src/styles/app.css` and `frontend/src/components/BrandLogo.tsx`.

## Principles

- **Quiet and editorial.** It should look like a printed analysis sheet, not an admin dashboard or a generated template.
- **Lead with the content.** Each page opens with its subject (for example a diagram, chart or pitch), then states its finding in one sentence.
- **One big number** (for example "71 of 200") instead of rows of badges or KPI tiles.
- **Borders are off by default.** Separate sections with a 1px hairline rule, not boxes. Only the selected or winning item gets a **3px navy top rule**.
- **Use real numbers in the copy.** Avoid filler such as "Unlock insights".
- **Don't use:** dark "tech" themes, neon, glassmorphism, condensed display type, pill-badge rows, teal alert boxes, pastel card grids, card hover lift, gradients, page transitions, or icon-only sidebars.

## Colour

### Brand navy scale (Mantine-style tuple, 0 = lightest)

| Shade | Hex | Use |
|---|---|---|
| 0 | `#eef1f8` | selected-row tint, quiet highlight background |
| 1 | `#dce2f0` | |
| 2 | `#b5c1de` | |
| 3 | `#8b9ecb` | hover state of a top rule |
| 4 | `#6880bb` | neutral markers/ticks |
| 5 | `#516db1` | |
| 6 | `#4462ad` | |
| 7 | `#354f8f` | inline reference links |
| 8 | `#26396b` | primary interactive colour (buttons, sliders, focus) |
| 9 | `#1b2a5e` | **brand navy**: the logo, headings, rules, big numbers |

### Neutrals and accents

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#1b2a5e` | headings, active nav, rules, emphasis |
| body text | `#1f2638` | paragraphs |
| secondary text | `#4b5568` | nav items, links, captions |
| muted text | `#6b7385` | de-emphasised values |
| dimmed number | `#9aa3b5` | the non-winning side of a comparison |
| `--sheet-rule` | `#e3e7ef` | hairline separators |
| page background | `#ffffff` | always a white page |
| signal orange | `#f08c00` | **only** for drawn measurements and highlights, never for UI chrome |
| threat red | `#e03131` | danger and negative events, used sparingly |
| simulated/model teal | `#0b7285` | labels marking content as simulated or model-generated (not observed) |

In data-viz areas (Second Look's pitch), use pale grass `#f1f5f2` / `#e9f0eb`, lines `rgba(27,42,94,0.18)` and grid `rgba(27,42,94,0.07)`.

## Typography

- **Sans (UI):** `"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif`, weights 400/500/600/700.
- **Serif (questions, headings, findings):** `"Newsreader", "Source Serif 4", Georgia, "Times New Roman", serif`, weights 500/600.
- Google Fonts link:
  `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap`
- Set all numbers in `font-variant-numeric: tabular-nums`.

| Role | Font | Size | Weight / notes |
|---|---|---|---|
| Page title | serif | `clamp(26px, 3.2vw, 34px)` | 600, line-height 1.15, `text-wrap: balance` |
| Verdict / headline answer | serif | `clamp(30px, 3.6vw, 40px)` | 600, line-height 1.1, navy |
| Big number | sans | `clamp(40px, 5vw, 56px)` | 600, line-height 1, letter-spacing -0.5px, navy, tabular |
| Finding sentence | serif | 21px | line-height 1.35, `text-wrap: pretty` |
| Kicker label | sans | 12px | 600, uppercase, letter-spacing 0.08em (navy = observed, teal = simulated) |
| Nav item | sans | 15px | 500 |
| Text link | sans | 13px | underlined, offset 3px |
| Detail labels (dt) | sans | 12px | 600, uppercase, letter-spacing 0.3px, dimmed |

## Layout and components

- **Shell:** a top bar with the logo and plain-word page names (for example "The press · The argument · Three choices"). Add a 1px bottom rule. Mark the active tab with a 3px navy underline and the inactive tabs with `#4b5568`. Don't use a sidebar.
- **Cards and sections:** transparent background, `border-top: 1px solid #e3e7ef`, radius 0, no side padding, no shadow.
- **Selected / best item:** `border-top: 3px solid #1b2a5e`, with 8–14px padding above the content. Other items get a transparent or `#e3e7ef` 3px rule, which turns `#8b9ecb` on hover.
- **Comparison ("duel"):** the winner's number is navy with a top rule, and the loser's number is `#9aa3b5`.
- **Selected table row:** background `#eef1f8` plus `inset 3px 0 0 #26396b`.
- **Radius:** small (`sm`, about 4px) where needed. There are no rounded pill shapes.
- **Focus:** `outline: 2px solid #1b2a5e; outline-offset: 2px`.
- **Overlay card on dark media:** `rgba(27,42,94,0.94)` with white text and shadow `0 6px 20px rgba(27,42,94,0.25)`.
- **Motion:** none beyond a 120ms opacity fade for stale content. Respect `prefers-reduced-motion`.
- **Mantine setup** (if using Mantine): `primaryColor: "navy"`, `primaryShade: 8`, `defaultRadius: "sm"`, headings in the serif at weight 600, and `withBorder: false` by default on Paper and Card.

## Logo

A navy square (`#1b2a5e`, no radius) with a white wordmark set bottom-right: **"Chui"** over **"Labs"**.

```svg
<svg viewBox="0 0 100 100" role="img" aria-label="Chui Labs">
  <rect width="100" height="100" fill="#1b2a5e"/>
  <text x="88" y="60" text-anchor="end" fill="#fff" font-size="27" font-weight="500">Chui</text>
  <text x="88" y="84" text-anchor="end" fill="#fff" font-size="21" font-weight="400">Labs</text>
</svg>
```

Favicon: a navy square with `rx="8"` and a white centred **"C"** (font-size 54, weight 600).

Page title format: `<Product> · Chui Labs`.
