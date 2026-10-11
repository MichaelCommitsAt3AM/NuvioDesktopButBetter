param([string]$BackendDirectory)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$uiRoot = Join-Path $repoRoot 'desktop-ui'
if (-not $BackendDirectory) { $BackendDirectory = Join-Path $repoRoot 'resources\backend' }
$backend = (Resolve-Path -LiteralPath $BackendDirectory).Path
$staged = Join-Path $uiRoot 'src-tauri\resources\backend'
if (-not (Test-Path -LiteralPath (Join-Path $backend 'runtime\bin\java.exe'))) {
    throw 'The packaged backend must include its private Java runtime in runtime\bin\java.exe.'
}
$entries = (Get-Content -LiteralPath (Join-Path $backend 'classpath.txt') -Raw).Trim().Split(';')
foreach ($entry in $entries) {
    if ([IO.Path]::IsPathRooted($entry) -or $entry -match '(^|[\\/])\.\.([\\/]|$)' -or
        -not (Test-Path -LiteralPath (Join-Path $backend $entry) -PathType Leaf)) {
        throw "Backend classpath must contain existing relative files: $entry"
    }
}
if ($backend -ne $staged) {
    Copy-Item -Path (Join-Path $backend '*') -Destination $staged -Recurse -Force
}
Push-Location $uiRoot
try {
    & cargo tauri build --config src-tauri/tauri.windows-installer.conf.json --bundles nsis
    if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }
    $installer = Get-ChildItem -LiteralPath 'src-tauri\target\release\bundle\nsis' -Filter '*-setup.exe' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $installer) { throw 'No Windows setup executable was produced.' }
    $destination = Join-Path $repoRoot 'Nuvio-Rewrite-Setup.exe'
    Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
    Write-Host "Windows setup: $destination"
} finally { Pop-Location }
