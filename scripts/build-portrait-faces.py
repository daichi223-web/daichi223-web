"""位階の肖像から「顔だけ」を丸いアイコン用に切り出した小さな正方形 webp を作る。

LINE 風の答え合わせの自分のアイコン（FaceAvatar、36px）は、今まで幅 1200px の肖像（約 180KB）を読んで
CSS で顔の位置に合わせていた。ここで、その CSS が丸の中に見せている範囲と同じ正方形を切り出して 128px にする。

顔の位置の正本は src/lib/portraitFaces.ts の PORTRAIT_FACES 1 か所。このスクリプトはその TS を直接読む
（Python 側に表を写さない）。切り出しの式は faceImgStyle と同じ：
  頭の直径 d（画像幅の %）を枠の FILL（0.74）にし、鼻 (cx, cy) を枠の横中央・上から NOSE_AT（0.6）に置く。
  枠 1 辺が元画像の何 px かは  side = 画像幅 * d / 100 / FILL
  切り出し左上 = (鼻x - side/2,  鼻y - side*NOSE_AT)
元画像の外にはみ出す分は透明（FaceAvatar の枠の背景が見える。今の見え方と同じ）。

入力 : public/portraits/<prefix>stage-NN-w1200.webp（build-portraits.py の生成物。画風 prefix は '' / yuru- / pop- / miyabi-）
出力 : public/portraits/face/<tone>-NN.webp（128x128）。既にあればスキップ（作り直すときは --force）。既存の画像は触らない。

  python -X utf8 scripts/build-portrait-faces.py [--force]
"""
import os
import re
import sys

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
TS = "src/lib/portraitFaces.ts"
IN_DIR = "public/portraits"
OUT_DIR = "public/portraits/face"
OUT_PX = 128        # 36px 表示の 3.5 倍（Retina 3x でもぼやけない）
FILL = 0.74         # faceImgStyle の既定
NOSE_AT = 0.6       # 同上
QUALITY = 85
PREFIX = {"sharp": "", "yuru": "yuru-", "pop": "pop-", "miyabi": "miyabi-"}


def load_faces():
    """PORTRAIT_FACES を TS から読む（tone -> [(cx, cy, d)] ×21）。"""
    text = open(TS, encoding="utf-8").read()
    start = text.index("export const PORTRAIT_FACES")
    end = text.index("/** 第 n 階の顔の位置", start)
    body = text[start:end]
    faces = {}
    for m in re.finditer(r"^\s{2}(\w+): \[(.*?)^\s{2}\],", body, re.S | re.M):
        rows = re.findall(r"\{\s*cx:\s*([\d.]+),\s*cy:\s*([\d.]+),\s*d:\s*([\d.]+)\s*\}", m.group(2))
        faces[m.group(1)] = [tuple(map(float, r)) for r in rows]
    return faces


def crop_rect(w, h, cx, cy, d):
    side = w * d / 100 / FILL
    nx, ny = w * cx / 100, h * cy / 100
    return nx - side / 2, ny - side * NOSE_AT, side


def main():
    force = "--force" in sys.argv
    faces = load_faces()
    assert set(faces) == set(PREFIX), faces.keys()
    os.makedirs(OUT_DIR, exist_ok=True)
    made = skipped = 0
    sizes = []
    for tone, rows in faces.items():
        assert len(rows) == 21, (tone, len(rows))
        for i, (cx, cy, d) in enumerate(rows, 1):
            dst = os.path.join(OUT_DIR, f"{tone}-{i:02d}.webp")
            if os.path.exists(dst) and not force:
                skipped += 1
                continue
            src = os.path.join(IN_DIR, f"{PREFIX[tone]}stage-{i:02d}-w1200.webp")
            with Image.open(src) as im:
                im = im.convert("RGBA")
                x0, y0, side = crop_rect(im.width, im.height, cx, cy, d)
                # 範囲外は透明で補う。BICUBIC の変形で小数の位置もそのまま扱う
                out = im.transform(
                    (OUT_PX, OUT_PX),
                    Image.AFFINE,
                    (side / OUT_PX, 0, x0, 0, side / OUT_PX, y0),
                    resample=Image.BICUBIC,
                )
                if side > OUT_PX * 1.5:  # 縮小が大きいときは先に縮めて折り返しを避ける
                    scale = OUT_PX * 1.5 / side
                    big = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
                    out = big.transform(
                        (OUT_PX, OUT_PX),
                        Image.AFFINE,
                        (side * scale / OUT_PX, 0, x0 * scale, 0, side * scale / OUT_PX, y0 * scale),
                        resample=Image.BICUBIC,
                    )
                out.save(dst, "WEBP", quality=QUALITY, method=6)
            sizes.append(os.path.getsize(dst))
            made += 1
    print(f"generated {made}, skipped {skipped}")
    if sizes:
        print(f"bytes avg {sum(sizes)//len(sizes)} max {max(sizes)}")


if __name__ == "__main__":
    main()
