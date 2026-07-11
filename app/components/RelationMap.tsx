"use client";

import { useState } from "react";
import type { RelatedPaper } from "../api/citations/route";

type Category = {
  key: string;
  label: string;
  color: string;
  papers: RelatedPaper[];
};

const VIEWBOX_SIZE = 640;
const CENTER = VIEWBOX_SIZE / 2;
const NODE_RADIUS_FROM_CENTER = 240;
const MIN_NODE_R = 4;
const MAX_NODE_R = 15;
const SECTOR_GAP_DEG = 6;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// 被引用数をノードの大きさに反映（sqrtスケールで極端な差を抑える）。
function nodeRadius(citationCount: number | null): number {
  if (!citationCount || citationCount <= 0) return MIN_NODE_R;
  const scaled = Math.sqrt(citationCount) / 12;
  return Math.min(MAX_NODE_R, Math.max(MIN_NODE_R, MIN_NODE_R + scaled));
}

function polarToXY(angleDeg: number, radius: number): { x: number; y: number } {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(angleRad),
    y: CENTER + radius * Math.sin(angleRad),
  };
}

export function RelationMap({
  centerTitle,
  references,
  citations,
  recommendations,
}: {
  centerTitle: string;
  references: RelatedPaper[];
  citations: RelatedPaper[];
  recommendations: RelatedPaper[];
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const categories: Category[] = [
    { key: "reference", label: "引用している論文（先行研究）", color: "var(--relation-map-reference)", papers: references },
    { key: "citation", label: "引用されている論文（後続研究）", color: "var(--relation-map-citation)", papers: citations },
    { key: "recommendation", label: "類似論文", color: "var(--relation-map-recommendation)", papers: recommendations },
  ].filter((c) => c.papers.length > 0);

  if (categories.length === 0) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">表示できる関連論文がありません。</p>;
  }

  const sectorSpan = 360 / categories.length;

  const nodes = categories.flatMap((category, categoryIndex) => {
    const sectorStart = categoryIndex * sectorSpan + SECTOR_GAP_DEG / 2;
    const sectorEnd = (categoryIndex + 1) * sectorSpan - SECTOR_GAP_DEG / 2;
    const usableSpan = sectorEnd - sectorStart;

    return category.papers.map((paper, i) => {
      const angle =
        category.papers.length === 1
          ? sectorStart + usableSpan / 2
          : sectorStart + (i / (category.papers.length - 1)) * usableSpan;
      const { x, y } = polarToXY(angle, NODE_RADIUS_FROM_CENTER);
      const r = nodeRadius(paper.citationCount);
      const key = `${category.key}-${i}`;
      const labelAnchor: "start" | "end" = Math.cos((angle * Math.PI) / 180) >= 0 ? "start" : "end";
      const labelOffset = labelAnchor === "start" ? r + 6 : -(r + 6);

      return { key, category, paper, x, y, r, labelAnchor, labelOffset };
    });
  });

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "var(--relation-map-center)" }}
          />
          選択中の論文
        </span>
        {categories.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
            {c.label}
          </span>
        ))}
        <span className="text-zinc-400 dark:text-zinc-500">（円の大きさ＝被引用数）</span>
      </div>

      <svg
        viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
        className="w-full max-w-2xl"
        role="img"
        aria-label={`「${centerTitle}」を中心にした引用・類似関係のマップ`}
      >
        {nodes.map((node) => (
          <line
            key={`line-${node.key}`}
            x1={CENTER}
            y1={CENTER}
            x2={node.x}
            y2={node.y}
            stroke={node.category.color}
            strokeWidth={2}
            opacity={hoveredKey === null || hoveredKey === node.key ? 0.55 : 0.15}
          />
        ))}

        <circle cx={CENTER} cy={CENTER} r={22} fill="var(--relation-map-center)" />
        <text
          x={CENTER}
          y={CENTER + 40}
          textAnchor="middle"
          className="fill-zinc-900 dark:fill-zinc-50"
          fontSize={13}
          fontWeight={600}
        >
          {truncate(centerTitle, 36)}
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
              x={node.x + node.labelOffset}
              y={node.y + 3}
              textAnchor={node.labelAnchor}
              className="fill-zinc-600 dark:fill-zinc-400"
              fontSize={10}
            >
              {truncate(node.paper.title, 28)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
