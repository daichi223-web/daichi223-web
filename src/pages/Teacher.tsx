// src/pages/Teacher.tsx
import { useEffect, useMemo, useState } from "react";
import { dataParser } from "../utils/dataParser";

function getToken(): string | null {
  // URL ?token=... → localStorage 保存（次回からURLに出さなくてOK）
  const u = new URL(window.location.href);
  const q = u.searchParams.get("token");
  if (q) {
    // Strip whitespace/newlines that may have snuck in during copy-paste
    const clean = q.replace(/\s+/g, '').trim();
    localStorage.setItem("ADMIN_VIEW_TOKEN", clean);
    // URLからtokenを消す（戻る対策に replaceState）
    u.searchParams.delete("token");
    window.history.replaceState(null, "", u.toString());
    return clean;
  }
  const stored = localStorage.getItem("ADMIN_VIEW_TOKEN");
  if (!stored) return null;
  // Sanity check: 32+ char tokens are valid. Trash broken ones.
  if (stored.length < 20) {
    localStorage.removeItem("ADMIN_VIEW_TOKEN");
    return null;
  }
  return stored;
}

/**
 * ログアウト: サーバーに cookie 失効を要請しつつ、レガシー localStorage も消す。
 * エラーは無視して続行（最終的に window.location.reload で強制リセット）。
 */
export async function logoutAdmin() {
  try {
    await fetch("/api/textPublications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "logout" }),
    });
  } catch {
    // ignore
  }
  localStorage.removeItem("ADMIN_VIEW_TOKEN");
}

export function clearAdminToken() {
  void logoutAdmin().finally(() => window.location.reload());
}

