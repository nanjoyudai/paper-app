"use client";

import { useState } from "react";
import type { RelatedPaper } from "../api/citations/route";

type Category = {
  key: string;
  label: string;
  color: string;
  laneX: number;
  labelAnchor: "start" | "middle" | "end";
  papers: RelatedPaper[];
};

const VIEWBOX_WIDTH = 700;
const AXIS_X = 46;
const LANE_XS = [170, 400, 610];
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 40;
const NO_DATE_GAP = 28;
const MIN_PLOT_HEIGHT = 360;
const MIN_NODE_GAP = 18;
const MIN_NODE_R = 4;
const MAX_NODE_R = 15;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// 被引用数をノードの大きさに反映（sqrtスケールで極端な差を抑える）。
function nodeRadius(citationCount: number | null): number {
  if (!citationCount || citationCount <= 0) return MIN_NODE_R;
  const scaled = Math.sqrt(citationCount) / 12;
  return Math.min(MAX_NODE_R, Math.max(MIN_NODE_R, MIN_NODE_R + scaled));
}

// 同じレーン内でノードが近すぎる/重なる場合に、時系列の順序を保ったまま
// 下方向に押し出して間隔を確保する（単純な累積オフセット方式）。
function deoverlapY(items: { y: number }[]): number[] {
  const sorted = items.map((item, i) => ({ y: item.y, i })).sort((a, b) => a.y - b.y);
  let prevY = -Infinity;
  const result: number[] = new Array(items.length);
  for (const { y, i } of sorted) {
    const placedY = Math.max(y, prevY + MIN_NODE_GAP);
    result[i] = placedY;
    prevY = placedY;
  }
  return result;
}

