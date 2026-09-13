# Component Audit — collection-card, product-card, product page, sticky-add-to-cart

Repo: `lokeshdugar040/chikan-kari-theme` · Theme ID `148327137395` · Branch `arena/01a09c28-chikan-kari-theme`

Status: **All four components done. A, B, C fixed; D hardened (no defect existed).
Plus cusvid id and CDN script. Six commits on `arena/01a09c28-chikan-kari-theme`.**

```
db75e00  fix(sticky-add-to-cart): robust hidden geometry + elevation token;
         harden cusvid id and CDN script
e4a4d72  docs(audit): record A/B/C fixes, correct three claims
c61ce96  fix(product): remove duplicate offer band and its CSS/JS workarounds
d180ee5  fix(product-card): give swatch styling a single owner; drop cascade war
1e916d4  chore(collection-card): remove unreferenced override-CSS layer
328843c  (base) Merge pull request #7
```

---

## 1. Method

Code-level audit only (no visual checks), as specified.

The single most useful thing I did was **establish an exact upstream baseline** instead of guessing what
"Horizon-consistent" means:

- `config/settings_schema.json` → `"theme_version": "3.4.0"`
- Upstream `Shopify/horizon` → commit **`d534fca` ("Horizon v3.4.0")**

Everything below is derived from a real tree diff:

```
diff -rq <horizon-3.4.0> <this-repo>          # 212 files differ
diff -w -B <a> <b>                            # 92 differ ignoring whitespace/blank lines
```

This matters: 120 of the 212 "differing" files differ **only by blank lines and stripped locale
comments** — export artefacts, not edits. Without the baseline they look like changes.

### Baseline caveat

Upstream `main` today has drifted far past v3.4.0 (no `snippets/color-schemes.liquid`,
no `assets/product-title-truncation.js`, etc.). **Only v3.4.0 is a valid comparison point.** Diffing
against `main` yields ~60 phantom "deleted file" findings.

---

## 2. What deviates from Horizon v3.4.0

### 2.1 Added files (not in Horizon)

| File | Purpose | Loaded? | Status |
|---|---|---|---|
| `assets/fix-duplicates.css` | duplicate suppression via `display:none !important` | **NO** | **deleted (A)** |
| `assets/layout-fix.css` | container/grid/section `!important` overrides | **NO** | **deleted (A)** |
| `assets/section-render-fix.css` | duplicate-section suppression | **NO** | **deleted (A)** |
| `assets/base-override.css` | blanket overrides of `base.css` | **NO** | **deleted (A)** |
| `snippets/premium-usp-band.liquid` | second, conflicting offer band | was yes | **deleted (C)** |
| `assets/motion.js` | scroll reveal + card tilt + header state | yes (`snippets/scripts.liquid:277`) | open |
| `blocks/premium-usp-band.liquid` | "Buy more, save more" offer | yes (`templates/product.json:171`) | kept |
| `blocks/slideshow-banner.liquid` | banner slideshow | yes (`templates/index.json:15,530`) | — |
| `blocks/testimonials-carousel.liquid` | testimonials | yes (`templates/index.json:1079`) | — |
| `sections/cusvid.liquid` | custom video-sequence slider (1459 lines) | yes | duplicate section id fixed (`db75e00`) |
| `sections/product-extra-content.liquid` | — | **NO** | unused |
| `snippets/pagefly-main-js.liquid` | PageFly stub | **NO** | unused |
| `blocks/_delivery-checker.liquid` | — | **NO** | unused |
| `blocks/testimonial-card.liquid` | — | **NO** | unused |

The four "fix" CSS assets were referenced from nowhere. `theme.liquid` loads CSS only via
`{%- render 'stylesheets' -%}`, which loads `overflow-list.css` + `base.css`; there is no `custom_css`
setting in `config/settings_data.json`. **`fix-duplicates.css` — the file whose entire job was
`display:none !important`-ing duplicate headers, logos, nav, cart icons and card #13+ — has never
executed.** If the store shows duplicates, that file is not the reason they are hidden, and editing it
does nothing.

---

## 3. Per-component findings

### A. `collection-card` — no duplication. FIXED (commit `1e916d4`)

Byte-identical to Horizon v3.4.0 (ignoring whitespace): `snippets/collection-card.liquid`,
`blocks/{collection,-}_collection-card.liquid`, `blocks/_collection-card-image.liquid`,
`sections/{collection-list,main-collection-list}.liquid`, `snippets/resource-list.liquid`.

