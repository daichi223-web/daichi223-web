// 学び始め 段0「ことばのきほん」の中の「文法用語になれる」（2026-11-08 ユーザー指示
// 「言葉の基本に文法用語になれる単元を」「文法用語全部」「発展で、自動詞、他動詞、補助動詞など」）。
//
// glossary.ts の48語を全部カード（やさしい説明＋例＋確認の1問）にし、
// きほん／用言／助動詞／助詞／敬語／発展 の6グループに分ける。見せ方は段0と同じ（1枚ずつ・3択・答えてから説明）。
// 進み具合は端末に覚える（localStorage。学習の記録は logEvent）。
// 説明と例は glossary と段の用語カードに合わせてある。確認の1問は AI が作り、教員未確認（2026-11-08）。

import type { TermCard } from "./manabinaoshi";
import { STORAGE_KEYS } from "@/lib/storageKeys";

export interface TermGroup {
  id: string;
  title: string;
  /** 一覧に出す短い説明 */
  lead: string;
  cards: TermCard[];
}

const KIHON: TermCard[] = [
  {
    id: "gt-yougen",
    term: "用言",
    plain: "動き・ようす・状態を表し、後ろに続く言葉によって形が変わる言葉。動詞・形容詞・形容動詞の3つ。",
    examples: [["動詞", "書く・見る・あり"], ["形容詞", "美し・高し"], ["形容動詞", "静かなり・あはれなり"]],
    check: { prompt: "用言でないものはどれ？", choices: ["花", "書く", "美し", "静かなり"], answer: "花", explanation: "「花」は形が変わらない言葉（体言＝名詞）。ほかの3つは形が変わる用言。" },
  },
  {
    id: "gt-taigen",
    term: "体言",
    plain: "名詞のこと。形が変わらない。「が」「を」などをつけて文の中で使う。",
    examples: ["月・花・人・山"],
    check: { prompt: "体言はどれ？", choices: ["月", "見る", "高し", "静かなり"], answer: "月", explanation: "「月」は名詞＝体言。ほかの3つは形が変わる用言。" },
  },
  {
    id: "gt-doushi",
    term: "動詞",
    plain: "動きや存在を表す用言。言い切り（終止形）はウ段で終わる。ラ変だけは「り」で終わる。",
    examples: [["ウ段で終わる", "書く・見る・来"], ["ラ変だけ「り」", "あり・をり・はべり"]],
    check: { prompt: "動詞はどれ？", choices: ["行く", "高し", "静かなり", "花"], answer: "行く", explanation: "「行く」はウ段「く」で言い切る動詞。「高し」は形容詞、「静かなり」は形容動詞、「花」は名詞。" },
  },
  {
    id: "gt-keiyoshi",
    term: "形容詞",
    plain: "性質や状態を表す用言。言い切りは「し」で終わる。",
    examples: ["高し・美し・をかし・いみじ"],
    check: { prompt: "形容詞はどれ？", choices: ["をかし", "静かなり", "思ふ", "月"], answer: "をかし", explanation: "「をかし」は「し」で言い切る形容詞。「静かなり」は形容動詞、「思ふ」は動詞、「月」は名詞。" },
  },
  {
    id: "gt-keiyoudoushi",
    term: "形容動詞",
    plain: "性質や状態を表す用言。言い切りは「なり」「たり」で終わる。",
    examples: [["ナリ活用", "静かなり・あはれなり"], ["タリ活用", "堂々たり・漫々たり"]],
    check: { prompt: "形容動詞はどれ？", choices: ["あはれなり", "美し", "あり", "あはれ"], answer: "あはれなり", explanation: "「あはれなり」は「なり」で言い切る形容動詞。「美し」は形容詞、「あり」は動詞、「あはれ」だけなら名詞。" },
  },
  {
    id: "gt-katsuyo",
    term: "活用",
    plain: "後ろに続く言葉に合わせて、語の終わりの形が変わること。",
    examples: ["書か（ず）／書き（けり）／書く。／書く（とき）／書け（ども）／書け。"],
    check: { prompt: "活用しない言葉はどれ？", choices: ["山", "見る", "高し", "あはれなり"], answer: "山", explanation: "「山」は名詞なので形が変わらない。動詞・形容詞・形容動詞は活用する。" },
  },
  {
    id: "gt-gokan",
    term: "語幹",
    plain: "活用しても変わらない部分。「書く」なら「書」。",
    examples: [["書か・書き・書く", "語幹は「書」"], ["高く・高し・高き", "語幹は「高」"]],
    check: { prompt: "「見え・見ゆ・見ゆる」の語幹は？", choices: ["見", "見ゆ", "ゆ"], answer: "見", explanation: "変わらない「見」が語幹。「え・ゆ・ゆる」が活用語尾。" },
  },
  {
    id: "gt-gobi",
    term: "活用語尾",
    plain: "活用で変わる部分。「書か・書き・書く」なら「か・き・く」。",
    examples: [["書く", "か・き・く・く・け・け"], ["高し", "く・く・し・き・けれ"]],
    check: { prompt: "「高けれども」の「高けれ」で、活用語尾はどれ？", choices: ["けれ", "高", "高け"], answer: "けれ", explanation: "変わらない「高」が語幹、変わる「けれ」が活用語尾。「ども」は後ろについた助詞。" },
  },
  {
    id: "gt-jodoshi",
    term: "助動詞",
    plain: "用言などの後ろについて、意味をそえる小さな言葉。助動詞も活用する。",
    examples: [["書か＋ず", "書かない（打消）"], ["書き＋けり", "書いた（過去）"], ["書か＋む", "書くだろう・書こう（推量・意志）"]],
    check: { prompt: "「書きけり」で、助動詞はどれ？", choices: ["けり", "書", "き"], answer: "けり", explanation: "「書き」は動詞（連用形）。後ろについて「〜た」の意味をそえる「けり」が助動詞。" },
  },
  {
    id: "gt-joshi",
    term: "助詞",
    plain: "後ろについて、言葉どうしの関係を示したり意味をそえたりする小さな言葉。助詞は活用しない。",
    examples: ["花の色（の）／春は（は）／行けども（ども）"],
    check: { prompt: "助動詞と助詞のちがいは？", choices: ["助動詞は活用する、助詞は活用しない", "助詞は活用する、助動詞は活用しない", "どちらも活用しない"], answer: "助動詞は活用する、助詞は活用しない", explanation: "どちらも後ろにつく小さな言葉だが、形が変わるのは助動詞だけ。" },
  },
  {
    id: "gt-setsuzoku",
    term: "接続",
    plain: "助動詞や助詞が、前の語に「この形で来て」と決めているきまり。",
    examples: [["「ず」は未然形に接続", "書か＋ず"], ["「けり」は連用形に接続", "書き＋けり"]],
    check: { prompt: "「ず」の前に来るのは何形？", choices: ["未然形", "連用形", "終止形"], answer: "未然形", explanation: "「ず」は未然形に接続する。だから「書く」は「書か」になって「書かず」。" },
  },
  {
    id: "gt-jutsugo",
    term: "述語",
    plain: "文の中で「どうする」「どんなだ」「何だ」にあたる部分。古文では文の終わりに来て、活用形を見る手がかりになる。",
    examples: [["花咲く", "述語＝咲く"], ["山高し", "述語＝高し"]],
    check: { prompt: "「月いと明かし」の述語は？", choices: ["明かし", "月", "いと"], answer: "明かし", explanation: "「どんなだ」にあたる「明かし」が述語。「月」は主語、「いと」は「とても」の意味で程度を表す言葉。" },
  },
  {
    id: "gt-shugo",
    term: "主語",
    plain: "文の中で「誰が」「何が」にあたる部分。古文では書かれないことが多く、敬語や文の流れから補う。",
    examples: [["花咲く", "主語＝花"], ["（翁）竹を取りけり", "主語は書かれていない"]],
    check: { prompt: "「風吹けば花散る」で、「散る」の主語は？", choices: ["花", "風", "吹け"], answer: "花", explanation: "散るのは花。「風」は「吹く」の主語。" },
  },
];

