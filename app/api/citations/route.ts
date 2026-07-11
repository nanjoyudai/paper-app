import { NextRequest, NextResponse } from "next/server";
import { cachedFetch } from "../semantic-scholar-cache";
import { parseLimit } from "../related-papers-limit";
import { citationsPerYearScore, parseSortBy, type SortBy } from "../related-papers-sort";

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

function compareByDate(a: RelatedPaper, b: RelatedPaper, direction: "asc" | "desc"): number {
  if (!a.publicationDate) return 1;
  if (!b.publicationDate) return -1;
  const diff = a.publicationDate.localeCompare(b.publicationDate);
  return direction === "asc" ? diff : -diff;
}

// citationsのデータには類似度がないため、citations一覧では"similarity"は
// citationCountと同じ扱いにフォールバックする。
function selectTopN(papers: RelatedPaper[], limit: number, sortBy: SortBy): RelatedPaper[] {
  if (sortBy === "newest") {
    return [...papers].sort((a, b) => compareByDate(a, b, "desc")).slice(0, limit);
  }

  if (sortBy === "oldest") {
    return [...papers].sort((a, b) => compareByDate(a, b, "asc")).slice(0, limit);
  }

  if (sortBy === "citationsPerYear") {
    const topByRate = [...papers]
      .sort(
        (a, b) =>
          citationsPerYearScore(b.citationCount, b.publicationDate) -
          citationsPerYearScore(a.citationCount, a.publicationDate),
      )
      .slice(0, limit);

    return topByRate.sort((a, b) => compareByDate(a, b, "asc"));
  }

  // citationCount（デフォルト）・similarity（フォールバック）:
  // 被引用数が多い論文ほど重要度が高いと見なして上位N件を選び、
  // 見やすさのために公開日の昇順（古い順）に並べ替える。
  const topByCitationCount = [...papers]
    .sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0))
    .slice(0, limit);

  return topByCitationCount.sort((a, b) => compareByDate(a, b, "asc"));
}

export async function GET(request: NextRequest) {
  const arxivId = request.nextUrl.searchParams.get("arxivId")?.trim();
  const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
  const sortBy = parseSortBy(request.nextUrl.searchParams.get("sortBy"));

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

  const references = selectTopN((data.references ?? []).map(toRelatedPaper), limit, sortBy);
  const citations = selectTopN((data.citations ?? []).map(toRelatedPaper), limit, sortBy);

  return NextResponse.json({ references, citations });
}
