"use client";

import { useState } from "react";
import type { Paper } from "../api/search/route";
import type { RelatedPaper } from "../api/citations/route";
import { ALLOWED_LIMITS, DEFAULT_LIMIT, type RelatedPapersLimit } from "../api/related-papers-limit";
import { DEFAULT_SORT_BY, SORT_BY_LABELS, type SortBy } from "../api/related-papers-sort";
import { RelationMap } from "./RelationMap";

function extractArxivId(paperId: string): string | null {
  const match = paperId.match(/abs\/([^/]+)$/);
  if (!match) return null;
  return match[1].replace(/v\d+$/, "");
}

function LimitSelect({
  value,
  onChange,
}: {
  value: RelatedPapersLimit;
  onChange: (limit: RelatedPapersLimit) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value) as RelatedPapersLimit)}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    >
      {ALLOWED_LIMITS.map((limit) => (
        <option key={limit} value={limit}>
          上位{limit}件
        </option>
      ))}
    </select>
  );
}

function SortBySelect({
  options,
  value,
  onChange,
}: {
  options: SortBy[];
  value: SortBy;
  onChange: (sortBy: SortBy) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SortBy)}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
    >
      {options.map((sortBy) => (
        <option key={sortBy} value={sortBy}>
          {SORT_BY_LABELS[sortBy]}
        </option>
      ))}
    </select>
  );
}

function RateLimitNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p>Semantic Scholarが混み合っていて、一時的に取得できませんでした。</p>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
        少し待ってから再試行するか、無料のAPIキーを設定すると起きにくくなります（READMEの「Semantic
        Scholar APIキーの設定」を参照）。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 rounded-md border border-amber-400 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
      >
        再試行する
      </button>
    </div>
  );
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
            )}{" "}
            <span className="text-zinc-400 dark:text-zinc-500">
              （被引用数: {p.citationCount ?? "不明"}）
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function useExpandableFetch<T>(
  buildUrl: (arxivId: string, limit: RelatedPapersLimit, sortBy: SortBy) => string,
) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<
    { arxivId: string; limit: RelatedPapersLimit; sortBy: SortBy } | null
  >(null);

  async function fetchData(arxivId: string, limit: RelatedPapersLimit, sortBy: SortBy) {
    setIsLoading(true);
    setError(null);
    setStatus(null);
    setLastParams({ arxivId, limit, sortBy });

    try {
      const res = await fetch(buildUrl(arxivId, limit, sortBy));
      const json = await res.json();
      setStatus(res.status);

      if (!res.ok) {
        throw new Error(json.error ?? "取得に失敗しました");
      }

      setData(json);
      setLoadedKey(`${arxivId}:${limit}:${sortBy}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }

  function retry() {
    if (!lastParams) return;
    fetchData(lastParams.arxivId, lastParams.limit, lastParams.sortBy);
  }

  // 同じ(arxivId, limit, sortBy)の組み合わせで取得済みなら再フェッチしない。
  // 引用関係・類似論文・関係マップの間でデータを使い回すために使う。
  function ensureLoaded(arxivId: string | null, limit: RelatedPapersLimit, sortBy: SortBy) {
    if (!arxivId) {
      setError("この論文のarXiv IDを取得できませんでした");
      return;
    }

    const key = `${arxivId}:${limit}:${sortBy}`;
    if (data !== null && loadedKey === key) return;

    fetchData(arxivId, limit, sortBy);
  }

  function toggle(arxivId: string | null, limit: RelatedPapersLimit, sortBy: SortBy) {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }

    setIsExpanded(true);
    ensureLoaded(arxivId, limit, sortBy);
  }

  function refetch(arxivId: string | null, limit: RelatedPapersLimit, sortBy: SortBy) {
    if (!arxivId || !isExpanded) return;
    fetchData(arxivId, limit, sortBy);
  }

  return { isExpanded, isLoading, error, status, data, toggle, refetch, ensureLoaded, retry };
}

export function PaperCard({
  paper,
  onSelectPaper,
}: {
  paper: Paper;
  onSelectPaper: (title: string) => void;
}) {
  const arxivId = extractArxivId(paper.id);

  const [citationsLimit, setCitationsLimit] = useState<RelatedPapersLimit>(DEFAULT_LIMIT);
  const [citationsSortBy, setCitationsSortBy] = useState<SortBy>(DEFAULT_SORT_BY);
  const [recommendationsLimit, setRecommendationsLimit] = useState<RelatedPapersLimit>(DEFAULT_LIMIT);
  const [recommendationsSortBy, setRecommendationsSortBy] = useState<SortBy>("similarity");
  const [isMapOpen, setIsMapOpen] = useState(false);

  const citations = useExpandableFetch<{ references: RelatedPaper[]; citations: RelatedPaper[] }>(
    (id, limit, sortBy) =>
      `/api/citations?arxivId=${encodeURIComponent(id)}&limit=${limit}&sortBy=${sortBy}`,
  );
  const recommendations = useExpandableFetch<{ recommendations: RelatedPaper[] }>(
    (id, limit, sortBy) =>
      `/api/recommendations?arxivId=${encodeURIComponent(id)}&limit=${limit}&sortBy=${sortBy}`,
  );

  // 引用関係・類似論文セクションで既に取得済みのデータがあればそれを再利用し、
  // なければ現在選択中のlimit/sortByで取得する（マップ専用に新しく取り直さない）。
  function toggleMap() {
    if (isMapOpen) {
      setIsMapOpen(false);
      return;
    }

    setIsMapOpen(true);
    citations.ensureLoaded(arxivId, citationsLimit, citationsSortBy);
    recommendations.ensureLoaded(arxivId, recommendationsLimit, recommendationsSortBy);
  }

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

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => citations.toggle(arxivId, citationsLimit, citationsSortBy)}
          className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
        >
          {citations.isExpanded ? "引用関係を閉じる ▲" : "引用関係を見る ▼"}
        </button>
        <button
          type="button"
          onClick={() => recommendations.toggle(arxivId, recommendationsLimit, recommendationsSortBy)}
          className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
        >
          {recommendations.isExpanded ? "類似論文を閉じる ▲" : "類似論文を見る ▼"}
        </button>
        <button
          type="button"
          onClick={toggleMap}
          className="text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
        >
          {isMapOpen ? "関係マップを閉じる ▲" : "関係マップを見る ▼"}
        </button>
      </div>

      {isMapOpen && (
        <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          {(citations.isLoading || recommendations.isLoading) && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
          )}
          {citations.status === 429 && <RateLimitNotice onRetry={citations.retry} />}
          {recommendations.status === 429 && <RateLimitNotice onRetry={recommendations.retry} />}
          {citations.error && citations.status !== 429 && (
            <p className="text-sm text-red-600 dark:text-red-400">{citations.error}</p>
          )}
          {recommendations.error && recommendations.status !== 429 && (
            <p className="text-sm text-red-600 dark:text-red-400">{recommendations.error}</p>
          )}
          {citations.data && recommendations.data && (
            <RelationMap
              centerTitle={paper.title}
              centerPublishedDate={paper.published}
              references={citations.data.references}
              citations={citations.data.citations}
              recommendations={recommendations.data.recommendations}
              onSelectPaper={onSelectPaper}
            />
          )}
        </div>
      )}

      {citations.isExpanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <SortBySelect
              options={["citationCount", "citationsPerYear", "newest", "oldest"]}
              value={citationsSortBy}
              onChange={(sortBy) => {
                setCitationsSortBy(sortBy);
                citations.refetch(arxivId, citationsLimit, sortBy);
              }}
            />
            <LimitSelect
              value={citationsLimit}
              onChange={(limit) => {
                setCitationsLimit(limit);
                citations.refetch(arxivId, limit, citationsSortBy);
              }}
            />
          </div>
          {citations.isLoading && <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>}
          {citations.status === 429 && <RateLimitNotice onRetry={citations.retry} />}
          {citations.error && citations.status !== 429 && (
            <p className="text-sm text-red-600 dark:text-red-400">{citations.error}</p>
          )}
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
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <SortBySelect
              options={["similarity", "citationCount", "citationsPerYear", "newest", "oldest"]}
              value={recommendationsSortBy}
              onChange={(sortBy) => {
                setRecommendationsSortBy(sortBy);
                recommendations.refetch(arxivId, recommendationsLimit, sortBy);
              }}
            />
            <LimitSelect
              value={recommendationsLimit}
              onChange={(limit) => {
                setRecommendationsLimit(limit);
                recommendations.refetch(arxivId, limit, recommendationsSortBy);
              }}
            />
          </div>
          {recommendations.isLoading && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
          )}
          {recommendations.status === 429 && <RateLimitNotice onRetry={recommendations.retry} />}
          {recommendations.error && recommendations.status !== 429 && (
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