const YOUGEN: TermCard[] = [
  {
    id: "gt-mizen",
    term: "未然形",
    plain: "「ず」「む」や仮定の「ば」がつく形。まだそうなっていない（未然）ことを表す形。",
    examples: [["書か＋ず", "書かず"], ["書か＋む", "書かむ"], ["降ら＋ば", "降らば（もし降るなら）"]],
    check: { prompt: "「書かむ」の「書か」は何形？", choices: ["未然形", "連用形", "終止形"], answer: "未然形", explanation: "後ろに「む」がついているので未然形。" },
  },
  {
    id: "gt-renyo",
    term: "連用形",
    plain: "「けり」「て」「たり」がつく形。用言に連なる形で、文の途中で止めるときにも使う。",
    examples: [["書き＋けり", "書きけり"], ["書き＋て", "書きて"], ["高く＋なる", "高くなる"]],
    check: { prompt: "「書きて」の「書き」は何形？", choices: ["連用形", "未然形", "連体形"], answer: "連用形", explanation: "後ろに「て」がついているので連用形。" },
  },
  {
    id: "gt-shushi",
    term: "終止形",
    plain: "「。」で言い切る形。辞書の見出しの形でもある。",
    examples: ["花咲く。／山高し。／静かなり。"],
    check: { prompt: "終止形はどれ？", choices: ["書く。", "書か（ず）", "書き（けり）"], answer: "書く。", explanation: "「。」で言い切っている「書く」が終止形。" },
  },
  {
    id: "gt-rentai",
    term: "連体形",
    plain: "「とき」「こと」「人」などの体言がつく形。体言に連なる形。係り結び（ぞ・なむ・や・か）の結びにもなる。",
    examples: [["書く＋とき", "書くとき"], ["高き＋山", "高き山"], ["花ぞ咲きける", "「ぞ」の結び＝連体形「ける」"]],
    check: { prompt: "「高き山」の「高き」は何形？", choices: ["連体形", "終止形", "連用形"], answer: "連体形", explanation: "後ろに体言「山」がついているので連体形。終止形なら「高し」。" },
  },
  {
    id: "gt-izen",
    term: "已然形",
    plain: "「ども」や確定の「ば」がつく形。すでにそうなった（已然）ことを表す形。「こそ」の結びにもなる。",
    examples: [["書け＋ども", "書けども"], ["降れ＋ば", "降れば（降るので）"], ["山こそ高けれ", "「こそ」の結び＝已然形「高けれ」"]],
    check: { prompt: "「降れば（降るので）」の「降れ」は何形？", choices: ["已然形", "未然形", "命令形"], answer: "已然形", explanation: "確定の「ば」がついているので已然形。「降らば」なら未然形（仮定）。" },
  },
  {
    id: "gt-meirei",
    term: "命令形",
    plain: "命令して言い切る形。",
    examples: ["書け。／見よ。／来（こ）。"],
    check: { prompt: "命令形はどれ？", choices: ["見よ。", "見る。", "見（ず）"], answer: "見よ。", explanation: "「見よ」は「見ろ」と命令して言い切る形。「見る」は終止形、「見（ず）」は未然形。" },
  },
  {
    id: "gt-yodan",
    term: "四段活用",
    plain: "「ず」をつけるとア段になる動詞の活用。ア・イ・ウ・エの4つの段に形が変わる。いちばん数が多い。",
    examples: [["書く", "書か・書き・書く・書く・書け・書け"], ["読む", "読ま・読み・読む・読む・読め・読め"]],
    check: { prompt: "四段活用の動詞はどれ？", choices: ["読む", "起く", "受く"], answer: "読む", explanation: "「読まず」とア段になるので四段。「起きず」はイ段で上二段、「受けず」はエ段で下二段。" },
  },
  {
    id: "gt-kami-nidan",
    term: "上二段活用",
    plain: "「ず」をつけるとイ段になる動詞の活用。イ・ウの2つの段に形が変わる。",
    examples: [["起く", "起き・起き・起く・起くる・起くれ・起きよ"], ["過ぐ", "過ぎ・過ぎ・過ぐ・過ぐる・過ぐれ・過ぎよ"]],
    check: { prompt: "「過ぐ」は何活用？（「ず」をつけると「過ぎず」）", choices: ["上二段活用", "下二段活用", "四段活用"], answer: "上二段活用", explanation: "「過ぎず」とイ段になるので上二段。" },
  },
  {
    id: "gt-shimo-nidan",
    term: "下二段活用",
    plain: "「ず」をつけるとエ段になる動詞の活用。ウ・エの2つの段に形が変わる。",
    examples: [["受く", "受け・受け・受く・受くる・受くれ・受けよ"], ["見ゆ", "見え・見え・見ゆ・見ゆる・見ゆれ・見えよ"]],
    check: { prompt: "「受く」は何活用？（「ず」をつけると「受けず」）", choices: ["下二段活用", "上二段活用", "四段活用"], answer: "下二段活用", explanation: "「受けず」とエ段になるので下二段。" },
  },
  {
    id: "gt-kami-ichidan",
    term: "上一段活用",
    plain: "イ段だけで形が変わる動詞の活用。語が少ないので「ひいきにみゐる」（干る・射る・鋳る・着る・似る・煮る・見る・居る・率る）で覚える。",
    examples: [["見る", "見・見・見る・見る・見れ・見よ"]],
    check: { prompt: "上一段活用の動詞はどれ？", choices: ["着る", "書く", "受く"], answer: "着る", explanation: "「着る」は「ひいきにみゐる」の「き」。「着ず」とイ段のまま変わる上一段。" },
  },
  {
    id: "gt-shimo-ichidan",
    term: "下一段活用",
    plain: "エ段だけで形が変わる動詞の活用。「蹴る」の1語だけ。",
    examples: [["蹴る", "蹴・蹴・蹴る・蹴る・蹴れ・蹴よ"]],
    check: { prompt: "下一段活用の動詞はどれ？", choices: ["蹴る", "見る", "来"], answer: "蹴る", explanation: "下一段は「蹴る」だけ。「見る」は上一段、「来」はカ変。" },
  },
  {
    id: "gt-henkaku",
    term: "変格活用",
    plain: "決まりから外れる活用。語が限られるので丸暗記する。",
    examples: [["カ変", "来（く）"], ["サ変", "す・おはす"], ["ナ変", "死ぬ・往ぬ"], ["ラ変", "あり・をり・はべり・いまそかり"]],
    check: { prompt: "変格活用でない動詞はどれ？", choices: ["書く", "来", "死ぬ", "あり"], answer: "書く", explanation: "「書く」は四段。「来」はカ変、「死ぬ」はナ変、「あり」はラ変。" },
  },
  {
    id: "gt-onbin",
    term: "音便",
    plain: "言いやすいように音が変わること。主に連用形に「て」「たり」が続くときに起こる。",
    examples: [["イ音便", "書きて → 書いて"], ["ウ音便", "美しくて → 美しうて"], ["撥音便", "飛びて → 飛んで"], ["促音便", "立ちて → 立つて"]],
    check: { prompt: "「書いて」は何音便？", choices: ["イ音便", "ウ音便", "撥音便", "促音便"], answer: "イ音便", explanation: "「書きて」の「き」が「い」に変わったのでイ音便。" },
  },
];

