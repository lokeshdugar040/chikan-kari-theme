# `base.css` audit — the pasted "hack layer"

Audited against this repo (theme: Shopify **Horizon/Tinker** derivative, `assets/base.css`,
`snippets/theme-styles-variables.liquid`, `blocks/_product-details.liquid`, `sections/header.liquid`,
`layout/theme.liquid`).

Every claim below was verified, not eyeballed:

| Check | Tool |
| --- | --- |
| Syntax / what the browser actually keeps after a parse error | `tinycss2` (CSS Syntax L3 error recovery) |
| Whole-file validity incl. CSS nesting | `postcss` 8.5 |
| Every class selector in the hacks vs. the theme's real markup | `grep` over all `.liquid` / `.js` |
| Every `var(--token)` vs. tokens the theme actually emits | repo-wide token cross-check |
| Whether Liquid runs inside `assets/*.css` | `snippets/stylesheets.liquid`, file extensions |

**Headline:** the file you pasted is not "a bit messy" — it is **corrupted at the end** (an
unterminated comment and an unclosed rule), it contains a **mangled copy-paste in the middle that
rewrites the cascade**, and roughly **40% of the appended selectors match nothing in this theme**.
Several of the rules that *do* parse are global leaks that restyle components you never intended to
touch. The stock ~5,000 lines above the hacks are fine; the damage is confined to the appended layer.

