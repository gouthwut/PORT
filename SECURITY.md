# Security policy

PORT Beta 2 is pre-release software. Security fixes target the latest beta.

Please use [GitHub private vulnerability reporting](https://github.com/gouthwut/PORT/security/advisories/new)
when it is enabled. If that option is unavailable, open an issue saying only that you need
a private reporting channel. Do not publish exploit details, credentials, cookies, private
catalog data or local game files in a public issue.

Describe the affected version, expected behavior, actual behavior and a minimal reproduction
using synthetic data. Include logs only after removing secrets and personal file paths.
No response-time guarantee or bug bounty is offered.

PORT downloads approved official GitHub Release files over HTTPS. It does not automatically
execute or install them. A SHA-256 check detects a mismatch with the approved digest; it is
not a malware scan or proof that a project works with a given game. Downloaded projects
are maintained by their own authors.

Automatic PORT application updates use the official signed GitHub Release channel. Every update
is cryptographically verified against an immutable Minisign public key and signed package digest
before installation. Updates are delivered strictly via HTTPS from official GitHub Release assets.
