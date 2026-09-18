/** Defaults first, then additions; removals always win. Inputs are unchanged. */
export function resolveApplicationAccess(
  defaultApplicationIds: readonly string[],
  addedApplicationIds: readonly string[],
  removedApplicationIds: readonly string[],
): string[] {
  const removed = new Set(removedApplicationIds);
  return [...new Set([...defaultApplicationIds, ...addedApplicationIds])]
    .filter((id) => !removed.has(id));
}
