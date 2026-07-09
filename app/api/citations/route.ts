import { NextRequest, NextResponse } from "next/server";

const SEMANTIC_SCHOLAR_API_URL = "https://api.semanticscholar.org/graph/v1/paper/arXiv:";

const FIELDS = [
  "title",
  "publicationDate",
  "externalIds",
  "references.title",
  "references.publicationDate",
  "references.externalIds",
  "citations.title",
  "citations.publicationDate",
  "citations.externalIds",
].join(",");

export type RelatedPaper = {
  title: string;
  publicationDate: string | null;
  arxivId: string | null;
};

type SemanticScholarPaper = {
  title: string;
  publicationDate: string | null;
  externalIds?: { ArXiv?: string };
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
  };
}

function sortByDateAscending(papers: RelatedPaper[]): RelatedPaper[] {
  return [...papers].sort((a, b) => {
    if (!a.publicationDate) return 1;
    if (!b.publicationDate) return -1;
    return a.publicationDate.localeCompare(b.publicationDate);
  });
}

export async function GET(request: NextRequest) {
  const arxivId = request.nextUrl.searchParams.get("arxivId")?.trim();

  if (!arxivId) {
    return NextResponse.json({ error: "arxivIdを指定してください" }, { status: 400 });
  }

  const response = await fetch(`${SEMANTIC_SCHOLAR_API_URL}${arxivId}?fields=${FIELDS}`);

  if (response.status === 404) {
    return NextResponse.json({ error: "この論文の引用情報は見つかりませんでした" }, { status: 404 });
  }

  if (response.status === 429) {
    return NextResponse.json(
      { error: "Semantic Scholar APIのリクエスト上限に達しました。しばらく待って再試行してください" },
      { status: 429 },
    );
  }

  if (!response.ok) {
    return NextResponse.json({ error: "引用情報の取得に失敗しました" }, { status: 502 });
  }

  const data: SemanticScholarResponse = await response.json();

  const references = sortByDateAscending((data.references ?? []).map(toRelatedPaper));
  const citations = sortByDateAscending((data.citations ?? []).map(toRelatedPaper));

  return NextResponse.json({ references, citations });
}
