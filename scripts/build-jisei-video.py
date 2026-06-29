# -*- coding: utf-8 -*-
"""
時制系 解説動画（図入り）を軽量生成する。
  Pillow で図つきスライド → edge-tts ナレーション → ffmpeg 結合。
出力: videos/jodoshi-jisei-tense.mp4
"""
import os, sys, glob, math, subprocess, asyncio, shutil
from PIL import Image, ImageDraw, ImageFont
import edge_tts

W, H = 1280, 720
BG     = (20, 26, 38)
PANEL  = (36, 46, 64)
GOLD   = (240, 185, 90)
WHITE  = (245, 245, 240)
BLUE   = (96, 156, 214)
GREEN  = (120, 200, 150)
PINK   = (228, 132, 142)
PURPLE = (170, 150, 220)
GRAY   = (150, 160, 178)
VOICE, RATE = "ja-JP-NanamiNeural", "+6%"
FB = r"C:\Windows\Fonts\YuGothB.ttc"
FM = r"C:\Windows\Fonts\YuGothM.ttc"
OUT = "videos/jodoshi-jisei-tense.mp4"
TMP = "videos/_jisei_tmp"

def F(sz, bold=True): return ImageFont.truetype(FB if bold else FM, sz)

def ffbin(name):
    p = shutil.which(name)
    if p: return p
    base = os.path.expanduser(r"~\AppData\Local\Microsoft\WinGet\Packages")
    for c in glob.glob(os.path.join(base,"Gyan.FFmpeg*","**",name+".exe"), recursive=True):
        return c
    return None

def tsize(d, t, f):
    b = d.textbbox((0,0), t, font=f); return b[2]-b[0], b[3]-b[1]

def ctext(d, cx, y, t, f, fill):
    w,_ = tsize(d,t,f); d.text((cx-w/2, y), t, font=f, fill=fill)

def box(d, x, y, w, h, lines, fill, fg=WHITE, fsz=30, radius=18, outline=None, ow=3, bold=True):
    d.rounded_rectangle([x,y,x+w,y+h], radius=radius, fill=fill, outline=outline, width=ow)
    f = F(fsz, bold)
    lh = fsz + 10
    ty = y + (h - lh*len(lines))/2
    for ln in lines:
        ctext(d, x+w/2, ty, ln, f, fg); ty += lh

def arrow(d, p1, p2, color=GOLD, width=5, head=16):
    d.line([p1,p2], fill=color, width=width)
    ang = math.atan2(p2[1]-p1[1], p2[0]-p1[0])
    for a in (ang+math.radians(152), ang-math.radians(152)):
        d.line([p2,(p2[0]+head*math.cos(a), p2[1]+head*math.sin(a))], fill=color, width=width)

def header(d, title):
    d.rectangle([0,0,W,8], fill=GOLD)
    d.text((70,46), title, font=F(46), fill=WHITE)
    d.text((70, H-52), "文法道場 ・ 助動詞 時制系", font=F(22, False), fill=(110,120,140))

def base():
    img = Image.new("RGB",(W,H),BG); return img, ImageDraw.Draw(img)

# ---------- スライド ----------
def s_title(p):
    img,d = base()
    d.rectangle([0,0,W,8], fill=GOLD)
    ctext(d, W/2, 250, "助動詞 時制系", F(80), WHITE)
    ctext(d, W/2, 360, "過去・完了・存続、そして強意・推量", F(34, False), GOLD)
    # ミニ時間軸
    y=470; arrow(d,(300,y),(980,y),GRAY,3)
    ctext(d,330,y+16,"過去",F(24,False),GRAY); ctext(d,640,y+16,"今",F(24,False),GRAY); ctext(d,950,y+16,"未来",F(24,False),GRAY)
    img.save(p)

def s_map(p):
    img,d = base(); header(d,"全体マップ")
    box(d, 520, 110, 240, 70, ["時制系の助動詞"], PANEL, GOLD, 30, outline=GOLD)
    cards = [(70,"過去",BLUE,["き ・ けり"]),
             (370,"完了",GREEN,["つ・ぬ・たり・り"]),
             (670,"存続",GREEN,["たり ・ り"]),
             (970,"強意",PINK,["つ・ぬ＋推量"])]
    for x,t,c,sub in cards:
        arrow(d,(640,180),(x+120,300),GRAY,3)
        box(d, x, 300, 240, 80, [t], c, (20,26,38), 34)
        box(d, x, 392, 240, 70, sub, PANEL, WHITE, 26, outline=c, ow=2)
    ctext(d, W/2, 540, "意味は「文脈」と「下に続く語」で確定する", F(28, False), GOLD)
    img.save(p)

