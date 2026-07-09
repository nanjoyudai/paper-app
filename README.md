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

- **arXiv APIへのリクエストはサーバー側で行う。** arXiv APIはXML(Atom)を返しCORSの制約もあるため、Next.jsのRoute Handler（`app/api/search/route.ts`）で取得・パースし、JSONにしてクライアントに渡す。フロントから直接arXivを叩かない。
- **XMLパースには`fast-xml-parser`を使用。** 依存が軽く、素直にオブジェクトへ変換できるため採用。
- **検索画面はClient Component。** フォーム入力・ローディング・エラー状態を扱うため`app/page.tsx`は`"use client"`にし、`fetch`で自前のAPI Route（`/api/search`）を呼ぶ構成にした。
- **キーワードは複数入力欄＋AND/OR結合。** 1つの入力欄にスペース区切りで書かせるとarXiv APIのクエリ構文（`AND`/`OR`/`ANDNOT`を明示する必要がある）と食い違うため、キーワードごとに入力欄を分け、`term`パラメータを複数渡してサーバー側で`AND`/`OR`のどちらか一種類の演算子で結合する設計にした。
- 状態管理はまず素朴に（React標準の`useState`）で組み、複雑化したら都度検討する。

## 実装済み機能

- `GET /api/search`: arXiv APIへ問い合わせ、最大20件を返すRoute Handler（`app/api/search/route.ts`）
  - `term`: 検索キーワード（複数指定可、例: `term=quantum&term=computing`）
  - `operator`: `AND` | `OR`（複数キーワードの結合方法、省略時は`AND`）
  - `sortBy`: `relevance` | `submittedDate` | `lastUpdatedDate`（省略時は`relevance`）
  - `sortOrder`: `descending` | `ascending`（省略時は`descending`）
- トップページ（`app/page.tsx`）: キーワードを複数追加できる検索フォーム（AND/OR切り替え、並び順選択付き）と、タイトル・著者・公開日・abstractを表示する結果一覧

## ディレクトリ構成

```
app/
  page.tsx                トップページ（検索フォーム＋結果一覧、Client Component）
  api/search/route.ts     arXiv APIを叩き、JSONを返すRoute Handler
```

## 開発の進め方

- 機能を1つ実装・変更するごとにgitコミットする。コミットメッセージは「何を・なぜ変えたか」がわかるように書く。
- 設計や仕様に大きな変更があった場合は、このREADMEも合わせて更新する。

## 変更履歴（時系列）

### 2026-07-09: プロジェクト作成
`create-next-app`でNext.js（App Router） + TypeScript + Tailwind CSSの雛形を作成。まずは検索・表示ができる最低限のところから始める方針とした。

### 2026-07-09: README作成（設計意図の明文化）
コードだけでなく「なぜその構成にしたか」を残すため、目的・技術スタック・設計方針をREADMEに記載。以後、設計判断はここに残していく運用にした。

### 2026-07-09: 検索機能の最小実装
- arXiv APIはXML(Atom)を返しCORSの制約もあるため、**サーバー側（Route Handler）で取得・パースしてJSONで返す**設計にした（クライアントから直接arXivを叩かない）。
- XMLパースは軽量な`fast-xml-parser`を採用。
- `app/page.tsx`はフォーム入力・ローディング・エラー状態を扱うためClient Component（`"use client"`）にした。
- この時点ではキーワードは1つの入力欄にそのまま渡すだけの実装（`all:<キーワード>`）。

### 2026-07-09: 複数キーワードのAND/OR検索・ソート機能を追加
- 課題: 1つの入力欄にスペース区切りで複数単語を書かせる方式だと、arXiv APIのクエリ構文（`AND`/`OR`/`ANDNOT`を明示する必要がある）と食い違い、意図通りに絞り込めなかった。
- 対応: キーワードごとに入力欄を分けて追加できるようにし（`term`パラメータを複数送信）、それらを`AND`/`OR`いずれか一種類の演算子で結合する設計に変更。
- 並び順（関連度・投稿日・更新日）と昇順/降順をUIから選べるようにし、`sortBy`/`sortOrder`としてAPIに渡すようにした（従来は関連度・降順に固定していた）。

## Getting Started

開発サーバーの起動:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [arXiv API User's Manual](https://info.arxiv.org/help/api/user-manual.html)
