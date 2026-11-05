/**
 * 自動出題（おまかせ選択）: 範囲内の候補から「何を出すか」を学習記録で決める。
 *
 * 方針（単語モード・多義語モード・文法道場で共通）
 *   due    … 期限が来た語（呼び出し側が渡したときだけ）。期限の古い順に先に出す
 *   weak   … 苦手な語を優先して復習させる（誤答率の高い順）
 *   new    … まったく手を付けていない語を、番号順に少しずつ進める
 *   mid    … 途中の語は誤答率に応じた重みでランダム
 *   strong … 得意な語は出題頻度を下げる（他が尽きた時だけ）
 *
 * 苦手・途中・得意の物差し（2026-11-06。docs/state-transition-review.md の案 D）
 *   箱の記録がある語は箱だけで決める：箱1＝苦手／箱2〜3＝途中／箱4以上＝得意。
 *   箱の記録が無い語だけ、正誤の累計（誤答率）で決める。
 *   以前は誤答率を箱より先に見ていたので、箱5まで上がった語も昔の誤答が多いと苦手に入り続けた。
 *
 * 1セッションの配分
 *   due を渡さないとき … weak 40% / new 30% / 残りは mid、足りない分は他から補う（今までどおり）
 *   due を渡したとき   … due 40% / weak 30% / new 30% / 残りは mid、
 *                         足りない分は due の残り → weak の残り → new の残り → mid → strong
 * 純粋関数なので単体テストできる。DB アクセスは呼び出し側。
 */

export type ItemStat = { correct: number; incorrect: number; lastSeen?: string | null };
export type Bucket = 'due' | 'weak' | 'new' | 'mid' | 'strong';

export type PickInput<T> = {
  items: T[];
  /** 学習記録のキー（単語なら qid、多義語なら lemma） */
  key: (t: T) => string;
  /** 「進める」順序（単語帳の番号など。小さい方が先） */
  order: (t: T) => number;
  stats: Record<string, ItemStat>;
  /** SRS の箱（あれば、箱だけで苦手・途中・得意を決める） */
  boxes?: Record<string, number>;
  /**
   * 期限が来た語の鍵（古い順）。渡すと、期限が来た語を先に出す配分になる。
   * 渡さない・空のときは今までと同じ配分（文法道場・多義語モードは渡していない）。
   */
  due?: string[];
  n: number;
  now?: Date;
  rng?: () => number;
};

export type PickResult<T> = { picked: T[]; composition: Record<Bucket, number> };

const WEAK_MIN_ATTEMPTS = 1;
const WEAK_ERR_RATE = 0.4;
const STRONG_MIN_ATTEMPTS = 3;
const STRONG_ERR_RATE = 0.2;
const STRONG_BOX = 4;
/** 直近この時間内に解いた語は、同じ枠の中で後回しにする */
const RECENT_MS = 60 * 60 * 1000;

/**
 * 苦手・新しい語・途中・得意に分ける（期限は見ない。期限が来た語は pickQuestions が due として先に取り分ける）。
 * 箱の記録があれば箱だけで決める。昔の誤答が多くても、箱が上がっていれば苦手に入れない。
 * 箱の記録が無いときだけ、正誤の累計（誤答率）で決める。
 */
export function classify(stat: ItemStat | undefined, box?: number): Exclude<Bucket, 'due'> {
  if (box != null) {
    if (box <= 1) return 'weak';
    if (box >= STRONG_BOX) return 'strong';
    // 間隔を空けた確認を優先。同日の正解数だけで得意にしない。
    return 'mid';
  }
  const total = (stat?.correct ?? 0) + (stat?.incorrect ?? 0);
  if (!stat || total === 0) return 'new';
  const err = stat.incorrect / total;
  if (total >= WEAK_MIN_ATTEMPTS && err >= WEAK_ERR_RATE) return 'weak';
  if (total >= STRONG_MIN_ATTEMPTS && err <= STRONG_ERR_RATE) return 'strong';
  return 'mid';
}

