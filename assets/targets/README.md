# 画像追跡ターゲット

現在の `demo-card.png` と `demo-card.mind` は、Phase 2の技術確認用にMindAR公式サンプルから取得した仮ターゲットです。

出典: https://github.com/hiukim/mind-ar-js/tree/1.2.5/examples/image-tracking/assets/card-example

実物作品の撮影条件が決まったら、次の手順で差し替えます。

1. レジン作品の下に置くカードまたは台座を、展示時と近い照明で正面から撮影
2. MindAR Image Targets Compilerへ画像を入れる
3. 特徴点が画像全体へ十分に分散していることを確認
4. 出力されたファイルを `artwork.mind` としてこのフォルダへ保存
5. `src/tracking-engine.js` の `imageTargetSrc` を変更

単色、反射が強い面、同じ模様の繰り返しは避け、文字・輪郭・細かな模様が不規則に含まれる画像を使ってください。
