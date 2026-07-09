import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "../semantic-scholar-cache";
import { parseLimit } from "../related-papers-limit";
import { parseSortBy } from "../related-papers-sort";
import type { RelatedPaper } from "../citations/route";

const SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL =
  "https://api.semanticscholar.org/recommendations/v1/papers/forpaper/arXiv:";

const FIELDS = "title,publicationDate,externalIds,citationCount";

type RecommendedPaper = {
  title: string;
  publicationDate: string | null;
  externalIds?: { ArXiv?: string };
  citationCount?: number | null;
};

type SemanticScholarRecommendationsResponse = {
  recommendedPapers?: RecommendedPaper[];
};

function compareByDate(a: RelatedPaper, b: RelatedPaper, direction: "asc" | "desc"): number {
  if (!a.publicationDate) return 1;
  if (!b.publicationDate) return -1;
  const diff = a.publicationDate.localeCompare(b.publicationDate);
  return direction === "asc" ? diff : -diff;
}

export async function GET(request: NextRequest) {
  const arxivId = request.nextUrl.searchParams.get("arxivId")?.trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const sortBy = parseSortBy(request.nextUrl.searchParams.get("sortBy"));

  if (!arxivId) {
    return NextResponse.json({ error: "arxivIdを指定してください" }, { status: 400 });
  }

  const { status, data } = await cachedFetch<SemanticScholarRecommendationsResponse>(
    `${SEMANTIC_SCHOLAR_RECOMMENDATIONS_URL}${arxivId}?fields=${FIELDS}&limit=${limit}`,
  );

  if (status === 404) {
    return NextResponse.json({ error: "この論文の類似論文は見つかりませんでした" }, { status: 404 });
  }

  if (status === 429) {
    return NextResponse.json(
      { error: "Semantic Scholar APIのリクエスト上限に達しました。しばらく待って再試行してください" },
      { status: 429 },
    );
  }

  if (status !== 200) {
    return NextResponse.json({ error: "類似論文の取得に失敗しました" }, { status: 502 });
  }

  const candidates: RelatedPaper[] = (data.recommendedPapers ?? []).map((paper) => ({
    title: paper.title,
    publicationDate: paper.publicationDate,
    arxivId: paper.externalIds?.ArXiv ?? null,
    citationCount: paper.citationCount ?? null,
  }));

  // Semantic Scholarのrecommendationsは元々「類似度順」に返ってくる。
  // "similarity"以外が選ばれた場合は、取得済みの候補（上位limit件）をその条件で並べ替える。
  let recommendations = candidates;
  if (sortBy === "newest") {
    recommendations = [...candidates].sort((a, b) => compareByDate(a, b, "desc"));
  } else if (sortBy === "oldest") {
    recommendations = [...candidates].sort((a, b) => compareByDate(a, b, "asc"));
  } else if (sortBy === "citationCount") {
    recommendations = [...candidates].sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
  }

  return NextResponse.json({ recommendations });
}
