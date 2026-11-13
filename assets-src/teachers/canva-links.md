# 先生キャラの絵（Canva 画像生成、2026-11-02）

本体は Canva 側に 1264×1264 で保存されている。ここにある PNG は 200×200 の下見。
本番用の高解像度にするときは、各リンクを開いて「ダウンロード」し、同じ名前で置き換える。

| id | 先生 | sharp（くっきり） | yuru（ゆるキャラ×史実） | pop（ポップ） |
|---|---|---|---|---|
| sei | 清少納言 | https://www.canva.com/M/MAHZutPRsYo | https://www.canva.com/M/MAHZulnFd2Q | https://www.canva.com/M/MAHZuiX7wqU |
| murasaki | 紫式部 | https://www.canva.com/M/MAHZusEaD_8 | https://www.canva.com/M/MAHZugvdIAw | https://www.canva.com/M/MAHZuvWS0aI |
| michizane | 菅原道真 | https://www.canva.com/M/MAHZuovNxjQ | https://www.canva.com/M/MAHZuubiU_E | https://www.canva.com/M/MAHZuvHf5D8 |
| tsurayuki | 紀貫之 | https://www.canva.com/M/MAHZuk-8H_4 | https://www.canva.com/M/MAHZuqyL5Y4 | https://www.canva.com/M/MAHZuonUnyk |
| teika | 藤原定家 | https://www.canva.com/M/MAHZuuSgFcY | https://www.canva.com/M/MAHZus3z6mk | https://www.canva.com/M/MAHZuhPcd9s |
| komachi | 小野小町（2026-11-12 追加） | https://www.canva.com/M/MAHarQYYgmI | https://www.canva.com/M/MAHarfT1Nxs | https://www.canva.com/M/MAHarbVMVH0 |
| izumi | 和泉式部（2026-11-12 追加） | https://www.canva.com/M/MAHatW4JB2A | https://www.canva.com/M/MAHatQhXlaM | https://www.canva.com/M/MAHatd0m9os |
| koshikibu | 小式部内侍（2026-11-12 追加） | https://www.canva.com/M/MAHatYZZ2HE | https://www.canva.com/M/MAHatVglC9Y | https://www.canva.com/M/MAHatZ-nNz4 |
| ukyo | 建礼門院右京大夫（2026-11-12 追加） | https://www.canva.com/M/MAHatff5lPc | https://www.canva.com/M/MAHatezbYQM | https://www.canva.com/M/MAHatQxfhDA |
| narihira | 在原業平（2026-11-12 追加） | https://www.canva.com/M/MAHatZyjQ9g | https://www.canva.com/M/MAHatTYpz2g | https://www.canva.com/M/MAHatdLNA0Q |

不採用（見本）: 博士 https://www.canva.com/M/MAHZui3s-XQ

## 4種類目「アニメ調」（2026-11-13、ユーザー提供。Canva には無い）

紫式部・小野小町・和泉式部・小式部内侍・建礼門院右京大夫の5人。背景は透明。
小式部内侍の絵は、清少納言として届いたもの（zip では sei.png）を回した。清少納言の型（強気なツンデレ）と合わないため（2026-11-13 ユーザー承認）。

- 原本: `<id>-anime-full.png`（約1150×1350）
- 下見: `<id>-anime.png`（200×200。頭の位置で正方形に切り出したもの）
- 切り出し: `python -I crop_anime.py <原本のフォルダ（<id>.png の名前で置く）> <出力先> 0.62`
- 清少納言は描き直した絵（Codex の依頼1、2026-11-13）を入れた。男性4人（道真・貫之・定家・業平）も同日夜に Codex の依頼2 で届いて入れた。原本の控え = `F:/A2A/_work/kobun-chat-feedback/codex-inbox/2026-11-13_men/`
