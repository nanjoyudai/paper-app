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
- **引用関係・類似論文は被引用数が多い順に上位N件へ絞る。** 1つの論文に対して引用/被引用が数十〜数百件になることがあり、そのまま全件出すと読みづらい。「多く引用されている論文ほど重要度が高い可能性が高い」という単純なヒューリスティックで`citationCount`（被引用数）順に上位を選び、選んだ後は表示上わかりやすいように公開日の昇順に並べ替える（`app/api/citations/route.ts`の`selectMostCitedSortedByDate`）。件数（5/10/20/50）はUIから選べるようにし、フロント・API間で許容値を`app/api/related-papers-limit.ts`に1箇所にまとめて共有している。
  - 注意点: 「引用している論文（citations側）」を被引用数で絞ると、単に古い論文の方が有利になりやすいバイアスがある。今はシンプルさを優先し、この点は許容している。
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
  - `limit`: `5` | `10` | `20` | `50`（省略時は`5`）
  - この論文が引用している論文（references）／この論文を引用している論文（citations）を、それぞれ被引用数が多い順に上位`limit`件選んだ上で公開日の昇順（古い順）に並べて返す
- `GET /api/recommendations`: Semantic Scholar Recommendations APIから類似論文を取得するRoute Handler（`app/api/recommendations/route.ts`）
  - `arxivId`: arXiv ID
  - `limit`: `5` | `10` | `20` | `50`（省略時は`5`）
  - 引用関係ではなく、Semantic Scholar側のモデルが算出した「似ている論文」を返す
- トップページ（`app/page.tsx`）: キーワードを複数追加できる検索フォーム（AND/OR切り替え、並び順選択付き）と、タイトル・著者・公開日・abstract・引用関係／類似論文の開閉ボタンを表示する結果一覧（`app/components/PaperCard.tsx`）

## ディレクトリ構成

```
app/
  page.tsx                          トップページ（検索フォーム＋結果一覧、Client Component）
  components/PaperCard.tsx          論文1件の表示（引用関係・類似論文の開閉を含む、Client Component）
  api/search/route.ts               arXiv APIを叩き、JSONを返すRoute Handler
  api/arxiv-client.ts                arXiv APIへのリクエスト間隔制御・キャッシュ・User-Agent付与
  api/citations/route.ts            Semantic Scholar APIから引用関係を取得するRoute Handler
  api/recommendations/route.ts      Semantic Scholar APIから類似論文を取得するRoute Handler
  api/semantic-scholar-cache.ts     Semantic Scholar APIレスポンスの簡易メモリキャッシュ（両Route Handlerで共有）
  api/related-papers-limit.ts       引用関係・類似論文の表示件数（5/10/20/50）の共有定義
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

### 2026-07-09: Semantic Scholar APIキー対応・429時の簡易リトライ
- キャッシュだけでは、まだ見ていない新しい論文を次々開くと結局すぐ429になる問題が残っていた（無認証APIのレート制限はこのアプリ単体の呼び出し回数ではなく、キー未登録の利用者全体で共有されているため）。
- 根本対策として、環境変数`SEMANTIC_SCHOLAR_API_KEY`が設定されていればリクエストヘッダ`x-api-key`に載せて送るようにした（`app/api/semantic-scholar-cache.ts`）。無料でキーを取得すれば専用の割り当てになりレート制限が緩和される。
- 補助的な対策として、429が返ってきた場合は1.5秒待って1回だけ再試行するようにした（瞬間的な混雑だけなら救済できる）。
- `.env.local.example`を追加し、READMEにキーの取得・設定手順を記載。

### 2026-07-09: arXiv APIのレート制限対策
- 課題: arXiv APIも短時間に何度も検索すると制限に当たるようになった。arXivの利用規約（1リクエスト3秒間隔、User-Agentで身元を明示）に沿っていなかったのが原因。
- 対応: `app/api/arxiv-client.ts`を新設し、以下をSemantic Scholarとは別に実装。
  - リクエストを直列化するキューを持ち、前回のリクエストから3秒経っていなければ待ってから送る（`search`のRoute Handlerから直接`fetch`していたのをこのクライアント経由に変更）。
  - 検索結果をクエリURL単位でメモリキャッシュ（TTL 10分）。同じ検索条件を繰り返してもAPIは叩かない。
  - `User-Agent`ヘッダーにアプリ名を含めて送信するようにした（arXiv側からアクセス元を識別できるように）。

### 2026-07-09: 引用関係・類似論文を被引用数上位N件に絞る機能を追加
- 課題: 1つの論文について引用/被引用が数十件以上返ってくることがあり、そのまま全部表示すると読みづらい。
- 対応: 「多く引用されている論文＝重要度が高い可能性が高い」という単純なルールを採用し、Semantic Scholar APIから`citationCount`（被引用数）も取得した上で、被引用数が多い順に上位N件だけを選んでから公開日の昇順で表示するようにした（`app/api/citations/route.ts`の`selectMostCitedSortedByDate`）。
- 表示件数（5/10/20/50）はUIのセレクトボックスから選べるようにし、citations・recommendations両方のRoute Handlerと画面側で使う許容値の定義を`app/api/related-papers-limit.ts`に集約した。
- 各論文の横に被引用数も表示し、なぜその論文が選ばれたのかがわかるようにした。

## Getting Started

開発サーバーの起動:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開く。

### Semantic Scholar APIキーの設定（推奨）

無認証のSemantic Scholar APIはレート制限がかなり低く、他の利用者とも共有されているため、少し使うだけで「リクエスト上限に達しました」というエラーが出やすい。無料のAPIキーを取得すると専用の割り当てになり緩和される。

1. https://www.semanticscholar.org/product/api#api-key-form から無料申請
2. `.env.local.example`を`.env.local`にコピーし、発行されたキーを`SEMANTIC_SCHOLAR_API_KEY`に設定
3. 開発サーバーを再起動

キーがなくても動作はするが、citations/recommendationsで429エラーが出やすい。

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [arXiv API User's Manual](https://info.arxiv.org/help/api/user-manual.html)
