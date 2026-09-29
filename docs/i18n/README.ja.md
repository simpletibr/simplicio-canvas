# Simplicio Canvas

[← English](../../README.md) · **日本語**

ローカルファーストの2Dフロービューア。GitHubプロジェクトのリンクを貼ると、そのフローをフローチャート（エントリポイント → ステップ → 呼び出し、各ステップの内容とソース付き）で表示します。実際の実行またはシミュレーションを、LLM呼び出しも含めてステップごとに再生できます。

```bash
git clone https://github.com/simpletibr/simplicio-canvas.git
cd simplicio-canvas && npm install && npm run dev
```

ローカルで実行: `npm run dev` → http://127.0.0.1:5173

- **フロー** — アーキテクチャとエントリポイントごとのフロー。Mermaidエクスポート対応。
- **リプレイ** — `simplicio.trace/v1` ファイルまたは `simplicio-loop turbo` が出力するJSONを読み込み、再生・一時停止・ステップ実行。各LLM呼び出しのモデル、トークン、コスト、レイテンシ、プロンプト／応答のプレビューを表示。
- **シミュレーション** — リクエストを入力すると、何も実行せずに、どこへ進みなぜそうなるかを確認できます。

コードはあなたのマシンに残ります。ファイルはブラウザ内で読み込まれ、アップロードされません。

![Simplicio Canvas](../images/flows.png)

[トレース形式](../trace-format.md) · [シミュレーション](../simulation.md) · [MIT](../../LICENSE)
