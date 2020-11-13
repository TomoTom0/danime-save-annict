# danime-save-annict-2

## Abstaract
This Chrome extension sends your watching record in [d-anime store](https://anime.dmkt-sp.jp/animestore/tp_pc) to [Annict](https://annict.jp/).
Forked from [kakunpc's Repository](https://github.com/kakunpc/danime-save-annict).

dアニメストアの視聴結果をAnnictに送るChrome拡張です。
[kakunpcさんのRepository](https://github.com/kakunpc/danime-save-annict)からforkした改良版です。

ちなみに今回拡張機能に手を付けたのは『ダイヤのA -SECOND SEASON-』が対応しないと言われたのがきっかけです。

## improvements about features

機能に関する加筆内容を解説します。
### 表記ゆれの対応
同一の作品でもdアニメストアとAnnictでは表記が異なることがあり、対応が必要でした。

1. 英数字や一部の記号を全角から半角に統一するようにした。
    - 数年前からdアニメストアではタイトルに含まれる英数字や一部の記号(`:`など)を全角で表記するようになった。(例:`ダイヤのＡ‐ＳＥＣＯＮＤ ＳＥＡＳＯＮ‐`)
      例外もあるが、半角に統一しているので問題ない。(例:`Re:ゼロから始める異世界生活`)
    - Annictでは半角で統一されているが、全角のままのものもある。(例: `ご注文はうさぎですか？？ ～Sing For You～`)
2. 追加の変換を行うようにした。
    - ローマ数字はdアニメストアでは環境依存記号で表記され、Annictでは`II`のようにアルファベットで代用されている。(例:`ダイヤのA actⅡ`)
    - `〈`と`＜`のように、一部記号を変換する必要がある。(例:`〈物語〉シリーズ セカンドシーズン`)
    - dアニメストア側にのみついている鍵括弧を削除する。(例:`｢DAYS｣`, `『つばさタイガー 其ノ貳』`)
    - 話数の部分では漢数字をアラビア数字に置き換える。(例:`第拾九話`)
3. `Title （第1話～第50話）`のような配信サイト故の表記について調整した。(例:`遊☆戯☆王SEVENS　マキシマム編`, `〈物語〉シリーズ セカンドシーズン（第1話～第5話） 猫物語(白)`)
    - オリジナルバージョンではdアニメストア側のタイトルがAnnict側のタイトルにすべて含まれるかを確認していたが、全体的にAnnict側の方がシンプルな場合が多いので、含まれる方向の判断を反対にした。


## improvements about scripts

1. 各変数の宣言を`var`から`const / let`に置き換えてより安全なscriptにした。
2. 非同期処理を`async / await`に統一することでscriptの見通しをよくした。
3. この拡張機能の使い方ではあまり必要性がなかったので、`graphql-fetch`を採用せず通常の`fetch`を利用した。
4. 漢数字をアラビア数字に変換する機能は[aok.blue.coocan.jp](http://aok.blue.coocan.jp/jscript/kan2arb.html)に掲載されていた関数を整えて利用した。

## Reference

- [aok.blue.coocan.jp / kan2arb](http://aok.blue.coocan.jp/jscript/kan2arb.html)
- [kakunpc / danime-save-annict](https://github.com/kakunpc/danime-save-annict)

## License
MIT

