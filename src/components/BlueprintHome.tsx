import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { useReiwaTheme } from '../theme/ThemeContext';
import type { ReiwaPalette } from '../theme/reiwa';
import { CHAPTERS } from '../utils/chapters';

// 古文機構 MK.III — 設計図ホーム (4 段階進化)
// プロトタイプ: handoff/rw-mecha-v2.jsx を TS+令和テーマ用に完全移植。
// 「Key & Point 古文単語330」の 5 章 (読解必修 50 / 入試必修 100 / 最重要敬語 30 /
// 入試重要 100 / 入試攻略 50 = 計 330 語) を BOM に流す。
// Stage 1: ナプキン素描   (語数 0-49)
// Stage 2: 骨組み確定     (語数 50-149 / 読解必修クリア)
// Stage 3: 分解詳細       (語数 150-279 / 敬語完了)
// Stage 4: MK.III 完成形  (語数 280+ / 入試攻略到達)

const FONT_SERIF = '"Noto Serif JP", serif';
const FONT_MONO = '"JetBrains Mono", monospace';
const FONT_KLEE = '"Klee One", "Noto Sans JP", sans-serif';

const STAMP_RED = '#a93226';

// chapters.ts の章 id (ext 含む 6 種) のうち BOM に出すのは 5 章のみ
export type ChapterId = 'ch1' | 'ch2' | 'ch3' | 'ch4' | 'ch5';
export const VISIBLE_CHAPTERS = CHAPTERS.filter((c) => c.id !== 'ext') as Array<typeof CHAPTERS[number] & { id: ChapterId }>;

// 段位 (★0-12 = 13 段階・3 大階層。古文常識の代表官職に擬えた階級制。位階順に整列):
//   地下:  ★0 無位 / ★1 雑色 / ★2 舎人 / ★3 衛士
//   殿上:  ★4 蔵人 / ★5 受領 / ★6 弁官 / ★7 中将 / ★8 頭中将
//   公卿:  ★9 参議 / ★10 大将 / ★11 大納言 / ★12 大臣 (= 真のマスター)
// - masteredPct: master / total * 100 → BOM 棒グラフ (★12 大臣 = 真にマスター)
// - avgTierPct:  (avg tier / 12) * 100 → 部位 opacity (なめらかな成長感)
export const TIER_LABELS = [
  '無位', '雑色', '舎人', '衛士',                              // 地下 (★0-3)
  '蔵人', '受領', '弁官', '中将', '頭中将',                    // 殿上 (★4-8)
  '参議', '大将', '大納言', '大臣',                            // 公卿 (★9-12)
] as const;
// 各段位の相当位階 (古文常識的な目安。実際は時代・人物で前後する)
export const TIER_KAII = [
  '', '無位', '初位', '八位',                                  // 地下
  '六位', '従五位下', '正五位', '従四位下', '従四位上',         // 殿上
  '正四位', '従三位', '正三位', '正二位以上',                   // 公卿
] as const;
export type ChapterStats = {
  total: number;
  jigeCount: number;     // 地下 ★1-3
  tenjouCount: number;   // 殿上 ★4-6
  kugyouCount: number;   // 公卿 ★7-9
  masterCount: number;   // ★9 大納言
  masteredPct: number;
  avgTierPct: number;
};
export type FieldMastery = Record<ChapterId, ChapterStats>;

export type BlueprintProps = {
  totalLearned: number;          // 着手 = ★1+ の語数 (ステージ判定の根拠)
  totalMastered: number;         // マスター = ★4 (達人) の語数
  fieldMastery: FieldMastery;    // 5 章ごとの段位集計
};

// 「Key & Point 古文単語330」全 330 語 (5 章) に合わせたステージ閾値。
// Stage の境界 = 章のクリアタイミングに揃えてある。
export function computeStage(n: number): 1 | 2 | 3 | 4 {
  if (n >= 280) return 4;  // 入試攻略 (ch5) 到達
  if (n >= 150) return 3;  // 最重要敬語 (ch3) 完了 / 入試重要 (ch4) 中
  if (n >= 50) return 2;   // 読解必修 (ch1) クリア
  return 1;
}

// 語数 → REV 番号 (1〜50, 330 語で 50 へ線形)
function computeRev(learned: number): number {
  return Math.min(50, Math.max(1, 1 + Math.floor(learned / 7)));
}

// 32 個の部品のうち、stage に応じた獲得数
function partsCompleted(stage: number): number {
  switch (stage) {
    case 4: return 32;
    case 3: return 15;
    case 2: return 5;
    default: return 0;
  }
}

// 次ステージまでの語数
function nextThreshold(learned: number): number {
  if (learned < 50) return 50 - learned;
  if (learned < 150) return 150 - learned;
  if (learned < 280) return 280 - learned;
  return 0;
}

export default function BlueprintHome(props: BlueprintProps) {
  const stage = computeStage(props.totalLearned);
  if (stage === 4) return <Stage4 {...props} />;
  if (stage === 3) return <Stage3 {...props} />;
  if (stage === 2) return <Stage2 {...props} />;
  return <Stage1 {...props} />;
}

// Reusable callout (number bubble + leader line + part code)
type CalloutProps = {
  x: number; y: number;
  lx: number; ly: number;
  n: number;
  code?: string;
  ink: string;
  paper: string;
};
function Callout({ x, y, lx, ly, n, code, ink, paper }: CalloutProps) {
  return (
    <g>
      <line x1={x} y1={y} x2={lx} y2={ly} stroke={ink} strokeWidth="0.45" />
      <circle cx={x} cy={y} r="1.4" fill={ink} />
      <circle cx={lx} cy={ly} r="6.5" fill={paper} stroke={ink} strokeWidth="1" />
      <text x={lx} y={ly + 3.2} textAnchor="middle" fontSize="8.5" fontWeight="800" fill={ink} fontFamily={FONT_MONO}>{n}</text>
      {code && (
        <text x={lx + 9} y={ly + 3} fontSize="7" fontFamily={FONT_MONO} fill={ink} letterSpacing="0.3">{code}</text>
      )}
    </g>
  );
}

