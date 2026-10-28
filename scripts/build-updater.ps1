# Builds private artifacts only; publishing is a separate, owner-authorized action.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
if ($env:PORT_UPDATER_CHANNEL_FILE) { throw 'Production build must use the committed channel, without a QA override.' }
$channel = Get-Content -LiteralPath 'src-tauri/updater-channel.json' -Raw | ConvertFrom-Json
if ($channel.channel -ne 'production' -or -not $channel.publicKey -or -not $channel.endpoint.StartsWith('https://') -or $channel.testCaPem) {
    throw 'Configure the production public updater channel first.'
}
$endpoint = [Uri]$channel.endpoint
if ($endpoint.Scheme -ne 'https' -or $endpoint.Port -ne 443 -or $endpoint.UserInfo -or $endpoint.Fragment -or $channel.hosts -notcontains $endpoint.DnsSafeHost) {
    throw 'Production endpoint must use allowlisted HTTPS without credentials.'
}
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) { throw 'Signing key must be supplied securely in the process environment.' }
New-Item -ItemType Directory -Force -Path '.local/updater' | Out-Null
$config = @{ bundle = @{ createUpdaterArtifacts = $true }; plugins = @{ updater = @{ pubkey = $channel.publicKey; requireSignedVersion = $true } } }
[IO.File]::WriteAllText((Join-Path $repo '.local/updater/build-config.json'), ($config | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
npm run tauri build -- --config .local/updater/build-config.json
if ($LASTEXITCODE -ne 0) { throw 'Signed updater build failed.' }
