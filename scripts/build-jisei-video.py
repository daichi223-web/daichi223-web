# -*- coding: utf-8 -*-
"""
時制系 解説動画を軽量生成する。
  Pillow でスライド画像 → edge-tts でナレーション → ffmpeg で結合。
出力: videos/jodoshi-jisei.mp4
依存: Pillow, edge-tts, ffmpeg/ffprobe（PATH または FFMPEG 環境変数）
使い方: python scripts/build-jisei-video.py
"""
import os, sys, glob, json, subprocess, asyncio, shutil
from PIL import Image, ImageDraw, ImageFont
import edge_tts

W, H = 1280, 720
BG = (24, 28, 38)          # 紺
FG = (245, 245, 240)
ACCENT = (240, 180, 80)    # 金
SUB = (150, 200, 210)
VOICE = "ja-JP-NanamiNeural"
RATE = "+8%"
FONT_B = r"C:\Windows\Fonts\YuGothB.ttc"
FONT_R = r"C:\Windows\Fonts\YuGothM.ttc"
OUT = "videos/jodoshi-jisei.mp4"
TMP = "videos/_jisei_tmp"

def ffmpeg_bin(name):
    p = shutil.which(name)
    if p: return p
    # winget Gyan.FFmpeg の既定location を探索
    base = os.path.expanduser(r"~\AppData\Local\Microsoft\WinGet\Packages")
    for c in glob.glob(os.path.join(base, "Gyan.FFmpeg*", "**", name+".exe"), recursive=True):
        return c
    return None

SLIDES = [
    {"title":"助動詞 時制系", "accent":"過去・完了・存続、そして強意・推量",
     "lines":[],
     "narr":"助動詞の時制系を整理しましょう。過去、完了、存続、そして強意と推量です。"},
    {"title":"過去 ── き・けり", "accent":"接続：連用形",
     "lines":["き … 自分が直接体験した過去","けり … 伝聞の過去／詠嘆（気づき）"],
     "narr":"過去の助動詞は、きと、けり。きは、自分が直接体験した過去。けりは、人から聞いた過去や、気づきの詠嘆を表します。どちらも連用形に付きます。"},
    {"title":"完了 ── つ・ぬ・たり・り", "accent":"〜た／〜てしまった",
     "lines":["つ … 意図的な動作の完了","ぬ … 自然な推移の完了","たり・り … 完了の意味もある"],
     "narr":"完了は、つ、ぬ、たり、り。動作が終わったことを、〜た、〜てしまった、と表します。つは意図的な完了、ぬは自然な完了です。"},
    {"title":"存続 ── たり・り", "accent":"〜ている（状態の継続）",
     "lines":["結果や状態が続いていることを表す","例：寝たるに ＝ 寝ているところに"],
     "narr":"たりと、りには、存続の意味もあります。〜ている、と、状態が続いていることを表します。たとえば、寝たるに、は、寝ているところに、という意味です。"},
    {"title":"強意（確述） ── つ・ぬ＋推量", "accent":"きっと〜だろう",
     "lines":["つ・ぬ ＋ む・べし → 強意","まだ実現していない＝未確定だから","らむ・けむ が続くときは完了のまま"],
     "narr":"つと、ぬの下に、推量の、むや、べしが続くと、強意になります。まだ実現していない、未確定のことなので、きっと〜だろう、と訳します。ただし、現在推量のらむ、過去推量のけむが続くときは、すでに起きた事態なので、完了のままです。"},
    {"title":"そして推量系へ", "accent":"時制系の先に推量系",
     "lines":["む・らむ・けむ・べし・らし・めり","時制と推量がつながって意味を作る"],
     "narr":"時制系をおさえたら、その先は推量系です。む、らむ、けむ、べし、らし、めり。時制と推量がつながって、文の意味を作ります。"},
    {"title":"まとめ", "accent":"接続と意味の見方",
     "lines":["接続：き〜けむは連用形（り は例外）","意味は、文脈と下に続く語で確定する"],
     "narr":"まとめます。時制系の接続は、りを除いて連用形。意味は、文脈と、下に続く語で確定する。これが、時制系を読み解くコツです。"},
]

def render_slide(s, path):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    title_f = ImageFont.truetype(FONT_B, 60)
    accent_f = ImageFont.truetype(FONT_R, 34)
    line_f = ImageFont.truetype(FONT_R, 40)
    # 上部アクセントバー
    d.rectangle([0, 0, W, 10], fill=ACCENT)
    # タイトル
    d.text((80, 90), s["title"], font=title_f, fill=FG)
    if s.get("accent"):
        d.text((80, 175), s["accent"], font=accent_f, fill=ACCENT)
    # 箇条書き
    y = 280
    for ln in s["lines"]:
        d.ellipse([80, y+16, 96, y+32], fill=SUB)
        d.text((120, y), ln, font=line_f, fill=FG)
        y += 78
    # フッタ
    d.text((80, H-60), "文法道場 ・ 助動詞 時制系", font=accent_f, fill=(120,130,150))
    img.save(path)

async def synth(text, path):
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(path)

def duration(ffprobe, path):
    out = subprocess.check_output([ffprobe, "-v","quiet","-show_entries","format=duration",
        "-of","csv=p=0", path], text=True).strip()
    return float(out)

def main():
    ff = ffmpeg_bin("ffmpeg"); fp = ffmpeg_bin("ffprobe")
    if not ff or not fp:
        print("✘ ffmpeg/ffprobe が見つかりません。インストール後に PATH を確認してください。")
        sys.exit(1)
    os.makedirs(TMP, exist_ok=True); os.makedirs("videos", exist_ok=True)
    segs = []
    for i, s in enumerate(SLIDES):
        png = f"{TMP}/s{i:02d}.png"; mp3 = f"{TMP}/s{i:02d}.mp3"; seg = f"{TMP}/s{i:02d}.mp4"
        render_slide(s, png)
        asyncio.run(synth(s["narr"], mp3))
        dur = duration(fp, mp3) + 0.6  # 余韻
        subprocess.run([ff,"-y","-loop","1","-i",png,"-i",mp3,
            "-c:v","libx264","-tune","stillimage","-t",f"{dur:.2f}",
            "-c:a","aac","-b:a","128k","-pix_fmt","yuv420p","-vf","scale=1280:720",
            seg], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        segs.append(seg); print(f"  slide {i}: {dur:.1f}s")
    lst = f"{TMP}/list.txt"
    with open(lst,"w",encoding="utf-8") as w:
        for s in segs: w.write(f"file '{os.path.abspath(s)}'\n")
    subprocess.run([ff,"-y","-f","concat","-safe","0","-i",lst,"-c","copy",OUT],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"✅ 出力: {OUT}  ({duration(fp,OUT):.1f}s)")

if __name__=="__main__":
    main()
