# Stage 18E — universal banner support

2026-10-29. Local frontend change following Stage 18D (`1ee4771`).

Home and catalog keep a single ProjectCard composition and equal dimensions for
banner, gallery, cover-only and missing-media states. The media region no longer
switches a cover-only project into a smaller row. Shared fixed text/action rows
prevent shorter descriptions or absent images from changing card height. Long
titles occupy at most two lines; the full accessible project label is retained.
Portrait covers use contain with padding inside the same large media region.
Existing Gemini Liquid Glass, badges, favorite action and navigation are retained.

## Optional media.banner contract

No CMS/API change was made. The existing v2 detail parser already accepts optional
`project.media.banner` as a string. It normalizes missing/invalid input to an empty
string in MediaSet, so old records stay valid. The client retains the existing
trusted immutable HTTPS origin/path, SHA-256, byte-limit and image-decode checks.
Arbitrary external image URLs and descriptor objects are not accepted. Future CMS
banners must use the same immutable media pipeline as cover/screenshots.

Selection is now banner, then optional hero, then a suitable gallery frame,
then original portrait cover composition, then PORT fallback. Dedicated banners
are not subject to the screenshot size/aspect heuristic: a valid 3:1 banner is
accepted and takes priority over a 16:9 hero and gallery. Failed validation/load
leaves the existing fallback usable. Screenshot quality gates remain unchanged.

The same shared selector serves Home carousel, Home cards, catalog cards and
ProjectHero. Banner display uses object-fit: cover and centered positioning;
heroes retain their shared dark text scrim. The fallback presentation from Stage
18D keeps full screenshot/portrait hero framing when there is no banner. Cover
remains independent, including in the existing project overview. Detail media
flows through existing bounded enrichment to both Home and catalog, so future
CMS banner publication requires no further UI redesign. No project-name rules,
manual image URLs, altered images or production banners were added.

## Verification

All 76 targeted Playwright checks pass, along with TypeScript/frontend build,
scoped formatting and diff checks. See `.local/evidence/stage18e/INDEX.md` for
final logs and screenshots. New fixture
checks at 800×600, 1280×720 and 1600×900 verify all four media states, equal widths
and heights, banner priority on all four surfaces, centered cover, portrait
contain, gallery fallback for malformed/foreign optional values and no overflow.
Fixtures contain labelled synthetic QA images only; they do not enter the app.

Actual isolated Tauri/WebView2 uses fresh `.local/stage18e/app-data` and the live
local API through the existing Rust HTTPS QA transport. Current live records
have no banner; native checks verify fallback, equal card geometry, all three
sizes, project pages, gallery/Escape, download CTA availability and carousel
manual/autoplay behavior. Banner fixtures are browser evidence, not proof that
CMS has published a banner. No production API or CMS neighbor access occurred.

Rust, SQLite/schema 4, native downloaders, legacy installations and user data
were unchanged. Real transfers/pickers/no-clobber, game execution, OS DPI matrix
and production installer were not retested. No push, deploy, release or next stage.
