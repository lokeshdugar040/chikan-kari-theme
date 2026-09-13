# Component Audit — collection-card, product-card, product page, sticky-add-to-cart

Repo: `lokeshdugar040/chikan-kari-theme` · Theme ID `148327137395` · Branch `arena/01a09c28-chikan-kari-theme`

---

## 1. Method

Code-level audit only (no visual checks), as specified.

The single most useful thing I did was **establish an exact upstream baseline** instead of guessing what "Horizon-consistent" means:

- `config/settings_schema.json` → `"theme_version": "3.4.0"`
- Upstream `Shopify/horizon` → commit **`d534fca` ("Horizon v3.4.0")**

Everything below is derived from a real tree diff:

```
diff -rq <horizon-3.4.0> <this-repo>          # 212 files differ
diff -w -B <a> <b>                            # 92 differ ignoring whitespace/blank lines
```

This matters: 120 of the 212 "differing" files differ **only by blank lines and stripped locale
comments** — those are export artefacts, not edits. Without the baseline they look like changes.

### Baseline caveat

Upstream `main` today has drifted a long way past v3.4.0 (it no longer has `snippets/color-schemes.liquid`,
`assets/product-title-truncation.js`, etc.). **Only v3.4.0 is a valid comparison point.** Diffing against
`main` produces ~60 phantom "deleted file" findings.

---

## 2. What actually deviates from Horizon v3.4.0

### 2.1 Added files (not in Horizon at all)

| File | Purpose | Loaded? |
|---|---|---|
| `assets/fix-duplicates.css` | duplicate-suppression via `display:none !important` | **NO — orphan** |
| `assets/layout-fix.css` | container/grid/section `!important` overrides | **NO — orphan** |
| `assets/section-render-fix.css` | duplicate-section suppression | **NO — orphan** |
| `assets/base-override.css` | blanket overrides of `base.css` | **NO — orphan** |
| `assets/motion.js` | scroll reveal + card tilt + header state | yes (`snippets/scripts.liquid:277`) |
| `blocks/premium-usp-band.liquid` | "Buy more, save more" offer | yes (`templates/product.json:171`) |
| `snippets/premium-usp-band.liquid` | *second, different* offer (raw `<style>`) | yes (`blocks/_product-details.liquid:52`) |
| `blocks/slideshow-banner.liquid` | banner slideshow | yes (`templates/index.json:15,530`) |
| `blocks/testimonials-carousel.liquid` | testimonials | yes (`templates/index.json:1079`) |
| `sections/cusvid.liquid` | custom video-sequence slider (1459 lines) | yes (`templates/index.json`) |
| `sections/product-extra-content.liquid` | — | **NO — unused** |
| `snippets/pagefly-main-js.liquid` | PageFly app stub | **NO — unused** |
| `blocks/_delivery-checker.liquid` | — | **NO — unused** |
| `blocks/testimonial-card.liquid` | — | **NO — unused** |

**The four "fix" CSS assets are referenced from nowhere.** Confirmed by grepping the entire repo
(all extensions, excluding `.git`) — the only hits are inside `BASE_CSS_AUDIT.md`, which describes them.
`theme.liquid` loads CSS exclusively via `{%- render 'stylesheets' -%}`, and `snippets/stylesheets.liquid`
loads only `overflow-list.css` + `base.css`. There is no `custom_css` setting in `config/settings_data.json`.

**Consequence:** `fix-duplicates.css` — the file whose entire job is to hide duplicate headers, duplicate
logos, duplicate nav, duplicate cart icons and card #13+ — **has never executed**. If the store still shows
duplicate headers/cards, this file is not hiding them, and no amount of editing it will help.

### 2.2 Modified files relevant to the four target components

