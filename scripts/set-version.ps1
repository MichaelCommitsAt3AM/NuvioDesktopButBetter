<#
.SYNOPSIS
  Windows wrapper for scripts/set-version.sh.

.DESCRIPTION
  Runs set-version.sh through Git for Windows' bash so the version rules
  (strictly increasing build codes, file formats) live in one script only.
  All arguments are forwarded unchanged and the script's exit code is returned.

.EXAMPLE
  .\scripts\set-version.ps1 --show
  .\scripts\set-version.ps1 --desktop 0.1.35.1 --desktop-code 50
#>
$ErrorActionPreference = 'Stop'

function Find-GitBash {
    $candidates = @()
    $git = Get-Command git -ErrorAction SilentlyContinue
    if ($git) {
        # e.g. C:\Program Files\Git\mingw64\libexec\git-core -> C:\Program Files\Git
        $execPath = (& $git.Source --exec-path 2>$null)
        if ($execPath) {
            $gitRoot = Split-Path (Split-Path (Split-Path $execPath -Parent) -Parent) -Parent
            $candidates += Join-Path $gitRoot 'bin\bash.exe'
        }
        # e.g. C:\Program Files\Git\cmd\git.exe -> C:\Program Files\Git
        $candidates += Join-Path (Split-Path (Split-Path $git.Source -Parent) -Parent) 'bin\bash.exe'
    }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, "$env:LOCALAPPDATA\Programs")) {
        if ($base) { $candidates += Join-Path $base 'Git\bin\bash.exe' }
    }
    # Never fall back to System32\bash.exe: that is WSL, which sees different paths.
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) { return $candidate }
    }
    return $null
}

$bash = Find-GitBash
if (-not $bash) {
    Write-Error 'Git Bash (bash.exe from Git for Windows) was not found. Install Git for Windows or run scripts/set-version.sh from Git Bash.'
    exit 1
}

$script = (Join-Path $PSScriptRoot 'set-version.sh') -replace '\\', '/'
& $bash $script @args
exit $LASTEXITCODE
