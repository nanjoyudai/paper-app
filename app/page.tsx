"use client";

import { useState } from "react";
import type { Paper } from "./api/search/route";
import { PaperCard } from "./components/PaperCard";

type Operator = "AND" | "OR";
type SortBy = "relevance" | "lastUpdatedDate" | "submittedDate";
type SortOrder = "descending" | "ascending";

const SORT_BY_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "relevance", label: "関連度" },
  { value: "submittedDate", label: "投稿日" },
  { value: "lastUpdatedDate", label: "更新日" },
];

const SORT_ORDER_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "descending", label: "降順" },
  { value: "ascending", label: "昇順" },
];

export default function Home() {
  const [terms, setTerms] = useState<string[]>([""]);
  const [operator, setOperator] = useState<Operator>("AND");
  const [sortBy, setSortBy] = useState<SortBy>("relevance");
  const [sortOrder, setSortOrder] = useState<SortOrder>("descending");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [lastSearchedTerms, setLastSearchedTerms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTerm(index: number, value: string) {
    setTerms((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function addTerm() {
    setTerms((prev) => [...prev, ""]);
  }

  function removeTerm(index: number) {
    setTerms((prev) => prev.filter((_, i) => i !== index));
  }

  async function runSearch(searchTerms: string[], start: number, append: boolean) {
    const filledTerms = searchTerms.map((t) => t.trim()).filter((t) => t.length > 0);
    if (filledTerms.length === 0) return;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setLastSearchedTerms(filledTerms);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      filledTerms.forEach((t) => params.append("term", t));
      params.set("operator", operator);
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      params.set("start", String(start));

      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "検索に失敗しました");
      }

      setTotalResults(data.totalResults ?? null);
      setPapers((prev) => (append ? [...prev, ...data.papers] : data.papers));
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
      if (!append) {
        setPapers([]);
        setTotalResults(null);
      }
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    await runSearch(terms, 0, false);
  }

  // 関係マップのノードをクリックしたときに、その論文のタイトルでこのサイト内を検索し直す。
  function searchForPaper(title: string) {
    setTerms([title]);
    runSearch([title], 0, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadMore() {
    runSearch(lastSearchedTerms, papers.length, true);
  }

  const hasMore = totalResults !== null && papers.length < totalResults;

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            paper-app
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            arXivの論文をキーワードで検索します。
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {terms.map((term, index) => (
              <div key={index} className="flex items-center gap-2">
                {index > 0 && (
                  <span className="w-12 shrink-0 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                    {operator}
                  </span>
                )}
                <input
                  type="text"
                  value={term}
                  onChange={(e) => updateTerm(index, e.target.value)}
                  placeholder="例: transformer"
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                {terms.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTerm(index)}
                    className="shrink-0 rounded-md px-2 py-2 text-zinc-500 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    aria-label="このキーワードを削除"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addTerm}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              + キーワードを追加
            </button>

            {terms.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                結合条件
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as Operator)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                >
                  <option value="AND">AND（すべて含む）</option>
                  <option value="OR">OR（いずれか含む）</option>
                </select>
              </label>
            )}

            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              並び順
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {SORT_BY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {SORT_ORDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="ml-auto rounded-md bg-black px-5 py-2 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {isLoading ? "検索中..." : "検索"}
            </button>
          </div>
        </form>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

        <ul className="flex flex-col gap-6">
          {papers.map((paper) => (
            <PaperCard key={paper.id} paper={paper} onSelectPaper={searchForPaper} />
          ))}
        </ul>

        {papers.length > 0 && totalResults !== null && (
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            {totalResults.toLocaleString()}件中 {papers.length}件を表示
          </p>
        )}

        {hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoadingMore}
            className="self-center rounded-md border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isLoadingMore ? "読み込み中..." : "もっと読み込む"}
          </button>
        )}

        {!isLoading && papers.length === 0 && !error && (
          <p className="text-zinc-500 dark:text-zinc-400">
            キーワードを入力して検索してください。
          </p>
        )}
      </main>
    </div>
  );
}
