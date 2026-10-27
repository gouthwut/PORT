# Real native failure-path check. Restrict only a newly created QA directory, restore its ACL.
$ErrorActionPreference = 'Stop'
$target = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local/stage03/denied-destination'))
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $target.StartsWith($workspace + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'QA target escaped workspace' }
New-Item -ItemType Directory -Path $target -Force | Out-Null
if ((Get-ChildItem -LiteralPath $target -Force).Count -ne 0) { throw 'QA directory must be empty' }
$original = Get-Acl -LiteralPath $target
$testAcl = Get-Acl -LiteralPath $target
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$rights = [Security.AccessControl.FileSystemRights]::CreateFiles -bor [Security.AccessControl.FileSystemRights]::CreateDirectories
$testAcl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid, $rights, [Security.AccessControl.AccessControlType]::Deny))
try {
    Set-Acl -LiteralPath $target -AclObject $testAcl
    node "$PSScriptRoot/native-disk-access.mjs" $target
    if ($LASTEXITCODE -ne 0) { throw 'Native disk-access check failed' }
} finally {
    Set-Acl -LiteralPath $target -AclObject $original
}
