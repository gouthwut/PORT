param([string]$UpstreamRoot = '')
$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$project = Join-Path $PSScriptRoot '../tools/extractor-lab/ExtractorLab.csproj'
if ($UpstreamRoot) {
    $resolvedRoot = (Resolve-Path -LiteralPath $UpstreamRoot).Path
    $revision = git -C $resolvedRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $revision -ne '4f9426e7dde5f04c42fb7e063992f730e3c308c8') {
        throw 'Expected the reviewed pkgextract revision.'
    }
    $changes = git -C $resolvedRoot status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Upstream tracked sources must be unmodified.' }
    dotnet run --project $project "-p:UpstreamRoot=$resolvedRoot" -- --self-test
} else {
    dotnet run --project $project -- --self-test
}
if ($LASTEXITCODE -ne 0) { throw 'Extractor research tests failed.' }
