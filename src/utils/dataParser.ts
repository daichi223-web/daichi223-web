import { WordData, Word, MultiMeaningWord, ExamplesBySense } from '../types';
import bundledKobunQ from '../data/kobunQ.json';

export class DataParser {
  private wordData: WordData[] = [];
  private multiMeaningWords: MultiMeaningWord[] = [];

  // 例文処理ヘルパー関数
  private processExamples(word: WordData): { kobun: string[], modern: string[] } {
    const kobun: string[] = [];
    const modern: string[] = [];

    // 既存のexamplesフィールドから例文を抽出
    if (word.examples && Array.isArray(word.examples)) {
      word.examples.forEach(example => {
        if (example.jp) {
          kobun.push(example.jp);
        }
        if (example.translation) {
          modern.push(example.translation);
        }
      });
    }

    // 新しいexamples_kobun/examples_modernフィールドがあれば追加
    if (word.examples_kobun && Array.isArray(word.examples_kobun)) {
      kobun.push(...word.examples_kobun);
    }
    if (word.examples_modern && Array.isArray(word.examples_modern)) {
      modern.push(...word.examples_modern);
    }

    return { kobun, modern };
  }

  // プレースホルダー {LEMMA} を 〔見出し語〕 に置換
  private replaceLemmaPlaceholder(text: string, lemma: string): string {
    return text.replace(/{LEMMA}/g, `〔${lemma}〕`);
  }

  // 見出し語を 〔 〕 で強調（プレースホルダーがない場合の自動処理）
  private emphasizeLemma(text: string, lemma: string): string {
    // 既に {LEMMA} プレースホルダーが処理済みの場合はそのまま
    if (text.includes(`〔${lemma}〕`)) {
      return text;
    }

    // 最初の一致のみを 〔 〕 で囲む
    const index = text.indexOf(lemma);
    if (index !== -1) {
      return text.substring(0, index) +
             `〔${lemma}〕` +
             text.substring(index + lemma.length);
    }

    return text;
  }

  // データ整合性チェック
  private validateExamples(word: WordData): string[] {
    const warnings: string[] = [];
    const { kobun, modern } = this.processExamples(word);

    if (kobun.length === 0) {
      warnings.push(`${word.lemma}(${word.qid}): 古文例文がありません`);
    }

    if (modern.length === 0) {
      warnings.push(`${word.lemma}(${word.qid}): 現代語訳がありません`);
    }

    if (kobun.length !== modern.length) {
      warnings.push(`${word.lemma}(${word.qid}): 古文例文(${kobun.length}件)と現代語訳(${modern.length}件)の数が一致しません`);
    }

    return warnings;
  }

  async loadData(): Promise<void> {
    try {
      // Bundled inside the JS chunk (旧 /kobun_q.jsonl.txt からの fetch 廃止)。
      // 学校ネットワーク等の Web Gateway (Cisco Umbrella 等) が .txt 拡張子を
      // SSO 認証壁に横取りして JSON パース失敗する現象を回避するため、
      // JS bundle に同梱する方針に切替。
      const raw = bundledKobunQ as unknown as WordData[];
      const allWarnings: string[] = [];

      this.wordData = raw
        .map((parsed, lineNum) => {
          if (!parsed || typeof parsed !== 'object') {
            console.warn(`[Index ${lineNum}] Invalid word data (not an object):`, parsed);
            return null;
          }

          const REQUIRED_FIELDS = ['qid', 'lemma', 'sense'] as const;
          const missingFields = REQUIRED_FIELDS.filter((field) => !parsed[field]);
          if (missingFields.length > 0) {
            console.warn(
              `[Index ${lineNum}] Invalid word data - missing fields: ${missingFields.join(', ')}`,
              {
                allKeys: Object.keys(parsed),
                qid: parsed.qid,
                lemma: parsed.lemma,
                sense: parsed.sense,
              },
            );
            return null;
          }

          const warnings = this.validateExamples(parsed);
          allWarnings.push(...warnings);
          return parsed;
        })
        .filter((word): word is WordData => word !== null);

      const validCount = this.wordData.length;
      const totalCount = raw.length;
      const invalidCount = totalCount - validCount;

      console.log(`[DataParser] Loaded ${validCount} valid words from bundled data (${invalidCount} invalid/skipped)`);

      if (this.wordData.length === 0) {
        console.error('[DataParser] CRITICAL: No valid words loaded! Bundled data is empty or corrupt.');
        throw new Error('No valid word data available');
      }

      if (allWarnings.length > 0) {
        console.warn(`[DataParser] Example validation warnings (${allWarnings.length} total):`, allWarnings.slice(0, 5));
      }

      this.processMultiMeaningWords();
    } catch (error) {
      console.error('Error loading data:', error);
      throw error;
    }
  }

