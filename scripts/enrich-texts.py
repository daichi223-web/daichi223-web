"""Enrich texts/index.json with era/author derived from source_work.

Reads public/texts/index.json and individual *.json, attempts to derive
era and author, writes back to both index and per-text files.
"""
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
TEXTS_DIR = ROOT / 'public' / 'texts'

# Known Japanese classical works with era / author.
# era: 奈良 / 平安 / 鎌倉 / 室町 / 江戸 / 近代
WORK_MAP = {
    # 奈良
    '古事記': {'author': '太安万侶編', 'era': '奈良'},
    '日本書紀': {'author': '舎人親王編', 'era': '奈良'},
    '万葉集': {'author': '大伴家持ら編', 'era': '奈良'},
    # 平安
    '竹取物語': {'author': '不明', 'era': '平安'},
    '伊勢物語': {'author': '不明', 'era': '平安'},
    '大和物語': {'author': '不明', 'era': '平安'},
    '宇津保物語': {'author': '不明', 'era': '平安'},
    '落窪物語': {'author': '不明', 'era': '平安'},
    '源氏物語': {'author': '紫式部', 'era': '平安'},
    '源氏物語玉の小櫛': {'author': '本居宣長', 'era': '江戸'},
    '枕草子': {'author': '清少納言', 'era': '平安'},
    '土佐日記': {'author': '紀貫之', 'era': '平安'},
    '蜻蛉日記': {'author': '藤原道綱母', 'era': '平安'},
    '和泉式部日記': {'author': '和泉式部', 'era': '平安'},
    '紫式部日記': {'author': '紫式部', 'era': '平安'},
    '更級日記': {'author': '菅原孝標女', 'era': '平安'},
    '今昔物語集': {'author': '不明', 'era': '平安'},
    '大鏡': {'author': '不明', 'era': '平安'},
    '今鏡': {'author': '不明', 'era': '平安'},
    '古今和歌集': {'author': '紀貫之ら編', 'era': '平安'},
    '後撰和歌集': {'author': '源順ら編', 'era': '平安'},
    '拾遺和歌集': {'author': '花山院編', 'era': '平安'},
    '堤中納言物語': {'author': '不明', 'era': '平安'},
    # 鎌倉
    '方丈記': {'author': '鴨長明', 'era': '鎌倉'},
    '徒然草': {'author': '兼好法師', 'era': '鎌倉'},
    '平家物語': {'author': '不明', 'era': '鎌倉'},
    '宇治拾遺物語': {'author': '不明', 'era': '鎌倉'},
    '十訓抄': {'author': '不明', 'era': '鎌倉'},
    '新古今和歌集': {'author': '藤原定家ら編', 'era': '鎌倉'},
    '無名抄': {'author': '鴨長明', 'era': '鎌倉'},
    '無名草子': {'author': '不明', 'era': '鎌倉'},
    '建礼門院右京大夫集': {'author': '建礼門院右京大夫', 'era': '鎌倉'},
    '讃岐典侍日記': {'author': '藤原長子', 'era': '平安'},
    '十六夜日記': {'author': '阿仏尼', 'era': '鎌倉'},
    '増鏡': {'author': '不明', 'era': '室町'},
    # 室町・江戸
    '太平記': {'author': '不明', 'era': '室町'},
    '風姿花伝': {'author': '世阿弥', 'era': '室町'},
    '風土記': {'author': '諸人', 'era': '奈良'},
    '奥の細道': {'author': '松尾芭蕉', 'era': '江戸'},
    '笈の小文': {'author': '松尾芭蕉', 'era': '江戸'},
    '野ざらし紀行': {'author': '松尾芭蕉', 'era': '江戸'},
    '鹿島紀行': {'author': '松尾芭蕉', 'era': '江戸'},
    '更科紀行': {'author': '松尾芭蕉', 'era': '江戸'},
    '去来抄': {'author': '向井去来', 'era': '江戸'},
    '三冊子': {'author': '服部土芳', 'era': '江戸'},
    '玉勝間': {'author': '本居宣長', 'era': '江戸'},
    '雨月物語': {'author': '上田秋成', 'era': '江戸'},
    '春雨物語': {'author': '上田秋成', 'era': '江戸'},
    '折たく柴の記': {'author': '新井白石', 'era': '江戸'},
    '花月草紙': {'author': '松平定信', 'era': '江戸'},
    '駿台雑話': {'author': '室鳩巣', 'era': '江戸'},
    '玉勝間': {'author': '本居宣長', 'era': '江戸'},
    '春雨物語': {'author': '上田秋成', 'era': '江戸'},
    'うひ山ぶみ': {'author': '本居宣長', 'era': '江戸'},
    # 近代
    '我が輩は猫である': {'author': '夏目漱石', 'era': '近代'},
    '舞姫': {'author': '森鴎外', 'era': '近代'},
}

