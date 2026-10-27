# Published catalog v1 / Stage 04C

## Stage 05C production integration — 2026-10-27

Stable public API: https://port-catalog-cms.port-catalog-cms.workers.dev/v1/catalog.json. The separate private CMS is deployed using Workers Free + SQLite Durable Object. The owner reports successful GitHub OAuth and first publication. Independent anonymous Windows curl and native Rust requests verify HTTP 200, application/json, schema v1, published Bloodborne identity and all six unique same-origin immutable WebP assets (SHA-256, MIME, bounds; 664220 bytes). Public schema rejects unknown fields/drafts/executable metadata; no privileged fields were present. Anonymous admin requests remain guarded. No owner session/secret is needed by PORT.

`src/catalog-endpoint.json` is shared by Rust and TypeScript. Missing/empty native configuration resolves to that endpoint without rewriting saved configuration; nonempty developer overrides and cache scoping are preserved. Release starts with an empty catalog until validated cache/network data arrives, never a local fixture. Manual endpoint UI and raw error details are development-build only; release IPC rejects configuration changes. Browser development can explicitly enable `VITE_CATALOG_FIXTURE=1`; Playwright uses that flag for historical fixture tests and a separate production preview for Stage 05C. Installed Bloodborne retains its stable collection identity, local art/profile and Play action; no registration migration is required.

Startup, five-minute, online-event and manual refresh remain. Full snapshots replace metadata without rebuilding the exe. Publication never grants an unknown adapter installation privileges. The last validated snapshot/images survive failures and cold restart; installations remain the sole library authority. Actual native release internet synchronization and normal restart are recorded in PROGRESS. Live owner publication was read only: updated/unpublished/failing responses are covered by isolated SQLite/Chromium tests, not claimed as live production mutation or physically disconnected native networking evidence.

## CMS publication contract

`docs/catalog.schema.json` is the machine-readable v1 schema consumed by **both Rust and TypeScript**. The validator implements its restricted `object`, `array`, `string`, `const`, `enum`, required-property, length/count and custom-format vocabulary. Unknown properties fail closed at every level. `id` means lowercase ASCII letters/digits/hyphens starting with an alphanumeric; `sha256` is exactly 64 lowercase hex digits; `timestamp` is a UTC `YYYY-MM-DDTHH:MM:SSZ` string. The `https` and `github` formats also enforce the URL policy below. General JSON Schema tools should register those custom formats to reproduce PORT's checks.

The response is one complete snapshot (not pagination or a delta):

```json
{
  "schemaVersion": 1,
  "revision": "publication-42",
  "publishedAt": "2026-10-27T12:00:00Z",
  "games": []
}
```

Each game requires stable `id`, `collectionId`, `status: published`, title, plain-text description, genres, tags, source console, Windows implementation kind, media, requirements, compatibility status/notes, GitHub repository, authors/license, required original files, Windows-build availability and adapter ID. See the complete fixture for a populated example. A collection can own multiple display titles sharing one runtime; collection IDs must remain stable across publications. CMS administrators must not assign an existing collection's identity to an unrelated game. Keep all draft data in the private CMS; a response containing a draft is rejected **as a whole**.

Implementation kinds: `compatibility-runtime`, `recompilation`, `native-port`. These are editorial descriptions, not execution instructions. Describe Bloodborne as independently developed bbport/shadPS4-derived execution with Vulkan translation, never an official native PC release. Compatibility labels are publisher claims; PORT does not infer successful gameplay from metadata.

To publish, the future CMS should:

1. Validate the entire next snapshot against v1 and PORT's semantic restrictions. Include only published records, at most 100, with unique game IDs. An empty array intentionally unpublishes all cards.
2. Upload redistribution-authorized static WebP images to **the same HTTPS origin** as the API. Publish immutable content URLs and each file's SHA-256. Cover, banner and hero are optional; `gallery` is required, at most six assets. No SVG, HTML, animation or remote embeds. Maximum 1 MiB/image, width/height <=4096, <=8,388,608 pixels. Convert/resize at publication time. Descriptive labels come from the game title.
3. Publish the complete JSON **after images exist**, atomically, with `Content-Type: application/json` (optional charset) and <=1 MiB decoded UTF-8. Images require `Content-Type: image/webp`. Use a direct HTTPS 200 response, without redirects, authentication or pagination. Client always performs a full GET, not conditional/304 requests.
4. Change `revision` and `publishedAt` for operational traceability. The client replaces its snapshot after successful validation; these fields are not signatures or monotonic anti-rollback counters.
5. Serve CORS headers for browser development/preview if needed. Native requests use Rust HTTPS and do not require CORS. Do not expose CMS secrets, private drafts, private source or privileged endpoints in this public response.