def s_timeline(p):
    img,d = base(); header(d,"時間軸で見る")
    y=360; arrow(d,(120,y),(1160,y),WHITE,4)
    ctext(d,150,y+24,"過去",F(26,False),GRAY); ctext(d,640,y+24,"今",F(26,False),GOLD); ctext(d,1130,y+24,"未来",F(26,False),GRAY)
    d.line([640,150,640,y],fill=GOLD,width=2)
    # 過去
    box(d,170,200,230,70,["き・けり","＝過去"],BLUE,(20,26,38),26)
    # 完了（今の直前で終わった）
    box(d,470,200,260,70,["つ・ぬ・たり・り","＝完了 〜てしまった"],GREEN,(20,26,38),24)
    # 存続（今、継続）
    box(d,470,440,260,70,["たり・り","＝存続 〜ている"],GREEN,(20,26,38),24)
    arrow(d,(600,440),(600,y+6),GREEN,3)
    # 未来（推量）
    box(d,860,200,300,70,["む・べし・らむ…","＝推量"],PINK,(20,26,38),24)
    img.save(p)

def s_past(p):
    img,d = base(); header(d,"過去 ── き・けり")
    box(d,90,200,520,260,[],PANEL,WHITE,28,outline=BLUE)
    ctext(d,350,225,"き",F(56),BLUE)
    ctext(d,350,320,"自分が直接体験した過去",F(30,False),WHITE)
    ctext(d,350,375,"〜た（見た・聞いた）",F(28,False),GOLD)
    box(d,670,200,520,260,[],PANEL,WHITE,28,outline=GREEN)
    ctext(d,930,225,"けり",F(56),GREEN)
    ctext(d,930,320,"伝聞の過去／詠嘆（気づき）",F(28,False),WHITE)
    ctext(d,930,375,"〜た（そうだ）・〜だなあ",F(28,False),GOLD)
    ctext(d,W/2,520,"地の文＝過去　／　会話・和歌＝詠嘆 が多い",F(26,False),GRAY)
    img.save(p)

def s_kanryo_sonzoku(p):
    img,d = base(); header(d,"完了 と 存続（たり・り）")
    # 完了：点
    ctext(d,330,180,"完了",F(40),GREEN)
    d.ellipse([315,300,345,330],fill=GOLD)
    d.line([120,315,315,315],fill=GRAY,width=3)
    ctext(d,330,360,"動作が終わった「点」",F(26,False),WHITE)
    ctext(d,330,405,"〜てしまった・〜た",F(28,False),GOLD)
    # 存続：線
    ctext(d,930,180,"存続",F(40),BLUE)
    d.line([760,315,1120,315],fill=GOLD,width=10)
    ctext(d,930,360,"状態が続く「線」",F(26,False),WHITE)
    ctext(d,930,405,"〜ている",F(28,False),GOLD)
    ctext(d,W/2,520,"例：梅咲きたる園 ＝ 梅が咲いている園（存続）",F(26,False),GRAY)
    img.save(p)

def s_flow(p):
    img,d = base(); header(d,"完了 か 強意 か")
    box(d,80,250,200,80,["つ・ぬ"],GREEN,(20,26,38),34)
    arrow(d,(280,290),(360,290))
    # ひし形（判定）
    cx,cy=520,290
    d.polygon([(cx,cy-80),(cx+150,cy),(cx,cy+80),(cx-150,cy)],fill=PANEL,outline=GOLD,width=3)
    ctext(d,cx,cy-46,"下に",F(24,False),WHITE); ctext(d,cx,cy-16,"推量(む・べし)?",F(24,False),WHITE)
    # YES → 強意
    arrow(d,(670,250),(820,200))
    box(d,820,160,360,80,["強意 ── きっと〜だろう"],PINK,(20,26,38),26)
    ctext(d,745,200,"YES",F(22),GOLD)
    # NO → 完了
    arrow(d,(670,330),(820,380))
    box(d,820,350,360,80,["完了 ── 〜た／〜てしまった"],GREEN,(20,26,38),26)
    ctext(d,745,370,"NO",F(22),GOLD)
    # 注記
    box(d,180,470,920,90,["※ らむ（現在）・けむ（過去）が続くときは、","すでに起きた事と分かるので「完了」のまま"],PANEL,WHITE,24,outline=PURPLE,ow=2)
    img.save(p)

