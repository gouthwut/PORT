# Real install/uninstall on a disposable hosted runner; never run on an owner's PC.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Installer smoke test requires a disposable GitHub Actions runner.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$installer = (Resolve-Path "src-tauri/target/release/bundle/nsis/PORT_${version}_x64-setup.exe").Path
if ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($installer)) -notmatch 'level="requireAdministrator"') {
    throw 'Installer does not request standard Windows elevation.'
}
$machineKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PORT'
$userKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PORT'
$installDir = Join-Path $env:ProgramFiles 'PORT'
$shortcut = Join-Path ([Environment]::GetFolderPath('CommonPrograms')) 'PORT.lnk'
if ((Test-Path $machineKey) -or (Test-Path $userKey) -or (Test-Path $installDir) -or (Test-Path $shortcut)) {
    throw 'Runner already has PORT; refusing to change an existing installation.'
}
$dataDir = Join-Path $env:APPDATA 'app.port.launcher'
New-Item -ItemType Directory -Force $dataDir | Out-Null
$sentinel = Join-Path $dataDir 'beta4-installer-preservation.txt'
Set-Content -LiteralPath $sentinel -Value 'User data must survive uninstall.'
$sentinelHash = (Get-FileHash $sentinel).Hash
$process = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Install failed: $($process.ExitCode)" }
$exe = Join-Path $installDir 'port-launcher.exe'
if ([Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes($exe)) -match 'level="(requireAdministrator|highestAvailable)"') {
    throw 'PORT must not request elevation.'
}
if ((Get-Item $exe).VersionInfo.ProductVersion -ne $version) { throw 'Wrong installed version or Program Files directory.' }
$registration = Get-ItemProperty $machineKey
if ($registration.DisplayVersion -ne $version -or $registration.InstallLocation.Trim('"') -ne $installDir -or (Test-Path $userKey)) {
    throw 'Incorrect uninstall registration or duplicate install scope.'
}
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
try {
    if ($link.TargetPath -ne $exe) { throw 'Incorrect all-users shortcut.' }
} finally {
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($link) | Out-Null
    [Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) | Out-Null
}
# NSIS _?= runs in place, so Wait observes the actual uninstaller, not its temp bootstrap.
$process = Start-Process -FilePath (Join-Path $installDir 'uninstall.exe') -ArgumentList ("/S _?=" + $installDir) -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
    $leftover = @($machineKey, $exe, $shortcut) | Where-Object { Test-Path -LiteralPath $_ }
    if (-not $leftover) { break }
    Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)
if ($leftover) { throw "Uninstall left: $($leftover -join ', ')" }
if ((Get-FileHash $sentinel).Hash -ne $sentinelHash) { throw 'Uninstall changed user data.' }

# Simulate a registered Beta 3 user install, without executing or deleting it.
New-Item -Path $userKey -Force | Out-Null
New-ItemProperty -Path $userKey -Name UninstallString -Value 'C:\Beta3-Preservation-Probe\uninstall.exe' | Out-Null
try {
    $process = Start-Process -FilePath $installer -ArgumentList '/S /UPDATE' -PassThru -Wait
    if ($process.ExitCode -ne 2 -or (Test-Path $machineKey) -or (Test-Path $exe)) { throw 'Per-user migration guard failed.' }
    if ((Get-ItemProperty $userKey).UninstallString -ne 'C:\Beta3-Preservation-Probe\uninstall.exe') { throw 'Legacy registration changed.' }
    if ((Get-FileHash $sentinel).Hash -ne $sentinelHash) { throw 'Migration guard changed user data.' }
} finally {
    Remove-Item -LiteralPath $userKey -Force
}
Write-Output 'PASS: Program Files install, HKLM uninstall, all-users shortcut, uninstall/data preservation, and blocked cross-scope update. Interactive UAC still requires human verification.'
