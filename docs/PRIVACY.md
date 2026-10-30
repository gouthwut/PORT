# Privacy Policy

PORT is designed with privacy and local ownership as fundamental principles.

---

## 1. Local Storage

- PORT stores your preferences (theme, language, reduced motion), saved/recent project bookmarks, and download history locally on your machine in the Windows Application Data directory (`%APPDATA%\com.port.launcher\`).
- Downloaded files are saved strictly to the folder you select. Clearing history in PORT does not delete downloaded files from your disk.
- PORT does not upload your local files, game assets, or directories.

---

## 2. Network Activity

- **Catalog Metadata & Artwork**: The client fetches public catalog records and screenshot media over HTTPS from the official PORT catalog service.
- **Project Downloads**: When downloading project releases, the client connects directly to official upstream servers (such as GitHub Releases) to retrieve release archives.
- **Application Updates**: PORT checks the official release manifest for signed application updates over HTTPS.
- Standard connection data (such as IP address and HTTP headers) is transmitted to host servers as part of normal web protocols.

---

## 3. Telemetry & Anonymous Statistics

- **Default Behavior**: PORT does not send usage statistics or include advertising SDKs.
- **Optional Anonymous Statistics**: Starting with the latest client, an optional **Share anonymous usage statistics** setting is available, switched **off by default**.
- Enabling it is completely voluntary and independent of downloads or catalog browsing. You can disable it at any time in Settings.
- When enabled with explicit consent, only four high-level events are counted: `app_open`, `project_view`, `download_started`, and `download_completed`.
- Events contain only the public project ID and a consent flag. There are no accounts, persistent device identifiers, hardware fingerprints, file paths, or personal user profiles.
- Events are aggregated into daily anonymous counters on Cloudflare without logging raw IP addresses or client records.

---

## 4. Accounts & Authentication

- PORT requires **no user accounts, registrations, or API keys** to search, browse, or download from the catalog.
