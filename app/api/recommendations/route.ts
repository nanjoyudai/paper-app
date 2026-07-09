import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "../semantic-scholar-cache";
import { parseLimit } from "../related-papers-limit";
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

export async function GET(request: NextRequest) {
  const arxivId = request.nextUrl.searchParams.get("arxivId")?.trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

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

  const recommendations: RelatedPaper[] = (data.recommendedPapers ?? []).map((paper) => ({
    title: paper.title,
    publicationDate: paper.publicationDate,
    arxivId: paper.externalIds?.ArXiv ?? null,
    citationCount: paper.citationCount ?? null,
  }));

  return NextResponse.json({ recommendations });
}
