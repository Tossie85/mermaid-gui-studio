# Mermaid GUI Studio

Mermaid の図を **GUI で組み立てられる** VS Code 拡張です。コードを覚えていなくても、
フォームに項目を足していくだけで図が描けます。既存の Mermaid コードを読み込んで、
続きを GUI で編集することもできます。

Web版（ブラウザだけで動く同じツール）は <https://tossie85.site/tools/mermaid-gui-studio-2.html> で公開しています。

## 対応する図

- フローチャート
- シーケンス図
- 状態遷移図
- クラス図
- ER図
- アーキテクチャ図
- ガントチャート
- 円グラフ

## 使い方

インストール後、次のいずれかで開きます。

| 入口 | 場所 |
|---|---|
| アクティビティバーのアイコン | 左端の縦並び。押すとサイドバーが開き「エディタで開く」ボタンが出る |
| ステータスバー | 画面下部の「Mermaid GUI」 |
| コマンドパレット | `Mermaid GUI Studio を開く` |

図は `.svg` または `.html` として保存でき、`.mmd` / `.md` などのファイルから
Mermaid コードを読み込めます。

## 特徴

- **外部通信なし** — 図の生成はすべてローカルで完結します（CSP で通信を遮断）。
- **テーマ追従** — UI の配色はライト / ダーク / ハイコントラストに合わせて切り替わります。
  図そのものの配色（Mermaid のテーマ）は、保存物の見た目が変わらないよう利用者の選択のままにしています。
- **キャンバスの色を選べる** — プレビューの地の明暗を図に合わせて調整できます（保存物には含まれません）。

## 開発

依存パッケージはありません。クローンすればそのまま動きます。

```
npm run build     # media/ に Webview 用の HTML と mermaid を生成する
npm test          # 生成物が拡張として成立しているかを12件の観点で検める
npm run preview   # VS Code なしでブラウザから見られるコピーを作る
```

Web版と同じ `tools/mermaid-gui-studio-2.html` から、Webview 用の `media/index.html` を
組み立てています。`media/` は生成物なのでリポジトリには持たず、`.vsix` を作るときに
毎回作り直します。図の描画に使う `vendor/mermaid.min.js` は
[Mermaid](https://github.com/mermaid-js/mermaid)（MIT）の配布物をそのまま同梱したものです。

ツール本体（`tools/mermaid-gui-studio-2.html`）がこのリポジトリの原本で、
サイト <https://tossie85.site/tools/mermaid-gui-studio-2.html> で配信しているのはその複製です。

## ライセンス

[MIT License](https://opensource.org/licenses/MIT)（同梱の `LICENSE` を参照）
