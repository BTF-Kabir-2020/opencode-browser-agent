#requires -Version 5.1
<#
  Easy INSTALL / UPDATE for the opencode-agent-browser plugin (Windows).

  First install (or after editing the source):
      powershell -ExecutionPolicy Bypass -File .\install.ps1

  Update (git pull -> rebuild -> redeploy):
      powershell -ExecutionPolicy Bypass -File .\install.ps1 -Update

  What it does:
    1. (with -Update)  git pull --ff-only
    2. npm install if node_modules is missing
    3. build dist/index.js + dist/index.d.ts  (esbuild via npx, then tsc)
    4. sanity check the bundle (no pkill guidance, has the new policy)
    5. copy dist to the 3 installed plugin locations (config + cache)
    6. point the global opencode.json at the local dist (file:/// URL)
    7. strip the UTF-8 BOM from ~\.agent-browser\config.json
  Then: restart opencode (plugins load at startup).

  The script only touches the C: drive and never touches running browsers.
#>
[CmdletBinding()]
param([switch]$Update)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $repo 'dist'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    !!  $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------- 1. update
if ($Update) {
    Write-Step "git pull (update)"
    Push-Location $repo
    try {
        git pull --ff-only
        if ($LASTEXITCODE -ne 0) { Write-Warn2 "git pull failed (dirty tree or offline) - continuing with local files" }
        else { Write-Ok "repository updated" }
    } finally { Pop-Location }
}

# ------------------------------------------------------------ 2. node deps
Write-Step "dependencies"
if (-not (Test-Path (Join-Path $repo 'node_modules\@opencode\plugin'))) {
    Write-Host "    node_modules missing -> npm install"
    Push-Location $repo
    try {
        npm install --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
    } finally { Pop-Location }
}
Write-Ok "node_modules present"

# ----------------------------------------------------------------- 3. build
Write-Step "build"
Push-Location $repo
try {
    & npx.cmd --yes esbuild@0.25.0 "$repo\index.ts" --bundle --platform=node --format=esm --target=esnext "--outfile=$dist\index.js"
    if ($LASTEXITCODE -ne 0) { throw "esbuild failed" }
    Write-Ok "dist\index.js bundled"

    if (Test-Path (Join-Path $repo 'node_modules\.bin\tsc.cmd')) {
        & (Join-Path $repo 'node_modules\.bin\tsc.cmd')
        if ($LASTEXITCODE -ne 0) { Write-Warn2 "tsc (declarations) failed - .d.ts may be stale" }
        else { Write-Ok "dist\index.d.ts generated" }
    } else {
        Write-Warn2 "tsc not installed - skipped declarations"
    }
} finally { Pop-Location }

if (-not (Test-Path (Join-Path $dist 'index.js'))) { throw "build produced no dist\index.js" }

# ---------------------------------------------------------- 4. sanity check
Write-Step "sanity check"
$bundle = [IO.File]::ReadAllText((Join-Path $dist 'index.js'))
# Unsafe only if a rendered line STARTS with the kill command (i.e. it is
# presented as something to run). Sentences like 'NEVER run pkill ...' are fine.
$unsafe = ($bundle -split '\\n') |
    Where-Object { ($_.TrimStart([char[]]' -*#>|`"' + [char]39)) -match '^pkill\b' }
if ($unsafe) { throw "bundle presents pkill as a command - aborting deploy" }
if ($bundle -notmatch 'auto-connect')    { throw "bundle missing auto-connect policy - aborting deploy" }
if ($bundle -notmatch 'skills get core') { throw "bundle missing 'skills get core' reference - aborting deploy" }
Write-Ok ("bundle " + [Math]::Round((Get-Item (Join-Path $dist 'index.js')).Length / 1KB) + " KB, policy clean")

# --------------------------------------------------------------- 5. deploy
Write-Step "deploy to installed plugin copies"
$selfRoot = Join-Path $env:USERPROFILE '.config\opencode\node_modules\opencode-browser-agent'
if ((Test-Path (Split-Path -Parent $selfRoot)) -and -not (Test-Path $selfRoot)) {
    New-Item -ItemType Directory -Path $selfRoot -Force | Out-Null
}
$targets = @(
    (Join-Path $env:USERPROFILE '.config\opencode\node_modules\opencode-browser-agent\dist'),
    (Join-Path $env:USERPROFILE '.config\opencode\node_modules\opencode-agent-browser\dist'),
    (Join-Path $env:USERPROFILE '.cache\opencode\packages\opencode-agent-browser\node_modules\opencode-agent-browser\dist'),
    (Join-Path $env:USERPROFILE '.cache\opencode\packages\opencode-agent-browser@latest\node_modules\opencode-agent-browser\dist')
)
foreach ($t in $targets) {
    if (Test-Path (Split-Path -Parent $t)) {
        New-Item -ItemType Directory -Path $t -Force | Out-Null
        Copy-Item (Join-Path $dist 'index.js') -Destination $t -Force
        if (Test-Path (Join-Path $dist 'index.d.ts')) { Copy-Item (Join-Path $dist 'index.d.ts') -Destination $t -Force }
        Write-Ok $t
    } else {
        Write-Warn2 "not found, skipped: $t"
    }
}

# make the self-named copy resolvable as a bare package name too
$selfDir = Join-Path $env:USERPROFILE '.config\opencode\node_modules\opencode-browser-agent'
if (Test-Path $selfDir) {
    $ver = (Get-Content (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
    $manifest = @{
        name    = 'opencode-browser-agent'
        version = $ver
        type    = 'module'
        main    = 'dist/index.js'
        exports = @{ '.' = @{ import = './dist/index.js' } }
    } | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText((Join-Path $selfDir 'package.json'), $manifest + "`n", $utf8NoBom)
    Write-Ok "manifest for bare-name resolution"
}

# -------------------------------------------------- 6. point opencode at it
Write-Step "global opencode.json"
$cfgPath = Join-Path $env:USERPROFILE '.config\opencode\opencode.json'
if (Test-Path $cfgPath) {
    $raw = [IO.File]::ReadAllText($cfgPath)
    if ($raw[0] -eq [char]0xFEFF) { $raw = $raw.Substring(1) }
    $cfg = $raw | ConvertFrom-Json
    $distUrl = 'file:///' + ((Join-Path $dist 'index.js') -replace '\\', '/')
    if (-not $cfg.plugins) { $cfg | Add-Member -NotePropertyName plugins -NotePropertyValue @() }
    $cfg.plugins = @($distUrl)
    $json = $cfg | ConvertTo-Json -Depth 10
    [IO.File]::WriteAllText($cfgPath, $json + "`r`n", $utf8NoBom)
    Write-Ok "plugin -> $distUrl"
} else {
    Write-Warn2 "$cfgPath not found - add the plugin entry manually"
}

# ------------------------------------------------------- 7. strip BOM noise
Write-Step "agent-browser config.json"
$abCfg = Join-Path $env:USERPROFILE '.agent-browser\config.json'
if (Test-Path $abCfg) {
    $bytes = [IO.File]::ReadAllBytes($abCfg)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $text = [Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
        [IO.File]::WriteAllText($abCfg, $text, $utf8NoBom)
        Write-Ok "BOM removed ($($bytes.Length) -> $($bytes.Length - 3) bytes)"
    } else {
        Write-Ok "no BOM present"
    }
} else {
    Write-Warn2 "$abCfg not found - skipped"
}

# -------------------------------------------------------------- 8. summary
Write-Host ""
Write-Host "Done. Restart opencode so the plugin reloads." -ForegroundColor Green
Write-Host "  install:  powershell -ExecutionPolicy Bypass -File .\install.ps1"
Write-Host "  update:   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Update"
Write-Host "  (update.ps1 does the same as install.ps1 -Update)"
