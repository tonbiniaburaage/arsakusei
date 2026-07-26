# 2Dキャラクター素材

`dreamy-jellyfish-source.png` は、クラゲ2D試作用の提供画像です。

キャラクターが変形しないように、画像自体は描き直していません。ブラウザで読み込む際に、画像の端からつながっている白背景だけをCanvasで透明化し、透明部分を除いた範囲へ自動トリミングしてThree.jsのSpriteとして表示します。

クラゲ全体の浮遊軌道は `src/creature-controller.js`、星・泡・発光・光の尾は `src/effect-controller.js` が担当します。
