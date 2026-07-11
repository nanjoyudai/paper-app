"use client";

import { useState } from "react";
import type { RelatedPaper } from "../api/citations/route";

type Category = {
  key: string;
  label: string;
  color: string;
  laneX: number;
  papers: RelatedPaper[];
};

type PositionedNode = {
  key: string;
  category: Category;
  paper: RelatedPaper;
  x: number;
  y: number;
  r: number;
  showLabel: boolean;
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
const MIN_PLOT_HEIGHT = 280;
const MIN_NODE_R = 4;
const MAX_NODE_R = 15;
const DATE_TICK_COUNT = 5;
// 同じ時期に集中した論文をまとめる際の設定。
const CLUSTER_GAP = 18; // これ以内の距離にある論文は同じ「時期グループ」としてまとめる
const ROW_SPACING = 20; // グループ内・グループ間の縦間隔
const COL_SPACING = 24; // グループ内で横に並べる間隔
const MAX_COLS = 4; // 1グループを横に並べる最大数（超えたら下の行へ）
const CENTER_GAP = 22; // 選んだ論文の基準線から最低限空ける距離

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

type RawItem = { paper: RelatedPaper; rawY: number; r: number };

// 近い時期の論文をひとかたまりのグループにまとめる。
function clusterByProximity(items: RawItem[]): RawItem[][] {
  const sorted = [...items].sort((a, b) => a.rawY - b.rawY);
  const clusters: RawItem[][] = [];
  for (const item of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && item.rawY - current[0].rawY <= CLUSTER_GAP) {
      current.push(item);
    } else {
      clusters.push([item]);
    }
  }
  return clusters;
}

