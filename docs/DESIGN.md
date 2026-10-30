# PORT Visual Design System

PORT features a bespoke **Dark Violet Liquid Glass** interface designed specifically for modern Windows environments (Windows 10 & 11).

---

## 1. Visual Aesthetics & Material

- **Dark Aesthetic**: Deep charcoal and midnight tones designed for focused, cinematic browsing.
  - Canvas: `#0B0911`
  - Secondary surface: `#120E1D`
  - Card & panel: `#221A33`
  - Text: `#F4F0FA`
  - Secondary text: `#AEA5BE`
- **Violet Accent**: Vibrant violet (`#8F55F5`) and focused lilac (`#A782FF`) deliver high-contrast interactive elements and visual indicators.
- **Translucent Depth & Liquid Glass**: Subtle backdrop blur, hairline borders, inset highlights, and soft layered shadows evoke native Windows glass materials.

---

## 2. Typography

PORT packages offline variable typography with complete Latin and Cyrillic character sets under the SIL Open Font License 1.1:

- **Manrope Variable**: Distinctive geometric sans-serif for project titles, hero banners, and section headings.
- **Inter Variable**: Highly legible interface font for body text, technical specifications, and metadata tables.

Both fonts are bundled locally with zero external network requests.

---

## 3. Responsive Layout & Accessibility

- **Responsive Adaptability**: The interface adapts across desktop resolutions down to an 800×600 compact mode.
- **Accessibility**:
  - Full keyboard navigation across all views, dialogs, and project cards.
  - Radix UI primitives provide compliant ARIA roles, focus management, and keyboard dismissal.
  - High contrast readability with at least 4.5:1 text-to-background contrast ratios.
  - Respects the operating system's `prefers-reduced-motion` setting, alongside an explicit in-app reduced motion toggle.
