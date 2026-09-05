/**
 * 自動出題（おまかせ選択）: 範囲内の候補から「何を出すか」を学習記録で決める。
 *
 * 方針（単語モード・多義語モード共通）
 *   weak   … 間違えたことがある語を優先して復習させる（誤答率の高い順）
 *   new    … まったく手を付けていない語を、番号順に少しずつ進める
 *   mid    … 途中の語は誤答率に応じた重みでランダム
 *   strong … 正答率が高い／SRS箱が4以上の語は出題頻度を下げる（他が尽きた時だけ）
 *
 * 1セッションの配分は weak 40% / new 30% / 残りは mid、足りない分は他から補う。
 * 純粋関数なので単体テストできる。DB アクセスは呼び出し側。
 */

export type ItemStat = { correct: number; incorrect: number; lastSeen?: string | null };
export type Bucket = 'weak' | 'new' | 'mid' | 'strong';

export type PickInput<T> = {
  items: T[];
  /** 学習記録のキー（単語なら qid、多義語なら lemma） */
  key: (t: T) => string;
  /** 「進める」順序（単語帳の番号など。小さい方が先） */
  order: (t: T) => number;
  stats: Record<string, ItemStat>;
  /** SRS の箱（あれば。4以上は strong 扱い） */
  boxes?: Record<string, number>;
  n: number;
  now?: Date;
  rng?: () => number;
};

export type PickResult<T> = { picked: T[]; composition: Record<Bucket, number> };

const WEAK_MIN_ATTEMPTS = 2;
const WEAK_ERR_RATE = 0.4;
const STRONG_MIN_ATTEMPTS = 3;
const STRONG_ERR_RATE = 0.2;
const STRONG_BOX = 4;
/** 直近この時間内に解いた語は、同じ枠の中で後回しにする */
const RECENT_MS = 60 * 60 * 1000;

export function classify(stat: ItemStat | undefined, box?: number): Bucket {
  const total = (stat?.correct ?? 0) + (stat?.incorrect ?? 0);
  if (!stat || total === 0) return 'new';
  const err = stat.incorrect / total;
  if (total >= WEAK_MIN_ATTEMPTS && err >= WEAK_ERR_RATE) return 'weak';
  if ((box ?? 0) >= STRONG_BOX) return 'strong';
  if (total >= STRONG_MIN_ATTEMPTS && err <= STRONG_ERR_RATE) return 'strong';
  return 'mid';
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
  const composition: Record<Bucket, number> = { weak: 0, new: 0, mid: 0, strong: 0 };
  if (n <= 0 || items.length === 0) return { picked: [], composition };

  const byBucket: Record<Bucket, T[]> = { weak: [], new: [], mid: [], strong: [] };
  for (const t of items) {
    const k = key(t);
    byBucket[classify(stats[k], boxes[k])].push(t);
  }

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

  const quotaWeak = Math.min(weakSorted.length, Math.ceil(n * 0.4));
  const quotaNew = Math.min(newSorted.length, Math.ceil(n * 0.3));

  const picked: T[] = [];
  const take = (bucket: Bucket, arr: T[], count: number) => {
    const chosen = arr.slice(0, Math.max(0, Math.min(count, arr.length)));
    picked.push(...chosen);
    composition[bucket] += chosen.length;
    return arr.slice(chosen.length);
  };

  // 1) weak は上位 2×quota の中から重み付きで（毎回同じ顔ぶれにしない）
  const weakWindow = weakSorted.slice(0, Math.max(quotaWeak * 2, quotaWeak));
  const weakChosen = weightedSample(weakWindow, (t) => 1 + 4 * errRate(stats[key(t)]), quotaWeak, rng);
  picked.push(...weakChosen);
  composition.weak += weakChosen.length;
  const weakRest = weakSorted.filter((t) => !weakChosen.includes(t));

  // 2) new は番号順に quota 個
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

  // 4) 足りなければ weak の残り → new の残り → strong（頻度を下げる枠）の順で補う
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

  // 出題順は混ぜる（最初の1問は苦手か未着手にして、開始直後の「知ってる」連発を避ける）
  const shuffled = shuffle(picked, rng);
  const firstIdx = shuffled.findIndex((t) => {
    const b = classify(stats[key(t)], boxes[key(t)]);
    return b === 'weak' || b === 'new';
  });
  if (firstIdx > 0) [shuffled[0], shuffled[firstIdx]] = [shuffled[firstIdx], shuffled[0]];

  return { picked: shuffled, composition };
}
