// 読解の庭（/garden）。2026-11-21 ユーザー決定「平面の絵」・計画の承認「その計画で進めて」。
// 上＝荒れた「なにがしの院」が、花が咲くたびに1か所ずつよみがえる。下＝前栽（教材ごとの草木）。
// 決まりは src/lib/garden.ts。草木の絵は Codex の依頼B（public/garden/plants、作り直し = assets-src/garden/make_plants.py）。
// 院は Codex の依頼A の絵が届くまで、図形の見取り図（components/garden/EstateSketch.tsx）。
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import bundledTextsV3 from '@/data/textsV3Index.json';
import { loadAllProgress } from '@/lib/kobun/progress';
import { getPublishedSlugs } from '@/lib/textPublications';
import { hasFullAccess } from '@/lib/fullAccess';
import { readClearedGroups } from '@/lib/readingClear';
import {
  BLOOM_STAGE, EARLIER, ESTATE_PARTS, NEXT_STEP, PLANT_NAMES, PLANT_REASON, STAGE_NAMES,
  nextPart, plantFor, plantImage, plantStage, readGardenRuns, restoredParts, seasonOf, workName,
  type EstateKey, type PlantKey, type Stage,
} from '@/lib/garden';
import EstateSketch from '@/components/garden/EstateSketch';

type TextEntry = { id: string; title: string; source?: string; genre?: string };
type Plant = { id: string; title: string; work: string; key: PlantKey; stage: Stage };

const SKY: Record<ReturnType<typeof seasonOf>, string> = {
  spring: '#fbe9ee', summer: '#e1efe6', autumn: '#f6e6d2', winter: '#e6ebf3',
};
const SOIL = '#b89a72';
const SOIL_DARK = '#8b6f47';
const HAIIN_ID = '249a2e97df'; // 廃院の怪（この院のモチーフの一つ）

const PART_NAMES = Object.fromEntries(ESTATE_PARTS.map((p) => [p.key, p.name])) as Record<EstateKey, string>;
const TITLE_OF = new Map((bundledTextsV3 as TextEntry[]).map((t) => [t.id, t.title]));

/** 種（段0）は絵が無いので、土の盛り上がりを描く */
function Seed({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 78 78" width={size} height={size} aria-hidden="true">
      <ellipse cx="39" cy="71" rx="12" ry="3.5" fill={SOIL_DARK} opacity=".35" />
      <path d="M27 70 q12 -9 24 0 z" fill={SOIL} />
      <ellipse cx="39" cy="66" rx="3" ry="2.2" fill={SOIL_DARK} />
    </svg>
  );
}

function PlantPicture({ plant, size }: { plant: Pick<Plant, 'key' | 'stage'>; size: number }) {
  const src = plantImage(plant.key, plant.stage);
  if (!src) return <Seed size={size} />;
  return <img src={src} width={size} height={size} alt="" loading="lazy" decoding="async" className="block" />;
}

function StageDots({ stage }: { stage: Stage }) {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden="true">
      {STAGE_NAMES.map((_, i) => (
        <i key={i} className="block w-[7px] h-[7px] rounded-full" style={{ background: i <= stage ? 'var(--rw-accent)' : 'var(--rw-rule)' }} />
      ))}
    </span>
  );
}