const JODOSHI: TermCard[] = [
  {
    id: "gt-uchikeshi",
    term: "打消",
    plain: "「〜ない」の意味。助動詞「ず」が表す。「ず」は未然形に接続する。",
    examples: [["書かず", "書かない"], ["知らぬ人", "知らない人（「ぬ」は「ず」の連体形）"]],
    check: { prompt: "「行かず」の意味は？", choices: ["行かない", "行った", "行くだろう"], answer: "行かない", explanation: "「ず」は打消。「行か＋ず」で「行かない」。" },
  },
  {
    id: "gt-kako",
    term: "過去",
    plain: "「〜た」の意味。助動詞「き」「けり」が表す。「き」は自分が体験したこと、「けり」は人から聞いたことに使うことが多い。",
    examples: [["京より下りき", "京から下った（体験）"], ["竹取の翁といふものありけり", "竹取の翁という者がいた（伝え聞き）"]],
    check: { prompt: "「ありけり」の意味は？", choices: ["いた", "いるだろう", "いない"], answer: "いた", explanation: "「けり」は過去。「あり＋けり」で「いた」。" },
  },
  {
    id: "gt-suiryo",
    term: "推量",
    plain: "「〜だろう」の意味。助動詞「む」「らむ」「けむ」「べし」などが表す。",
    examples: [["雨降らむ", "雨が降るだろう"], ["今ごろ花咲くらむ", "今ごろ花が咲いているだろう（今のことの推量）"]],
    check: { prompt: "「雨降らむ」の意味は？", choices: ["雨が降るだろう", "雨が降った", "雨が降らない"], answer: "雨が降るだろう", explanation: "「む」は推量。主語が自分以外なら「〜だろう」。" },
  },
  {
    id: "gt-ishi",
    term: "意志",
    plain: "「〜よう・〜つもりだ」の意味。「む」「べし」などが、主語が自分（一人称）のときに表す。",
    examples: [["我行かむ", "私は行こう"], ["必ず帰るべし", "必ず帰ろう・帰るつもりだ"]],
    check: { prompt: "「我行かむ」の「む」の意味は？", choices: ["意志", "推量", "過去"], answer: "意志", explanation: "主語が「我」なので「行こう」という意志。主語が他人なら推量。" },
  },
  {
    id: "gt-kanryo",
    term: "完了",
    plain: "「〜た・〜てしまった」の意味。助動詞「つ」「ぬ」「たり」「り」が表す。",
    examples: [["花散りぬ", "花が散ってしまった"], ["書きつ", "書いた"]],
    check: { prompt: "「花散りぬ」の意味は？", choices: ["花が散ってしまった", "花が散らない", "花が散るだろう"], answer: "花が散ってしまった", explanation: "「散り」（連用形）＋「ぬ」は完了。「散ら」（未然形）＋「ぬ」なら打消の「ず」の連体形。" },
  },
  {
    id: "gt-sonzoku",
    term: "存続",
    plain: "「〜ている・〜てある」の意味。助動詞「たり」「り」が表す。完了と同じ語なので、文の流れで見分ける。",
    examples: [["花咲きたり", "花が咲いている"], ["門に立てり", "門に立っている"]],
    check: { prompt: "「花咲きたり」の意味は？", choices: ["花が咲いている", "花が咲くだろう", "花が咲かない"], answer: "花が咲いている", explanation: "「たり」は存続・完了。今も続いている状態なので「咲いている」。" },
  },
  {
    id: "gt-eitan",
    term: "詠嘆",
    plain: "「〜なあ・〜ことよ」と気づきや感動を表す意味。和歌や会話文の「けり」が表す。",
    examples: [["月ぞ出でにける", "月が出たのだなあ（気づき）"], ["あはれなりけり", "しみじみと趣深いことよ"]],
    check: { prompt: "和歌の「〜にけり」の「けり」の意味は？", choices: ["詠嘆", "打消", "意志"], answer: "詠嘆", explanation: "和歌や会話文の「けり」は、気づいて感動する詠嘆になることが多い。地の文なら過去。" },
  },
];

