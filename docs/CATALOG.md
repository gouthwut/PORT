# PORT Catalog Specification

The PORT Catalog provides metadata, system specifications, compatibility data, and official release links for verified PC ports and recompilations.

---

## 1. Catalog Architecture

The PORT client accesses catalog data via a dedicated, read-only Cloudflare Workers API endpoint (`v2`):

```
┌──────────────────┐           HTTPS GET (v2)          ┌──────────────────────────┐
│   PORT Client    │  ◄──────────────────────────────  │  Cloudflare Workers API  │
│  (Windows/Tauri) │                                   │     (Curated Catalog)    │
└─────────┬────────┘                                   └──────────────────────────┘
          │ Caches locally
          ▼
┌──────────────────┐
│ Local App Cache  │ (offline fallback & instant startup)
└──────────────────┘
```

The base configuration is compiled into `src/hub/source-config.json`:

```json
{
  "version": "v2",
  "baseUrl": "https://port-catalog-cms.port-catalog-cms.workers.dev",
  "fallback": "none"
}
```

---

## 2. Project Data Model

Each catalog entry represents a verified community port, recompilation, or decompilation project:

```typescript
export interface CatalogProject {
  id: string; // Stable lowercase alphanumeric identifier
  name: string; // Project display title
  game: string; // Original game title
  platforms: string[]; // Original console platforms (e.g. N64, PS2, Xbox 360)
  kind:
    "recompilation" | "decompilation" | "native-port" | "compatibility-runtime";
  lifecycle: "active" | "beta" | "alpha" | "archived";
  windows: "available" | "unavailable";
  summary: string; // Plain text project summary
  description: string; // Detailed description
  requirements: {
    os: string;
    cpu: string;
    gpu: string;
    memory: string;
    storage: string;
    notes?: string;
  };
  compatibility: {
    status: "playable" | "experimental" | "unverified";
    notes: string;
  };
  upstream: {
    github: string; // Official upstream repository URL
    authors: string[];
    license: string;
  };
  media: {
    cover?: { url: string; sha256: string };
    banner?: { url: string; sha256: string };
    gallery: Array<{ url: string; sha256: string }>;
  };
  instructions?: {
    requiredFiles: string[]; // Legitimate original game assets required by the user
    setupSteps: string[]; // Step-by-step setup guide
  };
}
```

---

## 3. Trust Boundaries & Security

- **Strict Text Rendering**: Descriptions and setup instructions are parsed and rendered as sanitized text. No arbitrary HTML, scripts, or markdown commands are executed.
- **External Links**: Only verified HTTPS links (specifically pointing to approved upstream GitHub repositories) are allowed to be opened in the user's default browser.
- **Image Validation**: Images are served from the verified origin, bounded by dimension and payload limits, and validated against their cryptographic hashes.
- **Integrity**: Remote catalog entries cannot inject command-line flags, launch arguments, or executable scripts into the client.
