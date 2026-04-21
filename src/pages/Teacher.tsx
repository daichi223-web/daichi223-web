// src/pages/Teacher.tsx
import { useEffect, useMemo, useState } from "react";
import { dataParser } from "../utils/dataParser";

function getToken(): string | null {
  // URL ?token=... → localStorage 保存（次回からURLに出さなくてOK）
  const u = new URL(window.location.href);
  const q = u.searchParams.get("token");
  if (q) {
    localStorage.setItem("ADMIN_VIEW_TOKEN", q);
    // URLからtokenを消す（戻る対策に replaceState）
    u.searchParams.delete("token");
    window.history.replaceState(null, "", u.toString());
    return q;
  }
  return localStorage.getItem("ADMIN_VIEW_TOKEN");
}

async function callAPI(path: string, body?: any) {
  const tok = getToken();
  if (!tok) throw new Error("NO_TOKEN");
  const headers: any = { "Content-Type": "application/json", "x-admin-token": tok };
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Teacher() {
  const token = useMemo(getToken, []);
  const [activeTab, setActiveTab] = useState<"answers" | "candidates">("answers");
  const [rows, setRows] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<{[qid: string]: any}>({});
  const [allWordsData, setAllWordsData] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        if (!token) throw new Error("このページを見るには token が必要です。URL末尾に ?token=xxxx を付けてアクセスしてください。");

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
        setErr(String(e?.message || e));
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

  if (err) return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {err}
      </div>
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
    </div>
  );
}