const JOSHI: TermCard[] = [
  {
    id: "gt-kakujoshi",
    term: "格助詞",
    plain: "主に体言について、言葉どうしの関係を示す助詞。の・が・を・に・へ・と・より・にて など。",
    examples: [["花の色", "「の」＝下の体言を説明する"], ["花を見る", "「を」＝何を"]],
    check: { prompt: "格助詞はどれ？", choices: ["の", "ば", "ぞ"], answer: "の", explanation: "「の」は体言について関係を示す格助詞。「ば」は接続助詞、「ぞ」は係助詞。" },
  },
  {
    id: "gt-setsuzokujoshi",
    term: "接続助詞",
    plain: "前と後ろをつなぐ助詞。ば・ども・て・つつ・に・を など。",
    examples: [["雨降れば行かず", "「ば」＝〜ので"], ["雨降れども行く", "「ども」＝〜けれども"]],
    check: { prompt: "「雨降れども行く」の「ども」は？", choices: ["接続助詞", "格助詞", "係助詞"], answer: "接続助詞", explanation: "前と後ろを「〜けれども」とつないでいるので接続助詞。" },
  },
  {
    id: "gt-kakarijoshi",
    term: "係助詞",
    plain: "強めたり疑問を示したりして、文の終わりの形を変える助詞。ぞ・なむ・や・か・こそ。「は」「も」も係助詞だが、結びの形は変えない。",
    examples: [["花ぞ咲きける", "「ぞ」＝強め"], ["花や咲きける", "「や」＝疑問"]],
    check: { prompt: "係助詞はどれ？", choices: ["こそ", "を", "ども"], answer: "こそ", explanation: "「こそ」は強めて文の終わりを已然形にする係助詞。「を」は格助詞、「ども」は接続助詞。" },
  },
  {
    id: "gt-kakari-musubi",
    term: "係り結び",
    plain: "文の中に係助詞「ぞ・なむ・や・か」があると文の終わりが連体形に、「こそ」があると已然形になる。",
    examples: [["山ぞ高き", "「ぞ」→ 連体形「高き」"], ["山こそ高けれ", "「こそ」→ 已然形「高けれ」"]],
    check: { prompt: "「こそ」があるとき、文の終わりは何形？", choices: ["已然形", "連体形", "終止形"], answer: "已然形", explanation: "「ぞ・なむ・や・か」は連体形、「こそ」だけは已然形で結ぶ。" },
  },
  {
    id: "gt-junsetsu",
    term: "順接",
    plain: "前から当然そうなる流れのつながり（〜ので・〜すると）。",
    examples: [["雨降れば行かず", "雨が降るので行かない"]],
    check: { prompt: "順接はどれ？", choices: ["雨降れば行かず", "雨降れども行く"], answer: "雨降れば行かず", explanation: "「降るので行かない」と前から当然の流れなので順接。「ども」は逆接。" },
  },
  {
    id: "gt-gyakusetsu",
    term: "逆接",
    plain: "予想と反対になる流れのつながり（〜けれども）。",
    examples: [["雨降れども行く", "雨が降るけれども行く"]],
    check: { prompt: "逆接はどれ？", choices: ["雨降れども行く", "雨降れば行かず"], answer: "雨降れども行く", explanation: "降るのに行く＝予想と反対なので逆接。" },
  },
  {
    id: "gt-katei",
    term: "仮定",
    plain: "まだ起きていないこと（もし〜ならば）。未然形＋「ば」。",
    examples: [["雨降らば", "もし雨が降るならば"]],
    check: { prompt: "「雨降らば」の意味は？", choices: ["もし雨が降るならば", "雨が降るので", "雨が降ったけれども"], answer: "もし雨が降るならば", explanation: "「降ら」は未然形。未然形＋ば は仮定。" },
  },
  {
    id: "gt-kakutei",
    term: "確定",
    plain: "もう起きていること（〜ので・〜すると）。已然形＋「ば」。",
    examples: [["雨降れば", "雨が降るので"]],
    check: { prompt: "「雨降れば」の意味は？", choices: ["雨が降るので", "もし雨が降るならば", "雨が降らないので"], answer: "雨が降るので", explanation: "「降れ」は已然形。已然形＋ば は確定。" },
  },
];