- `snippets/resource-list.liquid` selects **one** layout branch (`grid`/`bento`/`carousel`/`editorial`)
  and emits `list_items` exactly once (line 116 for grid, 119-137 otherwise).
- `sections/collection-list.liquid:46-59` and `main-collection-list.liquid:36-60` each capture
  `list_items` once and pass it to `resource-list` once. `content_for 'blocks'` renders only the
  *section header* blocks; the card comes from the `static-collection-card` block. Stock Horizon
  pattern, not double rendering.
- `templates/index.json` has exactly one `collection-list` section.

**Fix applied:** deleted the four orphan CSS assets (zero references → no runtime effect, no visual
change; removes the forbidden global-override layer).

**Remaining (open):** `assets/motion.js` injects `--tilt-x/--tilt-y/--glare-x/--glare-y` inline style on
every `.collection-card` and drives `transform` on pointer move (`assets/motion.js:60-99`); `base.css`
carries a matching hover/reveal layer and a `prefers-reduced-motion` block that blanket-nulls
`transition/animation/transform` on cards.

### B. `product-card` — no duplication; duplicated CSS. FIXED (commit `d180ee5`)

Structural files byte-identical to Horizon v3.4.0: `snippets/product-card.liquid`,
`blocks/{product,-}_product-card.liquid`, `_product-card-group`, `_product-card-gallery`,
`sections/{main-collection,product-list}.liquid`, `snippets/product-grid.liquid`,
`blocks/featured-collection.liquid`, `snippets/quick-add.liquid`.

- One `content_for 'block' … '_product-card'` per `<li>` (`main-collection.liquid:62`,
  `product-list.liquid:35`/`:50`). No second render path.
- Grid is Horizon's own container (`snippets/product-grid.liquid:76-93` +
  `--product-grid-columns-desktop` set per-section in `{% style %}` at 18-74). No `!important`.
- No extra wrappers.

Note: the `swatches` block is used **only inside product cards** — `collection.json`, `index.json`,
`search.json`, `cart.json`, `404.json`, and product.json's related-products carousel. The product page
uses `variant-picker` instead.

**Defect found:** `blocks/swatches.liquid` and `snippets/swatch.liquid` styled the *same* elements with
*opposite* values:

| | `blocks/swatches.liquid` | `snippets/swatch.liquid` |
|---|---|---|
| Selector | `product-swatches .variant-option__button-label` | `product-swatches label:has(.swatch)`, `.variant-option__button-label--has-swatch` |
| Size | `--swatch-size` 32/34/36px square | hard-coded 36×46 / 40×50 / 42×52 (4:5) |
| `overflow` | `visible !important` | `hidden !important` |
| `.swatch` box | `--swatch-width/height: var(--swatch-size) !important` | `width/height: 100% !important` |

Which won was decided by `!important` source order in the compiled bundle — a knock-on of
`swatch.liquid` being rendered inside `swatches.liquid`. Layout by cascade accident.

`blocks/swatches.liquid:27-31` had also **dropped Horizon's `--overflow-list-alignment` /
`--overflow-list-alignment-mobile`**, which `assets/overflow-list.css:5,12` consumes — and which lives
in `overflow-list`'s **shadow DOM** (`snippets/overflow-list.liquid` uses
`<template shadowrootmode="open">`), so it can only be driven by inherited custom properties. The file
compensated with its own `overflow-list::part(list)` overrides.

**Fix applied:** ownership split along Horizon's own boundaries — `snippets/swatch.liquid` is sole owner
of swatch geometry (size, 4:5 aspect, radius, borders, selected/focus states); `blocks/swatches.liquid`
keeps only container layout and the padding settings it owns, and restores Horizon's stock
custom-property wiring. 352 → 188 lines, zero `!important` declarations, one owner per property.

Two honest caveats recorded in the commit:
- The restored `--overflow-list-alignment` vars are **inert with the current forked snippet**, which
  renders a plain `<ul>` rather than `<overflow-list>`. They are restored because they are Horizon's
  documented wiring and alignment silently breaks if `variant-swatches` is ever resynced to stock. (The
  `overflow-list` selectors they replace were themselves dead selectors.)
- The rendered result is unchanged: `snippets/swatch.liquid`'s hard-coded sizes already won the cascade
  before this commit, so they are the sizes the merchant already sees.

The deliberate 3-swatches-plus-N product-card feature is preserved (`variant-swatches.liquid` `limit: 3`
+ `+N` `<li>`; `variant-main-picker.liquid` mirrors it via `picker_context: 'product-card'`).

### C. Product page — real duplicate rendering. FIXED (commit `c61ce96`)