export function RelationMap({
  centerTitle,
  centerPublishedDate,
  references,
  citations,
  recommendations,
}: {
  centerTitle: string;
  centerPublishedDate: string;
  references: RelatedPaper[];
  citations: RelatedPaper[];
  recommendations: RelatedPaper[];
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const allCategories: Category[] = [
    {
      key: "reference",
      label: "引用している論文（先行研究）",
      color: "var(--relation-map-reference)",
      laneX: LANE_XS[0],
      labelAnchor: "end",
      papers: references,
    },
    {
      key: "recommendation",
      label: "類似論文",
      color: "var(--relation-map-recommendation)",
      laneX: LANE_XS[1],
      labelAnchor: "middle",
      papers: recommendations,
    },
    {
      key: "citation",
      label: "引用されている論文（後続研究）",
      color: "var(--relation-map-citation)",
      laneX: LANE_XS[2],
      labelAnchor: "start",
      papers: citations,
    },
  ];
  const categories = allCategories.filter((c) => c.papers.length > 0);

  if (categories.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">表示できる関連論文がありません。</p>;
  }

  const allDateValues = [
    centerPublishedDate,
    ...categories.flatMap((c) => c.papers.map((p) => p.publicationDate)),
  ]
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime())
    .filter((t) => !Number.isNaN(t));

  const minDate = allDateValues.length > 0 ? Math.min(...allDateValues) : 0;
  const maxDate = allDateValues.length > 0 ? Math.max(...allDateValues) : 1;
  const dateSpan = maxDate - minDate || 1;

  const maxLaneCount = Math.max(...categories.map((c) => c.papers.length));
  const plotHeight = Math.max(MIN_PLOT_HEIGHT, maxLaneCount * MIN_NODE_GAP);
  const viewBoxHeight = MARGIN_TOP + plotHeight + NO_DATE_GAP + MARGIN_BOTTOM;

  function yForDate(dateStr: string | null): number {
    if (!dateStr) return MARGIN_TOP + plotHeight + NO_DATE_GAP / 2;
    const t = new Date(dateStr).getTime();
    if (Number.isNaN(t)) return MARGIN_TOP + plotHeight + NO_DATE_GAP / 2;
    return MARGIN_TOP + ((t - minDate) / dateSpan) * plotHeight;
  }

  const nodes = categories.flatMap((category) => {
    const rawYs = category.papers.map((paper) => ({ y: yForDate(paper.publicationDate) }));
    const placedYs = deoverlapY(rawYs);

    return category.papers.map((paper, i) => ({
      key: `${category.key}-${i}`,
      category,
      paper,
      x: category.laneX,
      y: placedYs[i],
      r: nodeRadius(paper.citationCount),
    }));
  });

  const centerY = yForDate(centerPublishedDate);
  const dateTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: MARGIN_TOP + t * plotHeight,
    label: formatMonth(new Date(minDate + t * dateSpan).toISOString()),
  }));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--relation-map-center)" }}
          />
          選択中の論文（点線＝発表時期）
        </span>
        {categories.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.label}
          </span>
        ))}
        <span className="text-zinc-400 dark:text-zinc-500">（縦位置＝発表時期、円の大きさ＝被引用数）</span>
      </div>

      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}`}
        className="w-full max-w-3xl"
        role="img"
        aria-label={`「${centerTitle}」を中心にした、発表時期を縦軸にした引用・類似関係のマップ`}
      >
        {categories.map((c) => (
          <text
            key={`header-${c.key}`}
            x={c.laneX}
            y={MARGIN_TOP - 32}
            textAnchor="middle"
            className="fill-zinc-500 dark:fill-zinc-400"
            fontSize={11}
          >
            {c.key === "reference" ? "先行研究" : c.key === "citation" ? "後続研究" : "類似論文"}
          </text>
        ))}

        <line x1={AXIS_X} y1={MARGIN_TOP} x2={AXIS_X} y2={MARGIN_TOP + plotHeight} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />
        {dateTicks.map((tick, i) => (
          <g key={i}>
            <line x1={AXIS_X - 4} y1={tick.y} x2={AXIS_X} y2={tick.y} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />
            <text x={AXIS_X - 8} y={tick.y + 3} textAnchor="end" className="fill-zinc-400 dark:fill-zinc-500" fontSize={9}>
              {tick.label}
            </text>
          </g>
        ))}
        <line x1={AXIS_X} y1={MARGIN_TOP + plotHeight + 10} x2={AXIS_X} y2={MARGIN_TOP + plotHeight + NO_DATE_GAP} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} strokeDasharray="2 2" />
        <text x={AXIS_X - 8} y={MARGIN_TOP + plotHeight + NO_DATE_GAP / 2 + 3} textAnchor="end" className="fill-zinc-400 dark:fill-zinc-500" fontSize={9}>
          日付不明
        </text>

        <line
          x1={LANE_XS[0] - 20}
          y1={centerY}
          x2={LANE_XS[2] + 20}
          y2={centerY}
          stroke="var(--relation-map-center)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
        <text
          x={LANE_XS[1]}
          y={centerY - 8}
          textAnchor="middle"
          className="fill-zinc-900 dark:fill-zinc-50"
          fontSize={12}
          fontWeight={600}
        >
          {truncate(centerTitle, 44)}
        </text>

        {nodes.map((node) => (
          <g
            key={node.key}
            opacity={hoveredKey === null || hoveredKey === node.key ? 1 : 0.35}
            onMouseEnter={() => setHoveredKey(node.key)}
            onMouseLeave={() => setHoveredKey(null)}
          >
            {node.paper.arxivId ? (
              <a href={`https://arxiv.org/abs/${node.paper.arxivId}`} target="_blank" rel="noopener noreferrer">
                <title>
                  {node.paper.title}
                  {"\n"}
                  {node.paper.publicationDate ?? "日付不明"} ・ 被引用数: {node.paper.citationCount ?? "不明"}
                </title>
                <circle cx={node.x} cy={node.y} r={node.r} fill={node.category.color} />
              </a>
            ) : (
              <>
                <title>
                  {node.paper.title}
                  {"\n"}
                  {node.paper.publicationDate ?? "日付不明"} ・ 被引用数: {node.paper.citationCount ?? "不明"}
                </title>
                <circle cx={node.x} cy={node.y} r={node.r} fill={node.category.color} />
              </>
            )}
            <text
              x={
                node.category.labelAnchor === "end"
                  ? node.x - node.r - 6
                  : node.category.labelAnchor === "start"
                    ? node.x + node.r + 6
                    : node.x
              }
              y={node.y - node.r - 4}
              textAnchor={node.category.labelAnchor}
              className="fill-zinc-600 dark:fill-zinc-400"
              fontSize={10}
            >
              {truncate(node.paper.title, 26)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
