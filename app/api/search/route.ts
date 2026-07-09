import { XMLParser } from "fast-xml-parser";
import { NextRequest, NextResponse } from "next/server";
import { fetchArxiv } from "../arxiv-client";

const ARXIV_API_URL = "http://export.arxiv.org/api/query";

export type Paper = {
  id: string;
  title: string;
  summary: string;
  authors: string[];
  published: string;
  link: string;
};

type ArxivEntry = {
  id: string;
  title: string;
  summary: string;
  published: string;
  author?: { name: string } | { name: string }[];
  link?: { "@_href": string; "@_rel": string }[] | { "@_href": string; "@_rel": string };
};

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseEntry(entry: ArxivEntry): Paper {
  const links = toArray(entry.link);
  const abstractLink = links.find((l) => l["@_rel"] === "alternate")?.["@_href"] ?? entry.id;

  return {
    id: entry.id,
    title: entry.title.trim().replace(/\s+/g, " "),
    summary: entry.summary.trim().replace(/\s+/g, " "),
    authors: toArray(entry.author).map((a) => a.name),
    published: entry.published,
    link: abstractLink,
  };
}

const OPERATORS = ["AND", "OR"] as const;
type Operator = (typeof OPERATORS)[number];

const SORT_BY_VALUES = ["relevance", "lastUpdatedDate", "submittedDate"] as const;
type SortBy = (typeof SORT_BY_VALUES)[number];

const SORT_ORDER_VALUES = ["descending", "ascending"] as const;
type SortOrder = (typeof SORT_ORDER_VALUES)[number];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const terms = searchParams
    .getAll("term")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (terms.length === 0) {
    return NextResponse.json({ error: "検索キーワード(term)を1つ以上指定してください" }, { status: 400 });
  }

  const operatorParam = searchParams.get("operator");
  const operator: Operator = OPERATORS.includes(operatorParam as Operator)
    ? (operatorParam as Operator)
    : "AND";

  const sortByParam = searchParams.get("sortBy");
  const sortBy: SortBy = SORT_BY_VALUES.includes(sortByParam as SortBy)
    ? (sortByParam as SortBy)
    : "relevance";

  const sortOrderParam = searchParams.get("sortOrder");
  const sortOrder: SortOrder = SORT_ORDER_VALUES.includes(sortOrderParam as SortOrder)
    ? (sortOrderParam as SortOrder)
    : "descending";

  const searchQuery = terms.map((t) => `all:${t}`).join(` ${operator} `);

  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: "20",
    sortBy,
    sortOrder,
  });

  const { ok, xml } = await fetchArxiv(`${ARXIV_API_URL}?${params.toString()}`);

  if (!ok) {
    return NextResponse.json({ error: "arXiv APIへのリクエストに失敗しました" }, { status: 502 });
  }

  const parser = new XMLParser();
  const parsed = parser.parse(xml);

  const entries: ArxivEntry[] = toArray(parsed?.feed?.entry);
  const papers = entries.map(parseEntry);

  return NextResponse.json({ papers });
}
