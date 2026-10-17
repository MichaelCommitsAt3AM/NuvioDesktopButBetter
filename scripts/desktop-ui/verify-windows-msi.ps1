param([Parameter(Mandatory)][string]$Path, [string]$ExpectedVersion)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$versionProperties = Get-Content -LiteralPath (Join-Path $repoRoot 'composeApp\Configuration\DesktopVersion.properties') -Raw
$versionCode = [regex]::Match($versionProperties, '(?m)^VERSION_CODE=(\d+)').Groups[1].Value
if (-not $ExpectedVersion) { $ExpectedVersion = "1.0.$versionCode" }
$buildSource = Get-Content -LiteralPath (Join-Path $repoRoot 'composeApp\build.gradle.kts') -Raw
$upgradeCode = [regex]::Match($buildSource, 'val windowsMsiUpgradeUuid = "([^"]+)"').Groups[1].Value
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase((Resolve-Path -LiteralPath $Path).Path, 0)
function Read-Property([string]$Name) {
    $view = $database.OpenView("SELECT ``Value`` FROM ``Property`` WHERE ``Property``='$Name'")
    [void]$view.Execute()
    $record = $view.Fetch()
    if (-not $record) { throw "MSI property is missing: $Name" }
    $value = [string]$record.StringData(1)
    if ([string]::IsNullOrWhiteSpace($value)) { throw "MSI property is empty: $Name" }
    return $value
}
if ((Read-Property 'ProductName') -ne 'Nuvio') { throw 'Unexpected MSI product name.' }
$productVersion = Read-Property 'ProductVersion'
if ($productVersion -ne $ExpectedVersion) { throw "MSI version $productVersion does not match desktop version $ExpectedVersion." }
$installedUpgradeCode = Read-Property 'UpgradeCode'
if ($installedUpgradeCode.Trim('{}') -ne $upgradeCode) { throw 'MSI will not upgrade the original Kotlin installation.' }
$view = $database.OpenView('SELECT `FileName` FROM `File`')
[void]$view.Execute()
$names = @()
while ($record = $view.Fetch()) { $names += ($record.StringData(1) -split '\|')[-1] }
foreach ($name in @('Nuvio.exe', 'java.exe', 'classpath.txt', 'player_bridge.dll', 'libmpv-2.dll', 'WebView2Loader.dll')) {
    if ($names -notcontains $name) { throw "MSI is missing required runtime file: $name" }
}
if (@($names | Where-Object { $_ -eq 'Nuvio.exe' }).Count -ne 2) {
    throw 'MSI must contain both the main Nuvio.exe and the branded backend Nuvio.exe.'
}
Write-Output 'MSI identity, upgrade version and bundled runtime checks passed.'
