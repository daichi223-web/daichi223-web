# PPTX → mp4 書き出し（PowerPoint COM / CreateVideo）
# 使い方: pwsh scripts/export-pptx-video.ps1 -Pptx "<入力.pptx>" -Out "<出力.mp4>" [-SlideSec 8] [-Height 720]
param(
  [Parameter(Mandatory=$true)][string]$Pptx,
  [Parameter(Mandatory=$true)][string]$Out,
  [int]$SlideSec = 8,
  [int]$Height = 720
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $Pptx)) { throw "入力が見つからない: $Pptx" }
$outDir = Split-Path $Out -Parent
if ($outDir -and -not (Test-Path $outDir)) { New-Item -ItemType Directory -Force $outDir | Out-Null }

$pp = New-Object -ComObject PowerPoint.Application
try {
  # WithWindow:=msoFalse で開く（画面を奪わない）。msoTrue=-1 / msoFalse=0
  $pres = $pp.Presentations.Open((Resolve-Path $Pptx).Path, -1, 0, 0)
  $slides = $pres.Slides.Count
  Write-Output "slides=$slides 推定 $([math]::Round($slides*$SlideSec/60,1))分 → $Out"
  # 録音タイミングがあれば使い、なければ1枚 $SlideSec 秒
  $pres.CreateVideo($Out, $true, $SlideSec, $Height, 30, 85)
  while ($pres.CreateVideoStatus -eq 1 -or $pres.CreateVideoStatus -eq 2) { Start-Sleep -Seconds 5 }
  if ($pres.CreateVideoStatus -ne 3) { throw "CreateVideo failed (status=$($pres.CreateVideoStatus))" }
  $size = [math]::Round((Get-Item $Out).Length/1MB,1)
  Write-Output "✓ 完了: $Out (${size}MB)"
  $pres.Close()
} finally {
  $pp.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp) | Out-Null
}
