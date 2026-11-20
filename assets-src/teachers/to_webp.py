# -*- coding: utf-8 -*-
"""先生の絵の下見 PNG（Canva の 200px）を public/teachers の webp にする（品質 86。今までの絵と同じ）。

  python -X utf8 assets-src/teachers/to_webp.py <id>-<tone> [...]   例: kaoru-sharp nakanokimi-yuru
すでに webp があるものは上書きしない（--force で上書き）。
"""
import os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'teachers')

force = '--force' in sys.argv
for name in [a for a in sys.argv[1:] if not a.startswith('--')]:
    src = os.path.join(HERE, name + '.png')
    dst = os.path.join(OUT, name + '.webp')
    if os.path.exists(dst) and not force:
        print('skip (exists)', name)
        continue
    im = Image.open(src).convert('RGB')
    im.save(dst, 'WEBP', quality=86, method=6)
    print('wrote', name, im.size)
