// 学校（cohort）と、登録に使えるメールのドメイン。
//
// 学校の判別は「学校ごとに ?cohort=<名前> 付きの URL/QR を配る」方式（src/lib/cohort.ts）。
// 登録時にその cohort をプロフィールへ固定し、別端末でログインした時も同じ学校の教材が出る。
// 表示名が未設定の cohort はコード名をそのまま表示する。

export const ALLOWED_DOMAINS = ['st.spec.ed.jp', 'spec.ed.jp'];

/** cohort → 学校の表示名。新しい学校を足すときはここに1行追加 */
export const SCHOOLS: Record<string, string> = {
  default: '浦和高校',
};

export function schoolLabel(cohort: string): string {
  return SCHOOLS[cohort] ?? cohort;
}

/** cohort → 教員向けの短い学校コード（利用状況ダッシュボードで使う）。未登録の cohort はコード名のまま */
export const SCHOOL_CODES: Record<string, string> = {
  default: 'KU', // 県立浦和
  nishi: 'UW', // 浦和西
};

export function schoolCode(cohort: string | null | undefined): string {
  const c = cohort ?? 'default';
  return SCHOOL_CODES[c] ?? c;
}

export function emailDomainOk(email: string): boolean {
  const d = email.trim().split('@')[1]?.toLowerCase();
  return !!d && ALLOWED_DOMAINS.includes(d);
}

/** 教員のメール（@spec.ed.jp）。生徒は @st.spec.ed.jp。教員は組・番号を持たない */
export function isTeacherEmail(email: string): boolean {
  return email.trim().split('@')[1]?.toLowerCase() === 'spec.ed.jp';
}

export const DOMAIN_HINT = '学校のメール（@st.spec.ed.jp）';
