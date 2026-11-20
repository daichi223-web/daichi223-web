"""読解の庭の草木（Codex の依頼B、7種×5段＝35枚）をアプリ用の WebP にする（2026-11-21）。

原本は 512×512 の透明 PNG（根元は左右中央・下から1割＝(256,461) にそろえてある）。
形をそのまま 192×192 に縮めて public/garden/plants/<key>-<段>.webp に書く（段は 1〜5。種＝段0 はアプリが SVG で描く）。

  python -I make_plants.py [原本のフォルダ]
  既定の原本 = F:/A2A/_work/kobun-garden/codex-inbox/2026-11-15_garden/plants
"""
import os
import sys

from PIL import Image

KEYS = ['sakura', 'kobai', 'momiji', 'fuji', 'hagi', 'ominaeshi', 'yamabuki']
SIZE = 192
SRC = sys.argv[1] if len(sys.argv) > 1 else 'F:/A2A/_work/kobun-garden/codex-inbox/2026-11-15_garden/plants'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'garden', 'plants')

os.makedirs(OUT, exist_ok=True)
total = 0
for k in KEYS:
    for n in range(1, 6):
        im = Image.open(os.path.join(SRC, f'{k}-{n}.png')).convert('RGBA')
        assert im.size == (512, 512), (k, n, im.size)
        sm = im.resize((SIZE, SIZE), Image.LANCZOS)
        p = os.path.join(OUT, f'{k}-{n}.webp')
        sm.save(p, 'WEBP', quality=86, method=6)
        total += os.path.getsize(p)
print('35 files', round(total / 1024), 'KB')