/**
 * 設定パネルの「前回の内訳」の1行。期限が来た語（復習）は、入ったときだけ先頭に出す。
 * 得意も、入ったときだけ出す（今までどおり）。
 */
export function compositionLine(c: Record<Bucket, number>): string {
  const due = c.due > 0 ? `復習 ${c.due}・` : '';
  const strong = c.strong > 0 ? `・得意 ${c.strong}` : '';
  return `前回の内訳: ${due}苦手 ${c.weak}・未着手 ${c.new}・途中 ${c.mid}${strong}`;
}

function errRate(stat: ItemStat | undefined): number {
  const total = (stat?.correct ?? 0) + (stat?.incorrect ?? 0);
  return total === 0 ? 0 : (stat!.incorrect) / total;
}

function isRecent(stat: ItemStat | undefined, now: Date): boolean {
  if (!stat?.lastSeen) return false;
  const t = Date.parse(stat.lastSeen);
  return Number.isFinite(t) && now.getTime() - t < RECENT_MS;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 重み付きの非復元抽出 */
function weightedSample<T>(items: T[], weight: (t: T) => number, n: number, rng: () => number): T[] {
  const pool = items.map((t) => ({ t, w: Math.max(0.0001, weight(t)) }));
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const total = pool.reduce((a, x) => a + x.w, 0);
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool[idx].t);
    pool.splice(idx, 1);
  }
  return out;
}

