# 読解の庭「なにがしの院」の絵を、1か所ずつ直せる層に切り分ける（v2 2026-11-24）
# 設計：F:\A2A\_work\kobun-garden\design\partial-restore-design.md（v3 案。ユーザー決定「おすすめで」＝
#       残りの地面は咲いた数に合わせて全体が少しずつ／Canva の層分けで物の形を取る／寝殿の前の2本は寝殿・ほかの木は地面と同じ）
# 元の絵：F:\A2A\_work\kobun-garden\canva\2026-11-24\{ruined,restored}-v21b.png（Canva 生成、2400×1600）
# 物の形の型：同 layers\（Canva の「層分け」した絵から、部品だけ／背景だけ／池だけを書き出したもの。比べて形を取る）
#   restored-objects.png − restored-paper.png ＝ よみがえった院の物（建物・廊・木・中島・築山・前栽・遣水）
#   ruined-objects-on-ground.png − ruined-background.png ＝ 荒れた院の物
#   restored-pond.png − restored-paper.png ／ ruined-pond-on-ground.png − ruined-background.png ＝ 池の水
# 区分け（1枚の絵の画素ごとに、持ち主を1つ決める）：
#   0 ＝ 全体（どこにも入らない地面・木・空。咲いた数に合わせて少しずつよみがえる）
#   地面の区画（南庭・築山＝池と南庭、壺＝前栽、築地と門＝築地、遣水の溝＝遣水）→ 池の水（池と南庭）→ 物（物の形の中を、所の多角形で分ける）の順に上書き
# 出力：public/garden/estate/ruined.webp（土台 1200×800）・<key>.webp（11か所のよみがえった姿の層）・ground.webp（全体の層）
#       src/lib/gardenEstateLayers.ts（層の位置と押せる範囲）
#       F:\A2A\_work\kobun-garden\canva\2026-11-24\check-labels.png・check-single-parts-v2.png（確かめ用）
# 使い方：python -X utf8 assets-src/garden/make_estate.py
import json, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

SRC = r'F:\A2A\_work\kobun-garden\canva\2026-11-24'
LAY = os.path.join(SRC, 'layers')
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'public', 'garden', 'estate')
TS = os.path.join(ROOT, 'src', 'lib', 'gardenEstateLayers.ts')
W, H = 1200, 800

ORDER = ['shinden', 'nishi', 'higashi', 'yarimizu', 'ike', 'senzai', 'nakajima', 'kita', 'chumon', 'tsuridono', 'tsuiji']
NAMES = dict(shinden='寝殿', nishi='西の対', higashi='東の対', yarimizu='遣水', ike='池と南庭', senzai='前栽', nakajima='中島',
             kita='北の対', chumon='中門廊', tsuridono='釣殿', tsuiji='築地')

R = lambda x1, y1, x2, y2: [(x1, y1), (x2, y1), (x2, y2), (x1, y2)]
STREAM = [(785, 160), (800, 190), (778, 225), (770, 265), (775, 300), (785, 330), (790, 375), (800, 400),
          (830, 430), (860, 465), (878, 500), (884, 522), (886, 540)]