  private processMultiMeaningWords(): void {
    const wordGroups = new Map<string, WordData[]>();

    // Group by lemma
    this.wordData.forEach(word => {
      // Additional defensive check during processing
      if (!word || !word.lemma || typeof word.lemma !== 'string') {
        console.warn('Skipping invalid word during processing:', word);
        return;
      }

      const existing = wordGroups.get(word.lemma) || [];
      existing.push(word);
      wordGroups.set(word.lemma, existing);
    });

    // Filter words with multiple meanings
    this.multiMeaningWords = Array.from(wordGroups.entries())
      .filter(([_, words]) => words.length > 1)
      .map(([lemma, words]) => {
        const meanings = words
          .filter(word => word && word.lemma && word.qid && word.sense)
          .map(word => {
            const { kobun, modern } = this.processExamples(word);
            return {
              qid: word.qid,
              lemma: word.lemma,
              sense: word.sense,
              meaning_idx: word.meaning_idx,
              group: parseInt(word.group) || 0,
              examples: word.examples || [],
              examples_kobun: kobun,
              examples_modern: modern
            };
          });

        // examples_by_sense の構築（sense専用例文を優先）
        const examplesBySense: ExamplesBySense = {};
        meanings.forEach(meaning => {
          const senseId = meaning.qid; // qidをsenseIdとして使用
          if (meaning.examples_kobun && meaning.examples_modern) {
            examplesBySense[senseId] = {
              kobun: meaning.examples_kobun,
              modern: meaning.examples_modern
            };
          }
        });

        return {
          lemma,
          meanings,
          examples_by_sense: Object.keys(examplesBySense).length > 0 ? examplesBySense : undefined
        };
      });
  }

  getMultiMeaningWords(): MultiMeaningWord[] {
    return this.multiMeaningWords;
  }

  getRandomMultiMeaningWords(count: number): MultiMeaningWord[] {
    const shuffled = [...this.multiMeaningWords].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  getWordByLemma(lemma: string): MultiMeaningWord | undefined {
    return this.multiMeaningWords.find(word => word.lemma === lemma);
  }

  getAllLemmas(): string[] {
    return this.multiMeaningWords.map(word => word.lemma);
  }

  getAllWords(): Word[] {
    return this.wordData
      .filter(word => word && word.lemma && word.qid && word.sense)
      .map(word => {
        const { kobun, modern } = this.processExamples(word);
        return {
          qid: word.qid,
          lemma: word.lemma,
          sense: word.sense,
          meaning_idx: word.meaning_idx,
          group: parseInt(word.group) || 0,
          examples: word.examples || [],
          examples_kobun: kobun,
          examples_modern: modern
        };
      });
  }

  // 例文取得のヘルパー関数（sense優先）
  getExamplesForSense(word: Word, senseId?: string, multiMeaningWord?: MultiMeaningWord): { kobun: string[], modern: string[] } {
    // sense専用例文があるかチェック
    if (senseId && multiMeaningWord?.examples_by_sense?.[senseId]) {
      const senseExamples = multiMeaningWord.examples_by_sense[senseId];
      if (senseExamples.kobun.length > 0 || senseExamples.modern.length > 0) {
        return senseExamples;
      }
    }

    // フォールバック: 単語の共通例文
    return {
      kobun: word.examples_kobun || [],
      modern: word.examples_modern || []
    };
  }

  // 例文を強調付きで取得
  getEmphasizedExample(text: string, lemma: string): string {
    return this.emphasizeLemma(this.replaceLemmaPlaceholder(text, lemma), lemma);
  }
}

export const dataParser = new DataParser();
