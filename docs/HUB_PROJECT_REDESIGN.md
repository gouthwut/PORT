# Stage 14B — project storefront and download notifications

2026-10-29. Local frontend change from `1232f2e`, restricted to C:\PORT.
No CMS/API changes, production release/installer, Git push, extraction,
execution, user installation/profile change or next stage.

The v2 project page uses the existing PORT palette and typography, a validated
CMS screenshot (cover fallback), gradient hero, project title and prominent
Windows action. Version, archive size when known and official GitHub Release
source sit beside the action. Multiple Windows versions remain selectable.
Approval filtering and `downloadUnavailable` continue to block unsafe or
unconfirmed assets; source archives have no binary download action. Browser
preview keeps the native action disabled. Native IDs-only commands are unchanged.

Facts omit absent values and map OS/technology labels for people. Target OSes
are labelled as project platforms, rather than a claim that each has an available
approved build. Existing optional public `developers` (names) and build
`changelog` now enter the presentation model through bounded validation. No
outbound API shape or CMS schema changed. Changelog and long description use
native accessible disclosures; text stays escaped, without HTML/Markdown execution.
Structured requirements/instructions/dependencies/issues appear only with data.
No inferred hardware specifications or technical IDs are displayed.

The existing Radix image viewer now has an opt-in horizontal strip with paging
buttons, keyboard-accessible thumbnails, arrow navigation, Escape and focus
return. The default legacy gallery layout is retained. Images still pass the
existing CMS origin/path/size/WebP/SHA-256 checks. No new bundled or hotlinked art.

The app-level download panel stays visible during selection/checking/transfer.
Success offers Open folder, then fades after seven seconds of unpaused time.
Hover (including hover before the completion transition), keyboard focus and an
outstanding folder action pause the timer. Terminal notifications can be closed
manually; errors never auto-dismiss. Polling/navigation do not resurrect a
dismissed notification; a new operation/error does. Closing affects presentation
only. Rust status, canonical file path, exact Explorer reveal, destination picker,
SHA-256, `.part`, cancellation and no-clobber logic are unchanged. The full path
is no longer printed in the panel. Reduced motion suppresses movement.

## Verification

- `npm run build`: PASS, including TypeScript and Vite. Existing >500 kB chunk
  warning remains. Final `npx tsc --noEmit`: PASS.
- `npx playwright test tests/hub-api-v2.spec.ts tests/hub-downloads.spec.ts tests/stage14b-project.spec.ts`:
  **25 PASS**. Covers transport/approval/media guards, native-shaped progress,
  IDs-only start/folder commands, navigation, picker state, cancellation, browser
  restriction, unavailable/source-only builds, version choice, hover/focus timer,
  manual dismissal, retained status, persistent errors and new transfers.
- Zelda and Sonic deterministic fixtures: 1440x960, 1024x768, 800x600, 480x800;
  no horizontal overflow, CTA fully inside first viewport, disclosures, strip
  paging, keyboard viewer navigation, Escape and focus return PASS.
- Changed-file Prettier and `git diff --check`: PASS. Rust/backend unchanged;
  no Cargo tests/rebuild or production native build needed for this frontend task.
- Actual existing Stage 13F debug executable launched with dedicated identity
  `app.port.cms-qa` and workspace-contained QA storage, served current frontend.
  Real native IPC identity, enabled Windows action and gallery/Escape PASS.
  No download action invoked. Compared old project UI served from `1232f2e`
  with the new UI on the same fixture. Actual WebView screenshots were inspected.
  These are native WebView captures, not proof of OS dialogs or a ZIP transfer.
- Both browser and native QA used clearly labelled synthetic CMS media and
  deterministic metadata, never substituted production artwork. The live public
  media probe returned 404; real current CMS art rendering is not claimed here.
  Stage 13F's transfer/Explorer evidence and manual dialog limits remain applicable.

Ignored evidence: `.local/evidence/14b/native-zelda-before.png`,
`native-zelda-after.png`, `native-sonic-after.png`, `native-report.json`, and
`browser-{zelda,sonic}-{1440,1024,800,480}.png`. Fixture:
`tests/helpers/project14-fixture.ts`. QA processes/debug listener stopped after
checks. Existing unrelated dirty work remains outside this stage's commit.