export function pickQuestions<T>(input: PickInput<T>): PickResult<T> {
  const { items, key, order, stats, boxes = {}, n } = input;
  const now = input.now ?? new Date();
  const rng = input.rng ?? Math.random;
  const composition: Record<Bucket, number> = { due: 0, weak: 0, new: 0, mid: 0, strong: 0 };
  if (n <= 0 || items.length === 0) return { picked: [], composition };

  // 期限が来た語（古い順の番号つき）。渡されなければ空で、下の流れは今までとまったく同じになる
  const dueRank = new Map((input.due ?? []).map((k, i) => [k, i] as const));
  const bucketOf = (t: T): Bucket => {
    const k = key(t);
    return dueRank.has(k) ? 'due' : classify(stats[k], boxes[k]);
  };

  const byBucket: Record<Bucket, T[]> = { due: [], weak: [], new: [], mid: [], strong: [] };
  for (const t of items) byBucket[bucketOf(t)].push(t);
  // 期限を見る配分にするか（範囲の中に期限が来た語が1つでもあるとき）
  const useDue = byBucket.due.length > 0;

  // due: 期限の古い順。直近1時間に解いた語は後ろへ（間違えた直後の箱1の語が、すぐまた並ばないように）
  const dueSorted = byBucket.due
    .map((t) => ({ t, recent: isRecent(stats[key(t)], now) ? 1 : 0, rank: dueRank.get(key(t)) ?? 0 }))
    .sort((a, b) => (a.recent !== b.recent ? a.recent - b.recent : a.rank - b.rank))
    .map((x) => x.t);

  // weak: 誤答率の高い順。直近1時間に解いた語は後ろへ。上位の中で軽くシャッフル
  const weakSorted = byBucket.weak
    .map((t) => ({ t, s: stats[key(t)] }))
    .sort((a, b) => {
      const ra = isRecent(a.s, now) ? 1 : 0, rb = isRecent(b.s, now) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return errRate(b.s) - errRate(a.s);
    })
    .map((x) => x.t);

  // new: 番号順に進める（決定的）。同じ番号内だけ揺らす
  const newSorted = [...byBucket.new].sort((a, b) => order(a) - order(b));

  const picked: T[] = [];
  const take = (bucket: Bucket, arr: T[], count: number) => {
    const chosen = arr.slice(0, Math.max(0, Math.min(count, arr.length)));
    picked.push(...chosen);
    composition[bucket] += chosen.length;
    return arr.slice(chosen.length);
  };
  // 期限を見る配分では、枠の合計が n を超えないよう残りの数で切る（n が小さいと 40%+30%+30% の切り上げで超える）。
  // 期限を見ない配分は今までの数え方のまま（文法道場の結果を変えないため）
  const room = (quota: number) => (useDue ? Math.max(0, Math.min(quota, n - picked.length)) : quota);

  // 0) due は期限の古い順に最大 40%
  const dueRest = useDue ? take('due', dueSorted, Math.ceil(n * 0.4)) : [];

  const quotaWeak = room(Math.min(weakSorted.length, Math.ceil(n * (useDue ? 0.3 : 0.4))));

  // 1) weak は上位 2×quota の中から重み付きで（毎回同じ顔ぶれにしない）
  const weakWindow = weakSorted.slice(0, Math.max(quotaWeak * 2, quotaWeak));
  const weakChosen = weightedSample(weakWindow, (t) => 1 + 4 * errRate(stats[key(t)]), quotaWeak, rng);
  picked.push(...weakChosen);
  composition.weak += weakChosen.length;
  const weakRest = weakSorted.filter((t) => !weakChosen.includes(t));

  // 2) new は番号順に quota 個
  const quotaNew = room(Math.min(newSorted.length, Math.ceil(n * 0.3)));
  let newRest = take('new', newSorted, quotaNew);

  // 3) 残りは mid から誤答率に応じた重みで（直近は重み半減）
  let remaining = n - picked.length;
  const midChosen = weightedSample(
    byBucket.mid,
    (t) => (1 + 3 * errRate(stats[key(t)])) * (isRecent(stats[key(t)], now) ? 0.5 : 1),
    remaining,
    rng,
  );
  picked.push(...midChosen);
  composition.mid += midChosen.length;
  remaining = n - picked.length;

  // 4) 足りなければ due の残り → weak の残り → new の残り → strong（頻度を下げる枠）の順で補う
  //    （mid は 3) で取り切っているので、ここに残りは無い）
  if (remaining > 0 && dueRest.length > 0) {
    const extra = dueRest.slice(0, remaining);
    picked.push(...extra); composition.due += extra.length; remaining -= extra.length;
  }
  if (remaining > 0 && weakRest.length > 0) {
    const extra = weakRest.slice(0, remaining);
    picked.push(...extra); composition.weak += extra.length; remaining -= extra.length;
  }
  if (remaining > 0 && newRest.length > 0) {
    const extra = newRest.slice(0, remaining);
    picked.push(...extra); composition.new += extra.length; remaining -= extra.length;
    newRest = newRest.slice(extra.length);
  }
  if (remaining > 0 && byBucket.strong.length > 0) {
    // strong は箱が低い・最後に見たのが古いものから
    const strongSorted = [...byBucket.strong].sort((a, b) => {
      const ba = boxes[key(a)] ?? 0, bb = boxes[key(b)] ?? 0;
      if (ba !== bb) return ba - bb;
      const la = Date.parse(stats[key(a)]?.lastSeen ?? '') || 0;
      const lb = Date.parse(stats[key(b)]?.lastSeen ?? '') || 0;
      return la - lb;
    });
    const extra = strongSorted.slice(0, remaining);
    picked.push(...extra); composition.strong += extra.length; remaining -= extra.length;
  }

  // 出題順は混ぜる（最初の1問は期限が来た語・苦手・未着手のどれかにして、開始直後の「知ってる」連発を避ける）
  const shuffled = shuffle(picked, rng);
  const firstIdx = shuffled.findIndex((t) => {
    const b = bucketOf(t);
    return b === 'due' || b === 'weak' || b === 'new';
  });
  if (firstIdx > 0) [shuffled[0], shuffled[firstIdx]] = [shuffled[firstIdx], shuffled[0]];

  return { picked: shuffled, composition };
}
