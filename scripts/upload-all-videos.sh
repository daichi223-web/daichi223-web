#!/usr/bin/env bash
# 書き出した mp4 を Storage + grammar_media に一括登録する。
# 前提: scripts/export-all-videos.ps1 完了後。プロジェクト直下で:
#   bash scripts/upload-all-videos.sh
# 注意: 再実行すると --link 行が重複する（やり直す時は先に --delete <topicId>）。
set -e
V() { node --env-file=.env.local scripts/grammar-video.mjs "$@"; }

# 単独トピック
V doushi-katsuyo  videos/doushi-katsuyo.mp4  "動詞の活用 講義（デ板）"
V keiyoshi-katsuyo videos/keiyoshi-katsuyo.mp4 "形容詞・形容動詞 講義（デ板）"
V keigo           videos/keigo.mp4           "敬語マスター 講義（デ板）"
V jodoshi-beshi   videos/jodoshi-beshi.mp4   "助動詞「べし」「まじ」講義（デ板）"
V jodoshi-su      videos/jodoshi-su.mp4      "使役・尊敬「す・さす・しむ」講義（デ板）"
V jodoshi-ru      videos/jodoshi-ru.mp4      "「る」「らる」講義（デ板）"

# 1本の動画を複数トピックで共有（primary でアップロード → 他へ link）
V jodoshi-keri    videos/jodoshi-ki-keri-zu.mp4 "「き」「けり」「ず」講義（デ板）"
V --link jodoshi-zu jodoshi-keri.mp4 "「き」「けり」「ず」講義（デ板）"

V jodoshi-tsu     videos/jodoshi-tsu-nu-tari-ri.mp4 "「つ」「ぬ」「たり」「り」講義（デ板）"
V --link jodoshi-nu   jodoshi-tsu.mp4 "「つ」「ぬ」「たり」「り」講義（デ板）"
V --link jodoshi-tari jodoshi-tsu.mp4 "「つ」「ぬ」「たり」「り」講義（デ板）"
V --link jodoshi-ri   jodoshi-tsu.mp4 "「つ」「ぬ」「たり」「り」講義（デ板）"

# なり: 伝聞推定(primary) + 断定(別動画を link)
V jodoshi-nari    videos/jodoshi-nari-denbun.mp4 "伝聞推定「なり」講義（デ板）"
V jodoshi-dantei  videos/jodoshi-dantei.mp4      "断定「なり」「たり」講義（デ板）"
V --link jodoshi-nari jodoshi-dantei.mp4 "断定「なり」「たり」講義（デ板）"

# グループ単元（ドリル追加で道場ホームに出現予定）
V jodoshi-suiryo  videos/jodoshi-ramu-kemu.mp4 "「らむ」「けむ」講義（デ板）"
V --upload jodoshi-meri-rashi.mp4 videos/jodoshi-meri-rashi.mp4
V --link jodoshi-suiryo jodoshi-meri-rashi.mp4 "「めり」「らし」講義（デ板）"

V jodoshi-ganbou  videos/jodoshi-ganbou.mp4 "「まほし」「たし」「ごとし」講義（デ板）"
V --upload jodoshi-mashi.mp4 videos/jodoshi-mashi.mp4
V --link jodoshi-ganbou jodoshi-mashi.mp4 "「まし」講義（デ板）"

V jodoshi-jisei   videos/jodoshi-intro.mp4 "助動詞とは・接続の歌・活用（デ板）"

echo "=== 全動画の登録完了 ==="
