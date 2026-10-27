# Private offline artwork build

The supplied `bloodorneim.rar` was found in the user's package directory. Redistribution rights have not been established. **Do not commit or upload the archive, derived WebP files, personal executable, or screenshots containing this art.** The public repository and CI do not contain these inputs. A locally decorated executable is not cleared for public distribution.

With Python 3 + Pillow and a local 7-Zip installation:

```powershell
python scripts/package-local-art.py C:\path\to\bloodorneim.rar --inspect-only
python scripts/package-local-art.py C:\path\to\bloodorneim.rar
npm run tauri build -- --no-bundle
```

The helper inspects entry paths/types, rejects traversal, links, alternate streams, encryption and filename collisions, limits 20 images / 12 MiB per entry / 64 MiB total, streams each exact entry through 7-Zip, checks decoded dimensions, and processes files in a temporary directory. It is a developer helper for this reviewed archive, not an audited general-purpose RAR decoder. The inspected archive has six raster images and one ordinary directory, no links or streams; expanded source images total 4720624 bytes. 7-Zip validates each selected stream/CRC. Contact sheet: `.local/art-contact.jpg` (private).

| Input      | Resolution  | Use                                                                          |
| ---------- | ----------- | ---------------------------------------------------------------------------- |
| scr3.png   | 1920 × 1080 | Home hero crop, gallery                                                      |
| title.jpg  | 467 × 657   | Proportional 2:3 cover crop; no upscaling                                    |
| scr1.jpg   | 3840 × 2160 | Wide details crop, gallery downscaled to 1920 × 1080                         |
| scr2.jpg   | 739 × 415   | Gallery at original resolution                                               |
| scr4.jpg   | 1024 × 576  | Gallery at original resolution                                               |
| Banner.png | 1920 × 540  | Inspected; unused because its embedded logo duplicates PORT's existing title |

Seven WebP outputs (hero, cover, banner, four gallery frames) occupy about 0.9 MB. Lower-resolution source frames are not enlarged or represented as new screenshots. Four distinct original gallery images are shown; no extra frames are fabricated.

Outputs live in ignored `src/assets/bloodborne-local/`; `src/services/bundled-media.ts` discovers them at build time. Vite embeds assets into the native executable. No user import, network, absolute developer path or SQLite seeding is required to display defaults. SQLite/localStorage media records remain **overrides only**; each empty slot falls back to the bundled asset. Optional customization is collapsed on the details page. Settings/media JSON formats are unchanged; Stage 03 migrates the database to version 3 for installation tables.

For a public build, use a clean checkout without this ignored directory. It builds with labelled empty slots; this is intentional. To supply a personal build, repeat local packaging before building. Stage 03's actual installed-library card uses the same cover resolver; it appears only after real native SQLite installation registration.

Private evidence is under ignored `.local/evidence/`. Historical public screenshots remain in `screenshots/`; do not replace them with restricted art screenshots. CI's private-art scenario skips explicitly when these optional inputs are absent.