def s_why(p):
    img,d = base(); header(d,"なぜ「つ・ぬ＋む」が強意になるのか")
    # 合成の式：推量 ＋ 完了 ＝ 強意
    box(d, 50, 160, 330, 120, ["推量　む・べし","〜だろう（不確か）"], PANEL, WHITE, 26, outline=PURPLE, ow=2)
    ctext(d, 405, 192, "＋", F(48), GOLD)
    box(d, 440, 160, 330, 120, ["完了　つ・ぬ","確かに実現する"], GREEN, (20,26,38), 26)
    ctext(d, 795, 192, "＝", F(48), GOLD)
    box(d, 830, 160, 400, 120, ["強　意","きっと・必ず〜だろう"], PINK, (20,26,38), 28, outline=GOLD)
    # 説明
    ctext(d, W/2, 320, "「む」だけでは「〜だろう」と不確か。", F(28,False), WHITE)
    ctext(d, W/2, 362, "そこに『確かに実現する』つ・ぬを重ねるので、推量に確信が加わる。", F(28,False), GOLD)
    # 変換例：咲かむ → 咲きなむ
    box(d, 120, 440, 360, 80, ["咲かむ","＝咲くだろう（推量）"], PANEL, WHITE, 24, outline=PURPLE, ow=2)
    arrow(d,(496,480),(636,480),GOLD,5)
    ctext(d, 566, 442, "ぬ を入れる", F(20,False), GRAY)
    box(d, 656, 440, 470, 80, ["咲きなむ","＝きっと咲くだろう（強意）"], PINK, (20,26,38), 24, outline=GOLD)
    img.save(p)

def s_kyoi(p):
    img,d = base(); header(d,"強意（確述）の形と訳")
    ctext(d, W/2, 138, "覚える形（つ・ぬ ＋ 推量）", F(26,False), GRAY)
    box(d, 110, 172, 1060, 86, ["て む ・ な む ・ つ べ し ・ ぬ べ し"], PANEL, GOLD, 40, outline=PINK, ow=3)
    ctext(d, W/2, 288, "訳：きっと〜だろう ／ 必ず〜 ／ 〜てしまうにちがいない", F(27,False), WHITE)
    # 例
    box(d, 150, 336, 980, 80, ["例）潮満ちぬ。風も吹きぬべし（土佐日記）","＝ 潮が満ちた。風もきっと吹くだろう"], PANEL, WHITE, 24, outline=GREEN, ow=2)
    # 小注（受験標準を主軸／辞書説は補足）
    box(d, 150, 436, 980, 86, ["※ 受験では「つ・ぬ＋推量語」で強意と判断すれば確実。",
                                "　辞書では文末「日も暮れぬ」なども確述に数える流儀がある。"], PANEL, WHITE, 22, outline=PURPLE, ow=2)
    ctext(d, W/2, 560, "らむ・けむが続くときは「完了」で取ってよい（既に起きた事の推量）", F(22,False), GRAY)
    img.save(p)

def s_matome(p):
    img,d = base(); header(d,"まとめ")
    rows=[("過去","き＝直接体験／けり＝伝聞・詠嘆",BLUE),
          ("完了","つ・ぬ・たり・り（〜てしまった）",GREEN),
          ("存続","たり・り（〜ている）",GREEN),
          ("強意","つ・ぬ＋推量（きっと〜だろう）",PINK)]
    y=180
    for t,desc,c in rows:
        box(d,90,y,170,66,[t],c,(20,26,38),30)
        ctext(d,700,y+16,desc,F(28,False),WHITE)
        y+=90
    ctext(d,W/2,H-110,"接続は連用形（り は例外）／意味は文脈と下接語で決める",F(26,False),GOLD)
    img.save(p)