const KEIGO: TermCard[] = [
  {
    id: "gt-sonkei",
    term: "尊敬語",
    plain: "動作をする人を高める敬語。おはす・のたまふ・給ふ など。",
    examples: [["帝のたまふ", "帝がおっしゃる（帝を高める）"]],
    check: { prompt: "尊敬語はどれ？", choices: ["のたまふ", "申す", "侍り"], answer: "のたまふ", explanation: "「のたまふ」は「おっしゃる」。動作をする人を高める。「申す」は謙譲語、「侍り」は丁寧語。" },
  },
  {
    id: "gt-kenjou",
    term: "謙譲語",
    plain: "動作を受ける人を高める敬語。申す・奉る・参る など。",
    examples: [["帝に申す", "帝に申し上げる（帝を高める）"]],
    check: { prompt: "謙譲語はどれ？", choices: ["奉る", "おはす", "候ふ"], answer: "奉る", explanation: "「奉る」は「差し上げる」。動作を受ける人を高める。「おはす」は尊敬語、「候ふ」は丁寧語。" },
  },
  {
    id: "gt-teinei",
    term: "丁寧語",
    plain: "聞き手（読み手）を高める敬語。侍り・候ふ。",
    examples: [["ここに侍り", "ここにおります（聞き手に丁寧）"]],
    check: { prompt: "丁寧語はどれ？", choices: ["候ふ", "給ふ", "参る"], answer: "候ふ", explanation: "「候ふ」は「〜ます・あります」。聞き手を高める。「給ふ」は尊敬語、「参る」は謙譲語。" },
  },
];

