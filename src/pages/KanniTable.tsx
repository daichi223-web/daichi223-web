import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { STAGES, TIER_TONE, robeColorOf } from '@/lib/nobleData';
import { CAREER_ROUTES, CAREER_TERMS, KANSHOKU_STAGE_POSTS, NYOBO, ZURYO_POSTS } from '@/lib/kanshokuData';
import { PROVINCES, SHINNO_NINKOKU, kaisetsuFor, type ProvinceGrade } from '@/lib/kanshoku';
import { rankFullName } from '@/lib/teacherPromotions';
import { readMyStage } from '@/lib/myStage';

/**
 * 位階表（/kanni。2026-11-18 ユーザー指示「位階表つくっても見られるようにできる？」）。
 * 21段ごとに、位・区分（地下／殿上人／公卿）・袍の色・名乗れる官職・受領を1枚のカードで並べる。
 * 官職や国をタップすると読みと解説（kanshoku.ts の kaisetsuFor）。データは位階の「官職を選ぶ」と同じ表（kanshokuData.ts）。
 * 出世ルート（2026-11-18、ユーザー指示「出世ルートなども解説できればよい」）：ルートを選ぶと、通る官職に番号が付く。正本 = F:\A2A\_work\kanshoku\routes.json。
 */

const GRADES: ProvinceGrade[] = ['大国', '上国', '中国', '下国'];

