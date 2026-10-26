$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$taskCargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path -LiteralPath $taskCargoBin) { $env:Path = "$taskCargoBin;$env:Path" }
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Rust/Cargo is required.' }
$env:CARGO_BUILD_JOBS = '4'

& npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed.' }
& cargo test --manifest-path src-tauri/Cargo.toml --release --lib --locked
if ($LASTEXITCODE -ne 0) { throw 'Native tests failed.' }
& npm.cmd run package:windows
if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed.' }
$taskProductionExe = Join-Path $taskRoot 'src-tauri\target\release\folio.exe'
$taskProductionText = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($taskProductionExe))
if ($taskProductionText.Contains('com.zhijian.folio.close-smoke-')) { throw 'Refusing to package the close-smoke diagnostic executable.' }
$taskProductionText = $null

$taskInstaller = Get-ChildItem -LiteralPath (Join-Path $taskRoot 'src-tauri\target\release\bundle\nsis') -Filter '*.exe' -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $taskInstaller) { throw 'NSIS installer was not produced.' }
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskOutput = Join-Path (Split-Path -Parent $taskRoot) 'output'
New-Item -ItemType Directory -Path $taskOutput -Force | Out-Null
$taskDestination = Join-Path $taskOutput "Folio-$taskVersion-windows-x64-setup.exe"
Copy-Item -LiteralPath $taskInstaller.FullName -Destination $taskDestination -Force
$taskHash = (Get-FileHash -LiteralPath $taskDestination -Algorithm SHA256).Hash.ToLowerInvariant()
[System.IO.File]::WriteAllText("$taskDestination.sha256", "$taskHash  $(Split-Path -Leaf $taskDestination)`n")
Write-Output "Installer: $taskDestination"
Write-Output "SHA256: $taskHash"
