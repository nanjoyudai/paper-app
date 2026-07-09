"use client";

import { useState } from "react";
import type { Paper } from "./api/search/route";

export default function Home() {
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "検索に失敗しました");
      }

      setPapers(data.papers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索に失敗しました");
      setPapers([]);
    } finally {
      setIsLoading(false);
    }
  }

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

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例: transformer, quantum computing"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-black px-5 py-2 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {isLoading ? "検索中..." : "検索"}
          </button>
        </form>

        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}

        <ul className="flex flex-col gap-6">
          {papers.map((paper) => (
            <li
              key={paper.id}
              className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <a
                href={paper.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lg font-medium text-black hover:underline dark:text-zinc-50"
              >
                {paper.title}
              </a>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {paper.authors.join(", ")} ・ {new Date(paper.published).toLocaleDateString("ja-JP")}
              </p>
              <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                {paper.summary}
              </p>
            </li>
          ))}
        </ul>

        {!isLoading && papers.length === 0 && !error && (
          <p className="text-zinc-500 dark:text-zinc-400">
            キーワードを入力して検索してください。
          </p>
        )}
      </main>
    </div>
  );
}
