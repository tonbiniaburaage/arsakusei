# 模型参照画像と画像追跡ターゲット

## 模型参照画像

`resin-model-detector.js` が次の3枚の実物模型写真を読み込み、光るレジン模型の色と輪郭を比較します。

| 種類 | 参照画像 |
| --- | --- |
| クラゲ | `resin-jellyfish-reference.png` |
| クジラ | `resin-whale-reference.png` |
| ウミガメ | `resin-turtle-reference.png` |

参照画像は実行時に端末内で低解像度の輪郭記述子へ変換されます。元画像やカメラ映像は外部へ送信しません。

## 従来のMindAR補助ターゲット

模型単体の輪郭認識に加え、従来カードの平面画像追跡も残しています。

| Index | 種類 | カード |
| --- | --- | --- |
| 0 | クラゲ | `jellyfish-card.png` |
| 1 | クジラ | `whale-card.png` |
| 2 | ウミガメ | `turtle-card.png` |
| 3 | クラゲ | `jellyfish-card-white.png` |
| 4 | クジラ | `whale-card-white.png` |
| 5 | ウミガメ | `turtle-card-white.png` |

6ターゲットの認識データは `creature-targets.mind` です。写真入りカードと、模型を上に置く白地カードの両方を認識します。
