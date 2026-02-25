# PUDA Workflow Engine - Development Guidelines

## Bilingual Compliance (MANDATORY)

The citizen app serves users in English + Hindi/Punjabi. All user-visible text must follow these rules:

### Use `<Bilingual tKey="..." />` for:
- **Field labels** (`<Field label={<Bilingual tKey="..." />}>`)
- **Section headings** (`<h2>`, `<h3>`, etc.)
- **Card titles** and **page titles**
- **Detail-view labels** (e.g. `<span className="...-label">`)
- **Navigation labels** (renders stacked EN + regional language)

### Use `t("...")` for:
- **Button text** (short, action-oriented)
- **`<option>` values** inside `<Select>` (native elements don't support JSX children)
- **Placeholder attributes** (string-only props)
- **Alert/error/success messages**
- **Dynamic interpolation** (`t("key", { count, name })`)
- **Filter chip labels** (small inline text)

### Locale files
Every new i18n key MUST have entries in all three locale files:
- `apps/citizen/src/locales/en.ts`
- `apps/citizen/src/locales/hi.ts`
- `apps/citizen/src/locales/pa.ts`

Key naming convention: `section.descriptor` (e.g. `complaints.subject`, `nav.profile`)

### Pre-commit verification

Before committing changes to any citizen app component, run:

```bash
grep -n 'label={t(' apps/citizen/src/*.tsx
```

Zero matches = compliant. Any match is a `<Field label={t("...")}>` anti-pattern that must be converted to `<Bilingual>`.

## i18n General Rule

ALL user-visible text in the citizen app MUST use i18n keys. Never hardcode English strings in JSX.

## Code Style

- Citizen app: `apps/citizen/src/`
- Officer app: `apps/officer/src/`
- Shared UI components: `packages/shared/`
- API (Fastify): `apps/api/`
- Prefer editing existing files over creating new ones
- Citizen tsconfig errors on `import.meta.env` are expected; use `vite build` not raw `tsc`

---

## Mobile-First Responsive Design (MANDATORY)

The citizen app is used primarily on smartphones in the field. All UI work MUST follow these rules. Violations cause real usability problems — users with low-end Android devices, spotty connections, and thick fingers.

### 1. Breakpoints & Media Queries

**Defined tokens** (design-system.css):
| Token | Value | Usage |
|-------|-------|-------|
| `--bp-mobile` | `22.5rem` (360px) | Small phone edge cases only |
| `--bp-tablet` | `48rem` (768px) | **Primary mobile/desktop boundary** |
| `--bp-desktop` | `80rem` (1280px) | Wide desktop adjustments |

**Rules:**
- Write **mobile-first CSS** — base styles are for phones, then `@media (min-width: 48rem)` adds desktop enhancements
- Use `max-width` media queries ONLY inside the existing `@media (max-width: 48rem)` block in design-system.css for targeted mobile overrides
- **Never use px in breakpoints** — always use `rem` (e.g. `48rem` not `768px`)
- Never invent ad-hoc breakpoints (`600px`, `900px`). Use the three tokens above

### 2. Touch Targets

**Minimum interactive target: `2.75rem` (44px) — WCAG 2.5.5 Level AA**

- All `<button>`, `<a>`, clickable `<div>` elements MUST have `min-height: 2.75rem` and adequate width
- On mobile (`max-width: 48rem`), primary action buttons are `min-height: 3rem` (48px)
- Icon-only buttons need explicit `width` + `height` (not just font-size)
- Adjacent touch targets must have `>= 8px` gap to prevent mis-taps
- Read-only badges/chips below 44px are acceptable only if they are NOT interactive

**Checklist before shipping any interactive element:**
```
□ min-height >= 2.75rem (or 3rem on mobile for primary actions)
□ padding sufficient for comfortable tap area
□ gap between adjacent targets >= 0.5rem
□ has :active state (not just :hover)
```

### 3. Hover vs Touch — Dual Interaction States

- **Every `:hover` style MUST have a corresponding `:active` style** — hover is invisible on touch devices
- Never gate functionality behind hover (tooltips, menus, expanded info)
- Hover is an enhancement, not a requirement — the `:active` or click/tap path must work independently
- Long-press is unreliable across devices — avoid it for core functionality

### 4. Safe Area Insets (iOS Notch / Home Indicator)

The viewport uses `viewport-fit=cover`. All fixed/sticky elements MUST respect safe areas:

```css
/* Top-fixed: */ padding-top: env(safe-area-inset-top);
/* Bottom-fixed: */ padding-bottom: env(safe-area-inset-bottom);
/* Use max() when you also need minimum padding: */
padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
```

**Elements that need safe-area handling:**
- App bar (top)
- Bottom navigation bar (bottom)
- Sticky form action bars (bottom)
- Modal/sheet footers (bottom)
- Drawer header/footer (top + bottom)
- Toast container (bottom)
- Fullscreen overlays (all sides)

### 5. Viewport Units

- **Use `dvh`** (dynamic viewport height), NEVER `vh` — `100vh` overflows on mobile when the browser chrome (URL bar) is visible
- `dvh` adjusts dynamically as the URL bar appears/disappears
- For width-relative sizing, `vw` is fine inside `clamp()` but never as a standalone dimension (causes horizontal scroll)

### 6. Typography

- **Use `clamp()` for headings:** `font-size: clamp(min, preferred, max)` — scales fluidly between breakpoints
- Body text: fixed `rem` sizes are fine (0.875rem–1rem)
- **All form inputs MUST be `font-size: 1rem` (16px) or larger on mobile** — anything smaller triggers iOS Safari auto-zoom on focus
- Line-height: `1.5` for body, `1.2` for headings
- Long text containers: `max-width: 65ch` for readability

### 7. Layout Patterns

**Grids that collapse on mobile:**
```css
/* Base (mobile): single column */
.my-grid { display: grid; gap: var(--space-4); }

/* Desktop: multi-column */
@media (min-width: 48rem) {
  .my-grid { grid-template-columns: repeat(2, 1fr); }
}
```

**Tables → Card layout on mobile:**
- Desktop: standard `<table>` with headers
- Mobile: hide `<thead>`, convert rows to cards using `display: grid` + `td::before { content: attr(data-label); }` for labels
- Every `<td>` must have a `data-label` attribute for this to work

**Sticky action bars:**
- Form submit buttons: `position: sticky; bottom: 0` with safe-area padding
- Keeps primary action visible above keyboard / bottom nav

**Containers:**
- Page wrapper: `width: min(100%, 82rem); margin: 0 auto`
- Modals: `width: min(100%, 36rem)` — `min()` prevents overflow
- Never use fixed `width: 600px` — always use `min()` or `max-width`

### 8. Modals & Sheets

**Mobile (`max-width: 48rem`):**
- Modals become bottom sheets: `border-radius: lg lg 0 0`, `width: 100%`, anchored to bottom
- `max-height: 90dvh` with `overflow-y: auto`
- Sticky action buttons at sheet bottom with safe-area padding
- Backdrop: `align-items: flex-end` to push sheet to bottom

**Desktop:**
- Centered modal with `border-radius` on all corners
- Width: `min(100%, 36rem)` — never full-width on desktop

### 9. Spacing & Sizing

- **Always use design tokens** — `var(--space-1)` through `var(--space-8)`, never hardcoded `px` or bare `rem` values
- **Never use inline `style={{ padding: "2rem" }}`** for layout — use CSS classes with tokens
- Exception: truly one-off layout adjustments can use inline `style` with CSS variable references: `style={{ gap: "var(--space-4)" }}`
- Border radius: `var(--radius-sm)` / `var(--radius-md)` / `var(--radius-lg)` / `var(--radius-xl)`
- Box shadows: `var(--shadow-xs)` / `var(--shadow-sm)` / `var(--shadow-md)`

### 10. Overflow & Scrolling

- **Prevent horizontal scroll at all costs** — users cannot discover horizontal scroll on touch devices
- All flex containers should have `min-width: 0` on children that might overflow
- Long words/URLs: `word-break: break-word` or `overflow-wrap: break-word`
- Scrollable containers: always add `overflow-x: auto` (not `scroll` — avoid persistent scrollbar)
- Monospace text (ARNs, complaint numbers): add `word-break: break-all` on mobile

### 11. Text Truncation

- Single-line truncation: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` + explicit width/max-width
- Bilingual labels in tight spaces (bottom nav, chips): ensure `.bilingual__secondary` has truncation or reduced `font-size`
- Detail values / descriptions: use `word-break: break-word` instead of truncation — content matters more than layout

### 12. Images & Media

- All images: `max-width: 100%; height: auto` (never a fixed width that could overflow)
- Thumbnails: use `aspect-ratio` + `object-fit: cover` for consistent sizing
- Preview/fullscreen images: `max-height: 70dvh` to leave room for chrome
- Evidence grids: `grid-template-columns: repeat(auto-fill, minmax(100px, 1fr))`

### 13. Forms on Mobile

- **Single column by default** — two-column form layouts only at `min-width: 48rem`
- Labels above inputs (stacked), never beside them on mobile
- Primary submit button: `width: 100%` on mobile
- Sticky form actions at bottom so submit is always reachable
- Input types matter: use `type="tel"` for phone, `type="email"` for email, `inputMode="numeric"` for OTP/PIN — triggers the right mobile keyboard
- Autofill-friendly: proper `name` and `autocomplete` attributes

### 14. Accessibility in Responsive Context

- **Focus visible:** `outline: 3px solid var(--color-focus)` desktop, `2px` mobile (already set globally)
- **Skip links:** every page view must have a skip-to-main link
- **aria-expanded** on toggles (drawer, dropdown, accordion)
- **aria-pressed** on filter chips / toggle buttons
- **aria-label** on icon-only buttons (hamburger, close, avatar)
- **Reduced motion:** respected via `@media (prefers-reduced-motion: reduce)` + `[data-reduce-motion="true"]` — both already global in design-system.css. Never add animations that bypass these
- **Semantic HTML:** use `<button>` for actions, `<a>` for navigation, `<nav>` for nav regions — never `<div role="button">`

### 15. Offline & Network Resilience

- Disable data-mutation buttons when `isOffline` is true
- Show a visible banner/indicator when offline — don't just silently disable things
- Cache API responses with `readCached`/`writeCached` — show stale data with a timestamp rather than an empty screen
- Toast messages for network errors must be distinguishable from server errors

### Pre-commit Responsive Checklist

Before committing any UI change, verify:

```
□ All new interactive elements have min-height >= 2.75rem
□ No hardcoded px breakpoints — using rem tokens only
□ No new `100vh` usage — using dvh instead
□ All new fixed/sticky elements have safe-area insets
□ Every :hover has a corresponding :active state
□ Form inputs are >= 16px (1rem) font-size on mobile
□ No horizontal overflow on 320px-wide viewport
□ New modals/sheets use bottom-sheet pattern on mobile
□ Spacing uses design tokens, not hardcoded values
□ Bilingual labels render without overflow in tight spaces
```
