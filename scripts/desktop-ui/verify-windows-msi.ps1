param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$versionProperties = Get-Content -LiteralPath (Join-Path $repoRoot 'composeApp\Configuration\DesktopVersion.properties') -Raw
$versionCode = [regex]::Match($versionProperties, '(?m)^VERSION_CODE=(\d+)').Groups[1].Value
$buildSource = Get-Content -LiteralPath (Join-Path $repoRoot 'composeApp\build.gradle.kts') -Raw
$upgradeCode = [regex]::Match($buildSource, 'val windowsMsiUpgradeUuid = "([^"]+)"').Groups[1].Value
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase((Resolve-Path -LiteralPath $Path).Path, 0)
function Read-Property([string]$Name) {
    $view = $database.OpenView("SELECT ``Value`` FROM ``Property`` WHERE ``Property``='$Name'")
    $view.Execute()
    $record = $view.Fetch()
    if (-not $record) { throw "MSI property is missing: $Name" }
    return $record.StringData(1)
}
if ((Read-Property 'ProductName') -ne 'Nuvio') { throw 'Unexpected MSI product name.' }
if ((Read-Property 'ProductVersion') -ne "1.0.$versionCode") { throw 'MSI version does not match the desktop build number.' }
if ((Read-Property 'UpgradeCode').Trim('{}') -ne $upgradeCode) { throw 'MSI will not upgrade the original Kotlin installation.' }
$view = $database.OpenView('SELECT `FileName` FROM `File`')
$view.Execute()
$names = @()
while ($record = $view.Fetch()) { $names += ($record.StringData(1) -split '\|')[-1] }
foreach ($name in @('Nuvio.exe', 'java.exe', 'classpath.txt', 'player_bridge.dll', 'libmpv-2.dll', 'WebView2Loader.dll')) {
    if ($names -notcontains $name) { throw "MSI is missing required runtime file: $name" }
}
Write-Output 'MSI identity, upgrade version and bundled runtime checks passed.'
