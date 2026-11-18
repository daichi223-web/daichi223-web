import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { STAGES, TIER_TONE, robeColorOf } from '@/lib/nobleData';
import { KANSHOKU_STAGE_POSTS, ZURYO_POSTS } from '@/lib/kanshokuData';
import { PROVINCES, SHINNO_NINKOKU, kaisetsuFor, type ProvinceGrade } from '@/lib/kanshoku';
import { rankFullName } from '@/lib/teacherPromotions';
import { readMyStage } from '@/lib/myStage';

/**
 * 位階表（/kanni。2026-11-18 ユーザー指示「位階表つくっても見られるようにできる？」）。
 * 21段ごとに、位・区分（地下／殿上人／公卿）・袍の色・名乗れる官職・受領を1枚のカードで並べる。
 * 官職や国をタップすると読みと解説（kanshoku.ts の kaisetsuFor）。データは位階の「官職を選ぶ」と同じ表（kanshokuData.ts）。
 * 出世ルートは調査（F:\A2A\_work\kanshoku\routes.json）が済んだら足す。
 */

const GRADES: ProvinceGrade[] = ['大国', '上国', '中国', '下国'];

export default function KanniTable() {
  const myN = useMemo(() => readMyStage().n, []);
  const [focus, setFocus] = useState<string | null>(null);
  const view = focus ? kaisetsuFor(focus) : null;
  const { hash } = useLocation();
  // 開いたら、指定の段（#kanni-N）か今の段まで送る
  useEffect(() => {
    const id = hash ? decodeURIComponent(hash.slice(1)) : `kanni-${myN}`;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'center' }));
  }, [hash, myN]);

  const chip = (name: string, key?: string) => (
    <button
      key={key ?? name}
      type="button"
      onClick={() => setFocus((f) => (f === name ? null : name))}
      aria-pressed={focus === name}
      className="px-2 py-0.5 rounded-full border text-[12px] font-bold"
      style={{
        borderColor: focus === name ? 'var(--rw-primary)' : 'var(--rw-rule)',
        background: focus === name ? 'var(--rw-primary-soft)' : 'var(--rw-paper)',
        color: focus === name ? 'var(--rw-primary)' : 'var(--rw-ink)',
      }}
    >
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
                  {zuryo.map((z) => chip(`${z.grade}${z.post}`))}
                  {posts.map((p) => chip(p.name, `${s.n}-${p.name}`))}
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

        <p className="mt-6 text-[10.5px] leading-relaxed text-rw-ink-soft">
          出典：官位令（『官制大観』と『日本史必携』の官位相当表で照合）、延喜式 民部上、コトバンク（国史大辞典・日本大百科全書）ほか。
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
          </div>
        </div>
      )}
    </div>
  );
}