`templates/product.json` order: `main` (product-information) → `product_list_zR9Cym` (product-list,
related carousel) → `17723966628df34025` (`_blocks`, Judge.me review widget).

The Judge.me `preview_badge` (in `product-details`) and `review_widget` (own section) are **not**
duplicates — inline badge vs full widget is intended.

#### C1 — offer band rendered twice, with contradictory terms

| | `blocks/premium-usp-band.liquid` (block, in `product.json`) | `snippets/premium-usp-band.liquid` (snippet) |
|---|---|---|
| Offer | 2 pieces → ₹200 off; 3 pieces → ₹500 off ("Best value") | "Extra ₹200 off on 2+ pieces" |
| Shipping | "Free shipping on prepaid orders" | "Free shipping on prepaid orders" |

"Free shipping on prepaid orders" printed twice, and the two discount promises did not agree. The
snippet was rendered into a `hidden` div (`_product-details.liquid:51-53`) and then relocated after
`shopify-buy-it-now-button` by a 50-line `MutationObserver` (`:59-109`), propped up by
`.premium-usp-band-mount[hidden] { display: none !important; }`.

**Fix applied:** removed the mount + `{% render %}`, the `MutationObserver`, the
`.premium-usp-band-mount*` CSS, and the dead `[class*="coupon-body-template--"]` rule; deleted the now
unreferenced snippet. Kept the block — it is the richer editor-managed component (full
colour/padding/radius settings), is already positioned directly after the buy-buttons block in
`block_order`, and carries the more current offer terms. Net −178 lines.

#### C2 — dead legacy-element hiding

`[class*="coupon-body-template--"] { display: none !important; }` — an attribute-substring selector
hiding an element with **zero remaining references** anywhere in the theme. Removed with C1.

#### C3 — related-products carousel can re-render the current product (OPEN)

`templates/product.json` sets the related carousel to `collection: "all-products"` with
`max_products: 6`. `sections/product-list.liquid` is stock Horizon and contains **no exclusion logic**
for the current product (verified: no `closest.product` / `exclude` / `current_product` handling). So the
current product appears again in its own "you may also like" carousel whenever it falls in the first 6
products of the store.

This is a **content/config** decision, not a code bug — fixing it in Liquid would mean adding
non-Horizon filtering logic. Recommendation: point `collection` at a curated related collection.

#### Explicitly NOT a defect

`blocks/_product-details.liquid:16-23` renders a product-title link inside `.view-product-title`,
hidden by `:118-120 { display: none; }`. This looks exactly like a CSS-hidden duplicate title — but it is
**stock Horizon v3.4.0** (`hz340/blocks/_product-details.liquid:16,38`). It exists to be revealed inside
the quick-add modal, and `assets/quick-add.js:307-309` depends on it. Left intact.

The variant-metafield box (`variant-info-box`, plus `snippets/variant-swatches`-adjacent
`assets/variant-picker.js updateVariantInfo()`) is also left intact: its `:scope`-prefixed selectors are
correct, the matching JS is consistent, and it is a coherent feature rather than duplication.

### D. `sticky-add-to-cart` — no defect found. HARDENED (commit `db75e00`)

**JS wiring verified correct end to end:**

- `sections/product-information.liquid:43-47` emits `ref="stickyBar"`, `role="region"`, `data-stuck="false"`
- `ref="addToCartButton"` (`:122`), `ref="quantityDisplay"` (`:147`), `ref="quantityNumber"` (`:155`),
  `ref="productImage"` (`:67`) — all four mandatory refs in `requiredRefs` are present
- `assets/sticky-add-to-cart.js:316-327` resolves the form via
  `#shopify-section-<id> product-form-component[data-product-id="…"]`; `blocks/buy-buttons.liquid:44`
  really renders `<product-form-component>`. Selector matches.
- `data-puppet` handshake complete: set at `sticky-add-to-cart.js:167`, read at
  `assets/product-form.js:84`, reset on `cartUpdate`/`cartError` (`:274-279`)
- All five listened events (`variantUpdate`, `variantSelected`, `cartUpdate`, `cartError`,
  `quantitySelectorUpdate`) exist in `assets/events.js`
- The JS is CSS-model-agnostic: `#showStickyBar`/`#hideStickyBar` only toggle `data-stuck`, which both
  Horizon's and this theme's stylesheet respond to

**`sections/product-information.liquid:180-345` is a deliberate restyle of Horizon's sticky bar**, not
a hack, and it is self-consistent:

| Property | Horizon v3.4.0 | This theme |
|---|---|---|
| `bottom` | `20px` | `12px` |
| `width` | `600px` | `100%`, `max-width: 480px` |
| `border-radius` | `calc(var(--style-border-radius-buttons-primary) + min(var(--padding-sm), …))` | `var(--style-border-radius-buttons-primary)` |
| `box-shadow` | `var(--shadow-popover)` | hard-coded `0 8px 24px rgba(0,0,0,.18)` |
| `::before` glass layer | present (`backdrop-filter` blur/saturate) | removed |
| `@starting-style` | present | removed |
| transition | `transform, opacity, display` + `allow-discrete`, `0.3s` | `transform, opacity`, `0.26s` |
| mobile radius | `0` | `16px 16px 0 0` |
| mobile button | icon-only (`text__content { display: none }`) | text shown, `white-space: normal` |
| hidden geometry | `translateY(calc(100% + 40px))` | `translateY(120%)` |
| unavailable variant | `display: none` | `opacity: 0` + `translateY(120%)` |

I checked the two candidate defects and **both turned out not to be real**:

1. *"Dropping `display: none` leaves an invisible but focusable button in the tab order."* **False.**
   Horizon's stock bar also keeps the element in flow with `opacity: 0` and a translate; it uses
   `display: none` only for the unavailable-variant state. No accessibility regression.
2. *"`translateY(120%)` does not guarantee the bar is fully off-screen."* **Currently safe.** With
   `--padding-lg: 1rem` and `--icon-size-sm: 1.25rem`, `--height-buy-buttons` = 52px; plus the bar's
   `--padding-sm` (12px top+bottom) the bar is ≈76px tall. `1.2 × 76 = 91.2px` vs the 88px needed
   (`76 + 12`), so it clears the viewport by 3.2px. The mobile rule (`bottom: 0` + `translateY(100%)`)
   is exactly flush by construction.

   It is, however, *fragile by construction*: full hiding requires `height ≥ 5 × bottom`, whereas
   Horizon's `calc(100% + 40px)` is unconditionally safe. If `--icon-size-sm` is ever reduced enough
   that the bar drops below 60px, a sliver of the `opacity: 0` bar would remain hit-testable at the
   viewport edge.

**Conclusion:** no defect exists in D. The JS contract is correct and the CSS is a coherent,
self-consistent restyle rather than a hack. Two non-visual hardening changes were applied under
`db75e00`, and two things I initially judged to be bugs were **not** changed because they are not bugs:

1. **Hidden geometry** — `translateY(120%)` made clearing the viewport depend on the bar's height
   (`height ≥ 5 × bottom`). It happened to work (76px bar vs the 60px threshold) with only 3.2px to
   spare. Replaced with Horizon's unconditional `translateY(calc(100% + 12px))` in the base and
   unavailable-variant rules. **Fixed.** The mobile rule (`bottom: 0` + `translateY(100%)`) is exactly
   flush by construction and was deliberately left alone.
2. **Elevation token** — hard-coded `0 8px 24px rgba(0,0,0,.18)` → `var(--shadow-popover)`, the token
   Horizon itself uses on this element. **Fixed** (live: `popover_drop_shadow` defaults to true and the
   bar carries `color-{{ settings.popover_color_scheme }}`, which is where
   `snippets/color-schemes.liquid:90` emits the token). The mobile rule keeps its hard-coded *upward*
   shadow, because `--shadow-popover` points down and substituting it would remove a bottom sheet's
   edge definition.
3. **`display: none` / tab order** — not changed, because Horizon hides the bar the same way
   (`opacity: 0` + translate), using `display: none` only for the unavailable-variant state.
4. **The `::before` glass layer, `@starting-style`, 480px width, labelled mobile button** — not changed;
   they are the merchant's design decisions, not correctness problems. See the D table above.


---

## 4. Fix list

| Pri | Component | Fix | Status |
|---|---|---|---|
| 1 | A | Delete the 4 orphan override-CSS assets | **done** `1e916d4` |
| 2 | B | Single owner for swatch styling; drop cascade war | **done** `d180ee5` |
| 3 | C | Remove duplicate offer band + JS relocation + dead rule; delete orphan snippet | **done** `c61ce96` |
| 4 | D | Unconditional off-screen geometry; `var(--shadow-popover)` | **done** `db75e00` |
| 5 | — | `sections/cusvid.liquid` duplicate DOM id → unique `video-sequence-slider-` prefix | **done** `db75e00` |
| 6 | — | `layout/theme.liquid:39` unpkg script → SRI + `crossorigin` + `referrerpolicy` | **done** `db75e00` |
| 7 | C3 | Point related-products `collection` at a curated collection, not `all-products` | **open** — merchant content |
| 8 | — | Duplicated homepage heading in `templates/index.json` | **not a defect** — see below |
| 9 | — | 4 unused added files (`sections/product-extra-content.liquid`, `snippets/pagefly-main-js.liquid`, `blocks/_delivery-checker.liquid`, `blocks/testimonial-card.liquid`) | open |
| 10 | — | `assets/motion.js` card tilt + `base.css` reveal layer (non-Horizon, but self-contained and opt-out-able via `prefers-reduced-motion`) | open |