def band(pts, w):
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        a = pts[max(0, i - 1)]; b = pts[min(len(pts) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]; n = (dx * dx + dy * dy) ** .5 or 1
        nx, ny = -dy / n * w, dx / n * w
        left.append((x + nx, y + ny)); right.append((x - nx, y - ny))
    return left + right[::-1]

# 地面の区画（1200×800 の座標。restored-v21b を目盛りつきで見て手で決めた）。境目は建物・廊・塀の下に通す
ZONES = [
    ('ike', [[(300, 395), (790, 395), (830, 470), (870, 512), (700, 508), (480, 510), (300, 520)],      # 南庭（白砂）
             [(130, 750), (240, 705), (430, 708), (500, 750)], [(680, 750), (760, 705), (960, 708), (1060, 750)]]),  # 築山
    ('senzai', [R(372, 338, 490, 368), R(726, 338, 846, 368)]),                                       # 壺
    ('tsuiji', [band([(130, 103), (1080, 103)], 9), band([(130, 103), (22, 754)], 9), band([(1080, 103), (1180, 758)], 9),
                band([(22, 754), (1180, 758)], 11), R(44, 392, 122, 468), R(1086, 396, 1160, 472)]),  # 築地と東西の門
    ('yarimizu', [band(STREAM, 4)]),                                                                  # 遣水の溝（流れの幅だけ）
]
# 物の持ち主（物の形の中だけで使う）。後に書いたものが前
OBJECTS = [
    ('ike', [[(130, 750), (240, 705), (430, 708), (500, 750)], [(680, 750), (760, 705), (960, 708), (1060, 750)]]),  # 築山
    ('senzai', [[(300, 452), (418, 452), (428, 528), (304, 528)], [(788, 398), (832, 398), (900, 476), (914, 528), (852, 528), (818, 470)]]),
    ('nakajima', [[(405, 600), (440, 570), (520, 556), (610, 560), (668, 585), (676, 612), (640, 640), (540, 650), (440, 642), (408, 625)],
                  R(474, 512, 524, 578), [(648, 612), (668, 604), (772, 690), (752, 700)]]),
    ('kita', [[(178, 96), (1030, 96), (1030, 168), (1008, 168), (1008, 282), (838, 282), (838, 242), (718, 242), (718, 284),
               (490, 284), (490, 242), (372, 242), (372, 282), (205, 282), (205, 168), (178, 168)]]),
    ('yarimizu', [band(STREAM, 4)]),
    ('nishi', [R(370, 296, 492, 380), R(202, 284, 374, 412)]),
    ('higashi', [R(722, 296, 846, 380), R(838, 284, 1012, 412)]),
    ('senzai', [R(376, 342, 486, 364), R(728, 342, 770, 364), R(800, 342, 842, 364)]),   # 壺の植え込みと紅葉
    ('shinden', [R(482, 272, 732, 398), R(556, 352, 654, 424), R(512, 384, 558, 428), R(650, 384, 698, 428)]),  # 寝殿・階隠・前の木2本
    ('chumon', [R(232, 392, 304, 560), R(106, 482, 244, 542), R(906, 388, 984, 548), R(904, 440, 998, 500), R(980, 462, 1108, 528),
                R(878, 540, 1040, 642)]),
    ('tsuridono', [R(154, 545, 348, 652)]),
]

def load(name):
    return np.asarray(Image.open(os.path.join(LAY, name)).convert('RGB').resize((W, H), Image.LANCZOS), np.int32)

def diff_mask(a, b, th=30):
    return np.abs(load(a) - load(b)).sum(2) > th

def clean(m, close=5, fill=True):
    m = ndimage.binary_closing(m, structure=np.ones((close, close)), iterations=2)
    if fill: m = ndimage.binary_fill_holes(m)
    return ndimage.binary_opening(m, structure=np.ones((3, 3)))

def paint(polys_by_key):
    im = Image.new('I', (W, H), 0); d = ImageDraw.Draw(im)
    for key, polys in polys_by_key:
        k = ORDER.index(key) + 1
        for p in polys: d.polygon([tuple(map(float, q)) for q in p], fill=k)
    return np.asarray(im, np.int16)

def label_map():
    # よみがえった院の型はきれい。荒れた院の型は地面と色が近く細かい点が多いので、点を消してから使う（穴は埋めない＝囲まれた壺や階の前まで物にしない）
    obj_r = ndimage.binary_dilation(clean(diff_mask('restored-objects.png', 'restored-paper.png'), 3, fill=False), iterations=2)
    obj_u = clean(diff_mask('ruined-objects-on-ground.png', 'ruined-background.png'), 5, fill=False)
    obj_u = ndimage.binary_opening(obj_u, structure=np.ones((5, 5)))
    obj = obj_r | obj_u
    water = clean(diff_mask('restored-pond.png', 'restored-paper.png'), 3) | clean(diff_mask('ruined-pond-on-ground.png', 'ruined-background.png'), 9)
    lab = paint(ZONES)
    lab[water] = ORDER.index('ike') + 1
    P = paint(OBJECTS)
    # 多角形の中の物は、その多角形の持ち主。
    # 多角形の外にはみ出した物は、よみがえった院の物の形で、多角形から 10px 以内だけ、いちばん近い多角形の持ち主へ（屋根の端・廊の先など）。
    # それ以外（塀ぎわの木・岸の地面・荒れた院の型の外れ）は、地面の区画の持ち主のまま（区画が無ければ全体）
    near = ndimage.distance_transform_edt(P == 0, return_distances=False, return_indices=True)
    nearest = P[near[0], near[1]]
    dist = ndimage.distance_transform_edt(P == 0)
    inside = obj & (P > 0)
    # 遣水は流れの細い帯だけ（白砂の岸までは広げない）
    edge = obj_r & (P == 0) & (dist <= 10) & (nearest != ORDER.index('yarimizu') + 1)
    lab[inside] = P[inside]
    lab[edge] = nearest[edge]
    return lab, obj, water

def feather(mask_bool, r=1.6):
    return Image.fromarray((mask_bool * 255).astype('uint8')).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(r))

def composite(ruined, layers, keys, n_restored=None):
    c = ruined.convert('RGBA')
    n = len(keys) if n_restored is None else n_restored
    g = layers['ground']
    gl = Image.open(os.path.join(OUT, 'ground.webp')).convert('RGBA')
    if n:
        a = np.asarray(gl).copy(); a[..., 3] = (a[..., 3].astype(float) * n / len(ORDER)).astype('uint8')
        c.alpha_composite(Image.fromarray(a), (g['x'], g['y']))
    for k in keys:
        L = layers[k]; c.alpha_composite(Image.open(os.path.join(OUT, f'{k}.webp')).convert('RGBA'), (L['x'], L['y']))
    return c.convert('RGB')