# Partial-match fallback patterns (useful when source_work includes chapter)
PARTIAL_PATTERNS = [
    ('源氏物語', {'author': '紫式部', 'era': '平安'}),
    ('枕草子', {'author': '清少納言', 'era': '平安'}),
    ('徒然草', {'author': '兼好法師', 'era': '鎌倉'}),
    ('平家物語', {'author': '不明', 'era': '鎌倉'}),
    ('土佐日記', {'author': '紀貫之', 'era': '平安'}),
    ('古今和歌集', {'author': '紀貫之ら編', 'era': '平安'}),
    ('新古今和歌集', {'author': '藤原定家ら編', 'era': '鎌倉'}),
    ('奥の細道', {'author': '松尾芭蕉', 'era': '江戸'}),
    ('伊勢物語', {'author': '不明', 'era': '平安'}),
    ('大鏡', {'author': '不明', 'era': '平安'}),
    ('方丈記', {'author': '鴨長明', 'era': '鎌倉'}),
    ('太平記', {'author': '不明', 'era': '室町'}),
    ('宇治拾遺物語', {'author': '不明', 'era': '鎌倉'}),
    ('今昔物語集', {'author': '不明', 'era': '平安'}),
    ('今昔物語', {'author': '不明', 'era': '平安'}),
    ('万葉集', {'author': '大伴家持ら編', 'era': '奈良'}),
    ('日本書紀', {'author': '舎人親王編', 'era': '奈良'}),
    ('古事記', {'author': '太安万侶編', 'era': '奈良'}),
    ('世間胸算用', {'author': '井原西鶴', 'era': '江戸'}),
    ('浮世床', {'author': '式亭三馬', 'era': '江戸'}),
    ('春雨物語', {'author': '上田秋成', 'era': '江戸'}),
    ('雨月物語', {'author': '上田秋成', 'era': '江戸'}),
]


def resolve(source_work: str) -> dict:
    if not source_work:
        return {'author': '', 'era': ''}
    key = source_work.strip()
    if key in WORK_MAP:
        return WORK_MAP[key]
    for pat, info in PARTIAL_PATTERNS:
        if pat in key:
            return info
    return {'author': '', 'era': ''}


def main():
    idx_file = TEXTS_DIR / 'index.json'
    with open(idx_file, encoding='utf-8') as f:
        idx = json.load(f)

    stats = {'total': len(idx), 'resolved': 0, 'unresolved_works': {}}
    for entry in idx:
        info = resolve(entry.get('source_work', ''))
        entry['author'] = info['author']
        entry['era'] = info['era']
        if info['era']:
            stats['resolved'] += 1
        else:
            src = entry.get('source_work', '(なし)') or '(なし)'
            stats['unresolved_works'][src] = stats['unresolved_works'].get(src, 0) + 1

        # Also enrich per-text json
        p = TEXTS_DIR / f"{entry['slug']}.json"
        if p.exists():
            with open(p, encoding='utf-8') as f:
                rec = json.load(f)
            rec['author'] = info['author']
            rec['era'] = info['era']
            with open(p, 'w', encoding='utf-8') as f:
                json.dump(rec, f, ensure_ascii=False, indent=2)

    with open(idx_file, 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, indent=2)

    print(f"総数: {stats['total']}")
    print(f"解決: {stats['resolved']}")
    print(f"未解決: {stats['total'] - stats['resolved']}")
    print(f"未解決作品名:")
    for w, n in sorted(stats['unresolved_works'].items(), key=lambda x: -x[1]):
        print(f"  {w}: {n}")


if __name__ == '__main__':
    main()
