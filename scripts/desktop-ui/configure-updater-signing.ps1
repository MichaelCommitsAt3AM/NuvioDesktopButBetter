param(
    [string]$Repository = 'MichaelCommitsAt3AM/NuvioDesktopButBetter',
    [string]$Environment = 'desktop-release',
    [string]$KeyDirectory = (Join-Path $env:USERPROFILE '.codex\keys\nuvio-desktop-updater')
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$keyFile = Join-Path $KeyDirectory 'updater.key'
$passwordFile = Join-Path $KeyDirectory 'password.dpapi'
New-Item -ItemType Directory -Path $KeyDirectory -Force | Out-Null
# Restrict the persistent key backup to this Windows user and SYSTEM.
$acl = Get-Acl -LiteralPath $KeyDirectory
$acl.SetAccessRuleProtection($true, $false)
$inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', $inheritance, 'None', 'Allow'))
$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'), 'FullControl', $inheritance, 'None', 'Allow'))
Set-Acl -LiteralPath $KeyDirectory -AclObject $acl
if (Test-Path -LiteralPath $keyFile) {
    if (-not (Test-Path -LiteralPath $passwordFile)) { throw 'The existing key password backup is missing. Do not replace the release key.' }
    $securePassword = Get-Content -LiteralPath $passwordFile -Raw | ConvertTo-SecureString
    $signingPassword = [Net.NetworkCredential]::new('', $securePassword).Password
} else {
    $randomBytes = [byte[]]::new(32)
    [Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
    $signingPassword = [Convert]::ToBase64String($randomBytes)
    $securePassword = ConvertTo-SecureString $signingPassword -AsPlainText -Force
    $securePassword | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
    $cli = Join-Path $repoRoot 'desktop-ui\node_modules\@tauri-apps\cli\tauri.js'
    $signerOutput = & node $cli signer generate --ci --password $signingPassword --write-keys $keyFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Updater key generation failed. Check the protected key directory before retrying.' }
}
$privateKey = (Get-Content -LiteralPath $keyFile -Raw).Trim()
$publicKey = (Get-Content -LiteralPath ($keyFile + '.pub') -Raw).Trim()
$privateKey | & gh secret set NUVIO_UPDATER_PRIVATE_KEY --repo $Repository --env $Environment
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the updater private-key secret.' }
$signingPassword | & gh secret set NUVIO_UPDATER_PRIVATE_KEY_PASSWORD --repo $Repository --env $Environment
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the updater password secret.' }
& gh variable set NUVIO_UPDATER_PUBLIC_KEY --body $publicKey --repo $Repository --env $Environment
if ($LASTEXITCODE -ne 0) { throw 'Could not configure the updater public-key variable.' }
$privateKey = $null
$signingPassword = $null
Write-Output "Updater signing configured for $Repository ($Environment). Protected backup: $KeyDirectory"
