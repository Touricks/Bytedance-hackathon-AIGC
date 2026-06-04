/**
 * Pure helpers for filesystem-based workspace discovery.
 *
 * The homepage workspace list is otherwise DB-only, so a draft whose DB row was
 * wiped (e.g. by `reset:dev` clearing business tables, which intentionally keeps
 * on-disk `.daireel/`) becomes invisible even though its files survive. These
 * helpers let the service surface on-disk drafts and re-attach to their original
 * workspace id when re-opened. I/O lives in the service; logic stays here.
 */

/** Parse `WORKSPACE_DISCOVERY_ROOTS` (comma-separated) into trimmed roots. */
export function parseDiscoveryRoots(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((root) => root.trim())
    .filter((root) => root.length > 0);
}

/**
 * Decide which workspace id `initialize` should use when there is no DB row for
 * the directory. Reuse the on-disk manifest id when it is free so re-opening a
 * wiped draft reconnects its original id; otherwise return null and let the
 * caller mint a fresh id.
 */
export function chooseInitWorkspaceId(input: {
  manifestWorkspaceId: string | null | undefined;
  manifestIdInUse: boolean;
}): string | null {
  if (!input.manifestWorkspaceId || input.manifestIdInUse) {
    return null;
  }
  return input.manifestWorkspaceId;
}

export interface DiscoveredWorkspace {
  localPath: string;
  workspaceId: string | null;
}

/**
 * Keep only on-disk workspaces that are NOT already registered in the DB,
 * deduplicated by local path. `dbPaths` and discovered paths must already be
 * normalized by the caller so comparison is exact.
 */
export function filterUnregisteredDiscovered(
  dbPaths: string[],
  discovered: DiscoveredWorkspace[],
): DiscoveredWorkspace[] {
  const registered = new Set(dbPaths);
  const seen = new Set<string>();
  const result: DiscoveredWorkspace[] = [];
  for (const entry of discovered) {
    if (registered.has(entry.localPath) || seen.has(entry.localPath)) {
      continue;
    }
    seen.add(entry.localPath);
    result.push(entry);
  }
  return result;
}
