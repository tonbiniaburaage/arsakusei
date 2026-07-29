# 画像追跡ターゲット

模型を置ける白いスペースと、種類ごとに識別しやすい色・文字・模様を持つ3枚の認識カードを作成しています。

## ターゲット順

MindARのインデックスは次の順番で固定しています。

| Index | 種類 | カード |
| --- | --- | --- |
| 0 | クラゲ | `jellyfish-card-white.png` |
| 1 | クジラ | `whale-card-white.png` |
| 2 | ウミガメ | `turtle-card-white.png` |
| 3 | クラゲ | `jellyfish-card-white.png` の左側 |
| 4 | クラゲ | `jellyfish-card-white.png` の下側 |

3枚から作った5ターゲットの認識データが `creature-targets.mind` です。上記の順序を維持してください。

## 展示方法

- カードはカラー印刷し、可能ならA5前後のサイズにする
- 光沢紙を避け、反射しにくいマット紙を使う
- 対応する模型をカードの白い部分へ置く
- 最初はカード全体を映すと最も安定する。クラゲは左側・下側だけでも認識可能
- 模型でカードの文字や四隅の模様を隠しすぎない

## 再生成

`tools/dev-server.py` でローカルサーバーを起動し、`tools/compile-targets.html` を開くと3枚から5ターゲットを再コンパイルできます。通常の静的サーバーでは、生成後に表示されるボタンから `creature-targets.mind` を保存してください。

`demo-card.png` と `demo-card.mind` は以前のPhase 2確認用で、現在の本番追跡には使用していません。
