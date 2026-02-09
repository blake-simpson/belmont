Param(
  [string]$BelmontDir = ""
)

$ErrorActionPreference = "Stop"

function Resolve-BelmontDir {
  param([string]$Override)
  if ($Override -and $Override.Trim() -ne "") {
    return (Resolve-Path $Override).Path
  }
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$belmontDir = Resolve-BelmontDir $BelmontDir

Write-Host "Belmont Helper Setup (Windows)"
Write-Host "=============================="
Write-Host ""
Write-Host "Belmont directory: $belmontDir"
Write-Host ""

$root = (Get-Location).Path
$stateDir = Join-Path $root ".belmont"
$binDir = Join-Path $stateDir "bin"

if (-not (Test-Path $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir | Out-Null
  Write-Host "Created $stateDir"
}

if (-not (Test-Path $binDir)) {
  New-Item -ItemType Directory -Path $binDir | Out-Null
  Write-Host "Created $binDir"
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
  Write-Host "Go not found. Install Go and re-run this script."
  exit 1
}

$outPath = Join-Path $binDir "belmont.exe"
Push-Location $belmontDir
try {
  Write-Host "Building belmont..."
  & go build -o $outPath ./cmd/belmont
  Write-Host "  + $outPath"
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Running belmont install..."
& $outPath install --source $belmontDir
Write-Host ""
Write-Host "Done."
