"""先生の絵「みやび」（ファイル名は <id>-anime）の原本から、200px 正方形のアイコン用の絵を切り出す。

アプリは先生の絵を丸く切って出す（FaceAvatar。36〜40px）。丸の中で顔が真ん中に来て、顔が丸の6割ほどを占めるように、
原本ごとに測った顔の位置（FACES）を中心に正方形を切る。

FACES の値は、原本を幅 400px に縮めて 10% 刻みの格子を引いた図で目で測ったもの（2026-11-13）。
  cx, cy = 顔の中心（目と鼻のあいだ）の位置。原本の幅に対する比（cy も幅に対する比）。
  side   = 切り出す正方形の一辺。原本の幅に対する比。
新しい絵を足したら、同じやり方で測って FACES に1行足す（測っていない絵は切り出さず、止めて知らせる）。

  python -I crop_anime.py <原本のフォルダ> <出力先>
  原本のフォルダには <id>-anime-full.png か <id>.png を置く。出力は <id>-anime.webp（アプリ用）と <id>-anime.png（下見）と _sheet.png（丸く切った一覧）。
"""
import os
import sys

from PIL import Image, ImageDraw

FACES = {
    #            cx      cy      side
    'sei':       (0.565, 0.255, 0.42),
    'murasaki':  (0.555, 0.230, 0.42),
    'komachi':   (0.540, 0.255, 0.42),
    'izumi':     (0.490, 0.245, 0.42),
    'koshikibu': (0.535, 0.245, 0.42),
    'ukyo':      (0.560, 0.265, 0.42),
}

SIZE = 200


def find_src(src_dir, tid):
    for name in (f'{tid}-anime-full.png', f'{tid}.png'):
        p = os.path.join(src_dir, name)
        if os.path.exists(p):
            return p
    return None


def crop(path, face):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cx, cy, side = face
    s = round(W * side)
    left = round(W * cx - s / 2)
    top = round(W * cy - s / 2)
    # はみ出す分は透明で埋める（顔を真ん中に保つため、端に寄せて詰めない）
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.alpha_composite(im.crop((max(0, left), max(0, top), min(W, left + s), min(H, top + s))),
                           (max(0, -left), max(0, -top)))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS), (left, top, s)


def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    done = []
    for tid, face in FACES.items():
        p = find_src(src_dir, tid)
        if not p:
            continue
        sq, box = crop(p, face)
        sq.save(os.path.join(out_dir, f'{tid}-anime.webp'), 'WEBP', quality=88, method=6)
        sq.save(os.path.join(out_dir, f'{tid}-anime.png'))
        done.append((tid, sq))
        print(tid, 'box', box)
    # 原本らしいファイル（<id>-anime-full.png）で FACES に無いもの
    unknown = [f for f in os.listdir(src_dir) if f.endswith('-anime-full.png') and f[:-len('-anime-full.png')] not in FACES]
    if unknown:
        print('FACES に無い絵（測ってから足す）:', unknown)
    # 丸く切った一覧（72px と 40px）
    sheet = Image.new('RGB', (max(1, len(done)) * 90, 180), (245, 240, 230))
    for i, (tid, sq) in enumerate(done):
        for j, size in enumerate((72, 40)):
            a = sq.resize((size, size), Image.LANCZOS)
            m = Image.new('L', (size, size), 0)
            ImageDraw.Draw(m).ellipse((0, 0, size - 1, size - 1), fill=255)
            bg = Image.new('RGBA', (size, size), (245, 240, 230, 255))
            bg.alpha_composite(a)
            sheet.paste(bg, (i * 90 + 9 + (72 - size) // 2, 10 + j * 90), m)
    sheet.save(os.path.join(out_dir, '_sheet.png'))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
