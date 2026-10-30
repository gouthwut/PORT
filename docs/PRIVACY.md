# Privacy

PORT stores settings, saved/recent project IDs and download history locally in its Windows
application data directory. Downloaded files are saved to the destination selected by the user.
Clearing history does not delete those files. Uninstalling while retaining app data keeps
preferences and history for a later installation.

The app requests public catalog metadata and images from the configured PORT catalog
service. Official release downloads contact GitHub and its release asset delivery hosts.
Those services receive ordinary network information such as the connection IP and request
path and apply their own privacy policies. Official links open in the user's browser.

Public PORT does not require a player account or a user-supplied API token. It does not upload
game files or provide a game-file import flow. No analytics or advertising SDK is included.
Manually submitted GitHub issues and attachments are public unless submitted through a private channel.

## Optional statistics in the next client

Published Beta 2 does not send usage statistics. The next client adds **Share anonymous
usage statistics**, switched off by default. Enabling it is optional and independent of
downloads and other features. Disable it at any time in Settings; new requests stop and
pending requests are cancelled. A request already delivered cannot be recalled.

With consent, only `app_open`, `project_view`, `download_started` and `download_completed`
are sent to the existing PORT Cloudflare service. Project events contain only the published
project ID; requests include a consent flag. A download start means the release host has
returned a response; completion means the client has verified and saved the file. There is
no account, persistent device ID, fingerprint, hardware identifier, nickname, game file,
disk path, client timestamp or personal profile. No analytics or advertising SDK is added.

Cloudflare receives ordinary connection information, including IP addresses, to deliver
requests and limit abuse. Its edge rate limiter uses a short-lived IP key. PORT does not
store IP addresses in its own database and Worker request logging is disabled. Cloudflare
applies its own privacy policy. PORT immediately aggregates events into daily event/project
counters; no raw event records are stored. Counters and GitHub snapshots expire after up
to 180 days with daily cleanup. Because counters cannot identify you, individual past
contributions cannot be located or deleted. Only the authenticated CMS owner can read them.

There is no offline queue or retry. Analytics failures do not block launch or downloads.
Requests may be lost, duplicated, rate limited or forged. Launch counts are events, not
unique users. We cannot link events, identify unique app users or determine who first
discovered PORT from a particular source.

GitHub independently provides release-asset download counters, stars, forks and, where
permitted, repository views, visitors, clones and referring sites. Repository visitors are
not app users. GitHub traffic normally covers about 14 days; daily snapshots extend observed
history without reconstructing missing days or adding overlapping unique-visitor counts.
GitHub downloads do not establish successful installation. Sources refer to repository
traffic and do not establish acquisition of app users.

The opt-in is a separate, freely chosen consent; the choice is stored locally. It is not
bundled with acceptance of terms or needed to use PORT. Jurisdiction-specific requirements
still apply; PORT does not assume all analytics is exempt merely because it is described
as anonymous. Public policy: https://port-catalog-cms.port-catalog-cms.workers.dev/privacy.
For questions use the PORT GitHub issue tracker without posting personal information.

The separate administrative CMS is not part of the public client repository or installer.
Its owner authentication is separate from anonymous catalog access.
