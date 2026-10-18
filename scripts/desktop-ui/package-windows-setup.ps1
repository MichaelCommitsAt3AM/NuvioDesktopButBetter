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
if (-not (Test-Path -LiteralPath (Join-Path $backend 'runtime\bin\Nuvio.exe'))) {
    throw 'The packaged backend must include runtime\bin\Nuvio.exe. Run scripts/desktop-ui/bundle-java.mjs first.'
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
    if (-not $env:NUVIO_UPDATER_PUBLIC_KEY) {
        $publicKeyPath = Join-Path $env:USERPROFILE '.codex\keys\nuvio-desktop-updater\updater.key.pub'
        if (Test-Path -LiteralPath $publicKeyPath) { $env:NUVIO_UPDATER_PUBLIC_KEY = (Get-Content -LiteralPath $publicKeyPath -Raw).Trim() }
    }
    & node (Join-Path $PSScriptRoot 'release-config.mjs') msi
    if ($LASTEXITCODE -ne 0) { throw 'Release configuration failed.' }
    # Local packages are for migration testing, not publishing signed updates.
    $releaseConfigPath = Join-Path $uiRoot 'src-tauri\tauri.release.conf.json'
    $releaseConfig = Get-Content -LiteralPath $releaseConfigPath -Raw | ConvertFrom-Json
    $releaseConfig.bundle.createUpdaterArtifacts = $false
    $releaseConfig | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $releaseConfigPath
    # The Tauri CLI writes progress to stderr, and Windows PowerShell turns native
    # stderr into a terminating error under ErrorActionPreference=Stop. Build with
    # that preference relaxed and judge the result from the exit code instead.
    $buildErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & node node_modules/@tauri-apps/cli/tauri.js build --config src-tauri/tauri.release.conf.json --bundles msi
        $buildExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $buildErrorPreference
    }
    if ($buildExitCode -ne 0) { throw 'Windows installer build failed.' }
    $installer = Get-ChildItem -LiteralPath 'src-tauri\target\release\bundle\msi' -Filter '*.msi' |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $installer) { throw 'No Windows setup executable was produced.' }
    $destination = Join-Path $repoRoot 'Nuvio-Setup.msi'
    Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force
    Write-Host "Windows setup: $destination"
} finally { Pop-Location }
