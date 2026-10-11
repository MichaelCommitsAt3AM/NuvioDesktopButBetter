$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$uiRoot = Join-Path $repoRoot 'desktop-ui'
$tauriRoot = Join-Path $uiRoot 'src-tauri'
$shellExe = Join-Path $tauriRoot 'target\debug\nuvio-desktop-shell.exe'
$viteEntry = Join-Path $uiRoot 'node_modules\vite\bin\vite.js'
$backendClasspath = Join-Path $tauriRoot 'resources\backend\classpath.txt'
$viteLog = Join-Path $env:TEMP 'nuvio-preview-vite.log'
$viteErrorLog = Join-Path $env:TEMP 'nuvio-preview-vite-error.log'
$viteProcess = $null

try {
    if (-not (Test-Path $viteEntry)) {
        throw "Vite is not installed. Run 'npm ci' in $uiRoot first."
    }
    if (-not (Test-Path $backendClasspath)) {
        throw "The staged Kotlin bridge runtime is missing. From the repository root, run: .\gradlew.bat :composeApp:stageBridgeRuntime"
    }

    $listeners = @(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -gt 0) {
        throw 'Port 5173 is already in use. Close the existing preview/dev server before launching this one.'
    }

    $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
    $viteProcess = Start-Process -FilePath $nodeExe `
        -ArgumentList @($viteEntry, '--host', '127.0.0.1', '--port', '5173', '--strictPort') `
        -WorkingDirectory $uiRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $viteLog `
        -RedirectStandardError $viteErrorLog `
        -PassThru

    Write-Host 'Starting the React UI dev server…'
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($viteProcess.HasExited) {
            $details = if (Test-Path $viteErrorLog) { Get-Content $viteErrorLog -Raw } else { '' }
            throw "The React UI dev server exited early. $details"
        }
        try {
            $response = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -TimeoutSec 1 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                $ready = $true
                break
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $ready) {
        throw "The React UI did not become ready. See $viteLog and $viteErrorLog."
    }

    # Close only an earlier rewrite shell from this checkout; leave the installed Kotlin app alone.
    Get-Process -Name 'nuvio-desktop-shell' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $shellExe } |
        Stop-Process -Force

    Write-Host 'Starting the Tauri shell. It starts and supervises the Kotlin bridge itself.'
    Push-Location $tauriRoot
    try {
        & cargo run
        if ($LASTEXITCODE -ne 0) {
            throw "The Tauri shell exited with code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} catch {
    Write-Error $_
    exit 1
} finally {
    if ($viteProcess -and -not $viteProcess.HasExited) {
        Stop-Process -Id $viteProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
