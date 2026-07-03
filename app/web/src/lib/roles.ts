const RANK: Record<string, number> = { user: 0, editor: 1, admin: 2 }

/**
 * True if `userRole` meets or exceeds `required`. Unknown/absent roles fail closed.
 * Roles are single-valued in this slice; if multi-role strings (e.g. "admin,editor")
 * are ever stored, split before looking up here.
 */
export function hasRequiredRole(
  userRole: string | null | undefined,
  required: 'editor' | 'admin',
): boolean {
  return (RANK[userRole ?? ''] ?? -1) >= RANK[required]
}
