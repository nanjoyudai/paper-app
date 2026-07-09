export const ALLOWED_LIMITS = [5, 10, 20, 50] as const;
export type RelatedPapersLimit = (typeof ALLOWED_LIMITS)[number];
export const DEFAULT_LIMIT: RelatedPapersLimit = 5;

export function parseLimit(value: string | null): RelatedPapersLimit {
  const parsed = Number(value);
  return ALLOWED_LIMITS.includes(parsed as RelatedPapersLimit)
    ? (parsed as RelatedPapersLimit)
    : DEFAULT_LIMIT;
}