function readCookie(key: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function callAPI(path: string, body?: any) {
  const method = body ? "POST" : "GET";
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";

  // 状態変更系は CSRF token を付与（cookie 経路時のみ必要、レガシー経路では無視される）
  if (method !== "GET") {
    const csrf = readCookie("admin_csrf");
    if (csrf) headers["x-csrf-token"] = csrf;
  }

  // 既存 localStorage セッション（レガシー）が残っていれば header 経由でも認証を通す。
  // Cookie が発行されていればそちらが優先される（credentials: 'include'）。
  const legacyTok = getToken();
  if (legacyTok) headers["x-admin-token"] = legacyTok;

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Teacher() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [activeTab, setActiveTab] = useState<"answers" | "candidates" | "analytics" | "texts">("answers");
  const [rows, setRows] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!token);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<{[qid: string]: any}>({});
  const [allWordsData, setAllWordsData] = useState<any[]>([]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        // 単語データを読み込み
        await dataParser.loadData();
        const words = dataParser.getAllWords();
        setAllWordsData(words);

        const data = await callAPI("/api/listRecentAnswers?limit=50");
        setRows(data);

        // 候補データも取得
        const candidatesData = await callAPI("/api/listCandidates?limit=100");
        setCandidates(candidatesData.candidates || []);
      } catch (e: any) {
        const msg = String(e?.message || e);
        // Detect permission errors so we can show the login form cleanly
        if (msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
          await logoutAdmin();
          setToken(null);
          setErr(null);
        } else {
          setErr(msg);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const doOverride = async (id: string, label: "OK" | "NG" | null) => {
    try {
      await callAPI("/api/overrideAnswer", { answerId: id, result: label });
      setRows(rs => rs.map(r => r.id === id ? {
        ...r,
        final: label === null
          ? { result: r.raw?.auto?.result || "NG", source: "auto", reason: r.raw?.auto?.reason || "" }
          : { result: label, source: "override", reason: "teacher_override" }
      } : r));
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    }
  };

  const addOverrideRule = async (qid: string, answerRaw: string) => {
    try {
      await callAPI("/api/upsertOverride", { qid, answerRaw, label: "OK", active: true });
      alert("辞書に登録しました（同型を一括置換）");
      // Refresh data
      const data = await callAPI("/api/listRecentAnswers?limit=50");
      setRows(data);
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    }
  };

  const toggleRow = async (id: string, qid: string) => {
    if (expandedRow === id) {
      setExpandedRow(null);
    } else {
      setExpandedRow(id);
      if (!questionData[qid]) {
        try {
          const word = allWordsData.find(w => w.qid === qid);
          if (word) {
            setQuestionData(prev => ({ ...prev, [qid]: word }));
          } else {
            console.warn(`Question data not found for qid: ${qid}`);
          }
        } catch (e: any) {
          console.error(`Failed to load question data:`, e);
        }
      }
    }
  };

  // qidから単語を取得するヘルパー関数
  const getWordByQid = (qid: string) => {
    return allWordsData.find(w => w.qid === qid);
  };

  // 問題表示用のヘルパー関数（見出し語 + 意味）
  const getQuestionDisplay = (qid: string) => {
    const word = getWordByQid(qid);
    if (!word) return qid;

    // 見出し語を取得
    const lemma = word.lemma;

    // 同じ見出し語の単語を探して意味番号を取得
    const sameWords = allWordsData.filter(w => w.lemma === lemma);
    if (sameWords.length === 1) {
      // 単一の意味の場合は意味番号不要
      return lemma;
    }

    const index = sameWords.findIndex(w => w.qid === qid);
    return `${lemma} (意味${index + 1})`;
  };

  // 回答表示用のヘルパー関数（選択肢の場合は意味テキストを表示）
  const getAnswerDisplay = (answerRaw: string, qid: string) => {
    if (!answerRaw) return "(空)";

    // answerRawがqidの形式かチェック（例文理解モードの選択肢）
    const selectedWord = getWordByQid(answerRaw);
    if (selectedWord) {
      // 選択肢の場合は意味を表示
      const sense = selectedWord.sense;
      // 〔〕内の意味を抽出
      const bracketMatch = sense.match(/〔\s*(.+?)\s*〕/);
      return bracketMatch ? bracketMatch[1].trim() : sense;
    }

    // 記述回答の場合はそのまま表示
    return answerRaw;
  };

  // 記述式回答かどうかを判定（選択肢形式でないもの）
  const isWritingAnswer = (answerRaw: string) => {
    if (!answerRaw) return false;
    // answerRawがqid形式なら選択肢回答
    const selectedWord = getWordByQid(answerRaw);
    return !selectedWord; // qidでなければ記述式
  };

  // 記述式回答のみをフィルタリング
  const writingRows = rows.filter(r => isWritingAnswer(r.raw?.answerRaw));

  const aggregateCandidates = async () => {
    if (!confirm("回答データから選択肢候補を集計しますか？\n\n※この処理には時間がかかる場合があります")) {
      return;
    }

    try {
      setLoading(true);
      const result = await callAPI("/api/aggregateCandidates", {});
      alert(`集計完了:\n処理数: ${result.processed}\n集計数: ${result.aggregated}\n保存数: ${result.saved}`);

      // 候補データを再取得
      const candidatesData = await callAPI("/api/listCandidates?limit=100");
      setCandidates(candidatesData.candidates || []);
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteAllData = async () => {
    if (!confirm("本当に全データ（answers, candidates, overrides）を削除しますか？\n\nこの操作は取り消せません。")) {
      return;
    }

    const confirmText = prompt('削除を実行するには "DELETE_ALL_DATA" と入力してください:');
    if (confirmText !== "DELETE_ALL_DATA") {
      alert("キャンセルしました");
      return;
    }

    try {
      setLoading(true);
      const result = await callAPI("/api/deleteAllData", { confirm: "DELETE_ALL_DATA" });
      alert(`削除完了:\n${JSON.stringify(result.deleted, null, 2)}`);

      // データを再取得
      const data = await callAPI("/api/listRecentAnswers?limit=50");
      setRows(data);
      const candidatesData = await callAPI("/api/listCandidates?limit=100");
      setCandidates(candidatesData.candidates || []);
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Login form when no valid token
  if (!token && !loading) {
    return <LoginForm onLogin={(tok) => setToken(tok)} />;
  }

  if (err) return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
        {err}
      </div>
      <button
        onClick={async () => {
          await logoutAdmin();
          setToken(null);
          setErr(null);
        }}
        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition"
      >
        ログアウトしてやり直す
      </button>
    </div>
  );

  if (loading) return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="text-center text-slate-600">読み込み中...</div>
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="sticky top-0 bg-white z-10 pb-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">教師用管理画面（共有トークン）</h2>
          <div className="flex gap-2">
            <button
              onClick={aggregateCandidates}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            >
              📊 候補を集計
            </button>
            <button
              onClick={async () => {
                try {
                  setLoading(true);
                  const result = await callAPI("/api/exportCandidatesJSON");
                  alert(`エクスポート完了:\n候補数: ${result.candidatesCount}\nQID数: ${result.qidsCount}\n${result.message}`);
                } catch (e: any) {
                  alert(`エラー: ${e.message}`);
                } finally {
                  setLoading(false);
                }
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
            >
              📤 候補をエクスポート
            </button>
            <button
              onClick={deleteAllData}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
            >
              🗑️ 全データ削除
            </button>
          </div>
        </div>

        {/* タブ切り替え */}
        <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("answers")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "answers"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          回答一覧
        </button>
        <button
          onClick={() => setActiveTab("candidates")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "candidates"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          選択肢候補
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "analytics"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          📊 誤答分析
        </button>
        <button
          onClick={() => setActiveTab("texts")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "texts"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          📚 教材公開管理
        </button>
      </div>
      </div>

      {activeTab === "answers" && (
        <>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-100 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">単語</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">入力された回答</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">自動判定</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">生徒訂正</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">操作</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 bg-blue-50">現状</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {writingRows.map((r: any) => (
              <>
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                    <button
                      onClick={() => toggleRow(r.id, r.raw?.qid)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      {expandedRow === r.id ? "▼" : "▶"}
                    </button>
                    {" "}{r.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getQuestionDisplay(r.raw?.qid)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getAnswerDisplay(r.raw?.answerRaw, r.raw?.qid)}
                  </td>

                  {/* 自動判定 */}
                  <td className="px-4 py-3 text-sm">
                    {r.raw?.auto ? (
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        r.raw.auto.result === "OK" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {r.raw.auto.result} ({r.raw.auto.score}点)
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>

                  {/* 生徒判定 */}
                  <td className="px-4 py-3 text-sm">
                    {r.manual?.result ? (
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        r.manual.result === "OK" ? "bg-purple-100 text-purple-700" : "bg-pink-100 text-pink-700"
                      }`}>
                        {r.manual.result}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">-</span>
                    )}
                  </td>

                  {/* 操作 */}
                  <td className="px-4 py-3 text-sm space-x-2">
                    <button
                      onClick={() => doOverride(r.id, "OK")}
                      className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded transition"
                    >
                      OK
                    </button>
                    <button
                      onClick={() => doOverride(r.id, "NG")}
                      className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded transition"
                    >
                      NG
                    </button>
                    <button
                      onClick={() => doOverride(r.id, null)}
                      className="px-3 py-1 bg-slate-500 hover:bg-slate-600 text-white text-xs rounded transition"
                    >
                      自動に戻す
                    </button>
                  </td>

                  {/* 現状（最終判定） */}
                  <td className="px-4 py-3 text-sm bg-blue-50">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex px-3 py-1 rounded text-sm font-bold ${
                        r.final?.result === "OK" ? "bg-green-500 text-white" : "bg-red-500 text-white"
                      }`}>
                        {r.final?.result || "不明"}
                      </span>
                      <span className="text-xs text-slate-600">
                        {r.final?.source === "manual" ? "生徒訂正" :
                         r.final?.source === "override" ? "教師判定" :
                         r.final?.source === "auto" ? "自動" : ""}
                      </span>
                    </div>
                  </td>
                </tr>
                {expandedRow === r.id && (
                  <tr key={`${r.id}-detail`}>
                    <td colSpan={7} className="px-4 py-4 bg-slate-50">
                      {questionData[r.raw?.qid] ? (
                        <div className="space-y-3">
                          {/* 基本情報 */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="font-medium text-slate-700">見出し語: </span>
                              <span className="text-slate-900">{questionData[r.raw?.qid].lemma}</span>
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">意味: </span>
                              <span className="text-slate-900">{questionData[r.raw?.qid].sense}</span>
                            </div>
                          </div>

                          {/* 生徒の自己判定 */}
                          {r.manual && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3">
                              <span className="font-medium text-blue-800">生徒の判定: </span>
                              <span className={`font-bold ${r.manual.result === 'OK' ? 'text-green-700' : 'text-red-700'}`}>
                                {r.manual.result === 'OK' ? '✓ 正解' : '✗ 不正解'}
                              </span>
                              {r.manual.by?.at && (
                                <span className="text-xs text-blue-600 ml-2">
                                  ({new Date(r.manual.by.at._seconds ? r.manual.by.at._seconds * 1000 : r.manual.by.at).toLocaleString('ja-JP')})
                                </span>
                              )}
                            </div>
                          )}

                          {/* 例文 */}
                          {questionData[r.raw?.qid].examples?.length > 0 && (
                            <div>
                              <span className="font-medium text-slate-700">例文:</span>
                              <div className="ml-4 mt-2 space-y-2">
                                {questionData[r.raw?.qid].examples.map((ex: any, i: number) => (
                                  <div key={i} className="bg-white p-3 rounded border border-slate-200">
                                    <div className="text-sm text-slate-800 mb-1">{ex.jp}</div>
                                    <div className="text-xs text-slate-600">{ex.translation}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 自動採点情報 */}
                          {r.raw?.auto && (
                            <div className="text-xs text-slate-500 pt-2 border-t">
                              <span>自動採点: {r.raw.auto.score}点 ({r.raw.auto.reason})</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-slate-500">
                          <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                          <p>データを読み込んでいます...</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {writingRows.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          記述式の回答データがありません
        </div>
      )}
        </>
      )}

      {activeTab === "candidates" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">単語</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">入力された回答</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">頻度</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">平均点</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">役割</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">最終確認</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {candidates.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getWordByQid(c.qid)?.lemma || c.qid}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">{c.sampleAny}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
                      {c.freq}回
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">{c.avgScore}点</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      c.proposedRole === "accept"
                        ? "bg-green-100 text-green-700"
                        : c.proposedRole === "negative"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {c.proposedRole === "accept" ? "正解候補" : c.proposedRole === "negative" ? "誤答候補" : "要確認"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {c.lastSeen?.toDate ? new Date(c.lastSeen.toDate()).toLocaleDateString('ja-JP') :
                     c.lastSeen?._seconds ? new Date(c.lastSeen._seconds * 1000).toLocaleDateString('ja-JP') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {candidates.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              候補データがありません。まず /api/aggregateCandidates を実行してください。
            </div>
          )}
        </div>
      )}

      {activeTab === "analytics" && (
        <AnalyticsView candidates={candidates} getQuestionDisplay={getQuestionDisplay} />
      )}

      {activeTab === "texts" && <TextsManageView />}
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: (tok: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const attemptLogin = async () => {
    if (!username || !password) {
      setError("ID とパスワードを入力してください");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/textPublications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "login", username, password }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("ID またはパスワードが違います");
        }
        if (res.status === 500) {
          throw new Error("サーバー設定エラー（管理者に確認してください）");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { ok?: boolean; token?: string };
      if (!data.ok || !data.token) {
        throw new Error("ログイン応答が不正です");
      }
      localStorage.setItem("ADMIN_VIEW_TOKEN", data.token);
      onLogin(data.token);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🛠</div>
          <h1 className="text-2xl font-bold text-slate-800">教員ログイン</h1>
          <p className="text-sm text-slate-500 mt-2">
            ID とパスワードを入力してください
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            attemptLogin();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ID
            </label>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="teacher"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={checking}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              パスワード
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={checking}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={checking || !username || !password}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition"
          >
            {checking ? "確認中…" : "ログイン"}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 text-xs text-slate-500">
          <p>
            ログイン情報はブラウザに保存され、次回から自動でサインインします。
          </p>
        </div>

        <div className="mt-4 text-center">
          <a
            href="/"
            className="text-xs text-slate-400 hover:text-slate-600 underline"
          >
            ← ホームへ戻る
          </a>
        </div>
      </div>
    </div>
  );
}

type TextEntry = {
  id: string;
  slug: string;
  title: string;
  source_work: string;
  genre: string;
  era?: string;
  author?: string;
};

function TextsManageView() {
  const [index, setIndex] = useState<TextEntry[]>([]);
  const [publishedMap, setPublishedMap] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [queryFilter, setQueryFilter] = useState("");
  const [showOnly, setShowOnly] = useState<"all" | "published" | "unpublished">("all");
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [eraFilter, setEraFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const [idx, pubs] = await Promise.all([
          fetch("/texts/index.json").then((r) => r.json()),
          callAPI("/api/textPublications"),
        ]);
        setIndex(idx);
        const m: Record<string, boolean> = {};
        for (const row of pubs.rows || []) {
          m[row.slug] = !!row.published;
        }
        setPublishedMap(m);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const togglePublish = async (t: TextEntry, nextPublished: boolean) => {
    setBusy(t.slug);
    try {
      await callAPI("/api/textPublications", {
        slug: t.slug,
        published: nextPublished,
        title: t.title,
      });
      setPublishedMap((m) => ({ ...m, [t.slug]: nextPublished }));
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const bulkSet = async (filterFn: (t: TextEntry) => boolean, publish: boolean) => {
    if (!confirm(`対象 ${index.filter(filterFn).length} 件を${publish ? "公開" : "非公開"}にします`)) return;
    for (const t of index.filter(filterFn)) {
      setBusy(t.slug);
      try {
        await callAPI("/api/textPublications", {
          slug: t.slug,
          published: publish,
          title: t.title,
        });
      } catch (e: any) {
        console.warn(`${t.slug}: ${e.message}`);
      }
    }
    // Refresh
    const pubs = await callAPI("/api/textPublications");
    const m: Record<string, boolean> = {};
    for (const row of pubs.rows || []) m[row.slug] = !!row.published;
    setPublishedMap(m);
    setBusy(null);
  };

  const filtered = index.filter((t) => {
    if (queryFilter) {
      const q = queryFilter.toLowerCase();
      if (
        !t.title.toLowerCase().includes(q) &&
        !(t.source_work || "").toLowerCase().includes(q) &&
        !(t.author || "").toLowerCase().includes(q)
      )
        return false;
    }
    if (genreFilter && t.genre !== genreFilter) return false;
    if (eraFilter && t.era !== eraFilter) return false;
    const pub = !!publishedMap[t.slug];
    if (showOnly === "published" && !pub) return false;
    if (showOnly === "unpublished" && pub) return false;
    return true;
  });

  const publishedCount = Object.values(publishedMap).filter(Boolean).length;

  const genreOptions = Array.from(new Set(index.map((t) => t.genre).filter(Boolean))).sort();
  const eraOptions = Array.from(new Set(index.map((t) => t.era).filter(Boolean) as string[])).sort();
  const hasFilter = !!(queryFilter || genreFilter || eraFilter || showOnly !== "all");
  const bulkFilteredLabel = hasFilter
    ? `絞込 ${filtered.length} 件`
    : `全 ${index.length} 件`;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-slate-800 mb-2">📚 教材公開管理</h3>
        <p className="text-sm text-slate-600 mb-3">
          デフォルトは<strong>非公開</strong>。公開したい教材のみ ON にすると生徒画面に表示されます。
        </p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-blue-50 rounded p-3">
            <div className="text-2xl font-bold text-blue-700">{index.length}</div>
            <div className="text-xs text-blue-600">教材総数</div>
          </div>
          <div className="bg-emerald-50 rounded p-3">
            <div className="text-2xl font-bold text-emerald-700">{publishedCount}</div>
            <div className="text-xs text-emerald-600">公開中</div>
          </div>
          <div className="bg-amber-50 rounded p-3">
            <div className="text-2xl font-bold text-amber-700">
              {index.length - publishedCount}
            </div>
            <div className="text-xs text-amber-600">非公開</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="タイトル・作品・作者で絞込"
            value={queryFilter}
            onChange={(e) => setQueryFilter(e.target.value)}
            className="px-3 py-1 border rounded text-sm flex-1 min-w-[160px]"
          />
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">ジャンル：全て</option>
            {genreOptions.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select
            value={eraFilter}
            onChange={(e) => setEraFilter(e.target.value)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">時代：全て</option>
            {eraOptions.map((era) => (
              <option key={era} value={era}>{era}</option>
            ))}
          </select>
          <select
            value={showOnly}
            onChange={(e) => setShowOnly(e.target.value as any)}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="all">公開状態：全て</option>
            <option value="published">公開のみ</option>
            <option value="unpublished">非公開のみ</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2 items-center mt-3 pt-3 border-t border-slate-200">
          <span className="text-xs text-slate-500 mr-1">
            対象：<strong className="text-slate-700">{bulkFilteredLabel}</strong>
          </span>
          <button
            onClick={() => {
              const slugs = new Set(filtered.map((t) => t.slug));
              bulkSet((t) => slugs.has(t.slug), true);
            }}
            disabled={filtered.length === 0}
            className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs rounded font-bold"
          >
            {hasFilter ? "絞込分を公開" : "全て公開"}
          </button>
          <button
            onClick={() => {
              const slugs = new Set(filtered.map((t) => t.slug));
              bulkSet((t) => slugs.has(t.slug), false);
            }}
            disabled={filtered.length === 0}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs rounded font-bold"
          >
            {hasFilter ? "絞込分を非公開" : "全て非公開"}
          </button>
          {hasFilter && (
            <button
              onClick={() => {
                setQueryFilter("");
                setGenreFilter("");
                setEraFilter("");
                setShowOnly("all");
              }}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded"
            >
              絞込をクリア
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-3 py-2 text-left">タイトル</th>
              <th className="px-3 py-2 text-left">作品・作者</th>
              <th className="px-3 py-2 text-left">時代</th>
              <th className="px-3 py-2 text-left">ジャンル</th>
              <th className="px-3 py-2 text-center">公開</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const pub = !!publishedMap[t.slug];
              return (
                <tr key={t.slug} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{t.title}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {t.source_work}
                    {t.author && t.author !== "不明" && ` / ${t.author}`}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{t.era || "-"}</td>
                  <td className="px-3 py-2 text-slate-500">{t.genre || "-"}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => togglePublish(t, !pub)}
                      disabled={busy === t.slug}
                      className={`px-3 py-1 rounded text-xs font-bold transition ${
                        pub
                          ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                          : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                      } ${busy === t.slug ? "opacity-50" : ""}`}
                    >
                      {busy === t.slug ? "..." : pub ? "公開中" : "非公開"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-sm">該当する教材がありません</div>
        )}
      </div>
    </div>
  );
}

function AnalyticsView({
  candidates,
  getQuestionDisplay,
}: {
  candidates: any[];
  getQuestionDisplay: (qid: string) => string;
}) {
  // Top wrong answers (proposed_role='negative', sorted by freq)
  const topWrongs = useMemo(() => {
    return candidates
      .filter((c) => c.proposedRole === "negative")
      .sort((a, b) => (b.freq || 0) - (a.freq || 0))
      .slice(0, 30);
  }, [candidates]);

  // Aggregate by qid: count of wrong patterns & total freq
  const byQid = useMemo(() => {
    const m = new Map<
      string,
      { qid: string; negativeCount: number; negativeFreq: number; totalFreq: number }
    >();
    for (const c of candidates) {
      const qid = c.qid;
      if (!qid) continue;
      const row = m.get(qid) || {
        qid,
        negativeCount: 0,
        negativeFreq: 0,
        totalFreq: 0,
      };
      row.totalFreq += c.freq || 0;
      if (c.proposedRole === "negative") {
        row.negativeCount += 1;
        row.negativeFreq += c.freq || 0;
      }
      m.set(qid, row);
    }
    return Array.from(m.values())
      .filter((r) => r.negativeFreq > 0)
      .sort((a, b) => b.negativeFreq - a.negativeFreq)
      .slice(0, 20);
  }, [candidates]);

  // Date histogram (by lastSeen date)
  const dailyHistogram = useMemo(() => {
    const bucket: Record<string, number> = {};
    for (const c of candidates) {
      const ls = c.lastSeen;
      let d: Date | null = null;
      if (ls?.toDate) d = ls.toDate();
      else if (ls?._seconds) d = new Date(ls._seconds * 1000);
      else if (typeof ls === "string") d = new Date(ls);
      if (!d) continue;
      const key = d.toISOString().slice(0, 10);
      bucket[key] = (bucket[key] || 0) + (c.freq || 0);
    }
    return Object.entries(bucket)
      .sort(([a], [b]) => (a > b ? 1 : -1))
      .slice(-30);
  }, [candidates]);

  const maxDaily = Math.max(1, ...dailyHistogram.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-slate-800 mb-3">📈 サマリ</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded p-3">
            <div className="text-2xl font-bold text-blue-700">
              {candidates.length}
            </div>
            <div className="text-xs text-blue-600">候補総数</div>
          </div>
          <div className="bg-red-50 rounded p-3">
            <div className="text-2xl font-bold text-red-700">
              {candidates.filter((c) => c.proposedRole === "negative").length}
            </div>
            <div className="text-xs text-red-600">誤答パターン</div>
          </div>
          <div className="bg-amber-50 rounded p-3">
            <div className="text-2xl font-bold text-amber-700">
              {candidates.filter((c) => c.proposedRole === "review").length}
            </div>
            <div className="text-xs text-amber-600">要確認</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-slate-800 mb-3">
          🏆 頻出誤答TOP30 (proposed_role=negative × freq desc)
        </h3>
        {topWrongs.length === 0 ? (
          <div className="text-slate-500 text-sm py-4">
            まだデータがありません。生徒の記述解答が累積されたら /api/aggregateCandidates を実行してください。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">単語</th>
                <th className="px-3 py-2 text-left">誤答内容</th>
                <th className="px-3 py-2 text-right">回数</th>
                <th className="px-3 py-2 text-right">平均点</th>
              </tr>
            </thead>
            <tbody>
              {topWrongs.map((c, i) => (
                <tr key={`${c.qid}_${c.answerNorm}`} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{getQuestionDisplay(c.qid)}</td>
                  <td className="px-3 py-2 text-slate-700">{c.sampleAny || c.answerNorm}</td>
                  <td className="px-3 py-2 text-right font-bold text-red-600">{c.freq}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{c.avgScore ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-slate-800 mb-3">📊 単語別誤答集中度 (TOP20)</h3>
        {byQid.length === 0 ? (
          <div className="text-slate-500 text-sm py-4">データなし</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">単語</th>
                <th className="px-3 py-2 text-right">誤答パターン数</th>
                <th className="px-3 py-2 text-right">誤答延べ回数</th>
                <th className="px-3 py-2 text-right">全解答数</th>
              </tr>
            </thead>
            <tbody>
              {byQid.map((r) => (
                <tr key={r.qid} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{getQuestionDisplay(r.qid)}</td>
                  <td className="px-3 py-2 text-right">{r.negativeCount}</td>
                  <td className="px-3 py-2 text-right text-red-600 font-bold">{r.negativeFreq}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.totalFreq}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-slate-800 mb-3">📅 日別 解答累計 (直近30日)</h3>
        {dailyHistogram.length === 0 ? (
          <div className="text-slate-500 text-sm py-4">データなし</div>
        ) : (
          <div className="space-y-1">
            {dailyHistogram.map(([date, n]) => (
              <div key={date} className="flex items-center gap-2 text-xs">
                <span className="w-24 text-slate-500">{date}</span>
                <div className="flex-1 bg-slate-100 rounded h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full"
                    style={{ width: `${(n / maxDaily) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right font-medium">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
