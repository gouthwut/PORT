# PORT// — Stage 18: Premium Launcher UI & Liquid Glass

Date: 2026-10-29  
Status: Complete (Local Implementation & Verification)  
Design Direction: **A / Premiere Compact + Apple-inspired Liquid Glass + Cinematic Gaming UI**

---

## 1. Executive Summary

Stage 18 realizes the transition from the Stage 17A design exploration into the real production desktop launcher React/CSS codebase in `C:\PORT`.

Instead of generic plastic translucent divs with plain 1px white borders, Stage 18 implements an **Apple-inspired Liquid Glass material system** combined with the cinematic game-forward composition of **Direction A (Premiere Compact)**.

### What Was Delivered:

1. **Master Liquid Glass System (`src/hub/stage18-liquid.css`)**:
   - Multi-layer specular reflections (`inset 0 1px 1px rgba(255, 255, 255, 0.42)`, `inset 0 -1px 1px rgba(0, 0, 0, 0.40)`).
   - High-chroma saturation boost (`backdrop-filter: blur(12px) saturate(155%) brightness(103%)`), ensuring underlying game art stays vivid rather than turning dull/muddy gray.
   - Directional light sheen (`125deg` diagonal reflection gradient pseudo-element).
   - Dynamic hover illumination (violet/ice atmospheric rim lighting).
   - Comprehensive `@supports not (backdrop-filter)` and `@media (prefers-reduced-motion)` fallbacks for older WebView2 environments.

2. **Home Screen (`HubLanding.tsx` & `stage18-liquid.css`)**:
   - Floating glass navigation rail/sidebar (`.port-sidebar`) with curved pill indicator.
   - Liquid search capsule (`.port-search-bar`) centered in top bar with interactive focus ring.
   - Cinematic 320px Hero banner (`.port-hero`) with integrated text glass plate (`.port-hero-copy`) positioned comfortably below search bar.
   - Real CMS projects displayed as **Premiere-style wide game cards** (`.port-project-card`):
     - Cinematic screenshot backdrop (`media.gallery[0]`).
     - Floating inset 3D box art (`.port-project-inset-cover`).
     - Platform pill badge (`Xbox 360`, `N64`, etc.).
     - Frosted bottom caption bar displaying project title, engine/port technology, and availability status.
   - Verified **first-screen density**: at 1280×720, Hero and the top edge of game cards are simultaneously visible without scrolling (card Y: 462px < 720px).

3. **Catalog Showcase**:
   - Compact glass filter pill bar with active glow states.
   - Responsive multi-column grid with deep glass cards, hover elevation, and immediate visual distinction between available and coming-soon ports.
   - Intact search, console filtering, sorting, and favorites toggle.

4. **Project Detail Page (Cinema Hero & Liquid Materials)**:
   - Full-bleed panoramic hero with real CMS artwork.
   - Prominent Liquid Glass Download button (amber for approved builds, violet fallback) with specular sheen.
   - Screenshot gallery with glass thumbnails and fullscreen overlay viewer.
   - Collapsible installation instructions (`<details id="project-install">`) and structured system requirements.

5. **Downloads Center & Settings**:
   - Unified glass cards, luminous glowing progress bars, and clean zero-state typography.
   - Glass language picker and theme toggles.

6. **Safety & Stability**:
   - Zero changes to Rust backend, SQLite schema 4, Tauri IPC, CMS API contracts, or Bloodborne routines.
   - All tests passing: TypeScript check (`tsc --noEmit`), Playwright visual suite (5/5), active Stage 16, Stage 15, and API v2 test suites.

---

## 2. Liquid Glass Material Architecture

### Tokens & Variables

```css
:root {
  --lg-glass-fill: rgba(18, 14, 28, 0.65);
  --lg-glass-fill-hover: rgba(26, 20, 40, 0.76);
  --lg-glass-fill-dense: rgba(14, 11, 22, 0.86);
  --lg-glass-border-specular: rgba(255, 255, 255, 0.22);
  --lg-glass-border-rim: rgba(255, 255, 255, 0.08);
  --lg-glass-shadow:
    0 16px 36px -8px rgba(0, 0, 0, 0.65), 0 4px 12px rgba(0, 0, 0, 0.4);
  --lg-glass-blur: blur(12px) saturate(155%) brightness(103%);
  --lg-sheen: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0.16) 0%,
    rgba(255, 255, 255, 0.04) 32%,
    transparent 68%
  );
}
```

