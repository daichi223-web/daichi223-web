// scripts/fix-ri-izenkei.cjs
// 完了・存続の助動詞「り」(連体「る」/已然「れ」/終止「り」/未然「ら」) の直前にある
// 四段動詞・サ変動詞の活用形タグを学校文法の接続規則に正す。
//   - 四段(ラ四/ハ四/カ四/マ四/タ四/バ四/サ四/ガ四/ワ四 等) + り … 已然形「已」  (現状「命」を是正)
//   - サ変(す)             + り … 未然形「未」  (現状「命」を是正)
// 「サ未四已（さみしい）」。已然形と命令形が四段で同形のため、データは一律「命」と付けていた。
// texts-v3 と dist ミラーの双方を更新する。--dry で確認のみ。
const fs = require('fs');
const path = require('path');

const dry = process.argv.includes('--dry');
const V3 = path.join(__dirname, '..', 'public', 'texts-v3');
const DIST = path.join(__dirname, '..', 'dist', 'texts-v3');

function isYodan(type){ return type && /四/.test(type); }      // ラ四/サ四 等の略記を含む
function isSahen(type){ return type && /サ変|サ行変格/.test(type); }
function isRiAux(gt){
  if (!gt || gt.pos !== '助動詞') return false;
  const m = gt.meaning || '';
  const t = gt.baseForm || '';
  if (t === 'り') return /(完了|存続)/.test(m) || true;
  // baseForm 欠落時: meaning が完了/存続 かつ 表記が ら/り/る/れ
  return /(完了|存続)/.test(m);
}

const files = fs.readdirSync(V3).filter(f => f.endsWith('.json') && f !== 'index.json');
const changes = [];

for (const f of files) {
  const fp = path.join(V3, f);
  let doc;
  try { doc = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
  if (!doc.sentences) continue;
  let dirty = false;

  for (const s of doc.sentences) {
    if (!s.tokens) continue;
    for (let i = 1; i < s.tokens.length; i++) {
      const aux = s.tokens[i];
      const agt = aux.grammarTag;
      if (!isRiAux(agt)) continue;
      // 「り」の表記 (ら/り/る/れ) を確認 (受身らる等の誤巻き込み防止)
      const at = (aux.text || '').replace(/[、。「」]/g, '');
      if (!/^(ら|り|る|れ)$/.test(at)) continue;

      // 直前の内容語 (品詞あり)
      let prev = null;
      for (let j = i - 1; j >= 0; j--) {
        const pgt = s.tokens[j].grammarTag;
        if (pgt && pgt.pos) { prev = s.tokens[j]; break; }
      }
      if (!prev) continue;
      const pgt = prev.grammarTag;
      const form = pgt.conjugationForm;
      if (!/(動詞)/.test(pgt.pos || '')) continue;   // 動詞・補助動詞のみ
      if (form !== '命') continue;                   // 是正対象は命令形タグのみ

      let want = null;
      if (isYodan(pgt.conjugationType)) want = '已';
      else if (isSahen(pgt.conjugationType)) want = '未';
      if (!want || want === form) continue;

      changes.push(`${f} ${s.id}/${prev.id} 「${prev.text}」(${pgt.conjugationType}) ${form}→${want} +「${aux.text}」(${agt.meaning})`);
      if (!dry) { pgt.conjugationForm = want; dirty = true; }
    }
  }

  if (dirty && !dry) {
    fs.writeFileSync(fp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    // dist ミラー同期 (存在すれば)
    const dp = path.join(DIST, f);
    if (fs.existsSync(dp)) fs.writeFileSync(dp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  }
}

console.log(`${dry ? '[dry] ' : ''}修正対象: ${changes.length} 件`);
for (const c of changes) console.log('  ' + c);
