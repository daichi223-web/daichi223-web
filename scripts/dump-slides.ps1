# 全デ板デッキのスライド構成をダンプ（文法書ページ検出とナレーション台本作成の材料）
# 出力: videos/slide-dump.json
$ErrorActionPreference = "Stop"
$base = "F:\古文スライド集"
$jd = "$base\★古典文法\④助動詞"
$decks = @(
  @{ key="doushi-katsuyo";       p="$base\★古典文法\②動詞の活用\デ板「動詞の活用」 .pptx" },
  @{ key="keiyoshi-katsuyo";     p="$base\★古典文法\③形容詞・形容動詞\デ板形容詞形容動詞.pptx" },
  @{ key="jodoshi-intro";        p="$jd\デ板①助動詞とは➁歌③活用.pptx" },
  @{ key="jodoshi-ki-keri-zu";   p="$jd\デ板④「き」「けり」「ず」.pptx" },
  @{ key="jodoshi-tsu-nu-tari-ri"; p="$jd\デ板⑤「つ」「ぬ」⑥「たり」「り」.pptx" },
  @{ key="jodoshi-ramu-kemu";    p="$jd\デ板⑧「らむ」「けむ」.pptx" },
  @{ key="jodoshi-beshi";        p="$jd\デ板⑨「べし」「まじ」.pptx" },
  @{ key="jodoshi-dantei";       p="$jd\デ板➉「なり」「たり」(断定).pptx" },
  @{ key="jodoshi-mashi";        p="$jd\デ板⑪「まし」.pptx" },
  @{ key="jodoshi-nari-denbun";  p="$jd\デ板⑫「なり」(伝聞推定).pptx" },
  @{ key="jodoshi-meri-rashi";   p="$jd\デ板⑬「めり」「らし」.pptx" },
  @{ key="jodoshi-su";           p="$jd\デ板⑭「す・さす・しむ」.pptx" },
  @{ key="jodoshi-ru";           p="$jd\デ板⑮「る」「らる」.pptx" },
  @{ key="jodoshi-ganbou";       p="$jd\デ板⑯「まほし」「たし」「ごとし」.pptx" },
  @{ key="jodoshi-mu";           p="$jd\デ板⑦「む(むず)」「じ」.pptx" },
  @{ key="keigo";                p="$base\★敬語\デ板「敬語マスター」.pptx" }
)

$pp = New-Object -ComObject PowerPoint.Application
$result = @{}
try {
  foreach ($d in $decks) {
    if (-not (Test-Path $d.p)) { Write-Output "skip: $($d.p)"; continue }
    $pres = $pp.Presentations.Open((Resolve-Path $d.p).Path, -1, 0, 0)
    $slideArea = $pres.PageSetup.SlideWidth * $pres.PageSetup.SlideHeight
    $slides = @()
    foreach ($s in $pres.Slides) {
      $texts = @(); $maxPicRatio = 0.0; $picCount = 0
      foreach ($sh in $s.Shapes) {
        # 13=Picture, 11=OLE? テキスト収集
        if ($sh.HasTextFrame -eq -1 -and $sh.TextFrame.HasText -eq -1) {
          $t = $sh.TextFrame.TextRange.Text -replace "\r", " / "
          if ($t.Trim()) { $texts += $t.Trim() }
        }
        if ($sh.Type -eq 13) {
          $picCount++
          $ratio = ($sh.Width * $sh.Height) / $slideArea
          if ($ratio -gt $maxPicRatio) { $maxPicRatio = $ratio }
        }
      }
      $slides += @{ idx = $s.SlideIndex; texts = $texts; picCount = $picCount; maxPicRatio = [math]::Round($maxPicRatio, 2) }
    }
    $result[$d.key] = $slides
    $pres.Close()
    Write-Output "$($d.key): $($slides.Count) slides"
  }
} finally { $pp.Quit() }
$result | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 "F:\A2A\apps-released\kobun-tan\videos\slide-dump.json"
Write-Output "→ videos/slide-dump.json"
