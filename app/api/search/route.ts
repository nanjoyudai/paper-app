import { XMLParser } from "fast-xml-parser";
import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json({ error: "検索キーワード(q)を指定してください" }, { status: 400 });
  }

  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: "0",
    max_results: "20",
    sortBy: "relevance",
    sortOrder: "descending",
  });

  const response = await fetch(`${ARXIV_API_URL}?${params.toString()}`);

  if (!response.ok) {
    return NextResponse.json({ error: "arXiv APIへのリクエストに失敗しました" }, { status: 502 });
  }

  const xml = await response.text();
  const parser = new XMLParser();
  const parsed = parser.parse(xml);

  const entries: ArxivEntry[] = toArray(parsed?.feed?.entry);
  const papers = entries.map(parseEntry);

  return NextResponse.json({ papers });
}
