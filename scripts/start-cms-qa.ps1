param([switch]$DebugWebView)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
if ($workspace -ne 'C:\PORT') { throw 'This local QA configuration is scoped to C:\PORT.' }
Set-Location -LiteralPath $workspace
$certificate = Join-Path $workspace '.local/cms-qa/localhost.pem'
if (-not (Test-Path -LiteralPath $certificate)) {
    throw 'Place the owner-verified public localhost certificate in .local/cms-qa/localhost.pem. See docs/HUB_LOCAL_CMS_QA.md.'
}
Write-Output 'Local CMS QA: dedicated debug identity, per-client certificate trust, storage under C:\PORT\.local\cms-qa.'
Get-FileHash -LiteralPath $certificate -Algorithm SHA256 | Format-List
$previousSource = $env:VITE_HUB_SOURCE_JSON
$previousQa = $env:VITE_PORT_LOCAL_CMS_QA
$previousWebView = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
try {
    $env:VITE_HUB_SOURCE_JSON = '{"version":"v2","baseUrl":"https://localhost:8787","fallback":"none"}'
    $env:VITE_PORT_LOCAL_CMS_QA = '1'
    if ($DebugWebView) { $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9238' }
    npm run tauri dev -- --no-watch --config src-tauri/tauri.cms-qa.conf.json
    if ($LASTEXITCODE -ne 0) { throw "QA app exited with code $LASTEXITCODE" }
} finally {
    $env:VITE_HUB_SOURCE_JSON = $previousSource
    $env:VITE_PORT_LOCAL_CMS_QA = $previousQa
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousWebView
}
