# paper-app

arXiv APIを使って論文を検索・閲覧できるWebアプリ。

## 目的

arXivに公開されている論文をキーワードで検索し、タイトル・著者・abstract・リンクなどを一覧表示する。まずは検索と表示のコア機能を作り、そこから機能を広げていく。

## 技術スタック

- [Next.js](https://nextjs.org)（App Router）
- TypeScript
- Tailwind CSS
- データソース:
  - [arXiv API](https://info.arxiv.org/help/api/index.html)（APIキー不要のXML/Atomフィード） — 論文検索
  - [Semantic Scholar Academic Graph API](https://api.semanticscholar.org/api-docs/graph)（APIキー不要、無認証は低レート制限） — 引用関係の取得
  - [Semantic Scholar Recommendations API](https://api.semanticscholar.org/api-docs/recommendations)（同上） — 類似論文のおすすめ

## 設計方針

- **arXiv APIへのリクエストはサーバー側で行う。** arXiv APIはXML(Atom)を返しCORSの制約もあるため、Next.jsのRoute Handler（`app/api/search/route.ts`）で取得・パースし、JSONにしてクライアントに渡す。フロントから直接arXivを叩かない。
- **XMLパースには`fast-xml-parser`を使用。** 依存が軽く、素直にオブジェクトへ変換できるため採用。
- **検索画面はClient Component。** フォーム入力・ローディング・エラー状態を扱うため`app/page.tsx`は`"use client"`にし、`fetch`で自前のAPI Route（`/api/search`）を呼ぶ構成にした。
- **キーワードは複数入力欄＋AND/OR結合。** 1つの入力欄にスペース区切りで書かせるとarXiv APIのクエリ構文（`AND`/`OR`/`ANDNOT`を明示する必要がある）と食い違うため、キーワードごとに入力欄を分け、`term`パラメータを複数渡してサーバー側で`AND`/`OR`のどちらか一種類の演算子で結合する設計にした。
- **引用関係（先行研究／後続研究）は1段階のみ表示。** 「研究の系譜」を多段の引用グラフとして再帰的にたどると、外部APIの呼び出し回数が指数的に増えて複雑になるため、まずは選んだ論文が「引用している論文」「引用されている論文」を1段階分だけ日付順（古い順）に表示するスコープに絞った。arXivはAPIとして引用データを持たないため、この部分だけSemantic Scholar APIを別途利用している。
- **Semantic Scholarへのレスポンスはサーバー側でメモリキャッシュする。** 無認証APIはレート制限がかなり低く、同じ論文の引用/類似論文を何度も開閉するだけですぐ429（Too Many Requests）になっていたため、`app/api/semantic-scholar-cache.ts`にURL単位・30分TTLの簡易キャッシュを用意し、citations・recommendations両方のRoute Handlerで共有している。サーバープロセスが再起動すると消える程度の簡素な実装で今は十分。
- 状態管理はまず素朴に（React標準の`useState`）で組み、複雑化したら都度検討する。

## 実装済み機能

- `GET /api/search`: arXiv APIへ問い合わせ、最大20件を返すRoute Handler（`app/api/search/route.ts`）
  - `term`: 検索キーワード（複数指定可、例: `term=quantum&term=computing`）
  - `operator`: `AND` | `OR`（複数キーワードの結合方法、省略時は`AND`）
  - `sortBy`: `relevance` | `submittedDate` | `lastUpdatedDate`（省略時は`relevance`）
  - `sortOrder`: `descending` | `ascending`（省略時は`descending`）
- `GET /api/citations`: Semantic Scholar APIから引用情報を取得するRoute Handler（`app/api/citations/route.ts`）
  - `arxivId`: arXiv ID（例: `2201.00978`、バージョン番号なし）
  - この論文が引用している論文（references）／この論文を引用している論文（citations）を、それぞれ公開日の昇順（古い順）で返す
- `GET /api/recommendations`: Semantic Scholar Recommendations APIから類似論文を取得するRoute Handler（`app/api/recommendations/route.ts`）
  - `arxivId`: arXiv ID
  - 引用関係ではなく、Semantic Scholar側のモデルが算出した「似ている論文」を最大10件返す
- トップページ（`app/page.tsx`）: キーワードを複数追加できる検索フォーム（AND/OR切り替え、並び順選択付き）と、タイトル・著者・公開日・abstract・引用関係／類似論文の開閉ボタンを表示する結果一覧（`app/components/PaperCard.tsx`）

## ディレクトリ構成

```
app/
  page.tsx                          トップページ（検索フォーム＋結果一覧、Client Component）
  components/PaperCard.tsx          論文1件の表示（引用関係・類似論文の開閉を含む、Client Component）
  api/search/route.ts               arXiv APIを叩き、JSONを返すRoute Handler
  api/citations/route.ts            Semantic Scholar APIから引用関係を取得するRoute Handler
  api/recommendations/route.ts      Semantic Scholar APIから類似論文を取得するRoute Handler
  api/semantic-scholar-cache.ts     Semantic Scholar APIレスポンスの簡易メモリキャッシュ（両Route Handlerで共有）
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

### 2026-07-09: 引用関係（先行研究／後続研究）の表示機能を追加
- 動機: 類似論文をおすすめする機能の一歩目として、まず「引用構造から研究の前後関係を見えるようにしたい」という要望を受けた。
- arXiv APIには引用データがないため、Semantic Scholar APIを新たに利用。arXiv IDを渡すと、その論文が引用している論文（references）とその論文を引用している論文（citations）を取得できる。
- スコープは1段階の引用関係のみとした（多段階の引用グラフをたどると呼び出し回数・複雑さが跳ね上がるため）。取得した一覧は公開日の昇順で並べ、「古い方＝先行研究」が視覚的にわかるようにした。
- UI側は各論文カードに「引用関係を見る」ボタンを追加し、クリックで開閉・初回クリック時のみAPIを呼ぶ形にした。カード自体のロジックが増えたため、`app/components/PaperCard.tsx`として切り出した。

### 2026-07-09: 類似論文のおすすめ機能を追加、Semantic Scholarのレート制限対策
- Semantic Scholar Recommendations APIを使い、「引用関係」とは別に「類似論文」ボタンを論文カードに追加。こちらは引用の有無ではなく、Semantic Scholar側のモデルが類似度で算出した論文を返す。
- 課題: 引用関係・類似論文をいくつも開閉して動作確認しているだけで、無認証のSemantic Scholar APIのレート制限（429 Too Many Requests）にすぐ達してしまった。
- 対応: `app/api/semantic-scholar-cache.ts`にURLをキーにした簡易メモリキャッシュ（TTL 30分）を追加し、citations・recommendations両方のRoute Handlerで共有。同じ論文について短時間に何度も開閉しても実際のAPI呼び出しは1回で済むようにした。

## Getting Started

開発サーバーの起動:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [arXiv API User's Manual](https://info.arxiv.org/help/api/user-manual.html)
