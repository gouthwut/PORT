param([string]$UpstreamRoot = "$PSScriptRoot/../.local/stage03/pkgextract")
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath $UpstreamRoot).Path
if ((git -C $repo rev-parse HEAD) -ne '4f9426e7dde5f04c42fb7e063992f730e3c308c8' -or (git -C $repo status --porcelain)) { throw 'Expected exact unmodified reviewed pkgextract source' }
$output = Join-Path $PSScriptRoot '../.local/pkg-worker'
dotnet publish "$PSScriptRoot/../tools/pkg-worker/PortPkgWorker.csproj" -c Release -r win-x64 --self-contained true "-p:UpstreamRoot=$repo" -o $output
if ($LASTEXITCODE -ne 0) { throw 'Worker publish failed' }
Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $output 'port-pkg-worker.exe')
