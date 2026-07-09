"use client";

import { useState } from "react";
import type { Paper } from "../api/search/route";
import type { RelatedPaper } from "../api/citations/route";

function extractArxivId(paperId: string): string | null {
  const match = paperId.match(/abs\/([^/]+)$/);
  if (!match) return null;
  return match[1].replace(/v\d+$/, "");
}

function RelatedPaperList({ title, papers }: { title: string; papers: RelatedPaper[] }) {
  if (papers.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">見つかりませんでした。</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {papers.map((p, i) => (
          <li key={i} className="text-sm text-zinc-600 dark:text-zinc-400">
            <span className="text-zinc-400 dark:text-zinc-500">
              {p.publicationDate ? p.publicationDate.slice(0, 7) : "日付不明"}
            </span>{" "}
            {p.arxivId ? (
              <a
                href={`https://arxiv.org/abs/${p.arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {p.title}
              </a>
            ) : (
              p.title
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function useExpandableFetch<T>(fetchUrl: (arxivId: string) => string) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  async function toggle(arxivId: string | null) {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);

    if (data !== null) return;

    if (!arxivId) {
      setError("この論文のarXiv IDを取得できませんでした");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(fetchUrl(arxivId));
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "取得に失敗しました");
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }

  return { isExpanded, isLoading, error, data, toggle };
}

export function PaperCard({ paper }: { paper: Paper }) {
  const arxivId = extractArxivId(paper.id);

  const citations = useExpandableFetch<{ references: RelatedPaper[]; citations: RelatedPaper[] }>(
    (id) => `/api/citations?arxivId=${encodeURIComponent(id)}`,
  );
  const recommendations = useExpandableFetch<{ recommendations: RelatedPaper[] }>(
    (id) => `/api/recommendations?arxivId=${encodeURIComponent(id)}`,
  );

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
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
      <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{paper.summary}</p>

      <div className="mt-3 flex gap-4">
        <button
          type="button"
          onClick={() => citations.toggle(arxivId)}
          className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
        >
          {citations.isExpanded ? "引用関係を閉じる ▲" : "引用関係を見る ▼"}
        </button>
        <button
          type="button"
          onClick={() => recommendations.toggle(arxivId)}
          className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
        >
          {recommendations.isExpanded ? "類似論文を閉じる ▲" : "類似論文を見る ▼"}
        </button>
      </div>

      {citations.isExpanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {citations.isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
          {citations.error && <p className="text-sm text-red-600 dark:text-red-400">{citations.error}</p>}
          {citations.data && (
            <>
              <RelatedPaperList
                title="この論文が引用している論文（先行研究）"
                papers={citations.data.references}
              />
              <RelatedPaperList
                title="この論文を引用している論文（後続研究）"
                papers={citations.data.citations}
              />
            </>
          )}
        </div>
      )}

      {recommendations.isExpanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {recommendations.isLoading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
          )}
          {recommendations.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{recommendations.error}</p>
          )}
          {recommendations.data && (
            <RelatedPaperList title="類似論文" papers={recommendations.data.recommendations} />
          )}
        </div>
      )}
    </li>
  );
}