def main():
    os.makedirs(OUT, exist_ok=True)
    ruined = Image.open(os.path.join(SRC, 'ruined-v21b.png')).convert('RGB').resize((W, H), Image.LANCZOS)
    restored = Image.open(os.path.join(SRC, 'restored-v21b.png')).convert('RGB').resize((W, H), Image.LANCZOS)
    lab, obj, water = label_map()
    ruined.save(os.path.join(OUT, 'ruined.webp'), quality=82, method=6)
    layers = {}
    for i, key in enumerate(['ground'] + ORDER):
        m = feather(lab == i)
        a = np.asarray(m); ys, xs = np.nonzero(a > 2)
        x1, y1, x2, y2 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        rgba = restored.copy(); rgba.putalpha(m)
        rgba.crop((x1, y1, x2, y2)).save(os.path.join(OUT, f'{key}.webp'), quality=80, method=6)
        layers[key] = dict(x=x1, y=y1, w=x2 - x1, h=y2 - y1)
    # 押せる範囲：物の多角形＋地面の区画（重なりは後の方が前）
    hit = {}
    for key, polys in ZONES + OBJECTS:
        hit.setdefault(key, []).extend([[round(x), round(y)] for x, y in p] for p in polys)
    hit_order = list(dict.fromkeys(k for k, _ in ZONES + OBJECTS))
    # 確かめ 1：区分けを色で
    pal = [(150, 150, 150), (230, 57, 70), (244, 162, 97), (233, 196, 106), (42, 157, 143), (38, 70, 83), (138, 201, 38), (25, 130, 196),
           (106, 76, 147), (255, 89, 94), (255, 202, 58), (90, 60, 30)]
    col = np.zeros((H, W, 3), np.uint8)
    for i in range(12): col[lab == i] = pal[i]
    Image.blend(restored, Image.fromarray(col), 0.45).save(os.path.join(SRC, 'check-labels.png'))
    # 確かめ 2：1か所だけ直した11通り（全体の層は1/11）
    f = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', 22)
    sheet = Image.new('RGB', (1200, 267 * 4), 'white')
    for i, k in enumerate(ORDER):
        t = composite(ruined, layers, [k]).resize((400, 267)); d = ImageDraw.Draw(t)
        d.rectangle([0, 0, 150, 30], fill='white'); d.text((4, 2), f'{i + 1} {NAMES[k]}だけ', font=f, fill='black')
        sheet.paste(t, ((i % 3) * 400, (i // 3) * 267))
    sheet.save(os.path.join(SRC, 'check-single-parts-v2.png'))
    # 確かめ 3：数字（何も直さない＝荒れた院、全部＝よみがえった院）
    full = composite(ruined, layers, ORDER)
    d_full = np.abs(np.asarray(full, int) - np.asarray(restored, int)).mean()
    # 1か所だけ直したとき、変わった画素がその所の持ち分の中に収まる割合
    base = np.asarray(ruined, int)
    leak = {}
    for i, k in enumerate(ORDER, 1):
        ch = np.abs(np.asarray(composite(ruined, layers, [k], n_restored=0), int) - base).sum(2) > 24
        own = ndimage.binary_dilation(lab == i, iterations=4)
        leak[k] = round(float((ch & ~own).sum() / max(1, ch.sum())), 4)
    with open(TS, 'w', encoding='utf-8', newline='\n') as fp:
        fp.write('// 読解の庭「なにがしの院」の絵の層（assets-src/garden/make_estate.py が書き出す。手で直さない）\n')
        fp.write('// 絵は 1200×800。土台＝荒れた院 /garden/estate/ruined.webp。よみがえった所＝/garden/estate/<key>.webp を x,y に重ねる。\n')
        fp.write('// ground＝どこの所にも入らない地面と木。咲いた数（よみがえった所の数／11）の濃さで重ねる。\n')
        fp.write('// 元の絵は Canva で生成（2026-11-24、設計 v2.1＝国語便覧の寝殿造の図にならった理想の邸）。切り分けの設計は partial-restore-design.md\n')
        fp.write(f'export const ESTATE_SIZE = {{ w: {W}, h: {H} }} as const;\n')
        fp.write('export const ESTATE_LAYERS: Record<string, { x: number; y: number; w: number; h: number }> = ')
        fp.write(json.dumps(layers, ensure_ascii=False) + ';\n')
        fp.write('// 押せる範囲（院の所ごとの多角形。重なる所は後に並ぶ所が前）\n')
        fp.write('export const ESTATE_HIT: Record<string, number[][][]> = ')
        fp.write(json.dumps(hit, ensure_ascii=False) + ';\n')
        fp.write(f'export const ESTATE_HIT_ORDER = {json.dumps(hit_order)} as const;\n')
    sizes = {f: os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)}
    print('layers', layers)
    print('全部直した絵とよみがえった院の差 (0-255 平均):', round(float(d_full), 2))
    print('1か所だけ直したときのはみ出し（変わった画素のうち持ち分の外の割合）:', leak)
    print('持ち分の広さ（全体に占める割合）:', {(['ground'] + ORDER)[i]: round(float((lab == i).mean()), 3) for i in range(12)})
    print('sizes KB', {k: round(v / 1024) for k, v in sizes.items()}, 'total', round(sum(sizes.values()) / 1024))

if __name__ == '__main__':
    main()
