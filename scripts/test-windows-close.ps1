param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskRoot
$env:Path = (Join-Path $env:USERPROFILE '.cargo\bin') + ';' + $env:Path
$env:CARGO_BUILD_JOBS = '4'
if (-not $SkipBuild) {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    & cargo build --manifest-path src-tauri/Cargo.toml --release --features tauri/custom-protocol,close-smoke-test --locked
    if ($LASTEXITCODE -ne 0) { throw 'Smoke executable build failed' }
}
$taskBuilt = Join-Path $taskRoot 'src-tauri\target\release\folio.exe'
# Refuse to launch/terminate a regular production build: the test needs its isolated profile.
$taskBinaryText = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($taskBuilt))
if (-not $taskBinaryText.Contains('com.zhijian.folio.close-smoke-')) { throw 'Not an isolated close-smoke executable' }
$taskBinaryText = $null
$taskDirectory = Join-Path $taskRoot 'src-tauri\target\close-smoke'
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$taskExe = Join-Path $taskDirectory 'folio-close-smoke.exe'
Copy-Item -LiteralPath $taskBuilt -Destination $taskExe -Force
$taskTimer = [Diagnostics.Stopwatch]::StartNew()
$taskProcess = Start-Process -FilePath $taskExe -WorkingDirectory $taskDirectory -WindowStyle Hidden -PassThru
if (-not $taskProcess.WaitForExit(30000)) {
    Stop-Process -Id $taskProcess.Id -ErrorAction SilentlyContinue
    throw 'The isolated native close test did not exit within 30 seconds'
}
$taskTimer.Stop()
$taskProfile = Join-Path $env:APPDATA ("com.zhijian.folio.close-smoke-$($taskProcess.Id)")
$taskDb = Join-Path $taskProfile 'library.sqlite'
if ($taskProcess.ExitCode -ne 0) { throw "Unexpected exit code: $($taskProcess.ExitCode)" }
if (-not (Test-Path -LiteralPath (Join-Path $taskProfile 'close-listener-ready.marker'))) { throw 'Frontend/SQLite close readiness was not acknowledged' }
if (-not (Test-Path -LiteralPath $taskDb)) { throw 'The database was not saved before closing' }
if (-not [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($taskDb)).StartsWith('SQLite format 3')) { throw 'Invalid saved database' }
if (Test-Path -LiteralPath (Join-Path $taskProfile 'library.bak')) { throw 'Repeated close requests caused duplicate saves' }
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskResult = [ordered]@{ version=$taskVersion; exitCode=$taskProcess.ExitCode; elapsedMs=$taskTimer.ElapsedMilliseconds; nativeCloseRequests=2; saves=1; databaseBytes=(Get-Item -LiteralPath $taskDb).Length; isolatedProfile=$taskProfile; frontendReady=$true; processExited=$true }
$taskJson = $taskResult | ConvertTo-Json -Depth 3
[IO.File]::WriteAllText((Join-Path $taskRoot 'test-results\windows-close.json'), $taskJson)
Write-Output $taskJson
