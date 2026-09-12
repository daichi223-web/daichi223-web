// 登録必須の安全弁。
//
// 既定はオフ（＝今までどおり匿名で使えて、/account から任意で登録）。
// Vercel の環境変数 VITE_AUTH_REQUIRED=1 を入れて再デプロイした時だけ、
// 初回起動時の登録が必須になる（src/components/RequireAccount.tsx）。
//
// 生徒が入れない等のトラブルが起きたら、この変数を消して再デプロイすれば元に戻せる。
// コードを revert する必要はない。ビルド時に埋め込まれるので、切り替えには再デプロイが要る。
// 有効にする値は "1" だけ。
// （.env.production に旧機能の名残で VITE_AUTH_REQUIRED=true が入っており、
//   "true" も受理すると手元のビルドが意図せず必須になるため、あえて厳密に見る）
export const AUTH_REQUIRED = String(import.meta.env.VITE_AUTH_REQUIRED ?? '').trim() === '1';