// クラスタ群を、基準点(anchorY)から direction 方向（+1=下, -1=上）へ順に積み上げて配置する。
// 「先行研究は基準線より上、後続研究は基準線より下」という制約を、密集時も
// 押し出しが基準線を越えないことで保証する（境界に一番近いクラスタから積む）。
function layoutClusters(
  clusters: RawItem[][],
  laneX: number,
  anchorY: number,
  direction: 1 | -1,
): PositionedNode[] {
  const nodes: PositionedNode[] = [];
  let cursorY = anchorY;

  // 境界（基準線）に近いクラスタから先に積む。
  const ordered = direction === 1 ? clusters : [...clusters].reverse();

  for (const cluster of ordered) {
    const showLabel = cluster.length === 1;
    const cols = Math.min(cluster.length, MAX_COLS);
    const rows = Math.ceil(cluster.length / MAX_COLS);

    cluster.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = laneX + (col - (cols - 1) / 2) * COL_SPACING;
      const y = cursorY + direction * row * ROW_SPACING;
      nodes.push({
        key: `${item.paper.title}-${i}`,
        category: undefined as unknown as Category,
        paper: item.paper,
        x,
        y,
        r: item.r,
        showLabel,
      });
    });

    const clusterSpan = (rows - 1) * ROW_SPACING;
    cursorY += direction * (clusterSpan + ROW_SPACING);
  }

  return nodes;
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
      papers: references,
    },
    {
      key: "recommendation",
      label: "類似論文",
      color: "var(--relation-map-recommendation)",
      laneX: LANE_XS[1],
      papers: recommendations,
    },
    {
      key: "citation",
      label: "引用されている論文（後続研究）",
      color: "var(--relation-map-citation)",
      laneX: LANE_XS[2],
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

  const maxLaneCount = Math.max(...categories.map((c) => c.papers.length));
  const basePlotHeight = Math.max(MIN_PLOT_HEIGHT, maxLaneCount * ROW_SPACING * 0.5);

  function rawYForDate(dateStr: string): number | null {
    if (!rankOf.has(dateStr)) return null;
    return MARGIN_TOP + (rankOf.get(dateStr)! / maxRank) * basePlotHeight;
  }

  const centerRawY = rawYForDate(centerPublishedDate) ?? MARGIN_TOP + basePlotHeight / 2;

  // レーンごとに「日付がわかる論文」と「わからない論文」に分け、日付がわかる方は
  // 基準線を絶対に越えないようクラスタ化して配置する。reference（先行研究）は
  // 基準線より必ず上、citation（後続研究）は必ず下になるよう、基準線に近い側の
  // 論文から順に積み上げる。recommendation（類似論文）は制約なく上から詰める。
  const datedNodesByCategory = categories.map((category) => {
    const dated: RawItem[] = category.papers
      .map((paper) => {
        const rawY = paper.publicationDate ? rawYForDate(paper.publicationDate) : null;
        return rawY === null ? null : { paper, rawY, r: nodeRadius(paper.citationCount) };
      })
      .filter((item): item is RawItem => item !== null);

    const clusters = clusterByProximity(dated);

    let placed: PositionedNode[];
    if (category.key === "reference") {
      placed = layoutClusters(clusters, category.laneX, centerRawY - CENTER_GAP, -1);
    } else if (category.key === "citation") {
      placed = layoutClusters(clusters, category.laneX, centerRawY + CENTER_GAP, 1);
    } else {
      placed = layoutClusters(clusters, category.laneX, MARGIN_TOP, 1);
    }

    return { category, nodes: placed.map((n) => ({ ...n, category })) };
  });

  const maxDatedY = datedNodesByCategory
    .flatMap((c) => c.nodes.map((n) => n.y + n.r))
    .reduce((max, y) => Math.max(max, y), MARGIN_TOP + basePlotHeight);
  const minDatedY = datedNodesByCategory
    .flatMap((c) => c.nodes.map((n) => n.y - n.r))
    .reduce((min, y) => Math.min(min, y), MARGIN_TOP);

  const noDateAnchorY = maxDatedY + NO_DATE_GAP;

  const undatedNodesByCategory = categories.map((category) => {
    const undated: RawItem[] = category.papers
      .filter((paper) => !paper.publicationDate || rawYForDate(paper.publicationDate) === null)
      .map((paper) => ({ paper, rawY: noDateAnchorY, r: nodeRadius(paper.citationCount) }));
    const clusters = clusterByProximity(undated);
    const placed = layoutClusters(clusters, category.laneX, noDateAnchorY, 1);
    return { category, nodes: placed.map((n) => ({ ...n, category })) };
  });

  const nodes: PositionedNode[] = [
    ...datedNodesByCategory.flatMap((c) => c.nodes),
    ...undatedNodesByCategory.flatMap((c) => c.nodes),
  ];

  const hasUndated = undatedNodesByCategory.some((c) => c.nodes.length > 0);
  const maxNodeBottom = nodes.reduce((max, n) => Math.max(max, n.y + n.r), noDateAnchorY);
  const minNodeTop = Math.min(minDatedY, MARGIN_TOP);
  // 先行研究（reference）が密集して基準線から上方向に押し出された場合、
  // キャンバス上端をはみ出すことがあるため、全体を下にずらして吸収する。
  const yShift = Math.max(0, MARGIN_TOP - minNodeTop);
  const viewBoxHeight = maxNodeBottom + yShift + MARGIN_BOTTOM;

  const centerY = centerRawY + yShift;
  const tickIndices = Array.from({ length: DATE_TICK_COUNT }, (_, i) =>
    Math.round((i / (DATE_TICK_COUNT - 1)) * maxRank),
  );
  const dateTicks = Array.from(new Set(tickIndices)).map((rank) => ({
    y: MARGIN_TOP + (rank / maxRank) * basePlotHeight + yShift,
    label: formatMonth(uniqueSortedDates[rank] ?? uniqueSortedDates[0]),
  }));

  function showTooltip(node: PositionedNode, e: React.MouseEvent) {
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
          （縦位置＝発表時期・近い時期はまとめて表示、円の大きさ＝被引用数）
        </span>
      </div>
      <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-500">
        丸をクリックするとこのサイトでその論文を検索、論文名をクリックするとarXivのページを開きます。件数が多い時期はまとめて表示され、ホバーすると個別の情報が見られます。
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
            y2={MARGIN_TOP + basePlotHeight + yShift}
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
          {hasUndated && (
            <text
              x={AXIS_X - 8}
              y={noDateAnchorY + yShift + 4}
              textAnchor="end"
              className="fill-zinc-400 dark:fill-zinc-500"
              fontSize={9}
            >
              日付不明
            </text>
          )}

          <line
            x1={LANE_XS[0] - 30}
            y1={centerY}
            x2={LANE_XS[2] + 30}
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

          {nodes.map((node) => {
            const y = node.y + yShift;
            return (
              <g
                key={node.key}
                opacity={hovered === null || hovered.key === node.key ? 1 : 0.35}
                onMouseEnter={(e) => showTooltip(node, e)}
                onMouseMove={(e) => showTooltip(node, e)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  cx={node.x}
                  cy={y}
                  r={node.r}
                  fill={node.category.color}
                  className="cursor-pointer"
                  onClick={() => onSelectPaper(node.paper.title)}
                />
                {node.showLabel &&
                  (node.paper.arxivId ? (
                    <a
                      href={`https://arxiv.org/abs/${node.paper.arxivId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <text
                        x={node.x}
                        y={y - node.r - 4}
                        textAnchor="middle"
                        className="fill-zinc-600 hover:underline dark:fill-zinc-400"
                        fontSize={10}
                      >
                        {truncate(node.paper.title, 26)}
                      </text>
                    </a>
                  ) : (
                    <text
                      x={node.x}
                      y={y - node.r - 4}
                      textAnchor="middle"
                      className="fill-zinc-600 dark:fill-zinc-400"
                      fontSize={10}
                    >
                      {truncate(node.paper.title, 26)}
                    </text>
                  ))}
              </g>
            );
          })}
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