export default function KanniTable() {
  const myN = useMemo(() => readMyStage().n, []);
  const [focus, setFocus] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const route = CAREER_ROUTES.find((r) => r.id === routeId) ?? null;
  // ルートで通る官職：段と名前 → 何番目か（1から）
  const stepNo = (n: number, name: string) => {
    if (!route) return 0;
    const i = route.steps.findIndex((s) => s.n === n && s.post === name);
    return i + 1;
  };
  const view = focus ? kaisetsuFor(focus) : null;
  const { hash } = useLocation();
  // 開いたら、指定の段（#kanni-N）か今の段まで送る
  useEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : `kanni-${myN}`;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }));
  }, [hash, myN]);

  const chip = (name: string, key?: string, no = 0) => (
    <button
      key={key ?? name}
      type="button"
      onClick={() => setFocus((f) => (f === name ? null : name))}
      aria-pressed={focus === name}
      className="px-2 py-0.5 rounded-full border text-[12px] font-bold"
      style={{
        borderColor: focus === name || no ? 'var(--rw-primary)' : 'var(--rw-rule)',
        borderWidth: no ? 2 : 1,
        background: focus === name ? 'var(--rw-primary-soft)' : 'var(--rw-paper)',
        color: focus === name || no ? 'var(--rw-primary)' : 'var(--rw-ink)',
      }}
    >
      {no > 0 && <span className="mr-1 text-[10px] font-black">{no}</span>}
      {name}
    </button>
  );

  return (
    <div className="min-h-dvh bg-rw-bg pb-40">
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex items-center gap-3 mb-3">
          <Link to="/stats" className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full border-2 border-rw-ink text-rw-ink font-black" aria-label="学習履歴へ戻る">
            ←
          </Link>
          <div>
            <p className="text-[10px] font-black tracking-widest text-rw-ink-soft">位階と官職</p>
            <h1 className="text-lg font-black text-rw-ink" style={{ fontFamily: '"Noto Serif JP", serif' }}>位階表</h1>
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-rw-ink-soft mb-3">
          位（くらい）ごとに、その位の人が就いた主な官職です。律令の「官位令」の決まり（官位相当）と、平安時代の慣例で並べています。
          官職や国をタップすると、読みと説明が出ます。
        </p>

        {/* 区分の見方 */}
        <div className="flex flex-wrap gap-1.5 mb-4 text-[11px] font-bold">
          {(['地下', '殿上人', '公卿', '極位'] as const).map((t) => (
            <span key={t} className="px-2 py-0.5 rounded-full border" style={{ color: TIER_TONE[t].fg, borderColor: TIER_TONE[t].fg, background: TIER_TONE[t].bg }}>
              {t}
            </span>
          ))}
          <span className="text-rw-ink-soft font-normal self-center">（五位からが殿上人、三位からが公卿）</span>
        </div>

        {/* 出世ルート */}
        <div className="mb-4 rounded-xl border border-rw-rule bg-rw-paper px-3 py-2">
          <p className="text-[13px] font-black text-rw-ink">出世ルート</p>
          <p className="text-[11px] text-rw-ink-soft mb-1.5">選ぶと、下の表で通る官職に番号が付きます。</p>
          <div className="flex flex-wrap gap-1.5">
            {CAREER_ROUTES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRouteId((x) => (x === r.id ? null : r.id))}
                aria-pressed={routeId === r.id}
                className="px-2.5 py-1 rounded-full border-2 text-[12px] font-bold"
                style={{
                  borderColor: routeId === r.id ? 'var(--rw-primary)' : 'var(--rw-rule)',
                  background: routeId === r.id ? 'var(--rw-primary-soft)' : 'var(--rw-paper)',
                  color: routeId === r.id ? 'var(--rw-primary)' : 'var(--rw-ink)',
                }}
              >
                {r.name}
              </button>
            ))}
          </div>
          {route && (
            <div className="mt-2 pt-2 border-t border-rw-rule">
              <p className="text-[12.5px] leading-relaxed text-rw-ink">{route.summary}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-rw-ink">
                {route.steps.map((s, i) => (
                  <span key={`${s.post}-${i}`}>
                    {i > 0 && <span className="text-rw-ink-soft"> → </span>}
                    <b>{i + 1} {s.post}</b>
                    {s.n === null && <span className="text-[10px] text-rw-ink-soft">（位の外）</span>}
                  </span>
                ))}
              </p>
              {route.deadEnd && <p className="mt-1.5 text-[11.5px] leading-relaxed text-rw-ink-soft">{route.deadEnd}</p>}
              {route.examples.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {route.examples.map((e) => (
                    <li key={e.person} className="text-[11.5px] leading-relaxed text-rw-ink">
                      <b>{e.person}</b>：<span className="text-rw-ink-soft">{e.path}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[10px] text-rw-ink-soft">番号の付いた官職を置いた段は官位相当で、その人の実際の位とは限りません。</p>
            </div>
          )}
        </div>

        <ol className="space-y-2">
          {STAGES.map((s) => {
            const mine = s.n === myN;
            const tone = TIER_TONE[s.era];
            const posts = KANSHOKU_STAGE_POSTS[s.n] ?? [];
            const zuryo = ZURYO_POSTS.filter((z) => z.n === s.n);
            return (
              <li
                key={s.n}
                id={`kanni-${s.n}`}
                className="rounded-xl border bg-rw-paper px-3 py-2"
                style={{ borderColor: mine ? 'var(--rw-primary)' : 'var(--rw-rule)', borderWidth: mine ? 2 : 1 }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-sm border shrink-0" style={{ background: robeColorOf(s.display.robe), borderColor: 'rgba(0,0,0,0.2)' }} title={`袍：${s.display.robe}`} />
                  <span className="text-[15px] font-black text-rw-ink" style={{ fontFamily: '"Noto Serif JP", serif' }}>{rankFullName(s.rank)}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border" style={{ color: tone.fg, borderColor: tone.fg }}>{s.era}</span>
                  <span className="text-[10px] text-rw-ink-soft">第{s.n}階・袍 {s.display.robe}</span>
                  {mine && <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'var(--rw-primary)', color: '#fff' }}>いま</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {zuryo.map((z) => chip(`${z.grade}${z.post}`, undefined, stepNo(s.n, `${z.grade}${z.post}`)))}
                  {posts.map((p) => chip(p.name, `${s.n}-${p.name}`, stepNo(s.n, p.name)))}
                </div>
              </li>
            );
          })}
        </ol>

        <h2 className="mt-6 mb-2 text-base font-black text-rw-ink" style={{ fontFamily: '"Noto Serif JP", serif' }}>国の等級（延喜式）</h2>
        <p className="text-[12px] leading-relaxed text-rw-ink-soft mb-2">
          国は大国・上国・中国・下国の四つに分けられ、等級で国守（守）の位が違いました。介（次官）は大国・上国だけに置かれます。
          上総・常陸・上野は親王任国で、守は親王、実際に下るのは介でした。
        </p>
        <div className="space-y-2">
          {GRADES.map((g) => (
            <div key={g} className="rounded-xl border border-rw-rule bg-rw-paper px-3 py-2">
              <button type="button" onClick={() => setFocus((f) => (f === `${g}守` ? null : `${g}守`))} className="text-[13px] font-black text-rw-ink underline-offset-2 hover:underline">
                {g}（{PROVINCES[g].length}か国）
              </button>
              <div className="mt-1 flex flex-wrap gap-1">
                {PROVINCES[g].map((p) => chip(`${p}${SHINNO_NINKOKU.includes(p) ? '介' : '守'}`, p))}
              </div>
            </div>
          ))}
        </div>

        <h2 className="mt-6 mb-2 text-base font-black text-rw-ink" style={{ fontFamily: '"Noto Serif JP", serif' }}>出世の言葉</h2>
        <div className="flex flex-wrap gap-1">{Object.keys(CAREER_TERMS).map((t) => chip(t, `term-${t}`))}</div>

        <h2 className="mt-6 mb-2 text-base font-black text-rw-ink" style={{ fontFamily: '"Noto Serif JP", serif' }}>女房の呼び名</h2>
        <p className="text-[12px] leading-relaxed text-rw-ink-soft mb-2">{NYOBO.summary}</p>
        <ul className="space-y-1 mb-2">
          {NYOBO.names.map((x) => (
            <li key={x.name} className="text-[12px] leading-relaxed text-rw-ink"><b>{x.name}</b>：<span className="text-rw-ink-soft">{x.text}</span></li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1">{NYOBO.posts.map((x) => chip(x.name, `nyobo-${x.name}`))}</div>
        {NYOBO.note && <p className="mt-2 text-[10.5px] leading-relaxed text-rw-ink-soft">{NYOBO.note}</p>}

        <p className="mt-6 text-[10.5px] leading-relaxed text-rw-ink-soft">
          出典：官位令（『官制大観』と『日本史必携』の官位相当表で照合）、延喜式 民部上、コトバンク（日本大百科全書・世界大百科事典ほか）、出世ルートは岸野幸子「文章科出身者の任官と昇進」（1998）・公卿補任による経歴ほか。
          摂政・関白は相当の位の定めがなく、一位に置くのは推定です。蔵人・参議など令外官の位は慣例によります。
        </p>
      </div>

      {/* 解説（下に固定） */}
      {view && (
        <div className="fixed inset-x-0 bottom-0 z-40" aria-live="polite">
          <div className="max-w-2xl mx-auto m-2 rounded-2xl border-2 border-rw-ink bg-rw-paper px-4 py-3 shadow-lg">
            <div className="flex items-start gap-2">
              <p className="flex-1 text-[14px] font-black text-rw-ink">
                {view.title}
                <span className="ml-1.5 text-[11px] font-bold text-rw-ink-soft">（{view.kana}）</span>
              </p>
              <button type="button" onClick={() => setFocus(null)} aria-label="閉じる" className="shrink-0 w-7 h-7 rounded-full border-2 border-rw-ink text-[12px] font-black">✕</button>
            </div>
            {view.lines.map((t, i) => (
              <p key={i} className="mt-1 text-[12.5px] leading-relaxed text-rw-ink-soft">{t}</p>
            ))}
            {view.next && view.next.length > 0 && (
              <p className="mt-1 text-[11.5px] leading-relaxed text-rw-ink">
                <span className="font-bold text-rw-ink-soft">このあと、よく進む先：</span>
                {view.next.map((x, i) => (
                  <span key={x.post}>{i > 0 ? '・' : ''}<b>{x.post}</b><span className="text-rw-ink-soft">（{x.route}）</span></span>
                ))}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