// =============================================================
// STAGE 1 — NAPKIN SKETCH
// =============================================================
function Stage1(_props: BlueprintProps) {
  // ステージ 1 はテーマ色を使わず、ノート裏のセピア風固定色
  const ink = '#3a2818';
  const paper = '#f3ead8';
  const navigate = useNavigate();
  const goChapter = (id: ChapterId) => navigate(`/?chapter=${id}`);
  return (
    <div style={{ background: paper, fontFamily: FONT_KLEE, color: ink, position: 'relative' }}>
      {/* coffee stain accent */}
      <div style={{
        position: 'absolute', top: 12, right: 18, width: 60, height: 60, borderRadius: '50%',
        background: 'radial-gradient(circle, #8a5a3a44, transparent 70%)', pointerEvents: 'none',
      }} />

      <div style={{ padding: '14px 16px 6px', borderBottom: `1px dashed ${ink}66`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, transform: 'rotate(-1deg)' }}>古文機構 · あらまし</div>
          <div style={{ fontSize: 10, color: '#7a5a40', marginTop: 2 }}>令和8年5月 · ノート裏</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, transform: 'rotate(2deg)', color: STAMP_RED }}>LV.01 / D</div>
      </div>

      <div style={{ position: 'relative', margin: '8px 12px', height: 410 }}>
        <svg viewBox="0 0 360 410" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <g stroke={ink} strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M148 36 Q147 35 156 35 L210 36 Q213 38 213 46 L213 92 Q212 96 200 96 L156 95 Q149 95 149 90 L148 44 Z" />
            <path d="M154 42 L207 42 M154 88 L208 88 M154 42 L154 88 M207 42 L207 88" strokeDasharray="2 2" opacity="0.55" />
            <rect x="170" y="100" width="20" height="8" />
            <line x1="180" y1="98" x2="180" y2="118" strokeDasharray="1 2" opacity="0.5" />
            <path d="M126 124 Q124 122 138 122 L222 123 Q235 125 233 138 L231 230 Q229 236 215 236 L142 234 Q126 233 128 220 L130 130 Z" />
            <path d="M130 132 Q160 170 230 232" strokeDasharray="2 3" opacity="0.5" />
            <path d="M232 132 Q200 170 130 232" strokeDasharray="2 3" opacity="0.5" />
            <path d="M126 156 Q105 156 92 160 Q86 164 90 170 L96 172 Q108 172 130 170" />
            <path d="M126 156 L126 168 Q108 170 92 168" opacity="0.5" />
            <path d="M232 156 Q254 156 268 160 Q272 165 268 170 L264 172 Q252 170 230 170" />
            <path d="M232 156 L232 168 Q252 170 268 168" opacity="0.5" />
            <path d="M155 240 Q154 242 156 260 L160 312 Q160 318 174 318 Q176 312 174 260 L172 240" />
            <path d="M188 240 Q186 242 188 260 L192 312 Q192 318 206 318 Q208 312 206 260 L204 240" />
            <path d="M156 332 Q154 332 154 338 L188 340 Q190 332 186 332 Z" />
            <path d="M188 332 Q186 332 186 338 L220 340 Q222 332 218 332 Z" />
          </g>

          {/* exploded loose parts */}
          <g stroke={ink} strokeWidth="1.1" fill="none" strokeLinecap="round" opacity="0.85">
            <g transform="translate(312 126)">
              <circle r="14" />
              <circle r="5" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line
                  key={a}
                  x1={12 * Math.cos((a * Math.PI) / 180)}
                  y1={12 * Math.sin((a * Math.PI) / 180)}
                  x2={18 * Math.cos((a * Math.PI) / 180)}
                  y2={18 * Math.sin((a * Math.PI) / 180)}
                />
              ))}
            </g>
            <g transform="translate(36 100)">
              <rect x="-6" y="-3" width="12" height="6" />
              <line x1="6" y1="0" x2="22" y2="0" />
              <line x1="22" y1="-2" x2="22" y2="2" />
            </g>
            <g transform="translate(310 232)">
              <path d="M0 0 q 6 -4 12 0 q 6 4 12 0 q 6 -4 12 0" />
            </g>
          </g>

          <text x="180" y="200" textAnchor="middle" fontFamily={FONT_KLEE} fontSize="80" fontWeight="700" fill={ink} opacity="0.13" transform="rotate(-3 180 200)">?</text>

          <g fill={ink} fontFamily={FONT_KLEE} fontSize="11">
            <text x="240" y="44">FRAME-A1?</text>
            <line x1="238" y1="42" x2="214" y2="50" stroke={ink} strokeWidth="0.8" strokeDasharray="1 2" />
            <text x="68" y="148">SERV-01?</text>
            <line x1="92" y1="150" x2="100" y2="158" stroke={ink} strokeWidth="0.8" strokeDasharray="1 2" />
            <text x="282" y="186">うで</text>
            <text x="180" y="196" textAnchor="middle" fontSize="13" fontWeight="700">どう (用?)</text>
            <text x="248" y="276">FRAME-B?</text>
            <line x1="246" y1="274" x2="208" y2="286" stroke={ink} strokeWidth="0.8" strokeDasharray="1 2" />
            <text x="60" y="290">あし (敬?)</text>
            <line x1="84" y1="292" x2="158" y2="296" stroke={ink} strokeWidth="0.8" strokeDasharray="1 2" />
            <text x="172" y="32" textAnchor="middle">あたま (助?)</text>
            <text x="320" y="118" fontSize="9">GEAR?</text>
            <text x="320" y="248" fontSize="9">SPRING?</text>
          </g>

          <g stroke={ink} strokeWidth="1" fill="none" opacity="0.8">
            <path d="M100 158 L96 154 M100 158 L96 162" />
            <path d="M214 50 L210 47 M214 50 L210 54" />
          </g>

          <g fontFamily={FONT_KLEE} fontSize="11" fill={ink}>
            <text x="14" y="362">□ FRAME型番きめる</text>
            <text x="14" y="378">□ サーボ何個いる？</text>
            <text x="14" y="394">□ 助詞の関節は…</text>
          </g>

          <circle cx="332" cy="386" r="14" fill="none" stroke="#8a5a3a55" strokeWidth="1.2" />
          <circle cx="332" cy="386" r="9" fill="none" stroke="#8a5a3a30" strokeWidth="0.8" />

          {/* ヒット判定用の透明 rect。
              fill="none" のスケッチは内部クリックを拾わないため、各部位の上に
              透明な rect を重ねて章クイズへ navigate するボタン化する。 */}
          <rect x="144" y="32" width="72" height="68" fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => goChapter('ch3')}><title>最重要敬語 (30 語) のクイズへ</title></rect>
          <rect x="120" y="120" width="120" height="118" fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => goChapter('ch1')}><title>読解必修 (50 語) のクイズへ</title></rect>
          <rect x="80" y="146" width="50" height="34" fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => goChapter('ch2')}><title>入試必修 (100 語) のクイズへ</title></rect>
          <rect x="230" y="146" width="50" height="34" fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => goChapter('ch4')}><title>入試重要 (100 語) のクイズへ</title></rect>
          <rect x="148" y="238" width="80" height="104" fill="transparent" style={{ cursor: 'pointer' }}
                onClick={() => goChapter('ch5')}><title>入試攻略 (50 語) のクイズへ</title></rect>
        </svg>
      </div>

      <div style={{ margin: '4px 14px 10px', padding: 10, border: `1.5px dashed ${ink}80`, fontSize: 12 }}>
        <div style={{ fontSize: 10, marginBottom: 6, color: '#7a5a40' }}>めも · これから決める分野</div>
        {[['用言', '?'], ['助動詞', '?'], ['助詞', '?'], ['敬語', '?']].map(([n, v]) => (
          <div key={n} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px dotted ${ink}40`, padding: '3px 0' }}>
            <span style={{ fontFamily: FONT_SERIF }}>{n}</span>
            <span style={{ color: STAMP_RED, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ margin: '0 14px 12px' }}>
        <div style={{ background: ink, color: paper, padding: '12px', textAlign: 'center', fontWeight: 700, fontSize: 13, transform: 'rotate(-0.5deg)', borderRadius: 2 }}>
          いっしょに作ろう ✎
        </div>
      </div>

      <div style={{ padding: '0 16px 16px', fontSize: 10, color: '#7a5a40', textAlign: 'right' }}>p.1 · 走り書き</div>
    </div>
  );
}

// =============================================================
// STAGE 2 — SCHEMATIC (骨組み確定)
// =============================================================
function Stage2(props: BlueprintProps) {
  const { resolved: t } = useReiwaTheme();
  const navigate = useNavigate();
  const ink = t.ink;
  const paper = t.paper;
  const grid = `repeating-linear-gradient(0deg, transparent 0 19px, ${ink}10 19px 20px), repeating-linear-gradient(90deg, transparent 0 19px, ${ink}10 19px 20px)`;
  const rev = computeRev(props.totalLearned);
  const next = nextThreshold(props.totalLearned);
  const fm = props.fieldMastery;

  return (
    <div style={{ background: paper, fontFamily: FONT_MONO, color: ink }}>
      <Header
        ink={ink}
        paper={paper}
        primary={t.primary}
        inkSoft={t.inkSoft}
        no={`KBN-247-${String(rev).padStart(3, '0')}`}
        title="FRAME · 骨組み確定"
        sub="第一期 ・ 主要部材"
        rev={`REV.${String(rev).padStart(3, '0')} · DRAFT`}
        lv={`LV.${String(rev).padStart(2, '0')}`}
        rank="RANK B+"
      />

      <div style={{ position: 'relative', margin: 12, height: 400, border: `1px solid ${ink}`, backgroundImage: grid, background: paper }}>
        <CornerTicks ink={ink} top={6} left={6} />
        <div style={{ position: 'absolute', top: 6, left: 10, fontSize: 7, fontWeight: 800, letterSpacing: 1, color: t.inkSoft }}>FRAME ASSY · 1:1</div>

        <svg viewBox="0 0 360 400" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="hatch2" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={ink} strokeWidth="0.3" />
            </pattern>
          </defs>

          <line x1="180" y1="20" x2="180" y2="380" stroke={ink} strokeWidth="0.4" strokeDasharray="4 2 1 2" />

          {/* HEAD CAGE — ch3 最重要敬語 */}
          <g {...partInteractive(fm.ch3.avgTierPct, 'ch3', navigate)}>
            {/* hit-area: 線描のみだと内部クリックが拾えないので透明 rect で覆う */}
            <rect x="148" y="34" width="64" height="62" fill="transparent" />
            <rect x="148" y="34" width="64" height="58" fill="none" stroke={ink} strokeWidth="1.4" />
            <rect x="154" y="40" width="52" height="46" fill="none" stroke={ink} strokeWidth="0.5" strokeDasharray="2 2" />
            <line x1="148" y1="34" x2="154" y2="40" stroke={ink} strokeWidth="0.5" />
            <line x1="212" y1="34" x2="206" y2="40" stroke={ink} strokeWidth="0.5" />
            <line x1="148" y1="92" x2="154" y2="86" stroke={ink} strokeWidth="0.5" />
            <line x1="212" y1="92" x2="206" y2="86" stroke={ink} strokeWidth="0.5" />
            <text x="180" y="68" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="20" fontWeight="700" fill={ink}>助</text>
            <circle cx="160" cy="98" r="2.5" fill={paper} stroke={ink} />
            <circle cx="200" cy="98" r="2.5" fill={paper} stroke={ink} />
          </g>
          <line x1="180" y1="92" x2="180" y2="116" stroke={ink} strokeWidth="0.7" strokeDasharray="2 2" />

          {/* TORSO — ch1 読解必修 */}
          <g {...partInteractive(fm.ch1.avgTierPct, 'ch1', navigate)}>
            <rect x="120" y="118" width="120" height="124" fill={`color-mix(in oklab, ${t.primary} 18%, ${paper})`} stroke={ink} strokeWidth="1.6" />
            <rect x="132" y="130" width="96" height="100" fill="none" stroke={ink} strokeWidth="0.6" />
            <line x1="132" y1="130" x2="228" y2="230" stroke={ink} strokeWidth="0.4" strokeDasharray="2 2" />
            <line x1="228" y1="130" x2="132" y2="230" stroke={ink} strokeWidth="0.4" strokeDasharray="2 2" />
            <text x="180" y="190" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="44" fontWeight="800" fill={t.primary}>用</text>
            {([[120, 118], [240, 118], [120, 242], [240, 242]] as Array<[number, number]>).map(([gx, gy], i) => (
              <path key={i} d={`M${gx} ${gy} l${i % 2 ? -12 : 12} 0 l0 ${i < 2 ? 12 : -12} z`} fill="url(#hatch2)" stroke={ink} strokeWidth="0.5" />
            ))}
            <rect x="116" y="148" width="4" height="8" fill={ink} />
            <rect x="240" y="148" width="4" height="8" fill={ink} />
            <rect x="116" y="208" width="4" height="8" fill={ink} />
            <rect x="240" y="208" width="4" height="8" fill={ink} />
          </g>

          {/* RIGHT ARM (viewer's left side) — ch2 入試必修 */}
          <g {...partInteractive(fm.ch2.avgTierPct, 'ch2', navigate)}>
            <rect x="56" y="148" width="60" height="16" fill={`color-mix(in oklab, ${t.pop} 25%, ${paper})`} stroke={ink} strokeWidth="1.2" />
            <line x1="56" y1="156" x2="116" y2="156" stroke={ink} strokeWidth="0.4" strokeDasharray="1 2" />
            <text x="86" y="176" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="11" fontWeight="700" fill={ink}>助詞 L</text>
            <circle cx="60" cy="156" r="4" fill="none" stroke={ink} strokeWidth="0.8" />
          </g>

          {/* LEFT ARM (viewer's right side) — ch4 入試重要 */}
          <g {...partInteractive(fm.ch4.avgTierPct, 'ch4', navigate)}>
            <rect x="244" y="148" width="60" height="16" fill={`color-mix(in oklab, ${t.pop} 25%, ${paper})`} stroke={ink} strokeWidth="1.2" />
            <line x1="244" y1="156" x2="304" y2="156" stroke={ink} strokeWidth="0.4" strokeDasharray="1 2" />
            <text x="274" y="176" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="11" fontWeight="700" fill={ink}>助詞 R</text>
            <circle cx="300" cy="156" r="4" fill="none" stroke={ink} strokeWidth="0.8" />
          </g>

          {/* LEGS (両足) — ch5 入試攻略 */}
          <g {...partInteractive(fm.ch5.avgTierPct, 'ch5', navigate)}>
            <rect x="138" y="246" width="36" height="92" fill={`color-mix(in oklab, ${t.tertiary} 18%, ${paper})`} stroke={ink} strokeWidth="1.4" />
            <rect x="186" y="246" width="36" height="92" fill={`color-mix(in oklab, ${t.tertiary} 18%, ${paper})`} stroke={ink} strokeWidth="1.4" />
            <line x1="138" y1="290" x2="174" y2="290" stroke={ink} strokeWidth="0.4" strokeDasharray="1 2" />
            <line x1="186" y1="290" x2="222" y2="290" stroke={ink} strokeWidth="0.4" strokeDasharray="1 2" />
            <circle cx="156" cy="290" r="3" fill={paper} stroke={ink} strokeWidth="0.7" />
            <circle cx="204" cy="290" r="3" fill={paper} stroke={ink} strokeWidth="0.7" />
            <text x="156" y="320" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="14" fontWeight="700" fill={ink}>敬</text>
            <text x="204" y="320" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="14" fontWeight="700" fill={ink}>語</text>
            <rect x="132" y="338" width="48" height="6" fill={ink} />
            <rect x="180" y="338" width="48" height="6" fill={ink} />
          </g>

          {[
            { x: 212, y: 38, lx: 332, ly: 30, n: 1, code: 'FRAME-A1' },
            { x: 240, y: 130, lx: 332, ly: 130, n: 2, code: 'FRAME-A2' },
            { x: 110, y: 156, lx: 28, ly: 130, n: 3, code: 'SERV-01' },
            { x: 174, y: 246, lx: 332, ly: 248, n: 4, code: 'FRAME-B1' },
            { x: 156, y: 338, lx: 28, ly: 332, n: 5, code: 'BASE-01' },
          ].map((c) => <Callout key={c.n} {...c} ink={ink} paper={paper} />)}

          <g stroke={ink} strokeWidth="0.4" fill="none">
            <line x1="20" y1="118" x2="20" y2="242" />
            <line x1="16" y1="118" x2="24" y2="118" />
            <line x1="16" y1="242" x2="24" y2="242" />
          </g>
          <text x="14" y="184" fontSize="8" fill={t.inkSoft} textAnchor="end">L14</text>
          <g stroke={ink} strokeWidth="0.4" fill="none">
            <line x1="120" y1="358" x2="240" y2="358" />
            <line x1="120" y1="354" x2="120" y2="362" />
            <line x1="240" y1="354" x2="240" y2="362" />
          </g>
          <text x="180" y="356" textAnchor="middle" fontSize="8" fill={t.inkSoft}>120</text>
        </svg>
      </div>

      <Bom palette={t} fm={fm} />

      <Metrics palette={t} fm={fm} next={`+${next}`} parts={`${partsCompleted(2)}`} />

      <AssembleBar ink={ink} paper={paper} inkSoft={t.inkSoft} />

      <Footer inkSoft={t.inkSoft} note="主要4部材確定" sheet="2/4" />
    </div>
  );
}

// =============================================================
// STAGE 3 — EXPLODED VIEW (分解詳細)
// =============================================================
function Stage3(props: BlueprintProps) {
  const { resolved: t } = useReiwaTheme();
  const navigate = useNavigate();
  const ink = t.ink;
  const paper = t.paper;
  const grid = `repeating-linear-gradient(0deg, transparent 0 19px, ${ink}10 19px 20px), repeating-linear-gradient(90deg, transparent 0 19px, ${ink}10 19px 20px)`;
  const rev = computeRev(props.totalLearned);
  const next = nextThreshold(props.totalLearned);
  const fm = props.fieldMastery;

  const subs = {
    yougen: ['動詞', '形容詞', '形容動詞'],
    jodo: ['打消', '完了', '推量', '過去'],
    joshi: ['格助詞', '係助詞', '接続助詞'],
    keigo: ['尊敬'],
  };

  return (
    <div style={{ background: paper, fontFamily: FONT_MONO, color: ink }}>
      <Header
        ink={ink}
        paper={paper}
        primary={t.primary}
        inkSoft={t.inkSoft}
        no={`KBN-247-${String(rev).padStart(3, '0')}`}
        title="EXPLODED · 分解詳細"
        sub="第二期 ・ サーボ展開"
        rev={`REV.${String(rev).padStart(3, '0')} · CHECKED`}
        lv={`LV.${String(rev).padStart(2, '0')}`}
        rank="RANK A"
      />

      <div style={{ position: 'relative', margin: 12, height: 440, border: `1px solid ${ink}`, backgroundImage: grid, background: paper }}>
        <CornerTicks ink={ink} top={6} left={6} />
        <div style={{ position: 'absolute', top: 6, left: 10, fontSize: 7, fontWeight: 800, letterSpacing: 1, color: t.inkSoft }}>EXPLODED · SEC A-A</div>

        <svg viewBox="0 0 360 440" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="hatch3" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke={ink} strokeWidth="0.4" />
            </pattern>
            <pattern id="hatch3b" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke={ink} strokeWidth="0.25" />
            </pattern>
          </defs>

          <line x1="180" y1="14" x2="180" y2="430" stroke={ink} strokeWidth="0.4" strokeDasharray="4 2 1 2" />

          {/* HEAD MODULE — ch3 最重要敬語 */}
          <g {...partInteractive(fm.ch3.avgTierPct, 'ch3', navigate)}>
            <rect x="148" y="38" width="64" height="14" fill="url(#hatch3)" stroke={ink} strokeWidth="0.9" />
            <line x1="180" y1="52" x2="180" y2="58" stroke={ink} strokeWidth="0.4" strokeDasharray="1 1" />
            <rect x="148" y="60" width="64" height="44" fill={`color-mix(in oklab, ${t.accent} 50%, ${paper})`} stroke={ink} strokeWidth="1.3" />
            <text x="180" y="90" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="20" fontWeight="700" fill={ink}>助</text>
            <circle cx="180" cy="74" r="3" fill={paper} stroke={ink} strokeWidth="0.7" />
            <circle cx="180" cy="74" r="1.2" fill={ink} />
          </g>
          <line x1="180" y1="104" x2="180" y2="124" stroke={ink} strokeWidth="0.6" strokeDasharray="2 2" />

          {/* NECK MOTOR */}
          <g transform="translate(60 116)">
            <rect x="0" y="0" width="22" height="14" fill={paper} stroke={ink} strokeWidth="1" />
            <rect x="22" y="3" width="6" height="8" fill={ink} />
            <line x1="11" y1="0" x2="11" y2="14" stroke={ink} strokeWidth="0.3" strokeDasharray="1 1" />
            <path d="M0 7 q -16 -2 -22 8" stroke={ink} strokeWidth="0.7" fill="none" />
          </g>

          {/* TORSO — ch1 読解必修 */}
          <g {...partInteractive(fm.ch1.avgTierPct, 'ch1', navigate)}>
            <rect x="124" y="124" width="112" height="120" fill={`color-mix(in oklab, ${t.primary} 30%, ${paper})`} stroke={ink} strokeWidth="1.6" />
            <rect x="138" y="138" width="84" height="68" fill="none" stroke={ink} strokeWidth="0.6" />
            <text x="180" y="188" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="40" fontWeight="700" fill={t.primary}>用</text>
            <circle cx="180" cy="222" r="7" fill="none" stroke={ink} strokeWidth="1" />
            <circle cx="180" cy="222" r="2.5" fill={ink} />
            <path d="M124 124 L114 134 L114 154 L124 154 Z" fill="url(#hatch3b)" stroke={ink} strokeWidth="0.7" />
            <path d="M236 124 L246 134 L246 154 L236 154 Z" fill="url(#hatch3b)" stroke={ink} strokeWidth="0.7" />
            {[130, 144, 158, 172, 186, 200, 214, 228].map((x) => <circle key={x} cx={x} cy="130" r="1.1" fill={ink} />)}
            <g stroke={STAMP_RED} strokeWidth="0.7">
              <line x1="118" y1="184" x2="242" y2="184" strokeDasharray="6 2 1 2" />
              <text x="116" y="188" textAnchor="end" fontSize="9" fontWeight="700" fill={STAMP_RED}>A</text>
              <text x="246" y="188" fontSize="9" fontWeight="700" fill={STAMP_RED}>A</text>
            </g>
          </g>

          {/* RIGHT ARM (viewer's left side) — ch2 入試必修 */}
          <g {...partInteractive(fm.ch2.avgTierPct, 'ch2', navigate)}>
            <g transform="translate(40 156)">
              <circle cx="14" cy="14" r="13" fill={paper} stroke={ink} strokeWidth="1.1" />
              <circle cx="14" cy="14" r="6" fill={`color-mix(in oklab, ${t.pop} 40%, ${paper})`} stroke={ink} strokeWidth="0.7" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line
                  key={a}
                  x1={14 + 10 * Math.cos((a * Math.PI) / 180)}
                  y1={14 + 10 * Math.sin((a * Math.PI) / 180)}
                  x2={14 + 13 * Math.cos((a * Math.PI) / 180)}
                  y2={14 + 13 * Math.sin((a * Math.PI) / 180)}
                  stroke={ink}
                  strokeWidth="0.4"
                />
              ))}
              <rect x="-12" y="11" width="12" height="6" fill={paper} stroke={ink} strokeWidth="0.7" />
              <line x1="27" y1="14" x2="44" y2="14" stroke={ink} strokeWidth="0.5" strokeDasharray="1 1.5" />
            </g>
            <rect x="86" y="160" width="40" height="40" fill={`color-mix(in oklab, ${t.pop} 50%, ${paper})`} stroke={ink} strokeWidth="1.3" />
            <text x="106" y="184" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="13" fontWeight="700" fill={ink}>助詞</text>
            <line x1="86" y1="180" x2="126" y2="180" stroke={ink} strokeWidth="0.4" strokeDasharray="1 2" />
          </g>

          {/* LEFT ARM (viewer's right side) — ch4 入試重要 */}
          <g {...partInteractive(fm.ch4.avgTierPct, 'ch4', navigate)}>
            <g transform="translate(294 156)">
              <circle cx="12" cy="14" r="13" fill={paper} stroke={ink} strokeWidth="1.1" />
              <circle cx="12" cy="14" r="6" fill={`color-mix(in oklab, ${t.pop} 40%, ${paper})`} stroke={ink} strokeWidth="0.7" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
                <line
                  key={a}
                  x1={12 + 10 * Math.cos((a * Math.PI) / 180)}
                  y1={14 + 10 * Math.sin((a * Math.PI) / 180)}
                  x2={12 + 13 * Math.cos((a * Math.PI) / 180)}
                  y2={14 + 13 * Math.sin((a * Math.PI) / 180)}
                  stroke={ink}
                  strokeWidth="0.4"
                />
              ))}
              <rect x="24" y="11" width="12" height="6" fill={paper} stroke={ink} strokeWidth="0.7" />
              <line x1="-2" y1="14" x2="-16" y2="14" stroke={ink} strokeWidth="0.5" strokeDasharray="1 1.5" />
            </g>
            <rect x="234" y="160" width="40" height="40" fill={`color-mix(in oklab, ${t.pop} 50%, ${paper})`} stroke={ink} strokeWidth="1.3" />
            <text x="254" y="184" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="13" fontWeight="700" fill={ink}>助詞</text>
            <line x1="234" y1="180" x2="274" y2="180" stroke={ink} strokeWidth="0.4" strokeDasharray="1 2" />
          </g>

          {/* HIP + LEGS (両足) — ch5 入試攻略 */}
          <line x1="180" y1="244" x2="180" y2="262" stroke={ink} strokeWidth="0.6" strokeDasharray="2 2" />
          <g {...partInteractive(fm.ch5.avgTierPct, 'ch5', navigate)}>
            <rect x="156" y="262" width="48" height="14" fill="url(#hatch3)" stroke={ink} strokeWidth="1" />
            <circle cx="166" cy="269" r="2" fill={paper} stroke={ink} strokeWidth="0.5" />
            <circle cx="194" cy="269" r="2" fill={paper} stroke={ink} strokeWidth="0.5" />
            <line x1="156" y1="269" x2="138" y2="290" stroke={ink} strokeWidth="0.5" />
            <line x1="204" y1="269" x2="222" y2="290" stroke={ink} strokeWidth="0.5" />
            <rect x="134" y="290" width="40" height="68" fill={`color-mix(in oklab, ${t.tertiary} 28%, ${paper})`} stroke={ink} strokeWidth="1.3" />
            <rect x="186" y="290" width="40" height="68" fill={`color-mix(in oklab, ${t.tertiary} 28%, ${paper})`} stroke={ink} strokeWidth="1.3" />
            <circle cx="154" cy="324" r="4" fill={paper} stroke={ink} strokeWidth="0.7" />
            <circle cx="206" cy="324" r="4" fill={paper} stroke={ink} strokeWidth="0.7" />
            <text x="154" y="350" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="15" fontWeight="700" fill={ink}>敬</text>
            <text x="206" y="350" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="15" fontWeight="700" fill={ink}>語</text>
            <rect x="128" y="358" width="52" height="6" fill={ink} />
            <rect x="180" y="358" width="52" height="6" fill={ink} />
          </g>

          {/* sub-module callouts */}
          {subs.yougen.map((s, i) => (
            <g key={'yo' + i}>
              <rect x="288" y={284 + i * 18} width="64" height="14" fill={paper} stroke={ink} strokeWidth="0.6" />
              <text x="320" y={295 + i * 18} textAnchor="middle" fontFamily={FONT_SERIF} fontSize="9" fontWeight="700" fill={ink}>{s}</text>
              <line x1="288" y1={291 + i * 18} x2="236" y2="184" stroke={ink} strokeWidth="0.3" strokeDasharray="1 2" />
            </g>
          ))}
          {subs.jodo.map((s, i) => (
            <g key={'jo' + i}>
              <rect x={20 + i * 56} y="22" width="50" height="14" fill={paper} stroke={ink} strokeWidth="0.6" />
              <text x={45 + i * 56} y="33" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="9" fontWeight="700" fill={ink}>{s}</text>
              <line x1={45 + i * 56} y1="36" x2={170 - i * 6} y2="60" stroke={ink} strokeWidth="0.3" strokeDasharray="1 2" />
            </g>
          ))}
          {subs.joshi.map((s, i) => (
            <g key={'js' + i}>
              <rect x="6" y={224 + i * 20} width="56" height="14" fill={paper} stroke={ink} strokeWidth="0.6" />
              <text x="34" y={235 + i * 20} textAnchor="middle" fontFamily={FONT_SERIF} fontSize="9" fontWeight="700" fill={ink}>{s}</text>
              <line x1="62" y1={231 + i * 20} x2="86" y2="180" stroke={ink} strokeWidth="0.3" strokeDasharray="1 2" />
            </g>
          ))}
          {subs.keigo.map((s, i) => (
            <g key={'kg' + i}>
              <rect x="6" y={386 + i * 18} width="64" height="14" fill={paper} stroke={ink} strokeWidth="0.6" />
              <text x="38" y={397 + i * 18} textAnchor="middle" fontFamily={FONT_SERIF} fontSize="9" fontWeight="700" fill={ink}>{s}</text>
              <line x1="70" y1={393 + i * 18} x2="134" y2="350" stroke={ink} strokeWidth="0.3" strokeDasharray="1 2" />
            </g>
          ))}

          {[
            { x: 82, y: 170, lx: 18, ly: 154, n: 1, code: 'SED40-01' },
            { x: 306, y: 170, lx: 344, ly: 154, n: 2, code: 'SED40-02' },
            { x: 180, y: 268, lx: 344, ly: 264, n: 3, code: 'HIPM-01' },
            { x: 180, y: 222, lx: 18, ly: 222, n: 4, code: 'CORE-01' },
          ].map((c) => <Callout key={c.n} {...c} ink={ink} paper={paper} />)}

          <g stroke={ink} strokeWidth="0.4" fill="none">
            <line x1="116" y1="124" x2="116" y2="244" />
            <line x1="112" y1="124" x2="120" y2="124" />
            <line x1="112" y1="244" x2="120" y2="244" />
          </g>
          <text x="110" y="188" fontSize="8" fill={t.inkSoft} textAnchor="end">120</text>
        </svg>
      </div>

      {/* mini section A-A */}
      <div style={{ margin: '0 12px 10px', border: `1px solid ${ink}`, padding: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg viewBox="0 0 80 50" style={{ width: 80, height: 50, flexShrink: 0 }}>
          <defs>
            <pattern id="hatch3sec" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke={ink} strokeWidth="0.3" />
            </pattern>
          </defs>
          <rect x="6" y="10" width="68" height="30" fill="url(#hatch3sec)" stroke={ink} strokeWidth="1" />
          <rect x="20" y="18" width="40" height="14" fill={paper} stroke={ink} strokeWidth="0.6" />
          <text x="40" y="29" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="10" fontWeight="700" fill={ink}>用</text>
          <text x="40" y="48" textAnchor="middle" fontSize="6" fill={t.inkSoft}>SEC A-A</text>
        </svg>
        <div style={{ fontSize: 9, color: t.inkSoft, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 800, color: ink, marginBottom: 2 }}>断面 A-A</div>
          胴体内部に「動詞・形容詞・形容動詞」の3層を確認。<br />
          助詞接合部の応力解析を要する。
        </div>
      </div>

      <Bom palette={t} fm={fm} />

      <Metrics palette={t} fm={fm} next={`+${next}`} parts={`${partsCompleted(3)}`} />

      <AssembleBar ink={ink} paper={paper} inkSoft={t.inkSoft} />

      <Footer inkSoft={t.inkSoft} note="SED40系サーボ確定" sheet="3/4" />
    </div>
  );
}

// =============================================================
// STAGE 4 — FINAL ENGINEERING PRINT
// =============================================================
function Stage4(props: BlueprintProps) {
  const { resolved: t } = useReiwaTheme();
  const navigate = useNavigate();
  const ink = t.ink;
  const paper = t.paper;
  const fineGrid = `repeating-linear-gradient(0deg, transparent 0 9px, ${ink}08 9px 10px), repeating-linear-gradient(90deg, transparent 0 9px, ${ink}08 9px 10px), repeating-linear-gradient(0deg, transparent 0 49px, ${ink}18 49px 50px), repeating-linear-gradient(90deg, transparent 0 49px, ${ink}18 49px 50px)`;
  const rev = computeRev(props.totalLearned);
  const fm = props.fieldMastery;

  return (
    <div style={{ background: paper, fontFamily: FONT_MONO, color: ink }}>
      {/* heavy 3-column header */}
      <div style={{ borderBottom: `2px solid ${ink}`, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
        <div>
          <div style={{ fontSize: 8, color: t.inkSoft, letterSpacing: 1 }}>DRAWING NO.</div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>KBN-247-{String(rev).padStart(3, '0')}</div>
          <div style={{ fontSize: 8, color: t.inkSoft, letterSpacing: 1, marginTop: 2 }}>古文機構 / MK.III</div>
        </div>
        <div style={{ textAlign: 'center', borderLeft: `1px solid ${ink}`, borderRight: `1px solid ${ink}`, padding: '0 8px' }}>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 3 }}>FINAL · 完成形</div>
          <div style={{ fontSize: 8, color: t.inkSoft, letterSpacing: 2, marginTop: 2 }}>装甲 + 配線 + 基板</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 8, color: t.inkSoft, letterSpacing: 1 }}>REV.{String(rev).padStart(3, '0')} · APPROVED</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.primary, letterSpacing: 2 }}>LV.{String(rev).padStart(2, '0')}</div>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: STAMP_RED }}>RANK S</div>
        </div>
      </div>

      <div style={{ position: 'relative', margin: 12, height: 320, border: `1.5px solid ${ink}`, backgroundImage: fineGrid, background: paper }}>
        <CornerTicks ink={ink} top={4} left={4} />
        <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 8, fontWeight: 800, letterSpacing: 1 }}>FRONT VIEW · 装甲完成</div>
        <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 8, fontWeight: 800, letterSpacing: 1, color: t.inkSoft }}>SCALE 1:1</div>

        <div style={{ position: 'absolute', bottom: 8, right: 12, transform: 'rotate(-8deg)', border: `2.5px solid ${STAMP_RED}`, color: STAMP_RED, padding: '4px 10px', fontSize: 11, fontWeight: 900, letterSpacing: 3, opacity: 0.92, background: paper + 'd0' }}>
          検 APPROVED 印
          <div style={{ fontSize: 7, letterSpacing: 1, marginTop: 1, color: STAMP_RED }}>2026.05.09</div>
        </div>

        <svg viewBox="0 0 360 320" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <pattern id="hatch4" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke={ink} strokeWidth="0.3" />
            </pattern>
            <pattern id="hatch4b" patternUnits="userSpaceOnUse" width="3" height="3" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="3" stroke={ink} strokeWidth="0.25" />
            </pattern>
            <pattern id="hex4" patternUnits="userSpaceOnUse" width="10" height="9" patternTransform="rotate(0)">
              <polygon points="5,0.5 9.5,3 9.5,7 5,9 0.5,7 0.5,3" fill="none" stroke={ink} strokeWidth="0.3" />
            </pattern>
          </defs>

          <line x1="180" y1="10" x2="180" y2="310" stroke={ink} strokeWidth="0.4" strokeDasharray="6 2 1 2" />

          {/* HEAD — ch3 最重要敬語 */}
          <g {...partInteractive(fm.ch3.avgTierPct, 'ch3', navigate)}>
            <path d="M156 22 L204 22 L210 34 L210 64 L204 70 L156 70 L150 64 L150 34 Z" fill={`color-mix(in oklab, ${t.accent} 75%, ${paper})`} stroke={ink} strokeWidth="1.5" />
            <rect x="160" y="32" width="40" height="8" fill="url(#hatch4)" stroke={ink} strokeWidth="0.4" />
            <rect x="158" y="44" width="44" height="3" fill={ink} />
            <text x="180" y="62" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="13" fontWeight="700" fill={ink}>助動詞</text>
            <circle cx="156" cy="68" r="1.4" fill={ink} />
            <circle cx="204" cy="68" r="1.4" fill={ink} />
          </g>

          {/* TORSO ARMOR — ch1 読解必修 */}
          <g {...partInteractive(fm.ch1.avgTierPct, 'ch1', navigate)}>
            <rect x="124" y="78" width="112" height="124" fill={`color-mix(in oklab, ${t.primary} 70%, ${paper})`} stroke={ink} strokeWidth="1.6" />
            <path d="M126 80 L172 80 L172 134 L130 144 L126 138 Z" fill="url(#hex4)" stroke={ink} strokeWidth="0.7" />
            <path d="M188 80 L234 80 L234 138 L230 144 L188 134 Z" fill="url(#hex4)" stroke={ink} strokeWidth="0.7" />
            <line x1="180" y1="80" x2="180" y2="200" stroke={ink} strokeWidth="0.6" />
            <path d="M124 78 L114 88 L114 116 L124 116 Z" fill="url(#hatch4)" stroke={ink} strokeWidth="1" />
            <path d="M236 78 L246 88 L246 116 L236 116 Z" fill="url(#hatch4)" stroke={ink} strokeWidth="1" />
            <text x="180" y="156" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="56" fontWeight="800" fill={t.primary}>用</text>
            {[148, 156, 164, 172, 180].map((y) => <line key={y} x1="194" y1={y} x2="220" y2={y} stroke={ink} strokeWidth="0.6" />)}
            <circle cx="180" cy="186" r="8" fill="none" stroke={ink} strokeWidth="1.2" />
            <circle cx="180" cy="186" r="3" fill={ink} />
            <circle cx="180" cy="186" r="5.5" fill="none" stroke={ink} strokeWidth="0.4" strokeDasharray="1 1" />
            {[130, 142, 154, 168, 192, 206, 218, 230].map((x) => <circle key={'a' + x} cx={x} cy="84" r="1.1" fill={ink} />)}
            {[130, 142, 154, 168, 192, 206, 218, 230].map((x) => <circle key={'b' + x} cx={x} cy="196" r="1.1" fill={ink} />)}
          </g>

          {/* RIGHT ARM (viewer's left side) — ch2 入試必修 */}
          <g {...partInteractive(fm.ch2.avgTierPct, 'ch2', navigate)}>
            <rect x="86" y="106" width="40" height="60" fill={`color-mix(in oklab, ${t.pop} 70%, ${paper})`} stroke={ink} strokeWidth="1.4" />
            <line x1="86" y1="124" x2="126" y2="124" stroke={ink} strokeWidth="0.4" />
            <text x="106" y="142" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="12" fontWeight="700" fill={ink}>助詞</text>
            <rect x="86" y="166" width="40" height="22" fill={`color-mix(in oklab, ${t.pop} 90%, ${paper})`} stroke={ink} strokeWidth="1.2" />
            <rect x="92" y="190" width="28" height="14" fill="url(#hatch4b)" stroke={ink} strokeWidth="1" />
          </g>

          {/* LEFT ARM (viewer's right side) — ch4 入試重要 */}
          <g {...partInteractive(fm.ch4.avgTierPct, 'ch4', navigate)}>
            <rect x="234" y="106" width="40" height="60" fill={`color-mix(in oklab, ${t.pop} 70%, ${paper})`} stroke={ink} strokeWidth="1.4" />
            <line x1="234" y1="124" x2="274" y2="124" stroke={ink} strokeWidth="0.4" />
            <text x="254" y="142" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="12" fontWeight="700" fill={ink}>助詞</text>
            <rect x="234" y="166" width="40" height="22" fill={`color-mix(in oklab, ${t.pop} 90%, ${paper})`} stroke={ink} strokeWidth="1.2" />
            <rect x="240" y="190" width="28" height="14" fill="url(#hatch4b)" stroke={ink} strokeWidth="1" />
          </g>

          {/* LEGS (両足) — ch5 入試攻略 */}
          <g {...partInteractive(fm.ch5.avgTierPct, 'ch5', navigate)}>
            <rect x="134" y="208" width="40" height="74" fill={`color-mix(in oklab, ${t.tertiary} 65%, ${paper})`} stroke={ink} strokeWidth="1.4" />
            <rect x="186" y="208" width="40" height="74" fill={`color-mix(in oklab, ${t.tertiary} 65%, ${paper})`} stroke={ink} strokeWidth="1.4" />
            <rect x="134" y="240" width="40" height="10" fill="url(#hatch4)" stroke={ink} strokeWidth="0.6" />
            <rect x="186" y="240" width="40" height="10" fill="url(#hatch4)" stroke={ink} strokeWidth="0.6" />
            <text x="154" y="232" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="13" fontWeight="700" fill={ink}>敬</text>
            <text x="206" y="232" textAnchor="middle" fontFamily={FONT_SERIF} fontSize="13" fontWeight="700" fill={ink}>語</text>
            <rect x="128" y="282" width="52" height="8" fill={ink} />
            <rect x="180" y="282" width="52" height="8" fill={ink} />
          </g>

          {/* cable runs */}
          <g stroke={ink} strokeWidth="0.7" fill="none" opacity="0.7">
            <path d="M180 70 q -10 6 -2 12" />
            <path d="M126 124 q -10 4 -10 30" />
            <path d="M234 124 q 10 4 10 30" />
          </g>

          {/* dimensions */}
          <g stroke={ink} strokeWidth="0.5" fill="none">
            <line x1="20" y1="22" x2="20" y2="290" />
            <line x1="16" y1="22" x2="24" y2="22" />
            <line x1="16" y1="290" x2="24" y2="290" />
            <line x1="86" y1="304" x2="274" y2="304" />
            <line x1="86" y1="300" x2="86" y2="308" />
            <line x1="274" y1="300" x2="274" y2="308" />
          </g>
          <text x="14" y="160" fontSize="9" fill={ink} textAnchor="end" transform="rotate(-90 14 160)">268</text>
          <text x="180" y="302" fontSize="9" fill={ink} textAnchor="middle">188</text>

          {[
            { x: 200, y: 36, lx: 320, ly: 28, n: 1, code: 'PLT-A1' },
            { x: 220, y: 110, lx: 320, ly: 110, n: 2, code: 'PLT-B2' },
            { x: 110, y: 136, lx: 30, ly: 136, n: 3, code: 'SHLD-01' },
            { x: 180, y: 186, lx: 30, ly: 220, n: 4, code: 'CORE-K3' },
            { x: 210, y: 246, lx: 320, ly: 246, n: 5, code: 'KNEE-A' },
          ].map((c) => <Callout key={c.n} {...c} ink={ink} paper={paper} />)}
        </svg>
      </div>

      {/* mini 3-view + control PCB */}
      <div style={{ margin: '0 12px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr', gap: 6 }}>
        {/* SIDE */}
        <div style={{ border: `1px solid ${ink}`, position: 'relative', height: 110 }}>
          <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 7, fontWeight: 800, letterSpacing: 1 }}>SIDE</div>
          <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: '14px 4px 4px' }}>
            <line x1="50" y1="4" x2="50" y2="96" stroke={ink} strokeWidth="0.3" strokeDasharray="3 1 1 1" />
            <rect x="40" y="10" width="20" height="16" fill={`color-mix(in oklab, ${t.accent} 60%, ${paper})`} stroke={ink} strokeWidth="0.8" />
            <rect x="34" y="28" width="32" height="40" fill={`color-mix(in oklab, ${t.primary} 70%, ${paper})`} stroke={ink} strokeWidth="0.9" />
            <rect x="38" y="68" width="10" height="22" fill={`color-mix(in oklab, ${t.tertiary} 60%, ${paper})`} stroke={ink} strokeWidth="0.7" />
            <rect x="52" y="68" width="10" height="22" fill={`color-mix(in oklab, ${t.tertiary} 60%, ${paper})`} stroke={ink} strokeWidth="0.7" />
          </svg>
        </div>
        {/* TOP */}
        <div style={{ border: `1px solid ${ink}`, position: 'relative', height: 110 }}>
          <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 7, fontWeight: 800, letterSpacing: 1 }}>TOP</div>
          <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: '14px 4px 4px' }}>
            <circle cx="50" cy="50" r="32" fill="none" stroke={ink} strokeWidth="0.4" strokeDasharray="2 2" />
            <rect x="34" y="34" width="32" height="32" fill={`color-mix(in oklab, ${t.primary} 60%, ${paper})`} stroke={ink} strokeWidth="0.9" />
            <rect x="40" y="40" width="20" height="20" fill={`color-mix(in oklab, ${t.accent} 70%, ${paper})`} stroke={ink} strokeWidth="0.7" />
            <rect x="22" y="44" width="12" height="12" fill={`color-mix(in oklab, ${t.pop} 60%, ${paper})`} stroke={ink} strokeWidth="0.7" />
            <rect x="66" y="44" width="12" height="12" fill={`color-mix(in oklab, ${t.pop} 60%, ${paper})`} stroke={ink} strokeWidth="0.7" />
          </svg>
        </div>
        {/* CONTROL PCB */}
        <div style={{ border: `1px solid ${ink}`, position: 'relative', height: 110 }}>
          <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 7, fontWeight: 800, letterSpacing: 1 }}>CONTROL · 制御基板</div>
          <svg viewBox="0 0 140 100" style={{ position: 'absolute', inset: '14px 4px 4px' }}>
            <rect x="4" y="4" width="132" height="92" fill={`color-mix(in oklab, ${t.tertiary} 25%, ${paper})`} stroke={ink} strokeWidth="0.8" />
            <rect x="50" y="32" width="40" height="34" fill={ink} stroke={ink} strokeWidth="0.6" />
            <text x="70" y="52" textAnchor="middle" fontSize="6" fontWeight="800" fill={paper} fontFamily={FONT_MONO}>K-MCU</text>
            <text x="70" y="60" textAnchor="middle" fontSize="5" fill={paper} fontFamily={FONT_MONO}>247X</text>
            {[36, 42, 48, 54, 60].map((y) => <rect key={'l' + y} x="46" y={y - 1} width="4" height="2" fill={ink} />)}
            {[36, 42, 48, 54, 60].map((y) => <rect key={'r' + y} x="90" y={y - 1} width="4" height="2" fill={ink} />)}
            <rect x="14" y="14" width="20" height="14" fill={`color-mix(in oklab, ${t.primary} 70%, ${paper})`} stroke={ink} strokeWidth="0.5" />
            <rect x="106" y="14" width="20" height="14" fill={`color-mix(in oklab, ${t.accent} 70%, ${paper})`} stroke={ink} strokeWidth="0.5" />
            <rect x="14" y="74" width="20" height="14" fill={`color-mix(in oklab, ${t.pop} 70%, ${paper})`} stroke={ink} strokeWidth="0.5" />
            <rect x="106" y="74" width="20" height="14" fill={`color-mix(in oklab, ${t.tertiary} 70%, ${paper})`} stroke={ink} strokeWidth="0.5" />
            <g stroke={ink} strokeWidth="0.4" fill="none">
              <path d="M34 21 L46 21 L46 36" />
              <path d="M106 21 L94 21 L94 36" />
              <path d="M34 81 L50 81 L50 66" />
              <path d="M106 81 L90 81 L90 66" />
              <path d="M50 36 L40 36 L40 50 L8 50" />
              <path d="M90 50 L132 50" />
            </g>
            <circle cx="8" cy="50" r="1.2" fill={ink} />
            <circle cx="132" cy="50" r="1.2" fill={ink} />
            <text x="14" y="100" fontSize="5" fontFamily={FONT_MONO} fill={t.inkSoft}>K-MCU 247X · 4-DOF</text>
          </svg>
        </div>
      </div>

      {/* full BOM with subs */}
      <BomFull palette={t} fm={fm} />

      {(() => {
        const { jige, tenjou, kugyou } = aggregateTiers(fm);
        return (
          <div style={{ margin: '0 12px 10px', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 6, fontSize: 9 }}>
            <div style={{ border: `1px dotted ${t.rule}`, padding: '4px 6px' }}>
              <div style={{ fontSize: 7, color: t.inkSoft }}>地下 / 殿上 / 公卿</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                {jige}
                <span style={{ fontSize: 10, color: t.inkSoft, fontWeight: 700, margin: '0 2px' }}>/</span>
                <span style={{ color: t.accent }}>{tenjou}</span>
                <span style={{ fontSize: 10, color: t.inkSoft, fontWeight: 700, margin: '0 2px' }}>/</span>
                <span style={{ color: t.primary }}>{kugyou}</span>
              </div>
            </div>
            <div style={{ border: `1px dotted ${t.rule}`, padding: '4px 6px' }}>
              <div style={{ fontSize: 7, color: t.inkSoft }}>STATUS</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: STAMP_RED }}>完成</div>
            </div>
            <div style={{ border: `1px dotted ${t.rule}`, padding: '4px 6px' }}>
              <div style={{ fontSize: 7, color: t.inkSoft }}>PARTS</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>
                32<span style={{ fontSize: 8, color: t.inkSoft, marginLeft: 2 }}>/32</span>
              </div>
            </div>
          </div>
        );
      })()}

      <AssembleBar ink={ink} paper={paper} inkSoft={t.inkSoft} />

      <Footer inkSoft={t.inkSoft} note="完全稼働 · 古文機構として認定" sheet="4/4" />
    </div>
  );
}

// =============================================================
// Shared sub-components
// =============================================================

function Header({ ink, paper, primary, inkSoft, no, title, sub, rev, lv, rank }: { ink: string; paper: string; primary: string; inkSoft: string; no: string; title: string; sub: string; rev: string; lv: string; rank: string }) {
  void paper;
  return (
    <div style={{ borderBottom: `1px solid ${ink}`, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ fontSize: 8, color: inkSoft, letterSpacing: 1 }}>DRAWING NO. {no}</div>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, marginTop: 2 }}>{title}</div>
        <div style={{ fontSize: 9, color: inkSoft, fontFamily: FONT_SERIF, marginTop: 1, letterSpacing: 2 }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 8, color: inkSoft, letterSpacing: 1 }}>{rev}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: primary, letterSpacing: 2 }}>{lv}</div>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2 }}>{rank}</div>
      </div>
    </div>
  );
}

function CornerTicks({ ink, top, left }: { ink: string; top: number; left: number }) {
  const positions: Array<['t' | 'b', 'l' | 'r']> = [['t', 'l'], ['t', 'r'], ['b', 'l'], ['b', 'r']];
  return (
    <>
      {positions.map(([y, x], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: y === 't' ? top : 'auto',
            bottom: y === 'b' ? top : 'auto',
            left: x === 'l' ? left : 'auto',
            right: x === 'r' ? left : 'auto',
            width: 6,
            height: 6,
            border: `1px solid ${ink}`,
          }}
        />
      ))}
    </>
  );
}

// 章 id → 表示色。ロボット各部位 (頭/胴/腕/脚/装甲) の塗り色と一致させる:
//   ch1 読解必修 → 胴 (primary)
//   ch2 入試必修 → 腕 (pop)
//   ch3 最重要敬語 → 頭 (accent)
//   ch4 入試重要 → 脚 (tertiary)
//   ch5 入試攻略 → 装甲・PCB・検印 (inkSoft)
function colorFor(id: ChapterId, t: ReiwaPalette): string {
  switch (id) {
    case 'ch1': return t.primary;    // 胴体
    case 'ch2': return t.pop;        // 腕
    case 'ch3': return t.accent;     // 頭
    case 'ch4': return t.tertiary;   // 脚
    case 'ch5': return t.inkSoft;    // 装甲・最終仕上げ
  }
}

// 平均段位 (%) → 部位 opacity (0% で 0.20, 100% で 1.00 に線形補間)。
// 完全に消さず幽霊状の枠線は残すことで「下書き → 完成」の成長感を出す。
function partOpacity(pct: number): number {
  return 0.20 + 0.80 * (Math.max(0, Math.min(100, pct)) / 100);
}

// 部位タップ → その章の出題範囲でクイズ開始 + 視覚 props 一式
function partInteractive(avgTierPct: number, chapterId: ChapterId, navigate: NavigateFunction) {
  return {
    opacity: partOpacity(avgTierPct),
    onClick: () => navigate(`/?chapter=${chapterId}`),
    style: { cursor: 'pointer' as const },
  };
}

function Bom({ palette: t, fm }: { palette: ReiwaPalette; fm: FieldMastery }) {
  return (
    <div style={{ margin: '0 12px 10px', border: `1px solid ${t.ink}`, fontSize: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 70px 36px', borderBottom: `1px solid ${t.ink}`, background: t.bg, padding: '4px 8px', fontWeight: 800, letterSpacing: 1 }}>
        <span>NO.</span><span>章</span><span style={{ textAlign: 'right' }}>語数</span><span>習熟度</span><span style={{ textAlign: 'right' }}>%</span>
      </div>
      {VISIBLE_CHAPTERS.map((ch, i) => {
        const stat = fm[ch.id];
        const c = colorFor(ch.id, t);
        return (
          <div key={ch.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 70px 36px', padding: '4px 8px', borderBottom: `1px dotted ${t.rule}`, alignItems: 'center' }}>
            <span style={{ fontWeight: 800 }}>{i + 1}</span>
            <span style={{ fontFamily: FONT_SERIF, fontSize: 11, fontWeight: 700 }}>{ch.short}</span>
            <span style={{ textAlign: 'right', fontFamily: FONT_MONO, fontSize: 9, color: t.inkSoft }}>{ch.count}</span>
            <span style={{ position: 'relative', height: 4, background: t.rule }}>
              <span style={{ position: 'absolute', inset: 0, width: stat.masteredPct + '%', background: c }} />
            </span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: c }}>{stat.masteredPct}</span>
          </div>
        );
      })}
    </div>
  );
}

function BomFull({ palette: t, fm }: { palette: ReiwaPalette; fm: FieldMastery }) {
  return (
    <div style={{ margin: '0 12px 10px', border: `1.5px solid ${t.ink}`, fontSize: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 36px', borderBottom: `1.5px solid ${t.ink}`, background: t.bg, padding: '4px 8px', fontWeight: 800, letterSpacing: 1 }}>
        <span>NO.</span><span>章 · 完全展開</span><span style={{ textAlign: 'right' }}>範囲</span><span>習熟度</span><span style={{ textAlign: 'right' }}>%</span>
      </div>
      {VISIBLE_CHAPTERS.map((ch, i) => {
        const stat = fm[ch.id];
        const c = colorFor(ch.id, t);
        return (
          <div key={ch.id}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 36px', padding: '4px 8px', borderBottom: `1px dotted ${t.rule}`, alignItems: 'center' }}>
              <span style={{ fontWeight: 800 }}>{i + 1}</span>
              <span style={{ fontFamily: FONT_SERIF, fontSize: 11, fontWeight: 700 }}>{ch.label}</span>
              <span style={{ textAlign: 'right', fontFamily: FONT_MONO, fontSize: 9, color: t.inkSoft }}>
                #{ch.start}-{ch.end}
              </span>
              <span style={{ position: 'relative', height: 4, background: t.rule }}>
                <span style={{ position: 'absolute', inset: 0, width: stat.masteredPct + '%', background: c }} />
              </span>
              <span style={{ textAlign: 'right', fontWeight: 700, color: c }}>{stat.masteredPct}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function aggregateTiers(fm: FieldMastery): { jige: number; tenjou: number; kugyou: number } {
  let jige = 0, tenjou = 0, kugyou = 0;
  for (const c of Object.values(fm)) {
    jige += c.jigeCount;
    tenjou += c.tenjouCount;
    kugyou += c.kugyouCount;
  }
  return { jige, tenjou, kugyou };
}

function Metrics({
  palette: t,
  fm,
  next,
  parts,
}: {
  palette: ReiwaPalette;
  fm: FieldMastery;
  next: string;
  parts: string;
}) {
  const { jige, tenjou, kugyou } = aggregateTiers(fm);
  return (
    <div style={{ margin: '0 12px 10px', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 6, fontSize: 9, color: t.inkSoft, letterSpacing: 1 }}>
      <div style={{ border: `1px dotted ${t.rule}`, padding: '4px 6px' }}>
        <div style={{ fontSize: 7 }}>地下 / 殿上 / 公卿</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>
          {jige}
          <span style={{ fontSize: 10, color: t.inkSoft, fontWeight: 700, margin: '0 2px' }}>/</span>
          <span style={{ color: t.accent }}>{tenjou}</span>
          <span style={{ fontSize: 10, color: t.inkSoft, fontWeight: 700, margin: '0 2px' }}>/</span>
          <span style={{ color: t.primary }}>{kugyou}</span>
        </div>
      </div>
      <div style={{ border: `1px dotted ${t.rule}`, padding: '4px 6px' }}>
        <div style={{ fontSize: 7 }}>NEXT</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.primary }}>{next}</div>
      </div>
      <div style={{ border: `1px dotted ${t.rule}`, padding: '4px 6px' }}>
        <div style={{ fontSize: 7 }}>PARTS</div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>
          {parts}
          <span style={{ fontSize: 8, color: t.inkSoft, marginLeft: 2 }}>/32</span>
        </div>
      </div>
    </div>
  );
}

function AssembleBar({ ink, paper, inkSoft }: { ink: string; paper: string; inkSoft: string }) {
  return (
    <div style={{ margin: '0 12px 12px', display: 'flex', gap: 6 }}>
      <div style={{ flex: 1, background: ink, color: paper, padding: '12px', textAlign: 'center', fontWeight: 800, letterSpacing: 3, fontSize: 12 }}>▶ ASSEMBLE · 起動</div>
      <div style={{ background: paper, border: `1px solid ${ink}`, padding: '12px 14px', fontSize: 11, fontWeight: 700 }}>
        20<span style={{ color: inkSoft }}>/20</span>
      </div>
    </div>
  );
}

function Footer({ inkSoft, note, sheet }: { inkSoft: string; note: string; sheet: string }) {
  return (
    <div style={{ padding: '0 14px 16px', fontSize: 9, color: inkSoft, letterSpacing: 1, display: 'flex', justifyContent: 'space-between' }}>
      <span>NOTES: {note}</span>
      <span>SHEET {sheet}</span>
    </div>
  );
}
