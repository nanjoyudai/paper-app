export const SORT_BY_OPTIONS = [
  "citationCount",
  "citationsPerYear",
  "newest",
  "oldest",
  "similarity",
] as const;
export type SortBy = (typeof SORT_BY_OPTIONS)[number];
export const DEFAULT_SORT_BY: SortBy = "citationCount";

export function parseSortBy(value: string | null): SortBy {
  return SORT_BY_OPTIONS.includes(value as SortBy) ? (value as SortBy) : DEFAULT_SORT_BY;
}

export const SORT_BY_LABELS: Record<SortBy, string> = {
  citationCount: "被引用数順",
  citationsPerYear: "年間被引用数順",
  newest: "新しい順",
  oldest: "古い順",
  similarity: "類似度順",
};

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

// 被引用数を経過年数で割ることで、「単に古いから被引用数が多いだけ」の
// バイアスを緩和する。経過年数は最低1年として扱い、出たばかりの論文の
// スコアが分母の小ささで過剰に跳ね上がらないようにする。
// 公開日が不明な論文は比較不能なので最低値（0）を返す。
export function citationsPerYearScore(citationCount: number | null, publicationDate: string | null): number {
  if (!citationCount || citationCount <= 0) return 0;
  if (!publicationDate) return 0;

  const publishedAt = new Date(publicationDate).getTime();
  if (Number.isNaN(publishedAt)) return 0;

  const yearsElapsed = Math.max(1, (Date.now() - publishedAt) / MS_PER_YEAR);
  return citationCount / yearsElapsed;
}
