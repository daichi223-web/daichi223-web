"""位階の肖像の原画（assets-src/portraits/*.webp）から縮小版を作る。

原画は約 2800x1500px（デコード時 ~17MB/枚）。階位一覧で 10 枚並ぶとスマホのタブが落ちるため、
  <name>-w1200.webp … ホーム/ダッシュボードの主表示用（幅 1200px、~3MB）
  <name>-w480.webp  … 一覧サムネ用（幅 480px、~0.5MB）
を public/portraits/ に生成する。原画（.webp / .png）は触らない。既に縮小版があればスキップ。

原画は配信に載せないため public/ の外（assets-src/portraits/）に置いている。
アプリが参照するのは -w1200 / -w480 だけ（src/lib/nobleData.ts）。

  python scripts/build-portraits.py
"""
import glob
import os
import sys

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
SRC_DIR = "assets-src/portraits"   # 原画（配信しない）
OUT_DIR = "public/portraits"       # 縮小版（配信する）
WIDTHS = (1200, 480)
QUALITY = 82

os.makedirs(OUT_DIR, exist_ok=True)
made = skipped = 0
for src in sorted(glob.glob(os.path.join(SRC_DIR, "*.webp"))):
    base = os.path.basename(src)
    if "-w" in base and base.rsplit("-w", 1)[1].split(".")[0].isdigit():
        continue  # 生成物
    stem = base[:-5]
    for w in WIDTHS:
        dst = os.path.join(OUT_DIR, f"{stem}-w{w}.webp")
        if os.path.exists(dst):
            skipped += 1
            continue
        with Image.open(src) as im:  # 1枚ずつ開いて閉じる（8GB機）
            if im.width <= w:
                im.save(dst, "WEBP", quality=QUALITY, method=6)
            else:
                h = round(im.height * w / im.width)
                im.resize((w, h), Image.LANCZOS).save(dst, "WEBP", quality=QUALITY, method=6)
        made += 1
        print(f"{dst}  {os.path.getsize(dst)//1024}KB")
print(f"generated {made}, skipped {skipped}")
