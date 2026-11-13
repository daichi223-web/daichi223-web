// src/pages/Teacher.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { dataParser } from "../utils/dataParser";
import bundledTextsIndex from "../data/textsIndex.json";
import bundledKobunQ from "../data/kobunQ.v2.slim.json";
import bundledTextsV3Index from "../data/textsV3Index.json";
// 利用状況ダッシュボード（scripts/usage-report.mjs が作るローカル版と同じテンプレート・同じ集計コードを流用）
import usageTemplate from "../../scripts/usage-dashboard.template.html?raw";
import usageAggregateSrc from "../../scripts/usage-aggregate.js?raw";
import {
  STAGES,
  STAGE_MIN_SCORE,
  PORTRAITS,
  PART_CHARTS,
  portraitForStage,
  robeColorOf,
  TIER_TONE,
  type Tier,
} from "../lib/nobleData";

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

export { logoutAdmin, clearAdminToken } from "../lib/adminSession";
import { logoutAdmin } from "../lib/adminSession";

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
  const [activeTab, setActiveTab] = useState<"answers" | "candidates" | "analytics" | "texts" | "noble" | "quizrange" | "usage" | "guest">("answers");
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

        const data = await callAPI("/api/teacher?action=listRecentAnswers&limit=50");
        setRows(data);

        // 候補データも取得
        const candidatesData = await callAPI("/api/teacher?action=listCandidates&limit=300");
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
      await callAPI("/api/teacher?action=overrideAnswer", { answerId: id, result: label });
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
      await callAPI("/api/teacher?action=upsertOverride", { qid, answerRaw, label: "OK", active: true });
      alert("辞書に登録しました（同型を一括置換）");
      // Refresh data
      const data = await callAPI("/api/teacher?action=listRecentAnswers&limit=50");
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

  // 記述の言い方を、教員の判断として正解／不正解に決める（null で取り消し）。
  // 生徒の画面の判定は、ここで決めた言い方だけを辞書として使う。
  const decideCandidate = async (c: any, label: "OK" | "NG" | null) => {
    try {
      await callAPI("/api/teacher?action=upsertOverride", {
        qid: c.qid,
        answerRaw: c.sampleAny,
        label: label ?? c.override ?? "OK",
        active: label !== null,
      });
      setCandidates(cs => cs.map(x => (x.id === c.id ? { ...x, override: label } : x)));
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    }
  };

  // 要確認（自動で決まらなかった言い方）を先に、その中は頻度順
  const sortedCandidates = [...candidates].sort((a, b) => {
    const rank = (c: any) => (c.override ? 2 : c.proposedRole === "review" ? 0 : 1);
    return rank(a) - rank(b) || (b.freq ?? 0) - (a.freq ?? 0);
  });

  const aggregateCandidates = async () => {
    if (!confirm("回答データから選択肢候補を集計しますか？\n\n※この処理には時間がかかる場合があります")) {
      return;
    }

    try {
      setLoading(true);
      const result = await callAPI("/api/teacher?action=aggregateCandidates", {});
      alert(`集計完了:\n処理数: ${result.processed}\n集計数: ${result.aggregated}\n保存数: ${result.saved}`);

      // 候補データを再取得
      const candidatesData = await callAPI("/api/teacher?action=listCandidates&limit=300");
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
      const result = await callAPI("/api/teacher?action=deleteAllData", { confirm: "DELETE_ALL_DATA" });
      alert(`削除完了:\n${JSON.stringify(result.deleted, null, 2)}`);

      // データを再取得
      const data = await callAPI("/api/teacher?action=listRecentAnswers&limit=50");
      setRows(data);
      const candidatesData = await callAPI("/api/teacher?action=listCandidates&limit=300");
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
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="static sm:sticky sm:top-0 bg-white z-10 pb-4">
        {/* 生徒画面（学習のホーム）へ戻る道。生徒ホームの「教員管理画面」入口の逆向き。
            教員セッション（cookie / localStorage）は消さないので、戻ってきても再ログイン不要 */}
        <div className="mb-2">
          <Link
            to="/"
            className="inline-flex items-center min-h-[44px] px-3 sm:px-4 text-sm sm:text-base font-medium rounded-lg border border-rw-rule bg-rw-paper text-rw-ink hover:border-rw-ink-soft transition no-underline"
            style={{ textDecoration: "none" }}
            title="教員のログインは保ったまま、生徒の学習ホームへ移ります"
          >
            ← 生徒画面へ
          </Link>
        </div>
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-6">
          <h2 className="text-base sm:text-2xl font-bold text-slate-800 shrink-0">教員管理画面</h2>
          <div className="flex gap-2 flex-wrap items-center">
            <button
              onClick={aggregateCandidates}
              className="px-2.5 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-base bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition"
            >
              <span className="sm:hidden">📊集</span>
              <span className="hidden sm:inline">📊 候補を集計</span>
            </button>
            <button
              onClick={async () => {
                try {
                  setLoading(true);
                  const result = await callAPI("/api/teacher?action=exportCandidatesJSON");
                  alert(`エクスポート完了:\n候補数: ${result.candidatesCount}\nQID数: ${result.qidsCount}\n${result.message}`);
                } catch (e: any) {
                  alert(`エラー: ${e.message}`);
                } finally {
                  setLoading(false);
                }
              }}
              className="px-2.5 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-base bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition"
            >
              <span className="sm:hidden">📤出</span>
              <span className="hidden sm:inline">📤 候補をエクスポート</span>
            </button>
            <button
              onClick={deleteAllData}
              className="px-2.5 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-base bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition"
            >
              🗑️ 全データ削除
            </button>
            <button
              onClick={async () => {
                await logoutAdmin();
                setToken(null);
                setErr(null);
                setRows([]);
                setCandidates([]);
              }}
              className="px-2.5 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-base bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition"
              title="セッション cookie を失効させて再度ログインが必要な状態に戻す"
            >
              ログアウト
            </button>
          </div>
        </div>

        {/* タブ切り替え */}
        <div className="flex border-b border-slate-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveTab("answers")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "answers"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">回答</span>
          <span className="hidden sm:inline">回答一覧</span>
        </button>
        <button
          onClick={() => setActiveTab("candidates")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "candidates"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">候補</span>
          <span className="hidden sm:inline">選択肢候補</span>
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "analytics"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">誤答</span>
          <span className="hidden sm:inline">📊 誤答分析</span>
        </button>
        <button
          onClick={() => setActiveTab("texts")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "texts"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">教材</span>
          <span className="hidden sm:inline">📚 教材公開管理</span>
        </button>
        <button
          onClick={() => setActiveTab("quizrange")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "quizrange"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">範囲</span>
          <span className="hidden sm:inline">📌 小テスト範囲</span>
        </button>
        <button
          onClick={() => setActiveTab("guest")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "guest"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">試用</span>
          <span className="hidden sm:inline">🔑 お試し</span>
        </button>
        <button
          onClick={() => setActiveTab("noble")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "noble"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">段位</span>
          <span className="hidden sm:inline">🎎 段位プレビュー</span>
        </button>
        <button
          onClick={() => setActiveTab("usage")}
          className={`shrink-0 whitespace-nowrap px-2 sm:px-4 py-2 text-sm sm:text-base font-medium transition ${
            activeTab === "usage"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-slate-600 hover:text-slate-800"
          }`}
        >
          <span className="sm:hidden">利用</span>
          <span className="hidden sm:inline">📈 利用状況</span>
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
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">正解</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">入力された回答</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">頻度</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">自動判定</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">教員の判断</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedCandidates.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getWordByQid(c.qid)?.lemma || c.qid}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getWordByQid(c.qid)?.senseNorm || getWordByQid(c.qid)?.sense || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900">{c.sampleAny}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
                      {c.freq}回
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                      c.proposedRole === "accept"
                        ? "bg-green-100 text-green-700"
                        : c.proposedRole === "negative"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {c.proposedRole === "accept" ? "正解" : c.proposedRole === "negative" ? "不正解" : "要確認"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {c.override ? (
                      <>
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          c.override === "OK" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                        }`}>
                          {c.override === "OK" ? "正解にした" : "不正解にした"}
                        </span>
                        <button
                          onClick={() => decideCandidate(c, null)}
                          className="ml-2 text-xs text-slate-500 underline hover:text-slate-800"
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => decideCandidate(c, "OK")}
                          className="px-3 py-1 rounded border border-green-600 text-green-700 text-xs font-medium hover:bg-green-50"
                        >
                          ○ 正解にする
                        </button>
                        <button
                          onClick={() => decideCandidate(c, "NG")}
                          className="ml-2 px-3 py-1 rounded border border-red-600 text-red-700 text-xs font-medium hover:bg-red-50"
                        >
                          × 不正解にする
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {candidates.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              候補データがありません。まず「候補を集計」を実行してください。
            </div>
          )}
        </div>
      )}

      {activeTab === "analytics" && (
        <AnalyticsView candidates={candidates} getQuestionDisplay={getQuestionDisplay} />
      )}

      {activeTab === "texts" && <TextsManageView />}

      {activeTab === "quizrange" && <QuizRangeView />}
      {activeTab === "guest" && <GuestAccessView />}

      {activeTab === "noble" && <NoblePreviewView />}

      {activeTab === "usage" && <UsageView />}
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

// お試し（ゲスト）のパスワード（2026-11-13 ユーザー指示）。生徒や見学者に /?guest=1 とパスワードを伝えると、
// 登録なしでその端末で使える。パスワードはサーバにハッシュでだけ持つので、ここでは今の値は見られない（新しく決め直す）。
// 変える・止めると、それまでに入った端末もゲストの扱いが外れる。サーバ = api/_guest.ts、表 = guest_access。
function GuestAccessView() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const url = `${window.location.origin}/?guest=1`;

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await callAPI("/api/teacher?action=getGuestAccess");
      setEnabled(!!data?.enabled);
      setUpdatedAt(data?.updated_at ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async (stop: boolean) => {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = stop ? { action: "setGuestAccess", enabled: false } : { action: "setGuestAccess", password };
      const data = await callAPI("/api/teacher", body);
      setEnabled(!!data?.enabled);
      setUpdatedAt(data?.updated_at ?? null);
      setPassword("");
      setMsg(stop ? "お試しを止めました。入っていた端末も、次に開いたときに登録が必要になります。" : "新しいパスワードにしました。前のパスワードで入った端末は、次に開いたときにもう一度入れ直しになります。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const pwOk = password.normalize("NFKC").trim().length >= 4 && password.normalize("NFKC").trim().length <= 64;

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-800 mb-1">🔑 お試し（ゲスト）</h2>
      <p className="text-sm text-slate-600 mb-4">
        下のアドレスを開いてパスワードを入れると、登録しなくてもその端末で使えます（見学・体験用）。
        お試しの端末では分析用の記録（利用状況・つまずきの集計のもと）はとりません。単語の成績と復習の予定はその人の分として残ります。
      </p>
      <div className="mb-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <div className="text-xs font-bold text-slate-500">お試しのアドレス</div>
        <div className="font-mono break-all text-slate-800">{url}</div>
      </div>
      <div className="mb-4 text-sm">
        <span className="font-bold text-slate-700">今の状態：</span>
        {enabled == null ? "読み込み中…" : enabled ? "受け付け中" : "止めています"}
        {updatedAt && <span className="text-xs text-slate-500">（{new Date(updatedAt).toLocaleString("ja-JP")} に変更）</span>}
      </div>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">新しいパスワード</span>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="4〜64文字"
          autoComplete="off"
          className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
        />
        <span className="text-xs text-slate-500">全角で打っても半角と同じに扱います。今のパスワードはここでは見られません（決め直すだけ）。</span>
      </label>
      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          onClick={() => void save(false)}
          disabled={loading || !pwOk}
          className="px-4 py-2 rounded bg-blue-600 text-white font-bold disabled:opacity-50"
        >
          このパスワードにして受け付ける
        </button>
        <button
          onClick={() => void save(true)}
          disabled={loading || enabled === false}
          className="px-4 py-2 rounded border border-slate-300 text-slate-700 font-bold disabled:opacity-50"
        >
          お試しを止める
        </button>
      </div>
      {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
      {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
    </div>
  );
}

// 小テスト範囲: 教員が1回設定すると、その cohort の生徒ホーム最上段に出る。
// 生徒側の「範囲を自分で指定」はそのまま残る（指定の手間を消すだけ）。
function QuizRangeView() {
  const [cohort, setCohort] = useState("default");
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = async (c: string) => {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const data = await callAPI(`/api/teacher?action=getQuizRange&cohort=${encodeURIComponent(c)}`);
      const row = data?.row ?? null;
      if (row) {
        setLabel(row.label ?? "");
        setFrom(String(row.range_from ?? ""));
        setTo(String(row.range_to ?? ""));
        setDueDate(row.due_date ?? "");
        setNote(row.note ?? "");
        setActive(row.active !== false);
        setUpdatedAt(row.updated_at ?? null);
      } else {
        setLabel("");
        setFrom("");
        setTo("");
        setDueDate("");
        setNote("");
        setActive(true);
        setUpdatedAt(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(cohort);
  }, [cohort]);

  const save = async (nextActive: boolean) => {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { action: "setQuizRange", cohort, active: nextActive };
      if (nextActive) {
        body.from = Number(from);
        body.to = Number(to);
        body.label = label;
        body.dueDate = dueDate;
        body.note = note;
      }
      const data = await callAPI("/api/teacher", body);
      setActive(nextActive);
      setUpdatedAt(data?.row?.updated_at ?? null);
      setMsg(nextActive ? "保存しました。生徒のホームに出ます。" : "取り下げました。生徒のホームから消えます。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const valid = Number.isInteger(Number(from)) && Number.isInteger(Number(to)) && Number(from) >= 1 && Number(to) >= Number(from);

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-800 mb-1">📌 小テスト範囲</h2>
      <p className="text-sm text-slate-600 mb-5">
        ここで1回設定すると、その生徒のホーム最上段に「小テスト・あと3日／101〜150」が出ます。
        押すとその範囲で今日の分が始まります。生徒が自分で範囲を指定することもできます（今までどおり）。
      </p>

      <div className="grid grid-cols-2 gap-4">
        <label className="block col-span-2">
          <span className="text-sm font-bold text-slate-700">コホート</span>
          <input
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            placeholder="default"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
          <span className="text-xs text-slate-500">default = 全員。クラス別に配るなら 2A-2026 など</span>
        </label>

        <label className="block col-span-2">
          <span className="text-sm font-bold text-slate-700">名前</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="金曜の小テスト"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">範囲（から）</span>
          <input
            type="number"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="101"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">範囲（まで）</span>
          <input
            type="number"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="150"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-slate-700">実施日（任意）</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
          <span className="text-xs text-slate-500">入れると「あと3日」が出ます</span>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">ひとこと（任意）</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="敬語を中心に"
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
          />
        </label>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={() => void save(true)}
          disabled={loading || !valid}
          className="px-4 py-2 rounded bg-blue-600 text-white font-bold disabled:opacity-50"
        >
          保存して生徒に出す
        </button>
        {active && updatedAt && (
          <button
            onClick={() => void save(false)}
            disabled={loading}
            className="px-4 py-2 rounded border border-slate-300 text-slate-700 disabled:opacity-50"
          >
            取り下げる
          </button>
        )}
        {loading && <span className="text-sm text-slate-500">通信中…</span>}
      </div>

      {!valid && (from !== "" || to !== "") && (
        <p className="text-sm text-amber-700 mt-3">範囲は「から ≦ まで」の整数で入れてください。</p>
      )}
      {msg && <p className="text-sm text-green-700 mt-3">{msg}</p>}
      {err && <p className="text-sm text-red-700 mt-3">エラー: {err}</p>}
      {updatedAt && (
        <p className="text-xs text-slate-500 mt-4">
          最終更新: {new Date(updatedAt).toLocaleString("ja-JP")}／状態: {active ? "生徒に出ている" : "取り下げ済み"}
        </p>
      )}
    </div>
  );
}

function DiagnosticPanel({ cohort }: { cohort: string }) {
  const [rows, setRows] = useState<Array<{ slug: string; published: boolean; cohort?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullAccess, setFullAccess] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('kobun:full-access') === '1'
  );
  const [browserCohort, setBrowserCohort] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('kobun:cohort') ?? 'default' : 'default'
  );

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callAPI(`/api/textPublications?cohort=${encodeURIComponent(cohort)}`);
      setRows(data.rows || []);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [cohort]);

  const clearFullAccess = () => {
    localStorage.removeItem('kobun:full-access');
    setFullAccess(false);
  };

  const setCohortDefault = () => {
    localStorage.removeItem('kobun:cohort');
    setBrowserCohort('default');
  };

  const setCohortToCurrent = () => {
    if (cohort === 'default') {
      localStorage.removeItem('kobun:cohort');
    } else {
      localStorage.setItem('kobun:cohort', cohort);
    }
    setBrowserCohort(cohort);
  };

  const publishedCount = rows.filter((r) => r.published).length;
  const totalRows = rows.length;
  const isMatch = browserCohort === cohort;

  return (
    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-300 rounded">
      <div className="text-sm font-bold text-yellow-900 mb-2">🔍 診断パネル（生徒画面と DB の状態）</div>
      <div className="text-xs space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-700">📱 このブラウザの cohort:</span>
          <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">
            {browserCohort}
          </code>
          {!isMatch && (
            <button
              onClick={setCohortToCurrent}
              className="text-[11px] px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              編集中の {cohort} に切替
            </button>
          )}
          {browserCohort !== 'default' && (
            <button
              onClick={setCohortDefault}
              className="text-[11px] px-2 py-0.5 bg-slate-500 text-white rounded hover:bg-slate-600"
            >
              default に戻す
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-700">🔓 fullAccess (全公開フラグ):</span>
          <code className={`px-1.5 py-0.5 rounded font-mono ${fullAccess ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {fullAccess ? '有効 ⚠️' : '無効 ✓'}
          </code>
          {fullAccess && (
            <button
              onClick={clearFullAccess}
              className="text-[11px] px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-700"
            >
              無効化する（cohort フィルタを効かせる）
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-700">🗄️ DB (cohort={cohort}):</span>
          {error ? (
            <span className="text-red-700 font-mono">エラー: {error}</span>
          ) : loading ? (
            <span className="text-slate-500">読み込み中…</span>
          ) : (
            <>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                公開 {publishedCount} / 全 {totalRows} 件
              </code>
              {totalRows === 0 && (
                <span className="text-amber-700 text-[11px]">
                  ⚠️ この cohort の行がまだ DB にありません。教材を ON すると登録されます。
                </span>
              )}
            </>
          )}
          <button
            onClick={refresh}
            className="text-[11px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 ml-auto"
          >
            🔄 再取得
          </button>
        </div>

        {fullAccess && (
          <div className="mt-2 p-2 bg-red-50 border-l-4 border-red-400 text-red-800 text-[11px]">
            <strong>fullAccess が有効</strong>のため、cohort 設定に関係なく <strong>全教材が表示</strong>されます。
            これが「公開設定が効かない」原因の最有力候補です。上のボタンで無効化してください。
          </div>
        )}
        {error && error.includes('schema cache') && (
          <div className="mt-2 p-2 bg-orange-50 border-l-4 border-orange-400 text-orange-800 text-[11px]">
            <strong>スキーマキャッシュが古い</strong>状態です。Supabase Dashboard の SQL Editor で
            <code className="bg-white border border-orange-300 px-1 rounded mx-1">notify pgrst, 'reload schema';</code>
            を実行してください。
          </div>
        )}
      </div>
    </div>
  );
}

function CohortUrlList({ cohorts }: { cohorts: string[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const buildUrl = (c: string) =>
    c === 'default' ? `${origin}/` : `${origin}/?cohort=${encodeURIComponent(c)}`;

  const onCopy = async (c: string) => {
    const url = buildUrl(c);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(c);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard 利用不可 (HTTPS でない / 旧ブラウザ) → fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(c);
      setTimeout(() => setCopied(null), 1500);
    }
  };

  return (
    <div className="mb-3 p-3 bg-slate-50 rounded border border-slate-200">
      <div className="text-sm font-bold text-slate-800 mb-2">
        🔗 生徒に配る URL ({cohorts.length} 件)
      </div>
      <div className="space-y-1.5">
        {cohorts.map((c) => {
          const url = buildUrl(c);
          const isCopied = copied === c;
          return (
            <div
              key={c}
              className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1.5"
            >
              <span className="text-xs font-mono font-bold text-indigo-700 w-24 truncate shrink-0">
                {c}
              </span>
              <code className="text-xs text-slate-700 flex-1 truncate">{url}</code>
              <button
                type="button"
                onClick={() => onCopy(c)}
                className={`text-xs px-2 py-1 rounded shrink-0 transition-colors ${
                  isCopied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                {isCopied ? '✓ コピーしました' : '📋 コピー'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] text-slate-500 mt-2">
        生徒がこの URL を踏むとブラウザに cohort 情報が保存され、以後はその cohort の公開教材だけが見えます。
        <code className="bg-white px-1 rounded">default</code> は全員共通の URL。
      </div>
    </div>
  );
}

function TextsManageView() {
  const [index, setIndex] = useState<TextEntry[]>([]);
  const [publishedMap, setPublishedMap] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [queryFilter, setQueryFilter] = useState("");
  const [showOnly, setShowOnly] = useState<"all" | "published" | "unpublished">("all");
  const [genreFilter, setGenreFilter] = useState<string>("");
  const [eraFilter, setEraFilter] = useState<string>("");
  // 編集対象の cohort (学年・学校・クラス別教材セット)
  const [cohort, setCohort] = useState<string>("default");
  // すでに使われている cohort 一覧 (DB から取得した distinct)
  const [cohortOptions, setCohortOptions] = useState<string[]>(["default"]);

  useEffect(() => {
    setIndex(bundledTextsIndex as TextEntry[]);
  }, []);

  // cohort が変わるたびに publishedMap を再ロード
  useEffect(() => {
    (async () => {
      try {
        const pubs = await callAPI(`/api/textPublications?cohort=${encodeURIComponent(cohort)}`);
        const m: Record<string, boolean> = {};
        for (const row of pubs.rows || []) {
          m[row.slug] = !!row.published;
        }
        setPublishedMap(m);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [cohort]);

  // 起動時に cohort 一覧を取得 (全 row から distinct cohort)
  useEffect(() => {
    (async () => {
      try {
        const pubs = await callAPI("/api/textPublications");
        const set = new Set<string>(["default"]);
        for (const row of pubs.rows || []) {
          if (row.cohort) set.add(row.cohort);
        }
        setCohortOptions(Array.from(set).sort());
      } catch {
        /* noop */
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
        cohort,
      });
      setPublishedMap((m) => ({ ...m, [t.slug]: nextPublished }));
    } catch (e: any) {
      alert(`エラー: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const bulkSet = async (filterFn: (t: TextEntry) => boolean, publish: boolean) => {
    if (!confirm(`対象 ${index.filter(filterFn).length} 件を cohort=${cohort} に${publish ? "公開" : "非公開"}にします`)) return;
    for (const t of index.filter(filterFn)) {
      setBusy(t.slug);
      try {
        await callAPI("/api/textPublications", {
          slug: t.slug,
          published: publish,
          title: t.title,
          cohort,
        });
      } catch (e: any) {
        console.warn(`${t.slug}: ${e.message}`);
      }
    }
    // Refresh
    const pubs = await callAPI(`/api/textPublications?cohort=${encodeURIComponent(cohort)}`);
    const m: Record<string, boolean> = {};
    for (const row of pubs.rows || []) m[row.slug] = !!row.published;
    setPublishedMap(m);
    setBusy(null);
  };

  const onAddCohort = () => {
    const name = window.prompt('新しい cohort 名 (例: 2A-2026, 高1甲府, kobun-pilot)');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!cohortOptions.includes(trimmed)) {
      setCohortOptions((arr) => Array.from(new Set([...arr, trimmed])).sort());
    }
    setCohort(trimmed);
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
          デフォルトは<strong>非公開</strong>。公開したい教材のみ ON にすると、
          選択中の cohort の生徒に表示されます。
          <br />
          生徒側は URL に <code className="bg-slate-100 px-1 rounded">?cohort=&lt;名前&gt;</code> を踏めば
          そのコホートの公開セットを見られます。<code>default</code> は全員共通公開。
        </p>
        {/* cohort セレクタ + 編集対象切替 */}
        <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-indigo-50 rounded border border-indigo-200">
          <span className="text-sm font-bold text-indigo-900">編集中の cohort:</span>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="px-2 py-1 border rounded text-sm font-mono"
          >
            {cohortOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAddCohort}
            className="text-xs px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            ＋ 新規 cohort
          </button>
        </div>

        {/* 診断パネル: 生徒側の見え方をトラブルシュートする */}
        <DiagnosticPanel cohort={cohort} />

        {/* 全 cohort の生徒 URL コピー一覧 */}
        <CohortUrlList cohorts={cohortOptions} />
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
            まだデータがありません。生徒の記述解答が累積されたら「候補を集計」を実行してください。
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

// === 段位プレビュー — 21 階位の水彩肖像 + 部位構成を一覧表示 ===
// 教員が「生徒が段位上昇したらどんな画像/位階が表示されるか」を事前確認するための画面。
function NoblePreviewView() {
  const [tierFilter, setTierFilter] = useState<Tier | 'all'>('all');
  const [showCharts, setShowCharts] = useState(false);

  const filteredStages = tierFilter === 'all'
    ? STAGES
    : STAGES.filter((s) => s.era === tierFilter);

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">段位プレビュー (二十一階)</h3>
          <p className="text-xs text-slate-500 mt-1">
            生徒が段位上昇したときに表示される水彩肖像と装束構成を一覧確認できます。
            昇進は単語330語の★（0〜12）の合計点で決まります（最大3960点）。
          </p>
        </div>
        <button
          onClick={() => setShowCharts((v) => !v)}
          className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded hover:bg-slate-50"
        >
          {showCharts ? '装束図解を畳む' : '装束図解 (5部位)'}
        </button>
      </div>

      <div className="flex gap-2 mb-4 text-xs">
        {(['all', '地下', '殿上人', '公卿', '極位'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTierFilter(t)}
            className="px-3 py-1.5 font-bold rounded border transition"
            style={{
              background: tierFilter === t ? '#1e293b' : '#fff',
              color: tierFilter === t ? '#fff' : '#475569',
              borderColor: tierFilter === t ? '#1e293b' : '#cbd5e1',
            }}
          >
            {t === 'all' ? '全て' : t}
          </button>
        ))}
      </div>

      {showCharts && (
        <div className="mb-5 grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-slate-50 rounded">
          {PART_CHARTS.map((c) => (
            <div key={c.key} className="bg-white border border-slate-200 rounded overflow-hidden">
              <img src={c.thumb} alt={c.label} loading="lazy" decoding="async" style={{ display: 'block', width: '100%', height: 'auto' }} />
              <div className="px-2 py-1.5 text-[10px] text-slate-600 text-center">
                {c.label} <span className="text-slate-400 ml-1">全 {c.cap} 段</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredStages.map((s) => {
          const portrait = portraitForStage(s.n);
          const tone = TIER_TONE[s.era];
          return (
            <div
              key={s.n}
              className="border rounded-lg overflow-hidden bg-white flex"
              style={{ borderColor: s.apex ? '#b08841' : '#e2e8f0' }}
            >
              <div
                className="shrink-0 relative overflow-hidden"
                style={{ width: 96, height: 132, background: '#f6efe0', borderRight: '1px solid #e2e8f0' }}
              >
                <img
                  src={portrait.src}
                  alt={portrait.label}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: `${portrait.focusX}% ${portrait.focusY}%`,
                  }}
                />
                <div
                  className="absolute top-1 left-1 text-[10px] font-black px-1.5 py-0.5 rounded"
                  style={{ background: '#1e293b', color: '#fff' }}
                >
                  第{s.n}階
                </div>
                {s.milestone && (
                  <div
                    className="absolute bottom-1 left-1 text-[9px] font-black px-1.5 py-0.5 rounded text-white"
                    style={{ background: s.apex ? '#b08841' : '#b8423a' }}
                  >
                    {s.apex ? '👑 極位' : '★ ' + s.milestone + 'デビュー'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 p-2.5">
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span
                    className="text-[9px] font-black px-1.5 py-0.5 border rounded"
                    style={{ color: tone.fg, borderColor: tone.fg }}
                  >
                    {s.era}
                  </span>
                  <span className="text-base font-black" style={{ fontFamily: '"Noto Serif JP", serif' }}>
                    {s.rank}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-slate-500">
                    {STAGE_MIN_SCORE[s.n - 1]}点〜
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mb-2 truncate" title={s.post}>
                  {s.post}
                </div>
                <table className="w-full text-[10px] text-slate-700">
                  <tbody>
                    {[
                      ['頭', s.display.head, s.head, 7],
                      ['袍', s.display.robe, s.robe, 9],
                      ['裾', s.display.train, s.train, 5],
                      ['持', s.display.item, s.item, 5],
                      ['帯', s.display.belt, s.belt, 5],
                    ].map(([label, name, lv, cap]) => (
                      <tr key={String(label)} className="border-t border-slate-100">
                        <td className="py-0.5 pr-1 text-slate-400 w-6">{label}</td>
                        <td className="py-0.5 truncate" title={String(name)}>{name}</td>
                        <td className="py-0.5 text-right text-slate-400 font-mono w-12">
                          {label === '袍' && (
                            <span
                              className="inline-block w-2 h-2 mr-1 rounded-sm align-middle"
                              style={{ background: robeColorOf(String(name)), border: '1px solid #ccc' }}
                            />
                          )}
                          {lv}/{cap}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-bold text-slate-800 mb-2">
          {PORTRAITS.length} 幅の水彩 (各 portrait の担当ステージ範囲)
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {PORTRAITS.map((p, i) => (
            <div key={i} className="border border-slate-200 rounded overflow-hidden bg-white">
              <img
                src={p.thumb}
                loading="lazy"
                decoding="async"
                alt={p.label}
                draggable={false}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 100,
                  objectFit: 'cover',
                  objectPosition: `${p.focusX}% ${p.focusY}%`,
                }}
              />
              <div className="px-2 py-1.5 text-[10px]">
                <div className="font-bold text-slate-800">第{i + 1}幅 ・ {p.label}</div>
                <div className="text-slate-500 mt-0.5">第{p.fromN}–{p.toN}階</div>
                <div className="text-slate-600 mt-1 leading-tight">{p.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- 利用状況（scripts/usage-report.mjs のダッシュボードを教員画面に埋め込む） ------------
//
// API（action=usageData）は生行だけ返す。語・ドリルの見出しはバンドル済み JSON から引き、
// ローカル版と同じ D を組み立ててテンプレートに埋め込み、sandbox 付き iframe（srcdoc）で表示する。
// 既定は直近1年。全期間は再取得（行数が増えるので少し重い）。
type UsagePeriod = "1y" | "all";

function buildUsageHtml(raw: any): string {
  const wordLabels: Record<string, string> = {};
  for (const q of bundledKobunQ as any[]) wordLabels[q.qid] = `${q.lemma}（${q.senseNorm ?? q.sense ?? ""}）`;
  const drillTopics: Record<string, string> = {};
  for (const [id, topic] of raw.drills as [string, string][]) drillTopics[id] = topic;
  const published = new Set<string>(raw.publishedSlugs ?? []);
  const titles = (bundledTextsV3Index as any[])
    .filter((t) => published.has(t.id))
    .map((t) => ({ title: t.title, source: t.source }));
  const D = {
    generatedAt: raw.generatedAt,
    today: raw.today,
    users: raw.users,
    ws: raw.ws,
    srs: raw.srs,
    prog: raw.prog,
    wordLabels,
    drillLabels: {}, // 設問文は API から返さない（見出しは topic で足りる）
    drillTopics,
    wordTotal: (bundledKobunQ as any[]).length,
    drillTotal: raw.drills.length,
    topicTotal: new Set(Object.values(drillTopics)).size,
    registered: raw.registered,
    piiDecrypted: raw.piiDecrypted,
    schools: raw.schools,
    publications: { cohorts: raw.publicationCohorts ?? [], titles },
  };
  const aggSrc = usageAggregateSrc.replace(/^export .*$/m, "");
  // JSON を <script> に埋めるので "</" を壊して script 終端の誤検出を防ぐ
  const json = JSON.stringify(D).replace(/<\//g, "<\\/");
  return usageTemplate.replace("/*__DATA__*/null", json).replace("/*__AGG__*/", aggSrc);
}

function UsageCumulativeView() {
  const [period, setPeriod] = useState<UsagePeriod>("1y");
  const [html, setHtml] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ from: string | null; rows: number; users: number; generatedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (p: UsagePeriod) => {
    setLoading(true);
    setErr(null);
    try {
      const raw = await callAPI(`/api/teacher?action=usageData&from=${p === "all" ? "all" : ""}`);
      setHtml(buildUsageHtml(raw));
      setMeta({ from: raw.from, rows: raw.ws.length + raw.srs.length + raw.prog.length, users: raw.users.length, generatedAt: raw.generatedAt });
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  return (
    <div className="p-2 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
        <span className="font-medium text-slate-700">読み込む範囲</span>
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          {(["1y", "all"] as UsagePeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              disabled={loading}
              className={`px-4 py-2 sm:px-3 sm:py-1.5 ${period === p ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {p === "1y" ? "直近1年" : "全期間"}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load(period)}
          disabled={loading}
          className="px-4 py-2 sm:px-3 sm:py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          再読み込み
        </button>
        {meta && (
          <span className="text-slate-500 basis-full sm:basis-auto">
            {meta.from ? `${meta.from} 以降` : "全期間"}・{meta.users.toLocaleString("ja-JP")} 人・{meta.rows.toLocaleString("ja-JP")} 行
            （取得 {new Date(meta.generatedAt).toLocaleString("ja-JP")}）。細かい期間はページ内の「期間」で絞れます。
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        個人の表示は学校コード（KU=県立浦和・UW=浦和西）と年-組-番号だけ。未登録の生徒は匿名 ID の先頭 8 桁。
      </p>
      {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{err}</div>}
      {loading && <div className="text-slate-500 text-sm">読み込み中…</div>}
      {html && (
        <iframe
          title="古文単 利用状況"
          srcDoc={html}
          sandbox="allow-scripts"
          className="w-full rounded-lg border border-slate-200 bg-white"
          style={{ height: "calc(100dvh - 6rem)", minHeight: 460 }}
        />
      )}
    </div>
  );
}

// ---- 利用状況（2026-11-10 組み直し。設計 = docs/learning-events-design.md §10.5） ----------
//
// 上から 絞り込み → 概況 → 何でつまずいているか → 誰が使っているか（クラス別・生徒別と範囲）→ 教材別。
// 集計は learning_events（2026-10-05 記録開始）を DB 関数で行い、選んだ期間の回答だけで数える。
// 対象は登録済みの生徒だけ。個人の表示は学校コード＋年-組-番号だけ。
// 使っていないことは「身についていない」ことを意味しないので、未利用の強調や順位づけはしない。
const AREA_LABEL: Record<string, string> = { vocab: "単語", text: "教材（読解）", grammar: "文法道場" };
const AREA_ORDER = ["vocab", "text", "grammar"];
const LOG_START = "2026-10-05"; // learning_events の記録開始日（JST）

/** JST の今日から n 日ずらした "YYYY-MM-DD" */
const jstDayShift = (n: number) => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const fmtN = (n: number | null | undefined) => (n ?? 0).toLocaleString("ja-JP");
const jstShort = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ") : "";

function usagePersonLabel(x: any): string {
  if (!x) return "";
  const klass = x.cls && x.num ? `${x.grade ? x.grade + "-" : ""}${x.cls}-${x.num}` : "";
  return x.school ? `${x.school} ${klass}`.trim() : x.id;
}

/** 番号帯の先頭（1, 51, 101, …）の並びを「1〜100・201〜250」の形にまとめる */
function usageBandSpan(bands: number[]): string {
  const sorted = [...new Set(bands)].sort((a, b) => a - b);
  const out: string[] = [];
  let lo: number | null = null;
  let hi = 0;
  for (const b of sorted) {
    if (lo !== null && b === hi + 1) hi = b + 49;
    else {
      if (lo !== null) out.push(`${lo}〜${hi}`);
      lo = b;
      hi = b + 49;
    }
  }
  if (lo !== null) out.push(`${lo}〜${hi}`);
  return out.join("・");
}

const usageWordInfo: Record<string, { lemma: string; sense: string }> = {};
for (const q of bundledKobunQ as any[]) usageWordInfo[q.qid] = { lemma: q.lemma, sense: q.senseNorm ?? q.sense ?? "" };
const usageWordLabel = (qid: string) => {
  const w = usageWordInfo[qid];
  return w ? `${w.lemma}（${w.sense}）` : qid;
};

type StumbleKind = "word" | "topic" | "drill";
type StumbleSort = "repeat" | "people" | "first";
const U_TH = "px-2 py-1.5 text-left font-medium text-slate-600 whitespace-nowrap";
const U_TD = "px-2 py-1.5 whitespace-nowrap";
const U_TDW = "px-2 py-1.5";
const U_TDN = "px-2 py-1.5 text-right tabular-nums whitespace-nowrap";
const U_BTN = "px-4 py-2 sm:px-3 sm:py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const U_SEL = "border border-slate-300 rounded px-2 py-1 bg-white";

function UsageView() {
  const [from, setFrom] = useState<string>(jstDayShift(-29));
  const [to, setTo] = useState<string>(jstDayShift(0));
  const [school, setSchool] = useState<string>("");
  const [grade, setGrade] = useState<string>("");
  const [cls, setCls] = useState<string>("");
  const [data, setData] = useState<any | null>(null);
  const [stumbles, setStumbles] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [topicTitles, setTopicTitles] = useState<Record<string, string>>({});
  const [showOld, setShowOld] = useState(false);

  const query = (f: string, t: string, s: string, g: string, c: string) =>
    `from=${f}&to=${t}${s ? `&school=${s}` : ""}${g ? `&grade=${g}` : ""}${c ? `&cls=${c}` : ""}`;
  const [loadedQuery, setLoadedQuery] = useState<string>("");

  const load = async (f: string, t: string, s: string, g: string, c: string) => {
    setLoading(true);
    setErr(null);
    const q = query(f, t, s, g, c);
    try {
      const [a, st] = await Promise.all([
        callAPI(`/api/teacher?action=usageAreas&${q}`),
        callAPI(`/api/teacher?action=usageStumbles&${q}`),
      ]);
      setData(a);
      setStumbles(st);
      setLoadedQuery(q);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(from, to, school, grade, cls);
  }, []);

  // 文法の単元の題（集計に出てきた単元だけ、アプリの単元データから引く）
  useEffect(() => {
    const ids = new Set<string>();
    for (const t of stumbles?.topics ?? []) ids.add(t.id);
    for (const d of stumbles?.drills ?? []) if (d.topic) ids.add(d.topic);
    for (const r of data?.ranges?.grammar ?? []) ids.add(r.topic);
    const need = [...ids].filter((id) => !(id in topicTitles));
    if (!need.length) return;
    let cancelled = false;
    void Promise.all(
      need.map(async (id) => {
        try {
          const r = await fetch(`/grammar/${encodeURIComponent(id)}.json`);
          const j = r.ok ? await r.json() : null;
          return [id, typeof j?.title === "string" ? j.title : id] as [string, string];
        } catch {
          return [id, id] as [string, string];
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setTopicTitles((m) => ({ ...m, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [data, stumbles]);

  const preset = (f: string) => {
    const t = jstDayShift(0);
    setFrom(f);
    setTo(t);
    void load(f, t, school, grade, cls);
  };
  const pick = (s: string, g: string, c: string) => {
    setSchool(s);
    setGrade(g);
    setCls(c);
    void load(from, to, s, g, c);
  };

  const roster = (data?.roster ?? []) as Array<{ school: string; grade: number | null; cls: number | null; registered: number }>;
  const schools = [...new Set(roster.map((r) => r.school))];
  const inSchool = roster.filter((r) => !school || r.school === school);
  const grades = [...new Set(inSchool.map((r) => r.grade).filter((x): x is number => x != null))].sort((a, b) => a - b);
  const classes = [
    ...new Set(inSchool.filter((r) => !grade || r.grade === Number(grade)).map((r) => r.cls).filter((x): x is number => x != null)),
  ].sort((a, b) => a - b);

  const areas: Record<string, any> = {};
  for (const a of data?.areas ?? []) areas[a.area] = a;
  const ov = data?.overlap ?? {};
  const scope = [school, grade ? `${grade}年` : "", cls ? `${cls}組` : ""].filter(Boolean).join(" ") || "登録済みの全員";

  return (
    <div className="p-2 sm:p-4 space-y-6 text-sm">
      {/* 絞り込み */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="font-medium text-slate-700">期間</span>
          {(
            [
              ["直近7日", jstDayShift(-6)],
              ["直近30日", jstDayShift(-29)],
              ["記録開始から", LOG_START],
            ] as [string, string][]
          ).map(([label, f]) => (
            <button
              key={label}
              onClick={() => preset(f)}
              disabled={loading}
              className={`px-4 py-2 sm:px-3 sm:py-1.5 rounded-lg border disabled:opacity-50 ${
                from === f && to === jstDayShift(0)
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
          <input type="date" value={from} min={LOG_START} onChange={(e) => setFrom(e.target.value)} className={U_SEL} aria-label="開始日" />
          <span>〜</span>
          <input type="date" value={to} min={LOG_START} onChange={(e) => setTo(e.target.value)} className={U_SEL} aria-label="終了日" />
          <button
            onClick={() => void load(from, to, school, grade, cls)}
            disabled={loading || !from || !to}
            className="px-4 py-2 sm:px-3 sm:py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            表示
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="font-medium text-slate-700">対象</span>
          {schools.length > 1 && (
            <select value={school} onChange={(e) => pick(e.target.value, "", "")} disabled={loading} className={U_SEL} aria-label="学校">
              <option value="">すべての学校</option>
              {schools.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <select value={grade} onChange={(e) => pick(school, e.target.value, "")} disabled={loading || !grades.length} className={U_SEL} aria-label="学年">
            <option value="">すべての学年</option>
            {grades.map((g) => (
              <option key={g} value={g}>{g}年</option>
            ))}
          </select>
          <select value={cls} onChange={(e) => pick(school, grade, e.target.value)} disabled={loading || !classes.length} className={U_SEL} aria-label="組">
            <option value="">すべての組</option>
            {classes.map((c) => (
              <option key={c} value={c}>{c}組</option>
            ))}
          </select>
          {data && (
            <span className="text-slate-500 basis-full sm:basis-auto">
              {data.from ?? "…"} 〜 {data.to ?? "…"}・{scope}（登録 {fmtN(data.registered)} 人）・取得 {new Date(data.generatedAt).toLocaleString("ja-JP")}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          登録済みの生徒の記録を、選んだ期間の分だけ集計しています（記録の開始は {LOG_START}。それより前や期間の外の回答は、誤答の計算に入れていません）。
          個人の表示は学校コード（KU=県立浦和・UW=浦和西）と年-組-番号だけです。
        </p>
        {data && data.piiDecrypted === false && (
          <p className="text-xs text-amber-700">プロフィールを復号できないため、年・組・番号を表示できません（学校だけで集計しています）。</p>
        )}
      </div>

      {err && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{err}</div>}
      {loading && <div className="text-slate-500">読み込み中…</div>}

      {data && stumbles && (
        <>
          {/* 概況 */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-slate-600">使った人</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {fmtN(ov.all)}
                <span className="text-sm font-normal text-slate-500"> ／ 登録 {fmtN(data.registered)} 人</span>
              </div>
            </div>
            {AREA_ORDER.map((ar) => {
              const a = areas[ar] ?? { users: 0, answers: 0, correct: 0 };
              return (
                <div key={ar} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-slate-600">{AREA_LABEL[ar]}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    {fmtN(a.users)}
                    <span className="text-sm font-normal text-slate-500"> 人</span>
                  </div>
                  <div className="text-slate-600 tabular-nums">
                    {ar === "text"
                      ? `開かれた教材 ${fmtN((data.texts ?? []).length)} 本`
                      : `回答 ${fmtN(a.answers)}・正答率 ${pctOf(a.correct, a.answers)}`}
                  </div>
                </div>
              );
            })}
          </div>

          <UsageTrendChart data={data} />

          <UsageStumblesSection stumbles={stumbles} query={loadedQuery} topicTitles={topicTitles} />
          <UsagePeopleSection data={data} topicTitles={topicTitles} showClasses={!cls} />
          <UsageTextsSection data={data} />
        </>
      )}

      <section className="border-t border-slate-200 pt-3">
        <button onClick={() => setShowOld((v) => !v)} className="text-slate-600 underline">
          {showOld ? "▾" : "▸"} 以前の累計表示（登録前の記録を含む・別集計）
        </button>
        {showOld && <UsageCumulativeView />}
      </section>
    </div>
  );
}

// ---- 日ごとの使った人（時系列） ------------------------------------------------------------
//
// 全体（その日に単語・文法・教材のどれかを使った人。重複なし＝migration 017）を太い線、領域別を細い線で描く。
// 記録の無い日は 0 人として線をつなぐ。数字は下の「日ごとの利用」の表でも読める。
const U_TREND = [
  { k: "all", label: "全体", color: "#334155", width: 2.5 },
  { k: "vocab", label: "単語", color: "#2563eb", width: 1.5 },
  { k: "grammar", label: "文法", color: "#059669", width: 1.5 },
  { k: "text", label: "教材", color: "#d97706", width: 1.5 },
] as const;
type TrendKey = (typeof U_TREND)[number]["k"];

function UsageTrendChart({ data }: { data: any }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setW(Math.max(280, el.clientWidth));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasAll = Array.isArray(data.dayUsers);
  const rows = useMemo(() => {
    const m = new Map<string, Record<TrendKey, number>>();
    const at = (day: string) => {
      let x = m.get(day);
      if (!x) m.set(day, (x = { all: 0, vocab: 0, grammar: 0, text: 0 }));
      return x;
    };
    for (const d of data.days ?? []) if (d.area in at(d.day)) at(d.day)[d.area as TrendKey] = d.users;
    for (const d of data.dayUsers ?? []) at(d.day).all = d.users;
    const keys = [...m.keys()].sort();
    const first = data.from ?? keys[0];
    const last = data.to ?? keys[keys.length - 1];
    if (!first || !last) return [];
    const out: Array<{ day: string } & Record<TrendKey, number>> = [];
    for (let t = Date.parse(first + "T00:00:00Z"), e = Date.parse(last + "T00:00:00Z"); t <= e && out.length < 800; t += 864e5) {
      const day = new Date(t).toISOString().slice(0, 10);
      out.push({ day, ...(m.get(day) ?? { all: 0, vocab: 0, grammar: 0, text: 0 }) });
    }
    return out;
  }, [data]);

  const series = U_TREND.filter((s) => s.k !== "all" || hasAll);
  const n = rows.length;
  if (!n) return null;

  const H = 200, padL = 34, padR = 12, padT = 10, padB = 22;
  const innerW = w - padL - padR, innerH = H - padT - padB;
  const peak = Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.k])));
  const rough = peak / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = Math.max(1, [1, 2, 5, 10].map((x) => x * mag).find((x) => x >= rough) ?? 10 * mag);
  const yMax = step * Math.ceil(peak / step);
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  const xStep = Math.max(1, Math.ceil(n / (w < 480 ? 5 : 10)));
  const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  const wd = (day: string) => "日月火水木金土"[new Date(day + "T00:00:00Z").getUTCDay()];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = n === 1 ? 0 : Math.round(((e.clientX - r.left - padL) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const main: TrendKey = hasAll ? "all" : "vocab";
  const total = rows.reduce((s, r) => s + r[main], 0);
  const top = rows.reduce((a, r) => (r[main] > a[main] ? r : a), rows[0]);
  const h = hover != null ? rows[hover] : null;

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 mb-1">日ごとの使った人（時系列）</h3>
      <p className="text-xs text-slate-500 mb-2">
        {hasAll
          ? `「全体」は、その日に単語・文法・教材のどれかを使った人（同じ人は1人と数えます）。1日あたり平均 ${
              Math.round((total / n) * 10) / 10
            } 人、最も多い日は ${md(top.day)}（${wd(top.day)}）の ${fmtN(top.all)} 人。`
          : "領域ごとの、その日に使った人です。"}
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700 min-h-[1.5rem] tabular-nums">
          <span className="font-medium">{h ? `${md(h.day)}（${wd(h.day)}）` : "凡例"}</span>
          {series.map((s) => (
            <span key={s.k} className="inline-flex items-center gap-1">
              <span className="inline-block w-3 rounded-full" style={{ height: s.k === "all" ? 4 : 3, background: s.color }} />
              {s.label}
              {h && <span className="font-semibold">{fmtN(h[s.k])} 人</span>}
            </span>
          ))}
          {!h && <span className="text-xs text-slate-500">グラフに触れると、その日の人数が出ます</span>}
        </div>
        <div ref={boxRef} className="mt-1">
          <svg
            width={w}
            height={H}
            role="img"
            aria-label="日ごとの使った人の折れ線グラフ"
            style={{ touchAction: "pan-y", display: "block" }}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={(e) => { if (e.pointerType === "mouse") setHover(null); }}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#94a3b8" : "#e2e8f0"} strokeWidth={1} />
                <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">{v}</text>
              </g>
            ))}
            {rows.map((r, i) =>
              i % xStep === 0 && (i === 0 || n - 1 - i >= xStep / 2 || i === n - 1) ? (
                <text key={r.day} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "middle"} fontSize={11} fill="#64748b">{md(r.day)}</text>
              ) : null,
            )}
            {h && hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="#94a3b8" strokeWidth={1} />}
            {[...series].reverse().map((s) => (
              <polyline
                key={s.k}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={rows.map((r, i) => `${x(i).toFixed(1)},${y(r[s.k]).toFixed(1)}`).join(" ")}
              />
            ))}
            {n === 1 && series.map((s) => <circle key={s.k} cx={x(0)} cy={y(rows[0][s.k])} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />)}
            {h && hover != null && n > 1 &&
              series.map((s) => <circle key={s.k} cx={x(hover)} cy={y(h[s.k])} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />)}
          </svg>
        </div>
      </div>
    </section>
  );
}

// ---- 何でつまずいているか --------------------------------------------------------------

function UsageStumblesSection({ stumbles, query, topicTitles }: { stumbles: any; query: string; topicTitles: Record<string, string> }) {
  const [kind, setKind] = useState<StumbleKind>("word");
  const [sort, setSort] = useState<StumbleSort>("repeat");
  const [limit, setLimit] = useState(20);
  const [open, setOpen] = useState<string | null>(null);
  const [who, setWho] = useState<Record<string, any[] | "loading" | "error">>({});

  useEffect(() => {
    setOpen(null);
    setWho({});
    setLimit(20);
  }, [query, kind]);

  const topicName = (id: string | null | undefined) => (id ? topicTitles[id] ?? id : "");
  // 単元にも人数の下限をかける（1人が1問だけ解いた単元が先頭に来ないように）
  const topics: any[] = useMemo(
    () => ((stumbles.topics ?? []) as any[]).filter((t) => t.users >= (stumbles.minUsers ?? 1) && t.n >= (stumbles.minN ?? 1)),
    [stumbles],
  );
  const rows: any[] = useMemo(() => {
    const src: any[] = kind === "word" ? stumbles.words ?? [] : kind === "drill" ? stumbles.drills ?? [] : topics;
    // 単元は「生徒×ドリル」の初回で見る。語・ドリルは人で見る
    const firstRate = (r: any) => (kind === "topic" ? r.firstWrong / (r.firstN || 1) : r.firstWrong / (r.users || 1));
    const peopleRate = (r: any) => r.wrongUsers / (r.users || 1);
    const key =
      kind === "topic"
        ? sort === "people"
          ? peopleRate
          : firstRate
        : sort === "repeat"
          ? (r: any) => r.repeatUsers + peopleRate(r) / 10
          : sort === "people"
            ? peopleRate
            : firstRate;
    return [...src].sort((a, b) => key(b) - key(a) || b.users - a.users);
  }, [stumbles, topics, kind, sort]);

  const toggle = async (id: string) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (who[id]) return;
    setWho((m) => ({ ...m, [id]: "loading" }));
    try {
      const r = await callAPI(`/api/teacher?action=usageStumbles&${query}&type=${kind}&id=${encodeURIComponent(id)}`);
      setWho((m) => ({ ...m, [id]: r.rows ?? [] }));
    } catch {
      setWho((m) => ({ ...m, [id]: "error" }));
    }
  };

  const tot = stumbles.totals ?? {};
  const answerText = (a: unknown) => (Array.isArray(a) ? a.join("／") : a == null ? "" : String(a));
  const cols = kind === "topic" ? 5 : 6;

  return (
    <section>
      <h3 className="text-base font-semibold text-slate-800 mb-1">何でつまずいているか</h3>
      <p className="text-xs text-slate-500 mb-2">
        誤答率だけでは「1人が何度も間違えた」のか「多くの人が間違えた」のかが分からないので、人数で数えています。
        「初回」は各生徒がこの期間に最初に解いた1回、「2回以上」は期間内に同じものを2回以上間違えた人です。
        「もう一度」の再出題は数えていません。回答 {fmtN(stumbles.minN)} 件・{fmtN(stumbles.minUsers)} 人に満たないものは出していません。
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          {(
            [
              ["word", `単語（${fmtN((stumbles.words ?? []).length)}）`],
              ["topic", `文法の単元（${fmtN(topics.length)}）`],
              ["drill", `文法の問題（${fmtN((stumbles.drills ?? []).length)}）`],
            ] as [StumbleKind, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-4 py-2 sm:px-3 sm:py-1.5 ${kind === k ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-600">
          並び
          <select value={kind === "topic" && sort === "repeat" ? "first" : sort} onChange={(e) => setSort(e.target.value as StumbleSort)} className={U_SEL}>
            {kind !== "topic" && <option value="repeat">2回以上間違えた人が多い順</option>}
            <option value="first">初回の誤答が多い順</option>
            <option value="people">間違えた人の割合が高い順</option>
          </select>
        </label>
        <span className="text-slate-500">
          {kind === "word"
            ? `単語の回答 ${fmtN(tot.word?.n)} 件・${fmtN(tot.word?.users)} 人`
            : `文法の回答 ${fmtN(tot.drill?.n)} 件・${fmtN(tot.drill?.users)} 人`}
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className={U_TH}>{kind === "word" ? "語（意味）" : kind === "topic" ? "単元" : "問題"}</th>
              <th className={`${U_TH} text-right`}>間違えた人／解いた人</th>
              <th className={`${U_TH} text-right`}>初回の誤答</th>
              {kind !== "topic" && <th className={`${U_TH} text-right`}>2回以上</th>}
              <th className={`${U_TH} text-right`}>回答（誤答率）</th>
              <th className={U_TH}>{kind === "topic" ? "解かれた問題" : "何と間違えたか（多い順）"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).flatMap((r) => {
              const info = kind === "drill" ? stumbles.drillInfo?.[r.id] : null;
              const out = [
                <tr key={r.id} onClick={() => void toggle(r.id)} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50 align-top">
                  <td className={U_TDW}>
                    {kind === "word" ? (
                      <>
                        <span className="text-slate-400 tabular-nums mr-1">{String(r.id).split("-")[0]}</span>
                        {usageWordLabel(r.id)}
                      </>
                    ) : kind === "topic" ? (
                      topicName(r.id)
                    ) : (
                      <>
                        <div className="text-xs text-slate-500">{topicName(r.topic)}</div>
                        <div className="max-w-md">{info ? `${info.context ? info.context + "　" : ""}${info.prompt}` : r.id}</div>
                        {info && <div className="text-xs text-slate-500">正解：{answerText(info.answer)}</div>}
                      </>
                    )}
                  </td>
                  <td className={U_TDN}>
                    {fmtN(r.wrongUsers)}／{fmtN(r.users)} 人
                    <span className="text-slate-500">（{pctOf(r.wrongUsers, r.users)}）</span>
                  </td>
                  <td className={U_TDN}>
                    {kind === "topic" ? pctOf(r.firstWrong, r.firstN) : `${fmtN(r.firstWrong)} 人（${pctOf(r.firstWrong, r.users)}）`}
                  </td>
                  {kind !== "topic" && <td className={`${U_TDN} ${r.repeatUsers ? "font-semibold" : "text-slate-400"}`}>{fmtN(r.repeatUsers)} 人</td>}
                  <td className={U_TDN}>
                    {fmtN(r.n)}
                    <span className="text-slate-500">（{pctOf(r.wrong, r.n)}）</span>
                  </td>
                  <td className={U_TDW}>
                    {kind === "topic"
                      ? `${fmtN(r.drills)} 問`
                      : (r.confused ?? []).length
                        ? (r.confused as any[]).map((c) => (
                            <div key={c.id}>
                              {kind === "word" ? usageWordLabel(c.id) : c.id}
                              <span className="text-slate-500"> {fmtN(c.users)} 人・{fmtN(c.n)} 回</span>
                            </div>
                          ))
                        : <span className="text-slate-400">—</span>}
                  </td>
                </tr>,
              ];
              if (open === r.id) {
                const w = who[r.id];
                out.push(
                  <tr key={`${r.id}-who`} className="bg-slate-50">
                    <td colSpan={cols} className="px-3 py-2">
                      {w === "loading" || !w ? (
                        <span className="text-slate-500">読み込み中…</span>
                      ) : w === "error" ? (
                        <span className="text-red-700">読み込めませんでした</span>
                      ) : (
                        <>
                          <div className="text-xs text-slate-500 mb-1">解いた生徒（誤答／回答）。間違いの多い順</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {w.map((p: any, i: number) => (
                              <span key={i} className={p.wrong ? "" : "text-slate-400"}>
                                {usagePersonLabel(p.who)} <span className="tabular-nums">{p.wrong}／{p.n}</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>,
                );
              }
              return out;
            })}
            {!rows.length && (
              <tr>
                <td className={U_TD} colSpan={cols}>この期間・対象では、出せるだけの回答がありません</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit((n) => n + 30)} className={`${U_BTN} mt-2`}>
          もっと見る（残り {fmtN(rows.length - limit)}）
        </button>
      )}
    </section>
  );
}

// ---- 誰が使っているか（クラス別・生徒別と範囲） --------------------------------------------

/** 横棒（value / max）。数字は必ず横に文字でも出すので、棒そのものは読み上げない */
function UsageBar({ value, max, color, className = "" }: { value: number; max: number; color: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`h-2 rounded-full bg-slate-200 overflow-hidden ${className}`} aria-hidden="true">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
const U_BAR = { used: "bg-slate-600", vocab: "bg-blue-600", grammar: "bg-emerald-600", text: "bg-amber-500" };

function UsagePeopleSection({ data, topicTitles, showClasses }: { data: any; topicTitles: Record<string, string>; showClasses: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const [order, setOrder] = useState<"class" | "last">("class");
  const [openClass, setOpenClass] = useState<string | null>(null);

  const titleOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of bundledTextsV3Index as any[]) m[t.id] = t.title;
    return m;
  }, []);

  const byUser = useMemo(() => {
    const m = new Map<number, { vocab: any[]; grammar: any[]; text: any[] }>();
    const at = (u: number) => {
      let x = m.get(u);
      if (!x) m.set(u, (x = { vocab: [], grammar: [], text: [] }));
      return x;
    };
    for (const r of data.ranges?.vocab ?? []) at(r.u).vocab.push(r);
    for (const r of data.ranges?.grammar ?? []) at(r.u).grammar.push(r);
    for (const r of data.ranges?.text ?? []) at(r.u).text.push(r);
    return m;
  }, [data]);

  const people = useMemo(() => {
    const list = ((data.people ?? []) as any[]).map((p) => ({ ...p, who: data.users[p.u] }));
    if (order === "last") return list; // API は最終利用の新しい順
    const k = (x: any) => [x?.school ?? "~", x?.grade ?? 99, x?.cls ?? 99, x?.num ?? 999] as const;
    return list.sort((a, b) => {
      const ka = k(a.who), kb = k(b.who);
      return String(ka[0]).localeCompare(String(kb[0])) || ka[1] - kb[1] || ka[2] - kb[2] || ka[3] - kb[3];
    });
  }, [data, order]);

  // クラス別（登録人数は roster、利用は生徒別の行から束ねる）
  const classRows = useMemo(() => {
    const f = data.filter ?? {};
    const rows = ((data.roster ?? []) as any[])
      .filter((r) => (!f.school || r.school === f.school) && (f.grade == null || r.grade === f.grade) && (f.cls == null || r.cls === f.cls))
      .map((r) => ({ ...r, used: 0, vocabU: 0, vocabAns: 0, vocabCorrect: 0, grammarU: 0, grammarAns: 0, grammarCorrect: 0, textU: 0 }));
    const find = (w: any) => rows.find((r) => r.school === w?.school && r.grade === (w?.grade ?? null) && r.cls === (w?.cls ?? null));
    for (const p of (data.people ?? []) as any[]) {
      const row = find(data.users[p.u]);
      if (!row) continue;
      row.used++;
      if (p.vocab) row.vocabU++;
      if (p.grammar) row.grammarU++;
      if (p.text) row.textU++;
      row.vocabAns += p.vocabAns ?? 0;
      row.vocabCorrect += p.vocabCorrect ?? 0;
      row.grammarAns += p.grammarAns ?? 0;
      row.grammarCorrect += p.grammarCorrect ?? 0;
    }
    return rows;
  }, [data]);

  const classLabel = (r: any) => `${r.school} ${r.grade != null && r.cls != null ? `${r.grade}-${r.cls}` : "（年・組なし）"}`;

  const peopleOf = (r: any) =>
    people.filter((p) => p.who?.school === r.school && (p.who?.grade ?? null) === r.grade && (p.who?.cls ?? null) === r.cls);

  // 生徒の表（生徒別と、クラスを押して開いたときの両方で使う）
  const studentTable = (list: any[]) => (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={U_TH}>生徒</th>
                <th className={`${U_TH} text-right`}>単語 回答（正答率）</th>
                <th className={U_TH}>単語の範囲（番号）</th>
                <th className={`${U_TH} text-right`}>文法 回答（正答率）</th>
                <th className={`${U_TH} text-right`}>文法の単元</th>
                <th className={`${U_TH} text-right`}>教材</th>
                <th className={`${U_TH} text-right`}>利用日数</th>
                <th className={U_TH}>最終</th>
              </tr>
            </thead>
            <tbody>
              {list.flatMap((p) => {
                const rg = byUser.get(p.u) ?? { vocab: [], grammar: [], text: [] };
                const words = rg.vocab.reduce((s: number, r: any) => s + r.words, 0);
                const out = [
                  <tr key={p.u} onClick={() => setOpen(open === p.u ? null : p.u)} className="border-t border-slate-100 cursor-pointer hover:bg-slate-50">
                    <td className={U_TD}>{usagePersonLabel(p.who)}</td>
                    <td className={U_TDN}>{p.vocabAns ? `${fmtN(p.vocabAns)}（${pctOf(p.vocabCorrect, p.vocabAns)}）` : "—"}</td>
                    <td className={U_TD}>
                      {rg.vocab.length ? (
                        <>
                          {usageBandSpan(rg.vocab.map((r: any) => r.band))}
                          <span className="text-slate-500">（{fmtN(words)} 項目）</span>
                        </>
                      ) : "—"}
                    </td>
                    <td className={U_TDN}>{p.grammarAns ? `${fmtN(p.grammarAns)}（${pctOf(p.grammarCorrect, p.grammarAns)}）` : "—"}</td>
                    <td className={U_TDN}>{rg.grammar.length ? `${fmtN(rg.grammar.length)} 単元` : "—"}</td>
                    <td className={U_TDN}>{rg.text.length ? `${fmtN(rg.text.length)} 本` : "—"}</td>
                    <td className={U_TDN}>{fmtN(p.days)}</td>
                    <td className={U_TD}>{jstShort(p.last)}</td>
                  </tr>,
                ];
                if (open === p.u) {
                  out.push(
                    <tr key={`${p.u}-range`} className="bg-slate-50">
                      <td colSpan={8} className="px-3 py-2 space-y-2">
                        <div>
                          <div className="text-xs text-slate-500">単語（番号帯ごと：回答・正答率・触れた項目数）</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {rg.vocab.length ? rg.vocab.map((r: any) => (
                              <span key={r.band}>
                                {r.band}〜{r.band + 49}
                                <span className="text-slate-500 tabular-nums"> {fmtN(r.n)} 回・{pctOf(r.correct, r.n)}・{fmtN(r.words)} 項目</span>
                              </span>
                            )) : <span className="text-slate-400">—</span>}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">文法（単元ごと：回答・正答率）</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {rg.grammar.length ? rg.grammar.map((r: any) => (
                              <span key={r.topic}>
                                {topicTitles[r.topic] ?? r.topic}
                                <span className="text-slate-500 tabular-nums"> {fmtN(r.n)} 回・{pctOf(r.correct, r.n)}</span>
                              </span>
                            )) : <span className="text-slate-400">—</span>}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">教材（本文を開いた回数・語の解説を開いた回数）</div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                            {rg.text.length ? rg.text.map((r: any) => (
                              <span key={r.slug}>
                                {titleOf[r.slug] ?? r.slug}
                                <span className="text-slate-500 tabular-nums"> {fmtN(r.views)} 回・解説 {fmtN(r.opens)}</span>
                              </span>
                            )) : <span className="text-slate-400">—</span>}
                          </div>
                        </div>
                      </td>
                    </tr>,
                  );
                }
                return out;
              })}
              {!list.length && (
                <tr>
                  <td className={U_TD} colSpan={8}>この期間・対象の記録はありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
  );

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800 mb-1">誰が、どの範囲を、どの程度やっているか</h3>
        <p className="text-xs text-slate-500">
          この期間にアプリで学習した量と範囲です。アプリを使っていないことは、身についていないことを意味しません。
        </p>
      </div>

      {showClasses && classRows.length > 1 && (
        <div>
          <h4 className="font-semibold text-slate-700 mb-1">クラス別</h4>
          <p className="text-xs text-slate-500 mb-1">
            「登録」はその組でアプリに登録している人数（在籍数ではありません）。「使った人」は期間中に単語・文法・教材のどれかを使った人。回答数は組の合計です。
            棒は、登録している人のうち何割が使ったかを表します。組を押すと、その組で使った生徒が開きます。
          </p>
          {/* スマホ：1組ずつ縦に並べる */}
          <div className="sm:hidden rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {classRows.map((r) => (
              <div key={classLabel(r)} className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => setOpenClass(openClass === classLabel(r) ? null : classLabel(r))}
                  aria-expanded={openClass === classLabel(r)}
                  className="w-full flex items-baseline justify-between gap-2 text-left py-1"
                >
                  <span className="font-semibold text-slate-800">
                    <span className="text-slate-400 mr-1">{openClass === classLabel(r) ? "▾" : "▸"}</span>
                    {classLabel(r)}
                  </span>
                  <span className="tabular-nums">
                    <span className="text-slate-500">使った人 </span>
                    {fmtN(r.used)}／{fmtN(r.registered)} 人
                    <span className="text-slate-500">（{pctOf(r.used, r.registered)}）</span>
                  </span>
                </button>
                <UsageBar value={r.used} max={r.registered} color={U_BAR.used} className="mt-1" />
                <dl className="mt-2 grid grid-cols-[2.5rem_4rem_1fr] items-center gap-x-2 gap-y-1 tabular-nums">
                  <dt className="text-slate-500">単語</dt>
                  <dd><UsageBar value={r.vocabU} max={r.registered} color={U_BAR.vocab} /></dd>
                  <dd>{r.vocabU ? `${fmtN(r.vocabU)} 人・回答 ${fmtN(r.vocabAns)}・正答率 ${pctOf(r.vocabCorrect, r.vocabAns)}` : "—"}</dd>
                  <dt className="text-slate-500">文法</dt>
                  <dd><UsageBar value={r.grammarU} max={r.registered} color={U_BAR.grammar} /></dd>
                  <dd>{r.grammarU ? `${fmtN(r.grammarU)} 人・回答 ${fmtN(r.grammarAns)}・正答率 ${pctOf(r.grammarCorrect, r.grammarAns)}` : "—"}</dd>
                  <dt className="text-slate-500">教材</dt>
                  <dd><UsageBar value={r.textU} max={r.registered} color={U_BAR.text} /></dd>
                  <dd>{r.textU ? `${fmtN(r.textU)} 人` : "—"}</dd>
                </dl>
                {openClass === classLabel(r) && (
                  <div className="mt-2">
                    <div className="text-xs text-slate-500 mb-1">この組で使った生徒（行を押すと範囲の内訳）</div>
                    {studentTable(peopleOf(r))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* PC・タブレット：列を分けた表 */}
          <div className="hidden sm:block overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={U_TH} rowSpan={2}>組</th>
                  <th className={`${U_TH} text-right`} rowSpan={2}>使った人／登録</th>
                  <th className={U_TH} rowSpan={2}>
                    登録した人のうち使った割合
                    <div className="font-normal text-xs text-slate-500">
                      <span className="inline-block w-2 h-2 rounded-full bg-slate-600 mr-1" />全体
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-600 ml-2 mr-1" />単語
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 ml-2 mr-1" />文法
                      <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-2 mr-1" />教材
                    </div>
                  </th>
                  <th className={`${U_TH} text-center border-l border-slate-200`} colSpan={3}>単語</th>
                  <th className={`${U_TH} text-center border-l border-slate-200`} colSpan={3}>文法</th>
                  <th className={`${U_TH} text-center border-l border-slate-200`}>教材</th>
                </tr>
                <tr>
                  <th className={`${U_TH} text-right border-l border-slate-200`}>使った人</th>
                  <th className={`${U_TH} text-right`}>回答数</th>
                  <th className={`${U_TH} text-right`}>正答率</th>
                  <th className={`${U_TH} text-right border-l border-slate-200`}>使った人</th>
                  <th className={`${U_TH} text-right`}>回答数</th>
                  <th className={`${U_TH} text-right`}>正答率</th>
                  <th className={`${U_TH} text-right border-l border-slate-200`}>開いた人</th>
                </tr>
              </thead>
              <tbody>
                {classRows.flatMap((r) => {
                  const isOpen = openClass === classLabel(r);
                  const out = [
                  <tr
                    key={classLabel(r)}
                    onClick={() => setOpenClass(isOpen ? null : classLabel(r))}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                  >
                    <td className={U_TD}>
                      <button type="button" aria-expanded={isOpen} className="text-left">
                        <span className="text-slate-400 mr-1">{isOpen ? "▾" : "▸"}</span>
                        {classLabel(r)}
                      </button>
                    </td>
                    <td className={U_TDN}>
                      {fmtN(r.used)}／{fmtN(r.registered)} 人
                      <span className="text-slate-500">（{pctOf(r.used, r.registered)}）</span>
                    </td>
                    <td className="px-2 py-1.5 min-w-[11rem]">
                      <div className="space-y-0.5">
                        <UsageBar value={r.used} max={r.registered} color={U_BAR.used} />
                        <UsageBar value={r.vocabU} max={r.registered} color={U_BAR.vocab} className="!h-1.5" />
                        <UsageBar value={r.grammarU} max={r.registered} color={U_BAR.grammar} className="!h-1.5" />
                        <UsageBar value={r.textU} max={r.registered} color={U_BAR.text} className="!h-1.5" />
                      </div>
                    </td>
                    <td className={`${U_TDN} border-l border-slate-100`}>{r.vocabU ? `${fmtN(r.vocabU)} 人` : "—"}</td>
                    <td className={U_TDN}>{r.vocabU ? fmtN(r.vocabAns) : "—"}</td>
                    <td className={U_TDN}>{r.vocabU ? pctOf(r.vocabCorrect, r.vocabAns) : "—"}</td>
                    <td className={`${U_TDN} border-l border-slate-100`}>{r.grammarU ? `${fmtN(r.grammarU)} 人` : "—"}</td>
                    <td className={U_TDN}>{r.grammarU ? fmtN(r.grammarAns) : "—"}</td>
                    <td className={U_TDN}>{r.grammarU ? pctOf(r.grammarCorrect, r.grammarAns) : "—"}</td>
                    <td className={`${U_TDN} border-l border-slate-100`}>{r.textU ? `${fmtN(r.textU)} 人` : "—"}</td>
                  </tr>,
                  ];
                  if (isOpen) {
                    out.push(
                      <tr key={`${classLabel(r)}-people`} className="bg-slate-50">
                        <td colSpan={10} className="px-3 py-2">
                          <div className="text-xs text-slate-500 mb-1">この組で使った生徒（行を押すと範囲の内訳）</div>
                          {studentTable(peopleOf(r))}
                        </td>
                      </tr>,
                    );
                  }
                  return out;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <h4 className="font-semibold text-slate-700">生徒別（使った {fmtN(people.length)} 人。行を押すと範囲の内訳）</h4>
          <select value={order} onChange={(e) => setOrder(e.target.value as "class" | "last")} className={U_SEL} aria-label="並び">
            <option value="class">組・番号順</option>
            <option value="last">最近使った順</option>
          </select>
        </div>
        {studentTable(people)}
        <p className="text-xs text-slate-500 mt-1">「項目」は語の意味ごとの数（1語に意味が複数あれば別に数えます）。番号帯は50語ごと。</p>
      </div>
    </section>
  );
}

// ---- 教材別・日ごと ---------------------------------------------------------------------

function UsageTextsSection({ data }: { data: any }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const titleOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of bundledTextsV3Index as any[]) m[t.id] = t.title;
    return m;
  }, []);
  const days: Array<{ day: string; cells: Record<string, { users: number; events: number }> }> = [];
  for (const d of data.days ?? []) {
    let row = days[days.length - 1];
    if (!row || row.day !== d.day) days.push((row = { day: d.day, cells: {} }));
    row.cells[d.area] = { users: d.users, events: d.events };
  }

  return (
    <>
      <section>
        <h3 className="text-base font-semibold text-slate-800 mb-2">教材別（行を押すと、よく開かれた語の上位10）</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={U_TH}>教材</th>
                <th className={`${U_TH} text-right`}>利用者</th>
                <th className={`${U_TH} text-right`}>本文を開いた</th>
                <th className={`${U_TH} text-right`}>語の解説</th>
                <th className={`${U_TH} text-right`}>単語解説</th>
                <th className={`${U_TH} text-right`}>読解ガイド</th>
              </tr>
            </thead>
            <tbody>
              {(data.texts ?? []).flatMap((t: any) => {
                const terms = (data.terms ?? []).filter((x: any) => x.slug === t.slug);
                const rows = [
                  <tr
                    key={t.slug}
                    onClick={() => setOpenSlug(openSlug === t.slug ? null : t.slug)}
                    className="border-t border-slate-100 cursor-pointer hover:bg-slate-50"
                  >
                    <td className={U_TD}>{titleOf[t.slug] ?? t.slug}</td>
                    <td className={U_TDN}>{fmtN(t.users)}</td>
                    <td className={U_TDN}>{fmtN(t.views)}</td>
                    <td className={U_TDN}>{fmtN(t.tokenOpen)}</td>
                    <td className={U_TDN}>{fmtN(t.lemmaOpen)}</td>
                    <td className={U_TDN}>{fmtN(t.guide)}</td>
                  </tr>,
                ];
                if (openSlug === t.slug) {
                  rows.push(
                    <tr key={`${t.slug}-terms`} className="bg-slate-50">
                      <td colSpan={6} className="px-3 py-2">
                        {terms.length ? (
                          <ol className="flex flex-wrap gap-x-4 gap-y-1">
                            {terms.map((x: any, i: number) => (
                              <li key={`${x.kind}-${x.label}`}>
                                {i + 1}. {x.label}
                                <span className="text-slate-500">
                                  {x.kind === "lemma" ? "（単語解説）" : ""} {fmtN(x.n)} 回・{fmtN(x.users)} 人
                                </span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <span className="text-slate-500">語の解説は開かれていません</span>
                        )}
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })}
              {!(data.texts ?? []).length && (
                <tr>
                  <td className={U_TD} colSpan={6}>この期間の記録はありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details>
        <summary className="cursor-pointer text-slate-700 font-semibold">日ごとの利用（人数／操作数）</summary>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white mt-2">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={U_TH}>日付</th>
                {AREA_ORDER.map((ar) => (
                  <th key={ar} className={`${U_TH} text-right`}>{AREA_LABEL[ar]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-t border-slate-100">
                  <td className={U_TD}>{d.day}</td>
                  {AREA_ORDER.map((ar) => (
                    <td key={ar} className={U_TDN}>
                      {d.cells[ar] ? `${d.cells[ar].users} 人／${fmtN(d.cells[ar].events)}` : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {!days.length && (
                <tr>
                  <td className={U_TD} colSpan={4}>この期間の記録はありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
