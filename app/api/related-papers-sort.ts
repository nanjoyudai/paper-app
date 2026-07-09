export const SORT_BY_OPTIONS = ["citationCount", "newest", "oldest", "similarity"] as const;
export type SortBy = (typeof SORT_BY_OPTIONS)[number];
export const DEFAULT_SORT_BY: SortBy = "citationCount";

export function parseSortBy(value: string | null): SortBy {
  return SORT_BY_OPTIONS.includes(value as SortBy) ? (value as SortBy) : DEFAULT_SORT_BY;
}

export const SORT_BY_LABELS: Record<SortBy, string> = {
  citationCount: "被引用数順",
  newest: "新しい順",
  oldest: "古い順",
  similarity: "類似度順",
};
