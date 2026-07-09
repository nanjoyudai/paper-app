# paper-app

arXiv APIを使って論文を検索・閲覧できるWebアプリ。

## 目的

arXivに公開されている論文をキーワードで検索し、タイトル・著者・abstract・リンクなどを一覧表示する。まずは検索と表示のコア機能を作り、そこから機能を広げていく。

## 技術スタック

- [Next.js](https://nextjs.org)（App Router）
- TypeScript
- Tailwind CSS
- データソース: [arXiv API](https://info.arxiv.org/help/api/index.html)（APIキー不要のXML/Atomフィード）

## 設計方針

- **arXiv APIへのリクエストはサーバー側で行う。** arXiv APIはXML(Atom)を返しCORSの制約もあるため、Next.jsのRoute Handler（`app/api/...`）またはServer Componentから取得し、パース済みのデータをクライアントに渡す構成にする。フロントから直接叩かない。
- **XMLパースには軽量ライブラリを使う想定。**（例: `fast-xml-parser`）
- 状態管理はまず素朴に（React標準のuseState/Server Component）で組み、複雑化したら都度検討する。

## ディレクトリ構成（予定含む）

```
app/
  page.tsx           トップページ（検索フォーム＋結果一覧）
  api/search/        arXiv APIを叩くRoute Handler（予定）
  components/        UIコンポーネント（予定）
```

## 開発の進め方

- 機能を1つ実装・変更するごとにgitコミットする。コミットメッセージは「何を・なぜ変えたか」がわかるように書く。
- 設計や仕様に大きな変更があった場合は、このREADMEも合わせて更新する。

## Getting Started

開発サーバーの起動:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [arXiv API User's Manual](https://info.arxiv.org/help/api/user-manual.html)
