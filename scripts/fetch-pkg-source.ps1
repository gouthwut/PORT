$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot '../.local/stage03/pkgextract'
$revision = '4f9426e7dde5f04c42fb7e063992f730e3c308c8'
if (-not (Test-Path -LiteralPath $destination)) {
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    git -C $destination init
    if ($LASTEXITCODE -ne 0) { throw 'git init failed' }
    git -C $destination remote add origin https://github.com/mathisto/pkgextract.git
    git -C $destination fetch --depth 1 origin $revision
    if ($LASTEXITCODE -ne 0) { throw 'Pinned source fetch failed' }
    git -C $destination checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Pinned source checkout failed' }
}
if ((git -C $destination rev-parse HEAD) -ne $revision -or (git -C $destination status --porcelain)) { throw 'Pinned source checkout differs; nothing overwritten' }
Write-Output 'Pinned source ready (no game data or binary download).'
