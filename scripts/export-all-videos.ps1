# 全デ板スライドを mp4 へ順次書き出す（PowerPoint は同時1つなので直列）
# 使い方: pwsh scripts/export-all-videos.ps1
$ErrorActionPreference = "Continue"
$base = "F:\古文スライド集"
$out = "F:\A2A\apps-released\kobun-tan\videos"
$jd = "$base\★古典文法\④助動詞"

$jobs = @(
  @{ p = "$base\★古典文法\②動詞の活用\デ板「動詞の活用」 .pptx";            o = "doushi-katsuyo.mp4" },
  @{ p = "$base\★古典文法\③形容詞・形容動詞\デ板形容詞形容動詞.pptx";        o = "keiyoshi-katsuyo.mp4" },
  @{ p = "$jd\デ板①助動詞とは➁歌③活用.pptx";                               o = "jodoshi-intro.mp4" },
  @{ p = "$jd\デ板④「き」「けり」「ず」.pptx";                              o = "jodoshi-ki-keri-zu.mp4" },
  @{ p = "$jd\デ板⑤「つ」「ぬ」⑥「たり」「り」.pptx";                       o = "jodoshi-tsu-nu-tari-ri.mp4" },
  @{ p = "$jd\デ板⑧「らむ」「けむ」.pptx";                                  o = "jodoshi-ramu-kemu.mp4" },
  @{ p = "$jd\デ板⑨「べし」「まじ」.pptx";                                  o = "jodoshi-beshi.mp4" },
  @{ p = "$jd\デ板➉「なり」「たり」(断定).pptx";                             o = "jodoshi-dantei.mp4" },
  @{ p = "$jd\デ板⑪「まし」.pptx";                                          o = "jodoshi-mashi.mp4" },
  @{ p = "$jd\デ板⑫「なり」(伝聞推定).pptx";                                o = "jodoshi-nari-denbun.mp4" },
  @{ p = "$jd\デ板⑬「めり」「らし」.pptx";                                  o = "jodoshi-meri-rashi.mp4" },
  @{ p = "$jd\デ板⑭「す・さす・しむ」.pptx";                                o = "jodoshi-su.mp4" },
  @{ p = "$jd\デ板⑮「る」「らる」.pptx";                                    o = "jodoshi-ru.mp4" },
  @{ p = "$jd\デ板⑯「まほし」「たし」「ごとし」.pptx";                       o = "jodoshi-ganbou.mp4" },
  @{ p = "$base\★敬語\デ板「敬語マスター」.pptx";                           o = "keigo.mp4" }
)

$okCount = 0
foreach ($j in $jobs) {
  $dest = Join-Path $out $j.o
  if (Test-Path $dest) { Write-Output "skip(済): $($j.o)"; $okCount++; continue }
  if (-not (Test-Path $j.p)) { Write-Output "✘ 入力なし: $($j.p)"; continue }
  Write-Output "--- $($j.o) ---"
  pwsh -File "F:\A2A\apps-released\kobun-tan\scripts\export-pptx-video.ps1" -Pptx $j.p -Out $dest
  if ($LASTEXITCODE -eq 0 -and (Test-Path $dest)) { $okCount++ }
}
Write-Output "=== 完了: $okCount/$($jobs.Count) ==="
