# Optional analytics — next client source

Not released. Published v0.1.0-beta.2 and updater-beta.json remain unchanged.

Settings adds “Share anonymous usage statistics”, default false including legacy settings.
Only four events are allowed, and project IDs must belong to the public CMS catalog.
app_open is sent once per app UI lifetime after consent; opening a project sends project_view.
The native downloader emits a minimal local event when the release host responds and when
verification/file saving succeeds. Consent-gated HTTP is fire-and-forget, no queue, no retries,
three-second timeout and at most four in-flight requests. Disabling aborts pending requests.
An already delivered request cannot be recalled. No persistent identifier is created.

Public policy: https://port-catalog-cms.port-catalog-cms.workers.dev/privacy

Validated: frontend TypeScript/build, offline cargo check, targeted opt-in/withdrawal test.
Full packaged Windows interaction with the new setting is still a next-release check; the
installed Beta 2 was not replaced or used to fabricate production analytics events.
