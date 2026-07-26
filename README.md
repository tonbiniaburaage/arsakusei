# ドリーミー海のなかま AR

レジン模型と一緒に置いた認識カードをスマートフォンで映すと、クラゲ・クジラ・ウミガメを判定し、Three.jsの3D生物が泳ぎ出すWebAR作品です。インストールは不要です。

## 現在の段階

Phase 1〜7を実装済みです。

- 3種類の認識カードをMindARで自動判定
- クラゲ5体（大1・中2・小2）、クジラ1体、ウミガメ1体の専用遊泳
- GLBがない場合も動作する軽量な仮3Dモデル
- 星・泡・光の軽量演出
- カメラ映像・3D・演出を合成したAR写真
- 共有シートまたは画像保存へのフォールバック
- 低性能端末向けのPixelRatio・演出数自動調整
- カメラを使えない環境向けの3種類デモ
- カメラ拒否・非対応時の再試行とデモ復帰

## 実機で確認する

カメラ利用にはHTTPSが必要です。スマートフォンではGitHub PagesのURLをSafariまたはChromeで開いてください。

1. `target-card.html` をPCや別端末に表示するか、3枚をカラー印刷する
2. 対応するレジン模型をカードの写真部分、またはカードのすぐ手前に置く
3. スマートフォンでトップページを開き「ARをはじめる」を押す
4. カメラを許可し、カードの四隅まで画面へ入れる
5. 30〜60cm程度からゆっくり近づけ、認識後はカードが画面端に少し残る範囲で動かす
6. 左下の丸いボタンでAR写真を撮る

透明なレジン模型だけを背景や角度が変わる状態で直接判定する方式ではありません。反射と透過の影響を避けるため、提供写真から作った高特徴量カードを補助に使います。

## PCで確認する

```powershell
python -m http.server 8000
```

`http://localhost:8000` を開き、「カメラなし確認」から生物を選んで「動きを見る」を押します。自動ブラウザなどカメラにアクセスできない環境でも、3D・演出・撮影プレビューを確認できます。

## 3Dモデルを差し替える

以下にGLBを置くと仮モデルから自動的に置き換わります。

```text
assets/models/jellyfish.glb
assets/models/whale.glb
assets/models/turtle.glb
```

推奨目安は1モデル5MB以下、テクスチャ1024px以下、アニメーション1〜2本です。

## 主な構成

```text
index.html                         AR画面
target-card.html                   3種類のカード表示・印刷
assets/targets/creature-targets.mind  3種類の認識データ
src/tracking-engine.js             MindAR複数ターゲット追跡
src/creature-controller.js         生物の読込・遊泳
src/effect-controller.js           星・泡・光
src/photo-controller.js            AR写真の合成・共有
src/creature-config.js             3種類の設定と端末品質判定
EXHIBITION_CHECKLIST.md            展示前・当日の確認表
```

認識は画像ターゲット基準です。カードを完全に画面外へ出しても位置を保持するSLAM方式ではありません。
