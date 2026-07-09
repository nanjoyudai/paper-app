import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "../semantic-scholar-cache";
import { parseLimit } from "../related-papers-limit";

const SEMANTIC_SCHOLAR_API_URL = "https://api.semanticscholar.org/graph/v1/paper/arXiv:";

const FIELDS = [
  "title",
  "publicationDate",
  "externalIds",
  "references.title",
  "references.publicationDate",
  "references.externalIds",
  "references.citationCount",
  "citations.title",
  "citations.publicationDate",
  "citations.externalIds",
  "citations.citationCount",
].join(",");

export type RelatedPaper = {
  title: string;
  publicationDate: string | null;
  arxivId: string | null;
  citationCount: number | null;
};

type SemanticScholarPaper = {
  title: string;
  publicationDate: string | null;
  externalIds?: { ArXiv?: string };
  citationCount?: number | null;
};

type SemanticScholarResponse = {
  title: string;
  publicationDate: string | null;
  references?: SemanticScholarPaper[];
  citations?: SemanticScholarPaper[];
};

function toRelatedPaper(paper: SemanticScholarPaper): RelatedPaper {
  return {
    title: paper.title,
    publicationDate: paper.publicationDate,
    arxivId: paper.externalIds?.ArXiv ?? null,
    citationCount: paper.citationCount ?? null,
  };
}

// 被引用数が多い論文ほど重要度が高いと見なし、上位N件だけを残す。
// その上で見やすさのために公開日の昇順（古い順）に並べ替える。
function selectMostCitedSortedByDate(papers: RelatedPaper[], limit: number): RelatedPaper[] {
  const topByCitationCount = [...papers]
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, limit);

  return topByCitationCount.sort((a, b) => {
    if (!a.publicationDate) return 1;
    if (!b.publicationDate) return -1;
    return a.publicationDate.localeCompare(b.publicationDate);
  });
}

export async function GET(request: NextRequest) {
  const arxivId = request.nextUrl.searchParams.get("arxivId")?.trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));

  if (!arxivId) {
    return NextResponse.json({ error: "arxivIdを指定してください" }, { status: 400 });
  }

  const { status, data } = await cachedFetch<SemanticScholarResponse>(
    `${SEMANTIC_SCHOLAR_API_URL}${arxivId}?fields=${FIELDS}`,
  );

  if (status === 404) {
    return NextResponse.json({ error: "この論文の引用情報は見つかりませんでした" }, { status: 404 });
  }

  if (status === 429) {
    return NextResponse.json(
      { error: "Semantic Scholar APIのリクエスト上限に達しました。しばらく待って再試行してください" },
      { status: 429 },
    );
  }

  if (status !== 200) {
    return NextResponse.json({ error: "引用情報の取得に失敗しました" }, { status: 502 });
  }

  const references = selectMostCitedSortedByDate((data.references ?? []).map(toRelatedPaper), limit);
  const citations = selectMostCitedSortedByDate((data.citations ?? []).map(toRelatedPaper), limit);

  return NextResponse.json({ references, citations });
}