Ordinary users receive the embedded stable endpoint automatically; only developer builds expose an override. Clients fetch at startup, every five minutes, when connectivity returns, or using **Refresh catalog** without restarting. A stable shared API URL lets future CMS publication reach all configured clients without a rebuild. Stage 05C embeds the independently verified production URL above. New **metadata-only** games require no client rebuild. A new executable installation method still requires reviewed client adapter code.

## Trust boundaries and resource limits

- Catalog data never supplies commands, scripts, executable paths, download destinations, runtime artifacts or launch flags. Plain text is rendered through React escaping, with no HTML/Markdown interpreter. Only a validated `https://github.com/owner/repo` project link can be opened externally.
- The compiled adapter registry currently enables **only** game ID/collection ID/adapter ID `bloodborne`, implementation `compatibility-runtime`, Windows build available, compatibility not unavailable. Unknown IDs render complete cards/details with an explicit unavailable-installation explanation. Declaring another adapter, or copying the Bloodborne adapter ID onto a different game, grants no installation capability. Existing Rust installer/runtime pins, validation, update/launch guards and user-data behavior are unchanged.
- Public HTTPS on port 443 only; no credentials, fragments, whitespace, backslashes, IP literals, localhost/local/internal/test/invalid/example-suffix hosts. Images must share the endpoint origin. DNS resolution is checked against non-public/special addresses and pinned into each native request. Redirects and proxies are disabled. No game files/settings/saves are uploaded. Native WebView CSP remains `img-src self data:`: images are fetched and checked by Rust, then displayed from local data URLs, never hotlinked.
- Native: DNS wait <=4 seconds, connection <=4 seconds, each request <=8 seconds and total synchronization network deadline 45 seconds (cooperative processing follows). At most 128 image requests per sync, <=1 MiB each, with a conservative 24 MiB transfer budget (failed transfers reserve their full 1 MiB allowance), <=24 MiB retained decoded image bytes and <=36 MiB serialized snapshot. Prefer shared image hashes, small assets and curated featured media for large catalogs. Missing/bad/over-budget images produce placeholders and an explicit warning; valid metadata can still commit. Reused cached images are hash-checked, and a subsequent refresh retries missing images. WebP container/dimension checks precede browser decoding; this is not a full image-codec audit.
- The endpoint publisher remains trusted for editorial correctness and image licensing. HTTPS and hashes protect transport/cache consistency, not publisher authenticity. No signed catalog or arbitrary updater is claimed.

## Persistence, offline and unpublication

Native SQLite keeps `catalog_config`, `catalog_cache` and `catalog_known` separate from settings, media, installations and update journals. No installation-schema version change occurs. Configuration stores the endpoint; the cache is scoped to the exact endpoint. The last complete valid JSON/images snapshot commits transactionally. Network, malformed JSON, schema, URL or size failures preserve the previous cache. Corrupt cached data is rejected on load. Images are rechecked for WebP header, dimensions and SHA-256. Endpoint changes never show another endpoint's snapshot as its publication. An empty native endpoint uses the production default; only explicit browser development fixtures use local test data. Settings reset does not reset catalog configuration.

The native executable embeds its UI; the last valid catalog, cached images and installed library work without the API/internet after a cold restart. Missing assets show placeholders. The browser preview uses labelled localStorage with the same schema/size/URL/hash/image rules and visible quota errors. Browser fetch adds browser security/CORS; it cannot perform Rust's DNS pinning, and its dev UI still requires the local Vite server. Browser tests are not native behavior evidence.

`installations` remains the sole library authority. Unpublishing removes online cards only; it does not call uninstall, change versions/paths, touch runtimes, saves or settings. Retained metadata for installed collection IDs can name their library entries even after unpublication, and retained images are kept where the budget allows. A card that is unpublished while its detail page is open loses installation availability; an existing installation remains launchable. Bloodborne also has its existing built-in local identity and optional personal art, so it remains recognizable with no catalog cache at all. A generic installed entry without retained metadata falls back to its collection ID. No fictitious installation records are created in preview or native mode.

## Verification and historical Stage 04C foundation

`tests/stage04c.spec.ts` uses original generated QA images and intercepted HTTPS responses, clearly separate from real online services. Rust tests use isolated SQLite databases and exercise shared validation, URL/address rejection, corrupt snapshots, durable cache and unpublication preserving an original installation value. Native QA uses the actual release executable and Rust IPC; ignored `.local/evidence/04c` contains its results and screenshots. Consult `PROGRESS.md` for actual completed checks rather than inferring results from these descriptions.

Historical Stage 04C plan (implemented separately by Stage 05A–C): create a **separate private CMS project**; choose free hosting/storage/public API, owner authentication and secret management; create/edit drafts; upload and optimize authorized artwork; validate/publish/unpublish snapshots atomically; add publication history/rollback and image lifecycle; integrate a stable public endpoint; then verify publication end to end in an unmodified Windows client. Keep all CMS source/secrets out of this public client repository. No admin UI, CMS authorization/database or hosting setup is included here.