SLIDES = [
 (s_title,      "助動詞の時制系を、図で整理しましょう。過去、完了、存続、そして強意と推量です。"),
 (s_map,        "時制系は大きく四つ。過去のき・けり。完了の、つ・ぬ・たり・り。存続の、たり・り。そして、つ・ぬが推量と結びつく強意です。意味は、文脈と、下に続く語で確定します。"),
 (s_timeline,   "時間軸で見ると分かりやすい。き・けりは過去。つ・ぬ・たり・りは、今の直前に動作が終わった完了。たり・りは、今も状態が続く存続。そして、む・べし・らむなどは、これからを推し量る推量です。"),
 (s_past,       "過去は、きと、けり。きは、自分が直接体験した過去で、〜た。けりは、人から聞いた過去や、はっと気づく詠嘆で、〜たそうだ、〜だなあ。地の文なら過去、会話や和歌なら詠嘆が多いです。"),
 (s_kanryo_sonzoku, "たりと、りには、二つの意味があります。完了は、動作が終わった点。〜てしまった。存続は、状態が続く線。〜ている。たとえば、梅咲きたる園は、梅が咲いている園、で存続です。"),
 (s_flow,       "つと、ぬが、完了か強意かは、下に注目します。下に推量の、むや、べしがあれば、まだ実現していないので、強意。きっと〜だろう。なければ、完了です。ただし、現在推量のらむ、過去推量のけむが続くときは、すでに起きた事と分かるので、完了のままで構いません。"),
 (s_why,        "では、なぜ、つや、ぬに、むが付くと強意になるのでしょう。むや、べしは、〜だろう、という、まだ不確かな推量です。いっぽう、つや、ぬは、確かにそうなる、という確実さを表します。推量のむに、確実さのつ・ぬを重ねるから、ただの〜だろうではなく、確かにそうなるだろう、つまり、きっと、必ず〜だろう、という、確信のある推量になるのです。たとえば、咲かむ、は、咲くだろう。そこに、ぬを入れて、咲きなむ、にすると、きっと咲くだろう、と確信が強まります。"),
 (s_kyoi,       "覚える形は、てむ、なむ、つべし、ぬべし。訳は、きっと〜だろう、必ず〜、〜てしまうにちがいない。たとえば、潮満ちぬ、風も吹きぬべし、は、潮が満ちた、風もきっと吹くだろう、です。受験では、つ、ぬの下に推量の語があれば強意、と判断すれば確実。なお辞書では、文末の、日も暮れぬ、のような形も確述に数えることがあります。"),
 (s_matome,     "まとめます。過去はき・けり。完了はつ・ぬ・たり・り。存続はたり・り。強意はつ・ぬに推量がついた形。接続は、りを除いて連用形。意味は、文脈と下に続く語で決める。これが時制系のコツです。"),
]

async def synth(t,p): await edge_tts.Communicate(t,VOICE,rate=RATE).save(p)
def dur(fp,p): return float(subprocess.check_output([fp,"-v","quiet","-show_entries","format=duration","-of","csv=p=0",p],text=True).strip())

def main():
    ff,fp = ffbin("ffmpeg"), ffbin("ffprobe")
    if not ff or not fp: print("ffmpeg not found"); sys.exit(1)
    os.makedirs(TMP,exist_ok=True); os.makedirs("videos",exist_ok=True)
    segs=[]
    for i,(draw,narr) in enumerate(SLIDES):
        png=f"{TMP}/s{i:02d}.png"; mp3=f"{TMP}/s{i:02d}.mp3"; seg=f"{TMP}/s{i:02d}.mp4"
        draw(png); asyncio.run(synth(narr,mp3))
        t=dur(fp,mp3)+0.7
        subprocess.run([ff,"-y","-loop","1","-i",png,"-i",mp3,"-c:v","libx264","-tune","stillimage",
            "-t",f"{t:.2f}","-c:a","aac","-b:a","128k","-pix_fmt","yuv420p","-vf","scale=1280:720",seg],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        segs.append(seg); print(f"  slide {i}: {t:.1f}s")
    lst=f"{TMP}/list.txt"
    open(lst,"w",encoding="utf-8").write("\n".join(f"file '{os.path.abspath(s)}'" for s in segs))
    subprocess.run([ff,"-y","-f","concat","-safe","0","-i",lst,"-c","copy",OUT],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"done: {OUT} ({dur(fp,OUT):.1f}s)")

if __name__=="__main__":
    main()