### Optical Principles Applied:

- **No Flat White Outlines**: Instead of a crude 1px solid white stroke, elements use a dual-inset box-shadow to simulate thickness (top specular edge + bottom ambient shadow) paired with a sub-pixel semi-transparent border.
- **Surface Sheen Sweep**: Pseudo-elements (`::before`) cast a delicate 125-degree soft white gradient across the upper third of glass capsules, creating physical glass curvature.
- **Underlying Color Vibrancy**: `backdrop-filter: saturate(155%)` prevents the blur from washing out saturated game screenshots.
- **Ambient Hover Light**: Interactive cards and buttons transition on hover to cast an ethereal violet-tinted glow (`rgba(175, 145, 255, 0.24)`).

---

## 3. Visual Verification & Evidence Inventory

Generated Playwright visual evidence is located in `.local/evidence/stage18/`:

| File                            | Viewport | Content / Assertion Verified                                                                                  |
| ------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `01-home-1280x720.png`          | 1280×720 | First-screen density: Hero and top edge of cards visible (Y: 462px). Clean layout without search bar overlap. |
| `02-home-1600x900.png`          | 1600×900 | High-res desktop layout, wide game cards, floating glass sidebar.                                             |
| `03-home-800x600.png`           | 800×600  | Compact layout density: zero horizontal overflow (`scrollWidth <= clientWidth`).                              |
| `04-catalog-1280x720.png`       | 1280×720 | Catalog grid with filter pills, real Sonic and Zelda project cards.                                           |
| `05-catalog-1600x900.png`       | 1600×900 | Expanded catalog grid.                                                                                        |
| `06-catalog-800x600.png`        | 800×600  | Compact catalog with stacked filter controls, no clipping.                                                    |
| `07-project-sonic-1280x720.png` | 1280×720 | Sonic Unleashed Recompiled: Cinema hero, platform badges, liquid glass download plate, gallery.               |
| `08-project-sonic-1600x900.png` | 1600×900 | Panoramic cinema hero, specs table, collapsible installation notes.                                           |
| `09-project-zelda-1280x720.png` | 1280×720 | Zelda 64 Recompiled detail view.                                                                              |
| `10-downloads-1280x720.png`     | 1280×720 | Downloads Center with glass summary cards, clean empty state.                                                 |
| `11-settings-1280x720.png`      | 1280×720 | Settings screen with glass sections and language selectors.                                                   |
| `12-home-card-hover.png`        | 1280×720 | Interactive card hover: scale elevation, violet specular halo, sheen brightening.                             |
| `13-home-fallback.png`          | 1280×720 | Fallback mode (`.no-backdrop-filter`): solid deep-tone container backgrounds with 100% legibility.            |

---

## 4. Test & Quality Checklist

- [x] `npx tsc --noEmit` — 0 errors.
- [x] `npm run build` — Production client build passed (10.32s).
- [x] `cargo check --manifest-path src-tauri/Cargo.toml` — Finished dev profile in 14.79s without warnings or errors.
- [x] `npx playwright test tests/stage18-visual.spec.ts` — 5 of 5 tests passed (28.0s).
- [x] `npx playwright test tests/stage16.spec.ts` — 5 of 5 tests passed.
- [x] `npx playwright test tests/stage15.spec.ts` — 8 of 8 tests passed.
- [x] `npx playwright test tests/hub-api-v2.spec.ts` — 15 of 15 tests passed.
- [x] `npx playwright test tests/stage14b-project.spec.ts` — 2 of 2 tests passed.
- [x] `npx playwright test tests/titlebar.spec.ts` — 4 of 4 tests passed.
- [x] First-screen density verified: At 1280×720, Hero and start of project cards are visible without scrolling.
- [x] No horizontal overflow across all viewports (`1280×720`, `1600×900`, `800×600`).
- [x] Legacy code, dirty work, SQLite schema 4, and user data completely preserved.