const HATTEN: TermCard[] = [
  {
    id: "gt-hondoushi",
    term: "本動詞",
    plain: "その語本来の意味で使う動詞。「給ふ」なら「お与えになる」。",
    examples: [["衣を給ふ", "衣をお与えになる（本動詞）"]],
    check: { prompt: "「衣を給ふ」の「給ふ」はどちら？", choices: ["本動詞", "補助動詞"], answer: "本動詞", explanation: "「お与えになる」という本来の意味で使っているので本動詞。" },
  },
  {
    id: "gt-hojodoushi",
    term: "補助動詞",
    plain: "ほかの動詞の後ろについて、敬意などをそえるだけになった動詞。「書き給ふ」なら「お書きになる」。",
    examples: [["書き給ふ", "お書きになる"], ["うれしくおぼえ侍り", "うれしく思われます"]],
    check: { prompt: "「書き給ふ」の「給ふ」はどちら？", choices: ["補助動詞", "本動詞"], answer: "補助動詞", explanation: "動詞「書き」の後ろについて「お〜になる」の敬意だけをそえているので補助動詞。" },
  },
  {
    id: "gt-jidoushi",
    term: "自動詞",
    plain: "「〜を」をとらない動詞。戸が開く・花が散る。",
    examples: [["戸開く（四段）", "戸が開く"], ["花散る", "花が散る"]],
    check: { prompt: "自動詞はどれ？", choices: ["戸開く（戸が開く）", "戸を開く（戸を開ける）"], answer: "戸開く（戸が開く）", explanation: "「〜を」をとらずに「戸が開く」。これが自動詞。" },
  },
  {
    id: "gt-tadoushi",
    term: "他動詞",
    plain: "「〜を」をとって何かに働きかける動詞。戸を開ける・花を散らす。古文では同じ字でも活用の種類で自動詞と分かれる語がある。",
    examples: [["戸を開く（下二段）", "戸を開ける"], ["花を散らす", "「散る」（自動詞）に対する他動詞"]],
    check: { prompt: "他動詞はどれ？", choices: ["戸を開く（戸を開ける）", "戸開く（戸が開く）"], answer: "戸を開く（戸を開ける）", explanation: "「戸を」と「〜を」をとって働きかけているので他動詞。" },
  },
];