| File | Nature of change |
|---|---|
| `blocks/_product-details.liquid` | + variant-metafield block, + premium-usp-band mount & JS relocation, + dead coupon-hiding rule |
| `sections/product-information.liquid` | sticky-ATC stylesheet rewritten (Horizon's layout model replaced) |
| `assets/variant-picker.js` | + `updateVariantInfo()` to morph the new metafield box |
| `blocks/swatches.liquid` | Horizon's `<product-swatches>` stylesheet **deleted**, replaced by appended `!important` layer |
| `snippets/product-media-gallery-content.liquid` | + appended thumbnail "SAFE … FIX" `!important` layer |
| `snippets/variant-main-picker.liquid`, `snippets/variant-swatches.liquid`, `snippets/swatch.liquid` | swatch markup/CSS |
| `assets/base.css` | design-system edits + appended reveal/tilt/reduced-motion layer |
| `snippets/scripts.liquid` | + `motion.js` |
| `layout/theme.liquid` | + `spf-analytics@1.0.0` from unpkg + `window.ThemeLoader` |
| `snippets/theme-styles-variables.liquid` | fluid `--page-gutter` |
| `sections/header.liquid` | header changes |

---

## 3. Per-component findings

### A. `collection-card` — **no duplication in code**

Verified byte-identical to Horizon v3.4.0 (ignoring whitespace):

```
snippets/collection-card.liquid            STOCK
blocks/collection-card.liquid              STOCK
blocks/_collection-card.liquid             STOCK
blocks/_collection-card-image.liquid       STOCK
sections/collection-list.liquid            STOCK
sections/main-collection-list.liquid       STOCK
snippets/resource-list.liquid              STOCK
```

- `snippets/resource-list.liquid` selects **one** layout branch (`grid` / `bento` / `carousel` /
  `editorial`) and emits `list_items` exactly once (line 116 for grid, 119–137 for the others).
- `sections/collection-list.liquid:46-59` and `sections/main-collection-list.liquid:36-60` each capture
  `list_items` once and pass it to `resource-list` once. `content_for 'blocks'` renders only the
  *section header* blocks — the card comes from the `static-collection-card` block. This is the stock
  Horizon pattern and is correct; it is not double rendering.
- `templates/index.json` has exactly **one** `collection-list` section. No duplicate section.

**Verdict:** no duplicate collection-card rendering, no extra wrappers, no non-Horizon markup, no
CSS-hidden duplicates. There is nothing to fix in Liquid or JSON here.

**Only defects touching this component:**

| # | Defect | Evidence |
|---|---|---|
| A1 | Four orphan "fix" CSS files — pure CSS hacks, zero effect | 0 references repo-wide |
| A2 | `assets/motion.js` injects `--tilt-x/--tilt-y/--glare-x/--glare-y` inline style on every `.collection-card` and drives `transform` on pointer move | `assets/motion.js:60-99` |
| A3 | `assets/base.css` appended layer applies hover/reveal transforms to `.collection-card`, then a `prefers-reduced-motion` block blanket-nulls `transition/animation/transform` | `assets/base.css` (tail) |

---

### B. `product-card` — **no duplication in code**

Verified byte-identical to Horizon v3.4.0:

```
snippets/product-card.liquid               STOCK
blocks/product-card.liquid                 STOCK
blocks/_product-card.liquid                STOCK
blocks/_product-card-group.liquid          STOCK
blocks/_product-card-gallery.liquid        STOCK
sections/main-collection.liquid            STOCK
sections/product-list.liquid               STOCK
snippets/product-grid.liquid               STOCK
snippets/quick-add.liquid                  STOCK
blocks/featured-collection.liquid          STOCK
```

- One `content_for 'block' … '_product-card'` call per `<li>` — `sections/main-collection.liquid:62`,
  `sections/product-list.liquid:35` / `:50`. No second render path.
- Grid is Horizon's own container, not a CSS hack: `snippets/product-grid.liquid:76-93` +
  `--product-grid-columns-desktop` set per-section in `{% style %}` at lines 18-74. No `!important`.
- No extra wrappers: `snippets/product-card.liquid:84-110` is Horizon's `product-card__content` /
  `layout-panel-flex` / `spacing-style` stack, unmodified.

**Verdict:** no duplicate product cards, no extra wrappers, grid via proper containers. Nothing to fix
in Liquid or JSON.

**Only defect inside the product-card subtree:**

| # | Defect | Evidence |
|---|---|---|
| B1 | `blocks/swatches.liquid` — Horizon's `<product-swatches>` stylesheet was deleted and replaced with an appended ~200-line `!important` layer; alignment custom properties were also changed from Horizon's `start`/`end`/`center` tokens to raw `flex-start`/`flex-end` | `blocks/swatches.liquid:48-238` |
| B2 | Same `motion.js` tilt as A2 applied to `.product-card` | `assets/motion.js:60` |

B1 is the only genuine non-Horizon rewrite in the product-card subtree. Note it is a **visual** rewrite
(the merchant wanted larger swatches), so restoring stock will change swatch appearance.

---

### C. Product page — **real duplicates found**

`templates/product.json` order: `main` (product-information) → `product_list_zR9Cym` (product-list,
related-products carousel) → `17723966628df34025` (`_blocks`, Judge.me review widget).

The Judge.me `preview_badge` (in `product-details`) and `review_widget` (own section) are **not**
duplicates — badge vs. full widget is intended.

Two real defects, both in `blocks/_product-details.liquid` (a file added to/modified from Horizon):

#### C1 — Premium-USP band rendered twice, one copy hidden then relocated by JS

`blocks/_product-details.liquid:51-53` renders a **second** offer component into a hidden mount:

```liquid
<div id="premium-usp-band-mount-{{ section.id }}" class="premium-usp-band-mount" hidden>
  {% render 'premium-usp-band' %}
</div>
```

…while `templates/product.json:170-171` *also* configures a real `premium-usp-band` **block**
(`blocks/premium-usp-band.liquid`). So two different, independently-authored offer chunks render on the
same product page:

- `snippets/premium-usp-band.liquid` — "Extra ₹200 off on 2+ pieces", raw `<style>` tag (non-Horizon)
- `blocks/premium-usp-band.liquid` — "Buy more, save more", proper `{% stylesheet %}`

And a 50-line `MutationObserver` (`:59-109`) watches the whole `#ProductInformation-*` subtree to
`insertAdjacentElement('afterend', mount)` and flip `hidden` off — a DOM-relocation hack with a 5s
give-up timeout. It is propped up by `.premium-usp-band-mount[hidden] { display: none !important; }`
(`:178-180`), exactly the "hide it with CSS, fix it in JS" pattern the brief forbids.

#### C2 — Dead legacy-element hiding rule

`blocks/_product-details.liquid:187-190`:

```css
/* Hide old generated coupon block permanently */
[class*="coupon-body-template--"] { display: none !important; }
```

An attribute-substring selector used site-wide to hide an element that **no longer exists in the
codebase** — grep for `coupon-body-template` across every `.liquid`/`.js`/`.css`/`.json` returns this
stylesheet rule and nothing else. It is a leftover from a removed section.

#### Explicitly NOT a defect (checked, so it isn't "fixed" by mistake)

`blocks/_product-details.liquid:16-23` renders a product-title link inside `.view-product-title`,
hidden by `:118-120 { display: none; }`. This looks exactly like a CSS-hidden duplicate title — **but it
is stock Horizon v3.4.0** (`hz340/blocks/_product-details.liquid:16,38`). It exists to be revealed inside
the quick-add modal, and `assets/quick-add.js:307-309` depends on it. **Leave it alone.**

---

### D. `sticky-add-to-cart` — **wiring correct, styling model replaced**

Good news first — everything the JS depends on is intact:

- `sections/product-information.liquid:43-47` emits `ref="stickyBar"`, `role="region"`, `data-stuck="false"`
- `ref="addToCartButton"` (`:122`), `ref="quantityDisplay"` (`:147`), `ref="quantityNumber"` (`:155`), `ref="productImage"` (`:67`)
- `assets/sticky-add-to-cart.js:316-327` resolves the form via
  `#shopify-section-<id> product-form-component[data-product-id="…"]` — and `blocks/buy-buttons.liquid:44`
  really does render `<product-form-component>`. Selector matches.
- The `data-puppet` handshake is complete: JS sets it (`:167`), `assets/product-form.js:84` reads it, and
  it is reset on `cartUpdate`/`cartError` (`:274-279`).
- Events listened to (`variantUpdate`, `variantSelected`, `cartUpdate`, `cartError`,
  `quantitySelectorUpdate`) all exist in `assets/events.js`.

**Defect:** `sections/product-information.liquid:180-345` replaces Horizon's sticky-bar styling model
wholesale. Horizon v3.4.0 uses the `display`/`@starting-style`/`transition-behavior: allow-discrete`
pattern with a `::before` blurred-border layer for its glass look. This theme instead:

- moves the bar with `transform: translateX(-50%) translateY(120%)` + `opacity: 0` (`:184-185`)
- un-does it with `[data-stuck='true'] { translateY(0); opacity: 1 }` (`:206-208`)
- re-hides it for unavailable variants (`:211-214`)
- drops `@starting-style`, `transition-behavior: allow-discrete`, and the `::before` layer entirely
- swaps `width: 600px` → `width: 100%; max-width: 480px`, and `box-shadow: var(--shadow-popover)` →
  a hard-coded `0 8px 24px rgba(0,0,0,.18)`
- re-implements mobile as a bottom sheet (`:268-284`) with hard-coded `border-radius: 16px 16px 0 0`
- changes Horizon's small-mobile rules from `display: none` on `.add-to-cart-text__content` to
  `display: inline-flex` + `white-space: normal` (`:288-304`)

Functionally it can work, but it is a parallel CSS implementation of a component Horizon already ships,
it hard-codes values that Horizon exposes as tokens (`--shadow-popover`, border-radius tokens), and it
achieves show/hide by translating an always-present fixed element off-screen rather than by Horizon's
display transition — which is why the `z-index: calc(var(--layer-sticky) - 1)` band-aid is needed.

---

### 3bis. Adjacent issues found (outside the four components)

| Issue | Evidence |
|---|---|
| `sections/cusvid.liquid:2,6` sets `id="shopify-section-{{ section.id }}"` on its own `<section>`, while Shopify already wraps the section in `<div id="shopify-section-{{ section.id }}">` → **duplicate DOM id**, invalid HTML, and its own `#id` CSS (`:224-352`) and any `getElementById` become ambiguous | `sections/cusvid.liquid:2-6` |
| Homepage heading duplicated in JSON: `"<h3>Watch Then खरीदें</h3>"` is set on both `cusvid_ETYbzp.text_block_pEePdD` and `section_9kGeWd.text_tkj3Ep` | `templates/index.json` |
| 4 unused added files (`sections/product-extra-content.liquid`, `snippets/pagefly-main-js.liquid`, `blocks/_delivery-checker.liquid`, `blocks/testimonial-card.liquid`) | 0 references each |
| `layout/theme.liquid:39` loads `https://unpkg.com/spf-analytics@1.0.0/index.js` — third-party CDN, unpinned to a hash, no SRI | `layout/theme.liquid:39` |
| `sections/product-extra-content.liquid` and `snippets/pagefly-main-js.liquid` are dead weight | — |

---

## 4. Prioritised fix list

Ordered by (real duplication / rule violation) × (risk).

| Pri | Component | Fix | Risk | Visual impact |
|---|---|---|---|---|
| 1 | C | Remove the hidden `premium-usp-band` mount + the `MutationObserver` block + the dead `coupon-body-template` rule from `blocks/_product-details.liquid`; decide which single offer component stays | low | one of two competing offer bands disappears |
| 2 | A | Delete the 4 orphan CSS assets | **none** — unreferenced | none |
| 3 | D | Restore Horizon's sticky-bar stylesheet in `sections/product-information.liquid` | medium | bar styling changes |
| 4 | B | Restore Horizon's `<product-swatches>` stylesheet in `blocks/swatches.liquid` | medium | swatch size changes |
| 5 | C | Collapse `snippets/premium-usp-band.liquid` (raw `<style>`) into a `{% stylesheet %}` block, or retire it in favour of the block | low | none |
| 6 | — | Fix `sections/cusvid.liquid` duplicate section id | low | none |
| 7 | — | Remove duplicated homepage heading from `templates/index.json` | low | heading disappears once |
| 8 | — | Delete the 4 unused added files; pin or self-host `spf-analytics` | low | none |

**Not recommended:** touching `blocks/swatches.liquid` or the sticky-bar CSS without a visual pass,
since both are deliberate merchant design decisions. Recommend doing #3/#4 only with a preview.

---

## 5. Summary against the brief

| Brief requirement | Result |
|---|---|
| Duplicate rendering of collection cards | **none found** — stock Horizon |
| Duplicate rendering of product cards | **none found** — stock Horizon |
| Duplicate product-page sections/blocks | **found**: premium-usp-band rendered twice (C1) |
| Non-Horizon markup / extra wrappers in cards | none in cards; found in `snippets/premium-usp-band.liquid` (raw `<style>`) |
| Logic depending on CSS to hide duplicates | **found**: `.premium-usp-band-mount[hidden] { display:none !important }` + JS relocation (C1); dead `coupon-body-template` rule (C2); 4 orphan "fix" CSS files (A1) |
| New global override CSS files | none added by this audit; 4 pre-existing orphans identified for deletion |
