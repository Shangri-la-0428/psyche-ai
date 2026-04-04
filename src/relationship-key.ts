export const DEFAULT_RELATIONSHIP_USER_ID = "_default";

export function resolveRelationshipUserId(userId?: string | null): string {
  const normalized = userId?.trim();
  return normalized ? normalized : DEFAULT_RELATIONSHIP_USER_ID;
}