function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md bg-rw-paper rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto px-5 pt-3 pb-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-rw-rule/40 flex items-center justify-center text-rw-ink-soft" aria-label="閉じる">✕</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default function GardenPage() {
  const [sig, setSig] = useState(0); // 戻ってきたら記録を読み直す
  useEffect(() => {
    const refresh = () => setSig((n) => n + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  // 公開している教材だけ（学習履歴の庭と同じ。undefined＝読み込み中、null＝取れなかったので全部）
  const [published, setPublished] = useState<Set<string> | null | undefined>(undefined);
  useEffect(() => {
    getPublishedSlugs().then(setPublished);
  }, []);

  const { plants, restored, bloomCount } = useMemo(() => {
    void sig;
    const full = hasFullAccess();
    if (!full && published === undefined) return { plants: [] as Plant[], restored: [], bloomCount: 0 };
    const texts = (bundledTextsV3 as TextEntry[]).filter((t) => full || !published || published.has(t.id));
    const progress = loadAllProgress();
    const runs = readGardenRuns();
    const plants: Plant[] = texts.map((t) => ({
      id: t.id,
      title: t.title,
      work: workName(t.source) || 'そのほかの教材',
      key: plantFor(t.source, t.genre),
      stage: plantStage(Boolean(progress[t.id]), readClearedGroups(t.id), runs[t.id]),
    }));
    const blooms = plants.filter((p) => p.stage >= BLOOM_STAGE).map((p) => ({ textId: p.id, day: runs[p.id]?.bloomDay ?? EARLIER }));
    return { plants, restored: restoredParts(blooms), bloomCount: blooms.length };
  }, [sig, published]);

  const visible = useMemo(() => new Set(plants.map((p) => p.id)), [plants]);
  const restoredSet = useMemo(() => new Set(restored.map((r) => r.key)), [restored]);
  const next = nextPart(restored);
  const sky = SKY[seasonOf()];

  // 作品ごとの区画。育っている区画を上に、区画の中も育っている順
  const plots = useMemo(() => {
    const by = new Map<string, Plant[]>();
    for (const p of plants) by.set(p.work, [...(by.get(p.work) ?? []), p]);
    return [...by.entries()]
      .map(([work, ps]) => ({ work, key: ps[0].key, plants: [...ps].sort((a, b) => b.stage - a.stage) }))
      .sort((a, b) => b.plants[0].stage - a.plants[0].stage || b.plants.length - a.plants.length || a.work.localeCompare(b.work, 'ja'));
  }, [plants]);

  const [openPlant, setOpenPlant] = useState<Plant | null>(null);
  const [openPart, setOpenPart] = useState<EstateKey | null>(null);
  const part = openPart ? ESTATE_PARTS.find((p) => p.key === openPart)! : null;
  const restoredBy = openPart ? restored.find((r) => r.key === openPart)?.by : undefined;

  return (
    <div className="min-h-dvh bg-rw-bg text-rw-ink">
      <div className="max-w-[720px] mx-auto px-4 pt-3 pb-24">
        <Link to="/stats" className="text-[13px] text-rw-ink-soft no-underline">← 学習履歴</Link>
        <h1 className="text-[22px] font-black mt-2 mb-0.5 tracking-wide">読解の庭</h1>
        <p className="text-xs text-rw-ink-soft leading-relaxed mb-3">
          主を失い、荒れはてた「なにがしの院」。読解テストで教材の花を咲かせるたびに、院が1か所ずつよみがえります。
        </p>

        {/* 院 */}
        <section className="bg-rw-paper border border-rw-rule rounded-2xl overflow-hidden" aria-label="院">
          <div className="flex justify-between items-baseline px-3 pt-2.5 pb-1">
            <b className="text-[15px] font-black">{restored.length >= ESTATE_PARTS.length ? '院がよみがえりました' : 'なにがしの院'}</b>
            <small className="text-[10px] text-rw-ink-soft font-bold">よみがえった所 {restored.length}/{ESTATE_PARTS.length}・咲いた花 {bloomCount}本</small>
          </div>
          <div style={{ background: `linear-gradient(180deg, ${sky} 0%, var(--rw-paper) 100%)` }}>
            <EstateSketch restored={restoredSet} next={next?.key ?? null} names={PART_NAMES} onPick={setOpenPart} />
          </div>
          <div className="flex gap-2 items-start px-3 py-2.5 border-t border-rw-rule text-[12.5px] font-bold leading-normal">
            <span className="shrink-0 text-[10px] font-black bg-rw-ink text-rw-paper rounded-full px-2 py-0.5 mt-px">{next ? '次の一歩' : '完成'}</span>
            <span>
              {next ? (
                <>あと1本、花を咲かせると<b>{next.name}</b>がよみがえります。<span className="text-rw-ink-soft font-semibold">（咲いた教材に結びつく所がまだ荒れていれば、そこが先）</span></>
              ) : (
                '院の11か所がすべてよみがえりました。'
              )}
            </span>
          </div>
          {restored.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pb-2.5">
              {restored.map((r) => (
                <button key={r.key} type="button" onClick={() => setOpenPart(r.key)} className="text-[11px] font-bold border border-rw-rule bg-rw-bg text-rw-ink rounded-full px-2.5 py-0.5">
                  {PART_NAMES[r.key]}
                </button>
              ))}
            </div>
          )}
          <details className="px-3 pb-2.5 text-[11px] text-rw-ink-soft leading-relaxed">
            <summary className="cursor-pointer font-bold">この院のモチーフ</summary>
            <p className="mt-1">
              架空の院です。源融（みなもとのとおる）が陸奥の塩竈の景色を写した庭を造り、のちに荒れた河原院と、『源氏物語』で光源氏が古い邸の池や山を作り変えて造った六条院をもとにしました。
              {visible.has(HAIIN_ID) && (
                <> 夕顔の巻の「なにがしの院」は河原院とする見方もあります（<Link to={`/read/texts/${HAIIN_ID}`} className="underline">廃院の怪</Link>）。</>
              )}
            </p>
            <p className="mt-1">絵は国語便覧の寝殿造の図にならった「理想の邸」です。実際の邸の形はさまざまでした。</p>
          </details>
        </section>

        {/* 前栽 */}
        <h2 className="text-xs font-black text-rw-ink-soft tracking-widest mt-5 mb-2">前栽（せんざい）— 教材ごとの草木</h2>
        {published === undefined && !hasFullAccess() ? (
          <p className="text-xs text-rw-ink-soft">読み込んでいます...</p>
        ) : plots.length === 0 ? (
          <p className="text-xs text-rw-ink-soft">公開されている教材がまだありません。</p>
        ) : (
          plots.map((plot) => (
            <section key={plot.work} className="border border-rw-rule rounded-2xl overflow-hidden mb-3 bg-rw-paper">
              <div className="flex items-baseline justify-between px-3 pt-2.5">
                <h3 className="text-sm font-black m-0">{plot.work}</h3>
                <small className="text-[10px] text-rw-ink-soft font-bold">{PLANT_NAMES[plot.key]}・{plot.plants.length}本</small>
              </div>
              <div className="pt-1.5 px-2" style={{ background: `linear-gradient(180deg, ${sky} 0%, var(--rw-paper) 78%)` }}>
                <div className="flex gap-0.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                  {plot.plants.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setOpenPlant(p)}
                      aria-label={`${p.title}（${STAGE_NAMES[p.stage]}）`}
                      className="shrink-0 w-[78px] text-center rounded-[10px] p-0 bg-transparent border-0"
                    >
                      <PlantPicture plant={p} size={78} />
                      <div className={`text-[10px] leading-tight text-rw-ink-soft h-[26px] overflow-hidden px-0.5 ${p.stage === 0 ? 'opacity-75' : ''}`}>{p.title}</div>
                    </button>
                  ))}
                </div>
                <div className="h-2.5 -mx-2" style={{ background: `linear-gradient(180deg, ${SOIL} 0, ${SOIL_DARK} 100%)` }} />
              </div>
            </section>
          ))
        )}
        <p className="text-[11px] text-rw-ink-soft mt-4 leading-relaxed">
          草木は作品で決まります（物語＝桜・歌物語と和歌＝紅梅・随筆＝萩・日記＝女郎花・軍記＝紅葉・説話と歴史物語＝藤・評論や俳諧ほか＝山吹）。
          どれも『源氏物語』少女の巻の六条院の庭か、教材「野分のまたの日こそ」に出てくる草木です。
        </p>
      </div>

      {openPlant && (
        <Sheet label={`${openPlant.title}の草木`} onClose={() => setOpenPlant(null)}>
          <div className="flex gap-3 items-center">
            <div className="shrink-0 rounded-xl" style={{ background: `linear-gradient(180deg, ${sky}, var(--rw-paper))` }}>
              <PlantPicture plant={openPlant} size={96} />
            </div>
            <div>
              <h3 className="m-0 text-[17px] font-black">{openPlant.title}</h3>
              <div className="text-[11px] text-rw-ink-soft mt-0.5">{openPlant.work}・{PLANT_NAMES[openPlant.key]}（{PLANT_REASON[openPlant.key]}）</div>
              <div className="inline-flex items-center gap-1.5 mt-2 text-xs font-extrabold">
                <span>{STAGE_NAMES[openPlant.stage]}</span>
                <StageDots stage={openPlant.stage} />
              </div>
            </div>
          </div>
          <div className="mt-3.5 p-3 rounded-xl text-[13px] font-bold leading-relaxed" style={{ background: 'color-mix(in srgb, var(--rw-accent-soft) 70%, var(--rw-paper))' }}>
            <small className="block text-[10px] text-rw-ink-soft font-extrabold mb-0.5">次の一歩</small>
            {NEXT_STEP[openPlant.stage]}
          </div>
          <Link to={`/read/texts/${encodeURIComponent(openPlant.id)}/test`} className="block mt-2.5 text-center bg-rw-ink text-rw-paper rounded-xl py-3 font-black no-underline text-sm">読解テストへ</Link>
          <Link to={`/read/texts/${encodeURIComponent(openPlant.id)}`} className="block mt-2 text-center border border-rw-rule text-rw-ink rounded-xl py-2.5 font-bold no-underline text-[13px]">教材を読む</Link>
        </Sheet>
      )}

      {part && (
        <Sheet label={part.name} onClose={() => setOpenPart(null)}>
          <h3 className="m-0 text-[17px] font-black">
            {part.name}
            <span className="text-xs text-rw-ink-soft font-bold">（{part.yomi}）</span>
          </h3>
          <div className="text-[11px] font-bold mt-1" style={{ color: restoredSet.has(part.key) ? 'var(--rw-ok)' : 'var(--rw-ink-soft)' }}>
            {restoredSet.has(part.key) ? 'よみがえった' : `まだ荒れている：${part.ruined}`}
          </div>
          <div className="mt-2.5 p-3 rounded-xl text-[13px] font-bold leading-relaxed" style={{ background: 'color-mix(in srgb, var(--rw-accent-soft) 70%, var(--rw-paper))' }}>
            {part.note}
          </div>
          {restoredBy && TITLE_OF.get(restoredBy) && (
            <p className="text-[11px] text-rw-ink-soft mt-2">「{TITLE_OF.get(restoredBy)}」の花でよみがえりました。</p>
          )}
          {(() => {
            const links = part.texts.filter((id) => visible.has(id) && TITLE_OF.has(id));
            const hidden = part.texts.length - links.length;
            return (
              <>
                {links.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <div className="text-[11px] font-extrabold text-rw-ink-soft">この所が出てくる教材（咲かせると、ここが先によみがえる）</div>
                    {links.map((id) => (
                      <Link key={id} to={`/read/texts/${id}`} className="flex justify-between items-center border border-rw-rule rounded-[10px] px-3 py-2 text-rw-ink no-underline text-[13px] font-bold">
                        {TITLE_OF.get(id)}
                        <span className="text-[11px] text-rw-ink-soft font-semibold">教材を読む →</span>
                      </Link>
                    ))}
                  </div>
                )}
                {hidden > 0 && <p className="text-[10px] text-rw-ink-soft mt-2">ほかに、まだ公開されていない教材{hidden}本にも出てきます。</p>}
              </>
            );
          })()}
          <p className="text-[10px] text-rw-ink-soft mt-2.5">説明は AI が教材と便覧の範囲で書いたものです（先生の確認前）。</p>
        </Sheet>
      )}
    </div>
  );
}
