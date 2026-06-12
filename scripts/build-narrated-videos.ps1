# ナレーション入り動画のビルド
# 元pptxをコピー → 除外スライド削除 → 《文》ページ参照を削除 → 各スライドに音声埋め込み
# → 音声の長さでスライド送り → mp4 書き出し
# 使い方: pwsh scripts/build-narrated-videos.ps1 [deckKey ...]（無指定で全デッキ）
param([string[]]$Only = @(), [int]$Height = 720, [int]$Fps = 30)
$ErrorActionPreference = "Stop"
$proj = "F:\A2A\apps-released\kobun-tan"
$base = "F:\古文スライド集"
$jd = "$base\★古典文法\④助動詞"

$decks = [ordered]@{
  "doushi-katsuyo"         = "$base\★古典文法\②動詞の活用\デ板「動詞の活用」 .pptx"
  "keiyoshi-katsuyo"       = "$base\★古典文法\③形容詞・形容動詞\デ板形容詞形容動詞.pptx"
  "keigo"                  = "$base\★敬語\デ板「敬語マスター」.pptx"
  "jodoshi-intro"          = "$jd\デ板①助動詞とは➁歌③活用.pptx"
  "jodoshi-ki-keri-zu"     = "$jd\デ板④「き」「けり」「ず」.pptx"
  "jodoshi-tsu-nu-tari-ri" = "$jd\デ板⑤「つ」「ぬ」⑥「たり」「り」.pptx"
  "jodoshi-mu"             = "$jd\デ板⑦「む(むず)」「じ」.pptx"
  "jodoshi-ramu-kemu"      = "$jd\デ板⑧「らむ」「けむ」.pptx"
  "jodoshi-beshi"          = "$jd\デ板⑨「べし」「まじ」.pptx"
  "jodoshi-dantei"         = "$jd\デ板➉「なり」「たり」(断定).pptx"
  "jodoshi-mashi"          = "$jd\デ板⑪「まし」.pptx"
  "jodoshi-nari-denbun"    = "$jd\デ板⑫「なり」(伝聞推定).pptx"
  "jodoshi-meri-rashi"     = "$jd\デ板⑬「めり」「らし」.pptx"
  "jodoshi-su"             = "$jd\デ板⑭「す・さす・しむ」.pptx"
  "jodoshi-ru"             = "$jd\デ板⑮「る」「らる」.pptx"
  "jodoshi-ganbou"         = "$jd\デ板⑯「まほし」「たし」「ごとし」.pptx"
}

$narr = Get-Content "$proj\scripts\narrations.json" -Raw -Encoding utf8 | ConvertFrom-Json
New-Item -ItemType Directory -Force "$proj\videos\narrated" | Out-Null
# 長尺デッキはサイズ調整（Storage 50MB 制限）
$special = @{ "doushi-katsuyo" = @(360, 15); "keigo" = @(480, 30) }
$pp = New-Object -ComObject PowerPoint.Application
$ok = 0
try {
  foreach ($key in $decks.Keys) {
    if ($Only.Count -gt 0 -and $Only -notcontains $key) { continue }
    $src = $decks[$key]
    $out = "$proj\videos\narrated\$key.mp4"
    if (Test-Path $out) { Write-Output "skip(済): $key"; $ok++; continue }
    if (-not (Test-Path $src)) { Write-Output "✘ 入力なし: $src"; continue }
    $conf = $narr.$key
    $durs = Get-Content "$proj\videos\audio\$key\durations.json" -Raw -Encoding utf8 | ConvertFrom-Json

    $tmp = "$env:TEMP\narrated_$key.pptx"
    Copy-Item $src $tmp -Force
    $pres = $pp.Presentations.Open($tmp, 0, 0, 0)  # 編集可で開く(非表示)

    # 1) 除外スライドを後ろから削除（JSON数値はInt64なのでintへキャスト）
    $excl = @($conf.exclude | ForEach-Object { [int]$_ } | Sort-Object -Descending)
    foreach ($e in $excl) { $pres.Slides.Item([int]$e).Delete() }

    # 2) 残ったスライドの元番号リスト（昇順）= 新しい並びに対応
    $kept = @()
    foreach ($p in $conf.slides.PSObject.Properties) { $kept += [int]$p.Name }
    $kept = @($kept | Where-Object { $excl -notcontains $_ } | Sort-Object)

    # 3) 各スライド: 《文》参照の段落を消し、音声を埋め込み、自動送り設定
    for ($i = 0; $i -lt $pres.Slides.Count; $i++) {
      $slide = $pres.Slides.Item($i + 1)
      $orig = $kept[$i]
      foreach ($sh in $slide.Shapes) {
        if ($sh.HasTextFrame -eq -1 -and $sh.TextFrame.HasText -eq -1) {
          $tr = $sh.TextFrame.TextRange
          for ($pi = 1; $pi -le $tr.Paragraphs().Count; $pi++) {
            $para = $tr.Paragraphs($pi)
            if ($para.Text -match "《文》") { $para.Text = [char]13 }
          }
        }
      }
      $mp3 = "$proj\videos\audio\$key\s$orig.mp3"
      $dur = [double]($durs.PSObject.Properties[[string]$orig].Value)
      if (Test-Path $mp3) {
        $media = $slide.Shapes.AddMediaObject2($mp3, 0, -1, 10, 10, 24, 24)
        $media.AnimationSettings.PlaySettings.PlayOnEntry = -1
        $media.AnimationSettings.PlaySettings.HideWhileNotPlaying = -1
        $media.AnimationSettings.AdvanceMode = 2  # ppAdvanceOnTime
        $slide.SlideShowTransition.AdvanceOnTime = -1
        $slide.SlideShowTransition.AdvanceTime = $dur + 0.8
      } else {
        $slide.SlideShowTransition.AdvanceOnTime = -1
        $slide.SlideShowTransition.AdvanceTime = 6
      }
    }

    # 4) 動画書き出し（タイミング＋ナレーション使用）。埋め込みメディア確定のため先に保存
    $pres.Save()
    $h = $Height; $f = $Fps
    if ($special.ContainsKey($key)) { $h = $special[$key][0]; $f = $special[$key][1] }
    $pres.CreateVideo($out, $true, 5, $h, $f, 85)
    while ($pres.CreateVideoStatus -eq 1 -or $pres.CreateVideoStatus -eq 2) { Start-Sleep -Seconds 5 }
    $status = $pres.CreateVideoStatus
    $pres.Close()
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    if ($status -eq 3 -and (Test-Path $out)) {
      $mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
      Write-Output "✓ $key (${mb}MB)"; $ok++
    } else {
      Write-Output "✘ $key (status=$status)"
    }
  }
} finally { $pp.Quit() }
Write-Output "=== 完了: $ok 本 ==="