export const TERM_GROUPS: TermGroup[] = [
  { id: "kihon", title: "きほん", lead: "言葉の種類と、形が変わるということ", cards: KIHON },
  { id: "yougen", title: "用言", lead: "6つの活用形と、活用の種類", cards: YOUGEN },
  { id: "jodoshi", title: "助動詞", lead: "助動詞がそえる意味の名前", cards: JODOSHI },
  { id: "joshi", title: "助詞", lead: "助詞の種類と、つなぎ方・係り結び", cards: JOSHI },
  { id: "keigo", title: "敬語", lead: "誰を高めているか", cards: KEIGO },
  { id: "hatten", title: "発展", lead: "動詞のはたらきの見分け（敬語と活用の一歩先）", cards: HATTEN },
];

export const ALL_TERM_CARDS: TermCard[] = TERM_GROUPS.flatMap((g) => g.cards);

// ---- 進み具合（端末に覚える。学習の記録ではなく、続きから開くための道しるべ） ----
export interface TermProgress {
  /** 正解して終えたカードの id */
  solved: string[];
  /** 最初の1回の正誤 */
  first: Record<string, boolean>;
}

const EMPTY: TermProgress = { solved: [], first: {} };

export function readTermProgress(): TermProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.manabinaoshiTerms);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    return { solved: Array.isArray(p.solved) ? p.solved.filter((x: unknown) => typeof x === "string") : [], first: p.first && typeof p.first === "object" ? p.first : {} };
  } catch {
    return EMPTY;
  }
}

export function writeTermProgress(p: TermProgress): void {
  try {
    localStorage.setItem(STORAGE_KEYS.manabinaoshiTerms, JSON.stringify(p));
  } catch {
    /* 端末に書けなくても進める */
  }
}

/** グループの進み具合（済んだ枚数） */
export function groupDone(group: TermGroup, p: TermProgress): number {
  const s = new Set(p.solved);
  return group.cards.filter((c) => s.has(c.id)).length;
}

/** 続きから：まだ済んでいない最初のカードの位置（全部済みなら 0） */
export function resumeIndex(group: TermGroup, p: TermProgress): number {
  const s = new Set(p.solved);
  const i = group.cards.findIndex((c) => !s.has(c.id));
  return i < 0 ? 0 : i;
}
