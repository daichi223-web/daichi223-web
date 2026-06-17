// scripts/fix-ri-hint.cjs
// 完了・存続「り」の上接動詞の hint で「命令形（接続）」と断定している箇所を
// 学校文法「四段已然形・サ変未然形接続（サ未四已）」に正す。
// り接続の文脈に直接結びつく「命令形」のみ置換し、活用列挙等の中立的「命令形」は触れない。
// --dry で確認のみ。texts-v3 と dist ミラーを更新。
const fs = require('fs');
const path = require('path');
const dry = process.argv.includes('--dry');
const V3 = path.join(__dirname, '..', 'public', 'texts-v3');
const DIST = path.join(__dirname, '..', 'dist', 'texts-v3');

// り接続文脈の「命令形」→「已然形」（四段）。サ変は別途だが hint 上は稀なので已然形に寄せず個別。
function fixHint(h) {
  let s = h;
  // 「ラ四またはサ変命令形接続」のような誤説明
  s = s.replace(/ラ四またはサ変命令形接続/g, 'サ変未然・四段已然接続〔サ未四已〕');
  // 「已然形・命令形接続」(両併記) は冗長化を避けて已然形接続にまとめる
  s = s.replace(/已然形・命令形接続/g, '已然形接続');
  s = s.replace(/命令形接続/g, '已然形接続');
  // 「命令形「X」＋／+／に／:（ラベル）」 の直前修飾（り上接 token のみ走るので動詞=已然形）
  s = s.replace(/命令形(?=「[^」]*」\s*(?:＋|\+|に|[:：]))/g, '已然形');
  // 「命令形＋り」「命令形+助動詞「り」」「命令形+「る」」
  s = s.replace(/命令形(?=\s*(?:＋|\+)\s*(?:り|助動詞「り」|「る」|存続))/g, '已然形');
  return s;
}

const files = fs.readdirSync(V3).filter(f => f.endsWith('.json') && f !== 'index.json');
const changes = [];
for (const f of files) {
  const fp = path.join(V3, f);
  let doc; try { doc = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { continue; }
  if (!doc.sentences) continue;
  let dirty = false;
  for (const s of doc.sentences) {
    if (!s.tokens) continue;
    for (let i = 1; i < s.tokens.length; i++) {
      const aux = s.tokens[i].grammarTag || {};
      const at = (s.tokens[i].text || '').replace(/[、。]/g, '');
      if (aux.pos !== '助動詞' || !/^(ら|り|る|れ)$/.test(at) || !/(完了|存続)/.test(aux.meaning || '')) continue;
      let prev = null;
      for (let j = i - 1; j >= 0; j--) { const g = s.tokens[j].grammarTag; if (g && g.pos) { prev = s.tokens[j]; break; } }
      if (!prev || !prev.hint || !/命令形/.test(prev.hint)) continue;
      const fixed = fixHint(prev.hint);
      if (fixed !== prev.hint) {
        changes.push(`${f} ${s.id} 「${prev.text}」\n    旧: ${prev.hint}\n    新: ${fixed}`);
        if (!dry) { prev.hint = fixed; dirty = true; }
      }
    }
  }
  if (dirty && !dry) {
    fs.writeFileSync(fp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    const dp = path.join(DIST, f);
    if (fs.existsSync(dp)) fs.writeFileSync(dp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  }
}
console.log(`${dry ? '[dry] ' : ''}hint 修正: ${changes.length} 件\n`);
changes.forEach(c => console.log('  ' + c + '\n'));