### Item 8 reclassified — nothing to fix

The heading `"<h3>Watch Then खरीदें</h3>"` is set on both `cusvid_ETYbzp.text_block_pEePdD` and
`section_9kGeWd.text_tkj3Ep`, but `section_9kGeWd` carries **`"disabled": true`**, so it never renders.
The duplication exists only in the JSON, not on the storefront. Removing a merchant's disabled section
config is a content change with no benefit, so it was intentionally left alone rather than "fixed".

### Item 6 note — why not vendored

`spf-analytics@1.0.0` is published as **`"license": "UNLICENSED"`**. Self-hosting it in `assets/` would
mean redistributing a package with no licence to do so, so SRI + `crossorigin` was used instead. The URL
also already pinned `@1.0.0` — it was never an unpinned "latest" reference, so this only adds tamper
protection. The hash is not guessed: it is the sha384 of `index.js` as published in the npm artifact
(19,939 bytes), fetched from `registry.npmjs.org`. `unpkg.com` is unreachable from the sandbox, so the
served bytes could not be re-verified here; if analytics stops reporting, re-verify the hash against the
served file before assuming the script broke.

---

## 5. Summary against the brief

| Brief requirement | Result |
|---|---|
| Duplicate rendering of collection cards | **none exists** — code is stock Horizon |
| Duplicate rendering of product cards | **none exists** — code is stock Horizon |
| Duplicate product-page sections/blocks | **found and fixed** — premium-usp-band rendered twice with contradictory offer terms |
| Non-Horizon markup / extra wrappers in cards | none in the card paths; raw `<style>` snippet found on the product page and removed |
| Logic relying on CSS to hide duplicates | **found and fixed** — `.premium-usp-band-mount[hidden] { display:none !important }` + JS relocation; dead `coupon-body-template` rule; 4 orphan "fix" CSS files |
| No new global override CSS files added | correct — none added; 4 pre-existing orphans removed |
| Duplicates fixed in Liquid/JSON, not hidden with CSS | yes — C1 removed the elements in Liquid and only then dropped the compensating CSS |
| `sticky-add-to-cart` | **no defect found** — JS contract verified correct end to end; the CSS is a coherent design fork, hardened with two non-visual fixes |

### Evidence discipline

Each of the four components had at least one finding that looked like a defect but collapsed under
closer inspection, and every one was checked against the Horizon v3.4.0 baseline before acting:

| Looked like | Actually | Action |
|---|---|---|
| `.view-product-title` hidden with `display: none` = duplicate title | stock Horizon, load-bearing for `quick-add.js:307-309` | left alone |
| sticky bar's `z-index: calc(var(--layer-sticky) - 1)` = local band-aid | identical in Horizon v3.4.0 | left alone |
| sticky bar kept focusable while hidden = a11y regression | Horizon hides it the same way | left alone |
| `translateY(120%)` = geometry bug | worked, with 3.2px margin | hardened for robustness, not called a bug |
| homepage heading duplicated in JSON = rendered twice | section is `"disabled": true` | left alone |
| `unpkg` script "unpinned" | URL already pinned `@1.0.0` | corrected; added SRI only |
| `swatches` block = product-page component | product-card-only | corrected mid-audit |

### Corrections to earlier statements in this session

- I said `blocks/swatches.liquid` affects the product page. It does not — the `swatches` block is
  product-card-only; the product page renders `variant-picker` instead.
- I listed the hidden `.view-product-title` as a duplicate-title defect. It is stock Horizon and is
  load-bearing for the quick-add modal. **Not** changed.
- I described the sticky bar's `z-index: calc(var(--layer-sticky) - 1)` as a band-aid introduced by the
  restyle. Horizon v3.4.0 has the identical declaration.
- I called the sticky CSS model replacement an accessibility regression. It is not.
- I said the unpkg script was "unpinned". The version was already pinned; the real gap was the missing
  integrity check, and the package is `UNLICENSED` (so it cannot be vendored).
