param([switch]$Isolated, [ValidateSet('0.1.0', '0.1.1')][string]$QaVersion = '0.1.0')
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
if ($workspace -ne 'C:\PORT') { throw 'This local acceptance build is scoped to C:\PORT.' }
Set-Location -LiteralPath $workspace
if (Get-ChildItem Env: | Where-Object Name -Match '^(VITE_|PORT_UPDATER_CHANNEL_FILE$|TAURI_CONFIG$|TAURI_SIGNING_)') {
    throw 'Remove inherited frontend, updater or Tauri overrides before building the beta candidate.'
}
$source = Get-Content src/hub/source-config.json -Raw | ConvertFrom-Json
if ($source.version -ne 'v2' -or $source.fallback -ne 'none' -or $source.baseUrl -ne 'https://port-catalog-cms.port-catalog-cms.workers.dev') {
    throw 'Unexpected production catalog configuration.'
}
$channel = Get-Content src-tauri/updater-channel.json -Raw | ConvertFrom-Json
if ($channel.channel -ne 'unconfigured' -or $channel.endpoint -or $channel.publicKey) {
    throw 'This unsigned local candidate requires the unconfigured updater channel.'
}
$config = @{
    build = @{ beforeBuildCommand = 'npm run build && node scripts/audit-beta-assets.mjs' }
    bundle = @{
        createUpdaterArtifacts = $false
        resources = @{
            '../LICENSE' = 'licenses/PORT-LICENSE.txt'
            '../src/assets/fonts/Inter-OFL.txt' = 'licenses/Inter-OFL.txt'
            '../src/assets/fonts/Manrope-OFL.txt' = 'licenses/Manrope-OFL.txt'
            '../docs/WINDOWS_BETA_NOTICES.md' = 'licenses/BETA-NOTICES.md'
        }
    }
}
if ($Isolated) {
    $config.version = $QaVersion
    $config.identifier = 'app.port.stage19a-qa'
    $config.productName = 'PORT Stage19A QA'
    $config.app = @{
        appDirectoriesOverride = 'C:\PORT\.local\stage19a\app-data'
        security = @{ capabilities = @('main', @{
            identifier = 'stage19a-window-size'
            windows = @('main')
            permissions = @('core:window:allow-set-size')
        }) }
    }
}
New-Item -ItemType Directory -Force -Path .local/stage19a | Out-Null
$configPath = Join-Path $workspace '.local/stage19a/build-config.json'
$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding utf8
$previousBeta = $env:PORT_BETA_BUILD
try {
    $env:PORT_BETA_BUILD = '1'
    npm run tauri build -- --bundles nsis --config $configPath
    if ($LASTEXITCODE -ne 0) { throw "Tauri build failed: $LASTEXITCODE" }
} finally {
    $env:PORT_BETA_BUILD = $previousBeta
}