The repaired file is `assets/base.css` in this repo (see [What was fixed](#what-was-fixed-in-this-repo)).

---

## P0 — the file does not parse cleanly

### 1. A comment was pasted *into the middle of a declaration*, and a block was duplicated inside itself

```css
label.variant-option__button-label:not(…--has-swatch):has(:checked) {
  background-color: #000000;                  /* selected = black */
  border: /* Size buttons: white unselected, black selected */   ← ⚠ value starts, then a comment,
.variant-picker .variant-option--buttons                          ← ⚠ then a whole second rule
label.variant-option__button-label:not(…) {
  background-color: #ffffff;
  border-radius: 999px;
  border: 1px solid var(--color-variant-border);
  color: var(--color-variant-text);
}
…
} solid var(--color-selected-variant-border);   ← ⚠ declaration remnant at top level
  color: #ffffff;
}                                               ← ⚠ unmatched brace
```

What the browser keeps (verified with `tinycss2`, minimal faithful repro):

```
line 2  selector '.variant-picker … :has(:checked)'  -> kept ['background-color', 'color']
                                                   DROPPED: "Declaration contains {} block"
```

Consequences:

* the **unselected** size-button rule (white background, `border-radius: 999px`, border) is swallowed
  whole — it becomes part of the invalid `border:` value, so it never exists;
* the **selected** rule survives with only `background-color: #000` + `color: #fff`, keeping the
  theme's own border instead of the intended `0px`;
* `border-radius: 999px` is lost, so selected/unselected pills don't match;
* the trailing `} solid var(--color-selected-variant-border); color: #ffffff; }` is discarded as an
  invalid qualified rule, and the **stray `}` is silently ignored** — which is exactly why this went
  unnoticed: nothing crashes, the buttons just look wrong.

### 2. `lllool` — a stray token that silently rewrites the next selector

```css
lllool

/* RESPONSIVE TYPO KIT — MARTEL HEADINGS, NOTO SANS BODY */
body,
p,
.text-block.paragraph { font-family: var(--font-body--family); … }
```

`lllool` is a type selector with no declaration block, so the parser keeps consuming until it finds
`{`. Verified result:

```
line 22  selector 'lllool body, p, .text-block.paragraph'  -> kept ['font-family']
```

`p` and `.text-block.paragraph` still match. **`body` no longer does** — it now requires an
`<lllool>` ancestor. So the "body font: Noto Sans" rule that the whole TYPO KIT was built around is
dead, while the parts you can see working are the parts you didn't need. This is the single most
misleading bug in the file: it looks applied, it isn't.

### 3. The file ends mid-rule, inside an unterminated comment

```css
h1,
.text-block.h1 {
  font-family: var(--font-heading--family);
  font-size: clamp(2.5rem, 2rem + 2vw, 3.5rem);       /* ~40px → ~     ← EOF
```

Two problems: the rule is never closed, and the comment never terminates. Browsers auto-close at EOF,
so today the damage is limited to that one rule. **But any CSS appended after this point — by you, by
an app, by a future merge — is swallowed by the open comment.** This is a landmine, not a bug.

---

## P0 — Liquid in a plain `.css` asset

`snippets/stylesheets.liquid` loads the file as a static asset:

```liquid
{{ 'base.css' | asset_url | stylesheet_tag: preload: true }}
```

Shopify only processes Liquid in assets named `*.css.liquid` — and this theme has **zero** of them.
So `{{ section.id }}` is emitted verbatim into the selector. And even in a `.css.liquid` file
`section` wouldn't exist: assets have no section context.

Worse than dead code — the `{{` truncates the selector and **leaks the tail as a new global rule**.
Verified with `tinycss2` on the exact pasted text:

```
#ProductInformation-                 -> kept []                (empty rule)
.group-block                         -> kept ['gap:12px']      ← GLOBAL LEAK
#variant-info-box-                   -> kept []
, #variant-info-box-                 -> kept []
p, #variant-info-box-                -> kept []
h1, #variant-info-box-               -> kept []
… h2 … h3 … h4 … h5                  -> kept []
h6                                   -> kept ['margin:0']      ← GLOBAL LEAK
> * + *                              -> dropped by browsers (selector starts with a combinator)
```

* `.group-block { gap: 12px }` — `.group-block` is the theme's universal layout wrapper
  (`snippets/group.liquid`, used in 10 files: sections, cards, header groups, product details). Every
  one of them is now forced to a 12px gap.
* `h6 { margin: 0 }` — every `<h6>` in the store, including RTE content.
* The rules you actually wanted (`#ProductInformation-…` gap, `#variant-info-box-…` margin reset) do
  **not** exist.

**The theme already shows the correct pattern.** `blocks/_product-details.liquid:132` carries this
comment and fix:

```liquid
/* The stylesheet tag in a theme block is extracted into one shared, static
   asset: Liquid is not interpolated per instance, so the section-id based
   selectors that used to live here only ever matched the first product-details
   block on the page. */
:scope [id^="variant-info-box"] { margin-top: 8px; width: 100%; }
```

Two valid options, in order of preference:

1. Put per-instance CSS in the block's own `{% stylesheet %}` tag and use
   `:scope [id^="variant-info-box"]` — already done in this theme.
2. In `base.css`, use a prefix attribute selector: `[id^='variant-info-box-']`,
   `[id^='ProductInformation-']`. Never `{{ … }}`.

---

## P0 — rules that parse fine and break the store

### 4. Desktop navigation disappears at ≥990px

```css
@media screen and (min-width: 990px) {
  .header__inline-menu, .header__navigation, .header .menu-list, .header .menu-list--inline {
    display: block !important;
  }
  .header__icon--menu, .header__menu-toggle, .menu-drawer-container { display: none !important; }
}
```

Verified against the markup:

| selector | exists? |
| --- | --- |
| `.header__inline-menu` | **no** (0 files) |
| `.menu-list--inline` | **no** (0 files) |
| `.list-menu--inline` | **no** (0 files) |
| `.header__menu-toggle` | **no** (0 files) |
| `.header__icon--menu` | yes |
| `.menu-drawer-container` | yes |

So the block **hides the real hamburger and drawer** and reveals classes that don't exist. Whether
navigation vanishes depends on `data-menu-style`, which is set by JS at runtime
(`layout/theme.liquid:137`):

```js
const isTouchDevice = 'ontouchstart' in window && navigator.maxTouchPoints > 0;
const hasReachedMinimum = overflowList && overflowList.hasAttribute('minimum-reached');
headerComponent.dataset.menuStyle = isTouchDevice || hasReachedMinimum ? 'drawer' : 'menu';
```

An iPad, or any desktop window where the menu has overflowed, is in `drawer` mode — i.e. **exactly the
tablet case this block was written to fix is the case where it deletes the navigation.** The theme's
`overflow-list` already handles "menu doesn't fit" by collapsing items into a *More* item; fighting it
from `base.css` is the wrong layer.

### 5. `--header-height` / `--header-group-height` / `--top-row-height` forced with `!important`

```css
#header-group, .header-section, #header-component {
  --header-height: 70px !important;
  --header-group-height: 70px !important;
  --top-row-height: 70px !important;
}
```

These three are **measured at runtime and written inline**:

* `layout/theme.liquid:112-119` (inline, pre-hydration, to avoid layout shift):
  `document.body.style.setProperty('--header-height', …)`, `--header-group-height`, `--top-row-height`
* `assets/utilities.js:777-782`: same three, re-measured on resize/section change — and
  `--top-row-height` is set **on the `header` element itself**, i.e. `#header-component`.

An `!important` author declaration **beats a normal inline style**, so the measurement loses. Result:

* stock rule `body:has(.header[transparent]) .content-for-layout > .shopify-section:first-child { margin-top: calc(var(--header-group-height) * -1) }` pulls the hero up by a hard-coded 70px instead of
  the real header-group height (announcement bar + header) → hero content under the header, or a gap;
* `.product-media-container.constrain-height { --viewport-offset: var(--header-height, 100px) }`
  computes gallery height from a lie;
* elements **outside** `#header-component` (e.g. `blocks/_product-details.liquid`'s
  `max-height: calc(100vh - var(--header-group-height, 0))`) still read the JS value, so the page
  mixes two different header heights.

Change header height in the editor / by editing the header's own padding — never by pinning the
variable that JS is actively measuring.

### 6. Global type nuke

```css
p, li, span, a, label, input, textarea, select, button {
  font-size: max(16px, var(--fluid-sm)) !important;
}
```

`span`, `a`, `label` and `button` are the problem. This forces **16px+ on every inline element in the
store**, which beats every typography preset because the presets set `font-size` on the *container*
(`.h1`, `.paragraph`, `.text-block`), not on the inline children:

* `<h1>` whose text is wrapped in a `<span>` (RTE output, `rte-formatter`) renders at 16px even
  though the `h1` rule is also `!important` — the child wins for that child's own box;
* prices (`product-price` renders `<bdi>`/`<span>`), `.unit-price`, `.tax-note`, badges, cart line
  quantities, slideshow counters, facet pills, footer legal text: all pinned to 16px;
* icon-only buttons inherit a 16px font box, changing their measured size.

It also **disables the theme editor's typography settings** for merchants — the sizes in
`snippets/theme-styles-variables.liquid` (`settings.type_size_h1` etc.) can no longer have any effect.

The iOS zoom-on-focus problem this was reaching for is already solved in the stock layer, correctly
and narrowly (`input, textarea, select { font-size: max(1rem, …) }` under `max-width: 1200px`).

### 7. `.svg-wrapper svg { width: 18px !important; height: 18px !important }`

This one is in a list that *starts* header-scoped and **ends with a global selector**:

```css
.header__icon svg, .header-actions__action svg, …, .svg-wrapper svg { width: 18px !important; }
```

`.svg-wrapper` is the theme's universal icon wrapper. The stock layer sizes it deliberately:
`--icon-size-2xs/xs/sm/md`, `.svg-wrapper--small`, `.icon-success`, `.icon-error`, the quantity
selector's plus/minus, the close button, carets, slideshow arrows. All of them become 18px. Icons
across the entire store — cart drawer, filters, product page, footer — are resized by a rule that was
meant to tidy up three header icons.

### 8. `html, body { overflow-x: hidden }`

Set on **both**, this makes `<body>` a scroll container. `position: sticky` descendants then stick to
the body box, which never scrolls — so sticky silently stops working: `.sticky-content`,
`.product-details.sticky-content--desktop`, the sticky header state, sticky facet panels. It also
masks the real cause (one over-wide element) instead of fixing it, and interacts badly with the
theme's View Transitions and `scroll-behavior: smooth`.

The correct fix — already in the repaired file — clips without creating a scroll container:

```css
.content-for-layout { min-width: 0; overflow-x: clip; }
```

### 9. `.slideshow-control { position: absolute; top: 50%; transform: translateY(-50%); z-index: 2 }`

`.slideshow-control` is not "the arrows". Verified in `snippets/slideshow-controls.liquid`, the same
class is on:

* the pause button (line 81) and play button (line 89),
* **every thumbnail button** (line 106, `slideshow-controls__thumbnail`),
* the arrow controls.

So all thumbnails are absolutely positioned on top of each other at `top: 50%`, and the play/pause
button is torn out of the control bar. It also collides with the stock arrow animation:

```css
@keyframes arrowsSlideIn { from { transform: translate(var(--padding-sm), 0); opacity: 0 } to { opacity: 1 } }
```

The animation's `transform` overrides the pasted `translateY(-50%)` for the duration, so arrows visibly
jump. And `z-index: 2` is a magic number in a theme that has a documented layer scale
(`--layer-flat: 1 … --layer-temporary: 20`).

### 10. `.cart-bubble { z-index: 999 }`

The theme's layer tokens top out at `--layer-temporary: 20`, with `--layer-overlay: 16` and
`--layer-menu-drawer: 18`. `999` puts the cart badge **above modals, drawers and dialogs**. Use
`var(--layer-raised)` (or `--layer-heightened`) — the badge only needs to beat its own icon.

---

## P1 — dead code (verified selector-by-selector)

These class selectors appear in the appended layer and match **nothing** in this theme:

| Selector in the pasted CSS | Real class in this theme |
| --- | --- |
| `.header__inline-menu` | `.header-menu` (`blocks/_header-menu.liquid:154`) |
| `.header__menu-toggle` | `.header__icon--menu` |
| `.menu-list--inline`, `.list-menu--inline` | `.menu-list`, `.menu-list__list` |
| `.headerrow` | `.header__row` (`--top` / `--bottom`) |
| `.headercolumns` | `.header__columns` |
| `.headercolumn` | `.header__column` (`--left` / `--center` / `--right`) |
| `.headerinline-menu` | `.header-menu` |
| `.header-navigation` | `.header__navigation` |
| `.menu-listlink` | `.menu-list__link` |
| `.product-gridcard` | `.product-grid__card` |
| `.product-information__text` | `.product-details` |
| `.product-information__content` | `.product-information__grid` / `.product-information-content` |
| `.product__title`, `.product-title` (PDP) | `.view-product-title`, or the `product-title` block's `.text-block` |
| `.product__description` | `#variant-info-box-…`, `rte-formatter.text-block` |
| `.product__info-container` | `.product-information` |
| `.product__price` | `product-price` (custom element), `.price` |
| `.variant-product-description` | — (does not exist) |

That's the whole "STICKY HEADER MENU ALIGNMENT FIX" block (~80 lines), the whole
"Tablet-responsive header menu fix" block, and most of the "product text/content padding" block.
They are `!important`-laden no-ops: they add specificity noise, they mislead the next person reading
the file, and they cost bytes on every page view.

Also dead:

* `.text-block--AK3FBK2tiR0ZtVkFJc__text_GnyQiN` (four separate rules). Two problems: a hard-coded
  per-store block ID (Shopify: *"The ID is dynamically generated by Shopify and is subject to change.
  You should avoid relying on a literal value of this ID."*), and the class format doesn't even match
  this theme — `snippets/text.liquid:85` emits `text-block--{{ block.id }}`, with no
  `{{ section.id }}__` prefix. That format is from an older Horizon.
* `#ProductInformation-{{ section.id }}`, `#variant-info-box-{{ section.id }}` — see P0 §3.
* `:root { --letter-spacing--display-loose: 0.03em; … }` labelled *"fix letter-spacing variable
  typo"*. No typo: `snippets/theme-styles-variables.liquid:282-292` already defines
  `--letter-spacing--{display,heading,body}-{tight,normal,loose}` with **exactly those values**. The
  block re-declares the theme's own tokens and, being on `:root` later in the cascade, would freeze
  them against any future theme change.
* `[class*='product_title']` — **this one is alive, but fragile.** `block.id` returns the JSON key,
  and this theme's templates key title blocks `product_title_9KGj7G` / `product_title_NzQUxN`
  (`templates/404.json`, `templates/collection.json`), so `text-block--product_title_NzQUxN` does
  match. But in the pasted version the selector was **unscoped**, so it also clamped the PDP title,
  cart line-item titles and quick-add titles to 2 lines at `1.3em` with `max-height` — titles were
  being truncated in places nobody intended. Scope it to `.product-card` / `.product-grid__card`.

---

## P1 — the layer contradicts itself

Later blocks undo earlier ones, so a large share of the appended CSS is dead *by design*:

| Earlier rule | Later rule that wins | Net |
| --- | --- | --- |
| `.product-information__media > media-gallery { padding-inline: clamp(12px,3vw,32px) !important }` | `… > media-gallery { padding-inline: 0 !important; margin-inline: 0 !important }` | first block dead |
| `.product-information__text, … { padding-left/right: clamp(12px,3vw,32px) !important }` | same selectors `{ padding-left/right: 0 !important }` | first block dead |
| `.content-for-layout, main, … { padding-left/right: var(--global-safe-inline) !important }` (16px gutters) | `#header-group, .header-section, #header-component { --page-margin: 0 !important }` + `.header__columns { padding: 12px }` | page content gets **16px + the stock `--page-margin` 16px = 32px**, header gets 12px → header and content misaligned on mobile; full-bleed sections (hero, marquee) are no longer full-bleed |
| `.text-block--AK3F…` `--max-width: 22ch` → `18ch` → `100% !important` | last one | first two dead |
| `.text-block--AK3F… h1` `line-height: clamp(1.02,…)` → `1.33 !important` → `1.25 !important` | last one | first two dead |
| `a.header-logo { padding: 0 !important }` | `a.header-logo { padding: 6px 0 !important }` (8px at ≥990px) | first dead, and both are duplicated with `.header-logo__image` |
| `:root { --fluid-xs/sm/base/lg/xl }` + `!important` type rules | `:root { --fluid-text-body/h1…h6/button }` + non-`!important` type rules | **two competing fluid type systems**; the second loses almost everywhere because the first used `!important` |
| `body { line-height: 1.6 }` + `p,li,td…{ line-height: 1.6 }` + `.rte p { line-height: 1.6 }` + TYPO KIT `line-height: var(--line-height--body-normal)` (=1.4) | — | four line-height systems, three of them `!important` |
| `.variant-option__button-label` unselected `#ffffff` | the mangled duplicate (P0 §1) | both wrong |

Plus four separate `:root {}` blocks in the appended layer, on top of the theme's own.

## P1 — hard-coded colours ignore the colour-scheme system

`snippets/color-schemes.liquid` emits per-scheme `--color-background`, `--color-foreground`,
`--color-primary-button-*`, `--color-variant-*`. The appended layer overrides them with literals:

* `#ffffff` / `#000000` for size buttons — in an inverse scheme the unselected button is white with
  `var(--color-variant-text)` (light) text: **invisible**.
* `.menu-list__link { color: rgb(110 88 65) }` — a brand brown hard-coded into the nav; any dark
  scheme makes the menu unreadable, and a rebrand means editing CSS instead of the editor.
* `.sticky-add-to-cart__bar { background: rgb(var(--color-background-rgb) / 0.96) }` — this one is
  fine (`--color-background-rgb` *is* emitted, `snippets/color-schemes.liquid:24`), but the shadow
  `rgb(0 0 0 / 0.06)` and `#fff` zoom-dialog background are not.

Use the tokens; if a token is missing, add it to `snippets/theme-styles-variables.liquid` once.

## P1 — behaviour switched off with CSS instead of the setting that owns it

```css
.product-information .sticky-content, … { position: static !important; top: auto !important; }
```

`blocks/_product-details.liquid` already gates this on a merchant setting:

```liquid
{% if block_settings.sticky_details_desktop %} sticky-content--desktop{% endif %}
```

Turn it off in the editor. Overriding it in CSS leaves the JS that measures and toggles sticky state
running against a layout that no longer responds — and `!important` means the setting can never be
re-enabled without another CSS edit.

Same category: `object-fit: contain !important` on product media overrides the merchant's
"media fit" setting (stock: `.product-media-container.media-fit { --product-media-fit: cover }`) and
letterboxes every product image; `[slot='more'] { display: none !important }` would hide the
overflow-list *More* control (harmless here only because `snippets/variant-swatches.liquid:112`
renders its own `+N` pill).

---

## P2 — maintainability

1. **Append-only editing.** ~1,000 lines were added to the bottom of a 5,000-line stock file in
   ~13 unrelated batches, several with the same intent and contradictory values. Nobody can now tell
   which rule is live without a parser.
2. **Orphan assets.** `assets/base-override.css`, `assets/fix-duplicates.css`,
   `assets/layout-fix.css`, `assets/section-render-fix.css` are referenced **nowhere** (0 hits
   repo-wide). Only `base.css` and `overflow-list.css` are loaded. They read like previous attempts at
   this same fix and will confuse the next person.
3. **`!important` as a default.** The stock layer uses it 19 times in 5,000 lines, always with a
   `stylelint-disable` comment explaining why. The appended layer used it in almost every block. Once
   everything is `!important`, specificity is the only lever left — which is how you end up with
   `.product-grid__card.product-grid__card` and `.tax-note.tax-note.tax-note`.
4. **Physical properties in a logical-property theme.** `padding-left/right`, `margin-left`,
   `top/right/bottom/left` throughout, while the stock layer and the design layer use
   `padding-inline`, `inset-inline`, `margin-block`. Breaks RTL and reads inconsistently.
5. **Breakpoints invented per block.** `749px`, `750px`, `989px`, `990px`, `1199px`, `1200px` are all
   used, sometimes in the same feature (the menu "fix" switches at 989/990/1199/1200). The theme's
   three real tiers are **640 / 750 / 990**.
6. **No reduced-motion guard.** The appended layer adds animations and transitions with no
   `@media (prefers-reduced-motion: reduce)` opt-out; the stock layer is disciplined about this.
7. **`min-height`/`max-height` in `em` on clamped text** (`calc(1.3em * 2)`) plus `!important` —
   this hard-codes a line-height into the box, so the moment the preset's line-height changes the
   clamp shows half a line.

---

## What was fixed in this repo

`assets/base.css` = **stock layer (lines 1–~5,070, untouched)** + **one DESIGN SYSTEM LAYER**
(`/* ====== DESIGN SYSTEM LAYER (store customisations) ====== */` → EOF) that replaces the entire
appended hack layer. Verified state of the delivered file:

```
postcss parse: OK   (5,991 lines, 150.1 KB)
parse errors:       0
unterminated comments: 0
unbalanced braces:  0
!important in the design layer: 0        (19 in the whole file, all in the stock layer)
duplicate selectors: 13 — all legitimate breakpoint variants, no true duplicates
```

The design layer keeps every *intent* from the pasted hacks and drops every defect:

| Pasted intent | Where it lives now |
| --- | --- |
| Fluid, readable type; body 15→16px; tighter headings | §2 Typography — drives the theme's own `--font-h*--size` / `--font-paragraph--size` tokens, so the editor still works |
| No horizontal overflow | §1 `.content-for-layout { min-width: 0; overflow-x: clip }` (sticky keeps working) |
| Compact header, full-bleed background, padded content | §5 — fluid `--header-padding`, `padding-inline: var(--page-margin)` under 750px, no pinned `--header-height` |
| Logo sizing | §5 — `max-block-size: var(--header-logo-image-height-mobile, 2.5rem)` / `…-height, 3rem)` |
| Header icons | §5 — scoped to `.header__icon svg` etc. at `1.375rem`; **`.svg-wrapper svg` is not touched** |
| Premium menu links | §5 — `.menu-list__link` with tokens, `min-block-size: var(--touch-target)`, `aria-current` state, drawer variant |
| Cart bubble not cropped | kept, de-duplicated, `font-weight: 600` (the duplicate rule that dropped `width: max-content` and the `!important` pair was removed) |
| Product card title clamp | §6 — scoped to `.product-card` / `.product-grid__card`, now with a **stable** hook (below) |
| Big price, small compare-at | §7 — `.product-details product-price .price` / `.compare-at-price` / `.tax-note` |
| Product media responsive | §7 — real classes, `aspect-ratio` from the gallery tokens |
| Size buttons | §7 — `var(--color-background)` / `var(--color-primary-button-background)`, radius from the editor |
| Sticky add-to-cart bar | §8 — full component, `env(safe-area-inset-bottom)`, `--layer-sticky`, tokens not hex |
| Motion | §10 — transform/opacity only, with a `prefers-reduced-motion: reduce` block that strips all of it |

### Changes made in this pass

1. **`blocks/product-title.liquid`** — pass a stable class to the text snippet:
   ```liquid
   {% render 'text', class: 'product-title-block', fallback_text: product_title, block: block %}
   ```
   `snippets/text.liquid` documents `@param {string} [class]` for exactly this. The card-title clamp
   now keys on `.product-title-block` **and** keeps `[class*='product_title']` as a fallback, and uses
   `> *` instead of `p` so it still works when the merchant's preset renders a heading.
2. **`assets/base.css` §2** — sentinel fallbacks on the heading-size `min()`s:
   `min(var(--font-size--h1, 999rem), var(--text-h1))`. Those tokens are real (generated by the Liquid
   loop at `snippets/theme-styles-variables.liquid:311/388`), but if one is ever missing the whole
   declaration invalidates and **every h1–h4 collapses to the inherited body size**. Now it can't.
3. **`assets/base.css` §7** — removed three rules that could never match
   (`.product-information__text`, `.product-information__content`, `.product-title h1`), added
   `.product-information__grid` to the `min-inline-size: 0` rule that prevents long titles blowing out
   the grid track, and documented why they were deleted rather than retargeted.

### Two decisions I deliberately did **not** make for you

Both are rules that were dead, so "fixing" them would silently change your live layout:

* **PDP title size.** The dead rule wanted `font-size: var(--text-h3)` (20→28px); your pasted layer
  wanted `clamp(2rem, 1.35rem + 2.8vw, 3.75rem)` (32→60px). Today the title renders from
  `--font-h1--size` (up to 44px). Pick one and use the live hook:
  ```css
  .product-details :is(.product-title-block, [class*='product_title']) > * { font-size: var(--text-h3); }
  ```
* **Desktop gutter between media and details.** The dead `@media (min-width: 990px)` rule wanted
  `padding-inline-start: var(--space-8)` on the details column. The grid already supplies `--gap`
  (`snippets/product-information-content.liquid:82`), so adding it back double-spaces. If you want the
  extra 32px, raise `--gap` on the section instead of padding the column.

---

## Rules of the road for this file

1. **Never edit the stock region.** Everything custom goes below the `DESIGN SYSTEM LAYER` banner, so
   a theme update can be diffed instead of archaeologically excavated.
2. **One declaration per property per layer.** If the design layer must replace a stock value, say so
   in a comment (the file already does this for `.cart-bubble`, `--quantity-selector-width` and
   `.variant-option__button-label`).
3. **No Liquid in `assets/*.css`.** Per-instance CSS belongs in the block's `{% stylesheet %}` with
   `:scope`; global CSS uses `[id^='…']` / `[class*='…']` prefix matches.
4. **Tokens, not literals.** Colour → `--color-*`; spacing → `--space-*`; type → `--text-*` /
   `--font-*--size`; stacking → `--layer-*`; radii → `--style-border-radius-*`; touch →
   `--touch-target`.
5. **`!important` needs a `stylelint-disable` comment and a reason.** Budget: the stock layer has 19.
   The design layer has 0. Keep it that way.
6. **Breakpoints: 640 / 750 / 990 only.**
7. **Logical properties** (`padding-inline`, `margin-block`, `inset-inline`) to match the theme.
8. **Any new motion gets a `prefers-reduced-motion: reduce` opt-out** in §10.
9. **Verify a selector exists before you style it** — `grep -rn "my-class" --include='*.liquid' .`
   takes two seconds; 17 of the pasted selectors would have been caught that way.
10. **Delete the orphan assets** (`base-override.css`, `fix-duplicates.css`, `layout-fix.css`,
    `section-render-fix.css`) once you've confirmed nothing local references them.
