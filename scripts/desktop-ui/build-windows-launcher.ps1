param([Parameter(Mandatory)][string]$RuntimeDirectory)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtime = (Resolve-Path -LiteralPath $RuntimeDirectory).Path
if (-not $env:JAVA_HOME -or -not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'include\jni.h'))) {
    throw 'JAVA_HOME must point to a JDK with JNI headers.'
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Visual Studio C++ x64 build tools are required for the backend launcher.' }
$build = Join-Path $repoRoot 'desktop-ui\src-tauri\target\backend-launcher'
New-Item -ItemType Directory -Path $build -Force | Out-Null
$source = Join-Path $PSScriptRoot 'windows-launcher'
Copy-Item -LiteralPath (Join-Path $repoRoot 'desktop-ui\src-tauri\icons\icon.ico') -Destination (Join-Path $build 'icon.ico') -Force
# A single native build shell: vcvars initializes cl/rc/link for both local and
# hosted CI builds. Paths are quoted and come only from trusted build locations.
$commands = @"
@echo off
call "$vs\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
cd /d "$build"
rc /nologo /fo Nuvio.res "$source\Nuvio.rc"
if errorlevel 1 exit /b 1
cl /nologo /std:c++17 /EHsc /W4 /WX /MT /O2 /DUNICODE /D_UNICODE /I "$env:JAVA_HOME\include" /I "$env:JAVA_HOME\include\win32" "$source\main.cpp" Nuvio.res /Fe:Nuvio.exe /link /SUBSYSTEM:WINDOWS /STACK:2097152 /MANIFEST:EMBED /MANIFESTINPUT:"$source\Nuvio.manifest" shell32.lib
exit /b %errorlevel%
"@
$batch = Join-Path $build 'build.cmd'
Set-Content -LiteralPath $batch -Value $commands -Encoding Default
& $env:ComSpec /d /c "`"$batch`""
if ($LASTEXITCODE -ne 0) { throw 'Native backend launcher compilation failed.' }
$launcher = Join-Path $build 'Nuvio.exe'
$info = (Get-Item -LiteralPath $launcher).VersionInfo
if ($info.FileDescription -ne 'Nuvio' -or $info.ProductName -ne 'Nuvio') { throw 'Backend launcher branding is missing.' }
Copy-Item -LiteralPath $launcher -Destination (Join-Path $runtime 'bin\Nuvio.exe') -Force
Write-Output 'Built branded backend launcher: runtime/bin/Nuvio.exe'
