/**
 * kobun-tan 利用状況の集計ロジック（node と ブラウザで共用）。
 *   node:    usage-report.mjs が import して全期間の JSON を作る
 *   browser: usage-dashboard.template.html に丸ごと埋め込まれ、期間を変えるたびに再集計する
 *
 * D（埋め込みデータ）の形:
 *   users: string[]                               // 匿名 user_id の先頭 8 桁（index が uIdx）
 *   ws:   [uIdx, qid, correct, incorrect, lastDay, firstDay][]   // word_stats（日付は JST の "YYYY-MM-DD"）
 *   srs:  [uIdx, qid, box, nextReviewDay, lastReviewDay][]      // srs_state
 *   prog: [uIdx, topicId, drillTotal, drillCorrect, masteryPct, updatedDay][]  // grammar_topic_progress
 *   wordLabels: {qid: "語（意味）"}, drillLabels: {id: prompt}, drillTopics: {id: topicId}
 *   wordTotal, drillTotal, topicTotal
 *
 * 期間 [from, to] は "YYYY-MM-DD" で両端を含む。null は無制限。
 * word_stats は語ごとの累計行なので、期間集計は「その期間に最後に触れた語の累計」＝概算（過少）。
 */

const inRange = (d, from, to) => !!d && (!from || d >= from) && (!to || d <= to);
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const isWordQid = (qid) => /^\d+-/.test(qid);
const bandOf = (qid) => { const g = parseInt(qid, 10); const lo = Math.floor((g - 1) / 50) * 50 + 1; return `${lo}〜${lo + 49}`; };
const weekOf = (d) => {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const shiftDay = (day, n) => { const t = new Date(day + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** D.users[u] は "先頭8桁" の文字列（旧）か {id, school?, grade?, cls?, num?}（登録済み）。
 *  個人の識別は学校コード＋年・組・番号だけ（メール等は持たない） */
const identity = (D, u) => {
  const x = D.users[u];
  const o = typeof x === "string" ? { id: x } : { ...x };
  o.school = o.school ?? "";
  o.klass = o.cls && o.num ? `${o.grade ? o.grade + "-" : ""}${o.cls}-${o.num}` : "";
  o.registered = !!(x && typeof x === "object" && x.school);
  return o;
};

const BUCKETS = [
  { label: "1〜10回", lo: 1, hi: 10 },
  { label: "11〜50回", lo: 11, hi: 50 },
  { label: "51〜100回", lo: 51, hi: 100 },
  { label: "101〜300回", lo: 101, hi: 300 },
  { label: "301回以上", lo: 301, hi: Infinity },
];

/** 全体集計（期間つき） */
function aggregate(D, from, to, today) {
  const users = new Map();   // uIdx -> {ans, c, last, first, words}
  const byQid = new Map();   // qid -> {c, i, u}
  const byMonth = new Map();
  let totalAns = 0, totalCorrect = 0;
  for (const [u, qid, c, i, last, first] of D.ws) {
    if (!inRange(last, from, to)) continue;
    const n = c + i;
    totalAns += n; totalCorrect += c;
    const s = users.get(u) ?? { ans: 0, c: 0, last: "", first: "9999-99-99", words: 0, srs: 0, box5: 0, due: 0, topics: 0, mastery: 0 };
    s.ans += n; s.c += c; s.words++;
    if (last > s.last) s.last = last;
    if (first && first < s.first) s.first = first;
    users.set(u, s);
    const m = last.slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + n);
    const q = byQid.get(qid) ?? { c: 0, i: 0, u: 0 };
    q.c += c; q.i += i; q.u++;
    byQid.set(qid, q);
  }

  // SRS（期間指定時は「その期間に復習した語」だけ）
  const boxes = [0, 0, 0, 0, 0, 0];
  let due = 0, srsRows = 0;
  const srsUsers = new Set();
  for (const [u, , box, nextDay, lastReview] of D.srs) {
    if ((from || to) && !inRange(lastReview, from, to)) continue;
    srsRows++; boxes[box ?? 0]++; srsUsers.add(u);
    const isDue = !!nextDay && nextDay <= today;
    if (isDue) due++;
    const s = users.get(u);
    if (s) { s.srs++; if (box === 5) s.box5++; if (isDue) s.due++; }
  }

  // 文法道場（期間指定時は「その期間に更新のあったトピック」だけ）
  const topicUsers = new Map();
  const topicMastery = new Map();
  const progUsers = new Set();
  for (const [u, topic, , , mastery, upd] of D.prog) {
    if ((from || to) && !inRange(upd, from, to)) continue;
    progUsers.add(u);
    topicUsers.set(topic, (topicUsers.get(topic) ?? 0) + 1);
    const m = topicMastery.get(topic) ?? { sum: 0, n: 0 };
    m.sum += mastery ?? 0; m.n++;
    topicMastery.set(topic, m);
    const s = users.get(u);
    if (s) { s.topics++; s.mastery += mastery ?? 0; }
  }

  const ansPerUser = [...users.values()].map((s) => s.ans);
  const lastDays = [...users.values()].map((s) => s.last);
  const byWeek = new Map();
  for (const d of lastDays) if (d) byWeek.set(weekOf(d), (byWeek.get(weekOf(d)) ?? 0) + 1);

  const bands = new Map();
  let grammarAns = 0;
  for (const [qid, q] of byQid) {
    const n = q.c + q.i;
    if (!isWordQid(qid)) { grammarAns += n; continue; }
    bands.set(bandOf(qid), (bands.get(bandOf(qid)) ?? 0) + n);
  }

  const label = (qid) => D.wordLabels[qid] ?? D.drillLabels[qid] ?? "";
  const minN = totalAns >= 10000 ? 15 : totalAns >= 1000 ? 5 : 2;
  const hard = [...byQid.entries()].filter(([, q]) => q.c + q.i >= minN)
    .map(([qid, q]) => ({
      qid, n: q.c + q.i, err: pct(q.i, q.c + q.i), users: q.u,
      kind: isWordQid(qid) ? "単語" : "文法",
      label: label(qid), topic: D.drillTopics[qid] ?? "",
    }))
    .sort((a, b) => b.err - a.err || b.n - a.n).slice(0, 25);
  const freq = [...byQid.entries()]
    .map(([qid, q]) => ({ qid, n: q.c + q.i, label: label(qid) }))
    .sort((a, b) => b.n - a.n).slice(0, 10);

  const people = [...users.entries()].map(([u, s]) => ({
    u, ...identity(D, u), ans: s.ans, correctPct: pct(s.c, s.ans), first: s.first === "9999-99-99" ? "" : s.first, last: s.last,
    words: s.words, srs: s.srs, box5: s.box5, due: s.due, topics: s.topics,
    mastery: s.topics ? Math.round(s.mastery / s.topics) : null,
  }));
  // 登録済みだが期間内に記録がない人も一覧に出す（回答 0）。totals には数えない
  for (let u = 0; u < (D.users ?? []).length; u++) {
    const x = D.users[u];
    if (x && typeof x === "object" && x.school && !users.has(u)) {
      people.push({ u, ...identity(D, u), inactive: true, ans: 0, correctPct: 0, first: "", last: "", words: 0, srs: 0, box5: 0, due: 0, topics: 0, mastery: null });
    }
  }
  people.sort((a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : b.ans - a.ans));

  const sortedDays = lastDays.filter(Boolean).sort();
  return {
    from, to, minN,
    totals: {
      users: users.size,
      answers: totalAns,
      correctPct: pct(totalCorrect, totalAns),
      median: median(ansPerUser),
      low10: ansPerUser.filter((x) => x <= 10).length,
      active7: lastDays.filter((d) => d >= shiftDay(today, -7)).length,
      active30: lastDays.filter((d) => d >= shiftDay(today, -30)).length,
      wordQidsSeen: [...byQid.keys()].filter(isWordQid).length,
      wordQidTotal: D.wordTotal,
      grammarAns,
      top5: [...ansPerUser].sort((a, b) => b - a).slice(0, 5),
      firstDay: sortedDays[0] ?? "",
      lastDay: sortedDays[sortedDays.length - 1] ?? "",
    },
    months: [...byMonth.entries()].filter(([m]) => m).sort().map(([m, n]) => ({ m, n })),
    buckets: BUCKETS.map((b) => ({ label: b.label, n: ansPerUser.filter((x) => x >= b.lo && x <= b.hi).length })),
    weeks: [...byWeek.entries()].sort().map(([w, n]) => ({ w, n })),
    bands: [...bands.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([band, n]) => ({ band, n })),
    hard,
    freq,
    srs: { rows: srsRows, users: srsUsers.size, boxes: boxes.slice(1), due, duePct: pct(due, srsRows) },
    grammar: {
      topics: D.topicTotal,
      drills: D.drillTotal,
      users: progUsers.size,
      topTopics: [...topicUsers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([id, n]) => ({ id, n, mastery: Math.round(topicMastery.get(id).sum / topicMastery.get(id).n) || 0 })),
    },
    people,
  };
}

/** 1人ぶんの詳細（期間つき） */
function personDetail(D, u, from, to, today) {
  const words = [];
  const byMonth = new Map();
  const bands = new Map();
  let ans = 0, c = 0, grammarAns = 0, first = "9999-99-99", last = "";
  for (const row of D.ws) {
    if (row[0] !== u) continue;
    const [, qid, cc, ii, lastDay, firstDay] = row;
    if (!inRange(lastDay, from, to)) continue;
    const n = cc + ii;
    ans += n; c += cc;
    if (lastDay > last) last = lastDay;
    if (firstDay && firstDay < first) first = firstDay;
    byMonth.set(lastDay.slice(0, 7), (byMonth.get(lastDay.slice(0, 7)) ?? 0) + n);
    if (isWordQid(qid)) bands.set(bandOf(qid), (bands.get(bandOf(qid)) ?? 0) + n); else grammarAns += n;
    words.push({ qid, n, c: cc, i: ii, err: pct(ii, n), last: lastDay, kind: isWordQid(qid) ? "単語" : "文法",
      label: D.wordLabels[qid] ?? D.drillLabels[qid] ?? "" });
  }
  const boxes = [0, 0, 0, 0, 0, 0];
  let due = 0, srsRows = 0;
  const srsByQid = new Map();
  for (const row of D.srs) {
    if (row[0] !== u) continue;
    const [, qid, box, nextDay, lastReview] = row;
    if ((from || to) && !inRange(lastReview, from, to)) continue;
    srsRows++; boxes[box ?? 0]++;
    if (nextDay && nextDay <= today) due++;
    srsByQid.set(qid, box);
  }
  for (const w of words) w.box = srsByQid.get(w.qid) ?? null;
  const topics = [];
  for (const row of D.prog) {
    if (row[0] !== u) continue;
    const [, topic, total, correct, mastery, upd] = row;
    if ((from || to) && !inRange(upd, from, to)) continue;
    topics.push({ id: topic, total, correct, mastery, updated: upd });
  }
  topics.sort((a, b) => (b.updated > a.updated ? 1 : -1));
  const weak = words.filter((w) => w.n >= 2 && w.err >= 50).sort((a, b) => b.err - a.err || b.n - a.n).slice(0, 15);
  const recent = [...words].sort((a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : b.n - a.n)).slice(0, 15);
  return {
    ...identity(D, u), ans, correctPct: pct(c, ans), grammarAns, first: first === "9999-99-99" ? "" : first, last,
    words: words.length,
    months: [...byMonth.entries()].sort().map(([m, n]) => ({ m, n })),
    bands: [...bands.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([band, n]) => ({ band, n })),
    srs: { rows: srsRows, boxes: boxes.slice(1), due, duePct: pct(due, srsRows) },
    topics, weak, recent,
  };
}

export { aggregate, personDetail, inRange, shiftDay };
