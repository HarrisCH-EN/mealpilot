# Regenerates the settings/about/menu/recipes icon PNGs from the CSS shape source.
# Pattern mirrors scripts/generate-tab-icons.ps1, but renders the real CSS geometry
# (black icon on white) via headless Chrome, then converts it to black-on-transparent PNG.
#
# Prereqs (one-time):
#   npm install pngjs            # in scripts/_icongen (or a temp dir; see post-process.js)
#   Google Chrome installed at C:\Program Files\Google\Chrome\Application\chrome.exe
#
# Usage:  pwsh scripts\generate-ui-icons.ps1

$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { throw "Chrome not found at $chrome" }

$html = Join-Path $PSScriptRoot '_icongen\render-icons.html'
$out = Join-Path $env:TEMP 'dsh-icons-grid.png'
if (Test-Path $out) { Remove-Item $out }

& $chrome --headless=new --disable-gpu --no-sandbox --no-first-run --hide-scrollbars `
  --force-device-scale-factor=3 --default-background-color=00000000 `
  --window-size=528,660 --screenshot="$out" --virtual-time-budget=2000 `
  "file:///$($html -replace '\\','/')"

# Chrome writes the screenshot asynchronously on Windows (GUI subsystem app).
$deadline = (Get-Date).AddSeconds(15)
while (-not (Test-Path $out) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
if (-not (Test-Path $out)) { throw 'Chrome screenshot was not produced.' }

node (Join-Path $PSScriptRoot '_icongen\post-process.js') $out
