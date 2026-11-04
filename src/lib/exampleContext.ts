/**
 * 「例文から意味を選ぶ」で、例文1文だけでは意味が決まらないときの手当て（2026-11-05、ユーザー方針「例文は変えずに前後を足すか補足を付ける」）。
 *
 * 正本 = data/enrich/example-context.jsonl（qid と例文の本文をキーに、1例文1行）
 * 生成 = scripts/build-example-context.mjs → public/example-context.json（手で編集しない）
 *   avoid  … この例文では誤答に出さない意味（同じ語の紛れる意味。例: をかし 15-2 の例文に 15-1「趣がある」）
 *   before / after … 例文の前後の本文。vault の教材本文か public/texts-v3 にあるものだけ（生成時に一字一句照合）
 *   note   … 場面の補足（答えの語・訳は書かない）
 *
 * 純粋関数。DOM・fetch に触れない。
 */

export type ExampleContext = {
  avoid?: string[];
  before?: string;
  after?: string;
  note?: string;
};

export type ExampleContextMap = Record<string, ExampleContext>;

/** 例文の照合キー。空白を外し、末尾の（出典）を外す */
export function normExampleText(jp: string | undefined): string {
  return (jp ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[（(][^（）()]*[）)]$/, '')
    .trim();
}

export function exampleContextKey(qid: string, jp: string | undefined): string {
  return `${qid}|${normExampleText(jp)}`;
}

export function lookupExampleContext(
  map: ExampleContextMap | null | undefined,
  qid: string,
  jp: string | undefined
): ExampleContext | undefined {
  if (!map || !jp) return undefined;
  return map[exampleContextKey(qid, jp)];
}
