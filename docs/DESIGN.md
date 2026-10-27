# PORT visual design

[Figma foundation board](https://www.figma.com/design/UcQWJ0RjgsgaW9O5YgJjbC). Editable palette and typography direction; full application screens are implemented directly in React. Figma board uses Inter as a concept font; shipped Windows UI uses locally installed Segoe UI Variable/Segoe UI. No font downloads.

Palette: canvas #101116, surfaces #191A21, cards #20212A, text #F5F5F7, secondary #A0A0AA, accent #A78BFA. Restrained lavender focus and actions; original muted green, blue and ochre landscape art differentiates collection parts. UI theme follows Windows only when selected. Branding, curved 12–16px surfaces and editorial typography establish PORT's identity without copying another launcher.

Desktop: fixed 242px navigation, 83px toolbar, 42px content gutter; hero establishes hierarchy, 3-column collection cards and quiet supporting panels. At 800px the sidebar/gutters tighten; at narrow browser sizes a labelled accessible icon rail and single-column cards take over. Native minimum size 800×600. Content scrolls inside main, leaving navigation stable.

Segoe UI body; Georgia collection wordmark; no licensed game logo asset. Geometric SVG landscapes in Landscape.tsx and the vector icon in public/port-icon.svg are original placeholder artwork authored for this project, not depictions taken from games. Replace only with artwork whose redistribution rights are documented.

States: persistent selected navigation, keyboard outlines, search empty results, offline notice, startup skeleton, accessible Radix dialogs with focus trapping/Escape, feedback toasts, destructive settings reset confirmation. Download preview stays at 0%, unknown size/speed, with disabled controls and an explicit mock label. Library is empty until real installation exists. Install CTA opens a roadmap dialog and never pretends success.

Motion: 160ms page entrance, subtle cover scale and button hover, prefers-reduced-motion support plus saved user setting. No auto-scrolling carousel, blinking promotion or fake loading progress.
