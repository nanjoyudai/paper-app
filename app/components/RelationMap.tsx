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

type HoveredNode = {
  key: string;
  title: string;
  publicationDate: string | null;
  citationCount: number | null;
  clientX: number;
  clientY: number;
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
const DATE_TICK_COUNT = 5;

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
  onSelectPaper,
}: {
  centerTitle: string;
  centerPublishedDate: string;
  references: RelatedPaper[];
  citations: RelatedPaper[];
  recommendations: RelatedPaper[];
  onSelectPaper: (title: string) => void;
}) {
  const [hovered, setHovered] = useState<HoveredNode | null>(null);

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

  // 論文が存在する日付だけを均等間隔に並べ、論文が1件もない期間にスペースを割かない
  // （＝時期の空白を圧縮する）。同じ日付の論文は同じ位置に来るため、レーンをまたいだ
  // 前後関係の比較もしやすくなる。
  const uniqueSortedDates = Array.from(
    new Set(
      [centerPublishedDate, ...categories.flatMap((c) => c.papers.map((p) => p.publicationDate))].filter(
        (d): d is string => Boolean(d) && !Number.isNaN(new Date(d as string).getTime()),
      ),
    ),
  ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const rankOf = new Map(uniqueSortedDates.map((d, i) => [d, i]));
  const maxRank = Math.max(uniqueSortedDates.length - 1, 1);

  // まず見積もりの高さ（basePlotHeight）でランク位置を計算する。実際の描画高さ
  // （viewBoxHeight）は、deoverlapYで押し出された後の実際のY座標の最大値から
  // 後述で算出し直す。同じ日付にノードが集中して見積もりを超えて押し出されても、
  // キャンバスからはみ出して見切れることがないようにするため。
  const maxLaneCount = Math.max(...categories.map((c) => c.papers.length));
  const basePlotHeight = Math.max(MIN_PLOT_HEIGHT, maxLaneCount * MIN_NODE_GAP);

  function yForDate(dateStr: string | null): number {
    if (!dateStr || !rankOf.has(dateStr)) return MARGIN_TOP + basePlotHeight + NO_DATE_GAP / 2;
    return MARGIN_TOP + (rankOf.get(dateStr)! / maxRank) * basePlotHeight;
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

  const plotHeight = basePlotHeight;
  const maxNodeBottom = nodes.reduce((max, n) => Math.max(max, n.y + n.r), MARGIN_TOP + plotHeight);
  const viewBoxHeight = Math.max(
    MARGIN_TOP + plotHeight + NO_DATE_GAP + MARGIN_BOTTOM,
    maxNodeBottom + MARGIN_BOTTOM,
  );

  const centerY = yForDate(centerPublishedDate);
  const tickIndices = Array.from({ length: DATE_TICK_COUNT }, (_, i) =>
    Math.round((i / (DATE_TICK_COUNT - 1)) * maxRank),
  );
  const dateTicks = Array.from(new Set(tickIndices)).map((rank) => ({
    y: MARGIN_TOP + (rank / maxRank) * plotHeight,
    label: formatMonth(uniqueSortedDates[rank] ?? uniqueSortedDates[0]),
  }));

  function showTooltip(node: (typeof nodes)[number], e: React.MouseEvent) {
    setHovered({
      key: node.key,
      title: node.paper.title,
      publicationDate: node.paper.publicationDate,
      citationCount: node.paper.citationCount,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  return (
    <div className="relative">
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
        <span className="text-zinc-400 dark:text-zinc-500">
          （縦位置＝発表時期・論文がない期間は詰めて表示、円の大きさ＝被引用数）
        </span>
      </div>
      <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
        丸をクリックするとこのサイトでその論文を検索、論文名をクリックするとarXivのページを開きます。
      </p>

      {/* SVGを画面幅に合わせて縮小させず、狭い画面では横スクロールで読めるようにする。 */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}`}
          width={VIEWBOX_WIDTH}
          height={viewBoxHeight}
          style={{ minWidth: VIEWBOX_WIDTH }}
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

          <line
            x1={AXIS_X}
            y1={MARGIN_TOP}
            x2={AXIS_X}
            y2={MARGIN_TOP + plotHeight}
            className="stroke-zinc-300 dark:stroke-zinc-700"
            strokeWidth={1}
          />
          {dateTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={AXIS_X - 4}
                y1={tick.y}
                x2={AXIS_X}
                y2={tick.y}
                className="stroke-zinc-300 dark:stroke-zinc-700"
                strokeWidth={1}
              />
              <text
                x={AXIS_X - 8}
                y={tick.y + 3}
                textAnchor="end"
                className="fill-zinc-400 dark:fill-zinc-500"
                fontSize={9}
              >
                {tick.label}
              </text>
            </g>
          ))}
          <line
            x1={AXIS_X}
            y1={MARGIN_TOP + plotHeight + 10}
            x2={AXIS_X}
            y2={MARGIN_TOP + plotHeight + NO_DATE_GAP}
            className="stroke-zinc-200 dark:stroke-zinc-800"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <text
            x={AXIS_X - 8}
            y={MARGIN_TOP + plotHeight + NO_DATE_GAP / 2 + 3}
            textAnchor="end"
            className="fill-zinc-400 dark:fill-zinc-500"
            fontSize={9}
          >
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
              opacity={hovered === null || hovered.key === node.key ? 1 : 0.35}
              onMouseEnter={(e) => showTooltip(node, e)}
              onMouseMove={(e) => showTooltip(node, e)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={node.r}
                fill={node.category.color}
                className="cursor-pointer"
                onClick={() => onSelectPaper(node.paper.title)}
              />
              {node.paper.arxivId ? (
                <a href={`https://arxiv.org/abs/${node.paper.arxivId}`} target="_blank" rel="noopener noreferrer">
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
                    className="fill-zinc-600 hover:underline dark:fill-zinc-400"
                    fontSize={10}
                  >
                    {truncate(node.paper.title, 26)}
                  </text>
                </a>
              ) : (
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
              )}
            </g>
          ))}
        </svg>
      </div>

      {hovered && (
        <div
          className="pointer-events-none fixed z-10 max-w-xs rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          style={{ left: hovered.clientX + 14, top: hovered.clientY + 14 }}
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-50">{hovered.title}</p>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            {hovered.publicationDate ?? "日付不明"} ・ 被引用数: {hovered.citationCount ?? "不明"}
          </p>
        </div>
      )}
    </div>
  );
}
