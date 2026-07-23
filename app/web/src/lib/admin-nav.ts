export type AdminSectionId = 'sub-types' | 'sets' | 'users' | 'settings'

export interface AdminSection {
  id: AdminSectionId
  href: string
  /** key under the `admin.nav` i18n namespace */
  labelKey: string
  adminOnly: boolean
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'sub-types', href: '/admin/sub-types', labelKey: 'subTypes', adminOnly: false },
  { id: 'sets', href: '/admin/sets', labelKey: 'sets', adminOnly: false },
  { id: 'users', href: '/admin/users', labelKey: 'users', adminOnly: true },
  { id: 'settings', href: '/admin/settings', labelKey: 'settings', adminOnly: true },
]

export const ADMIN_SECTION_COOKIE = 'revelio.admin.section'

const DEFAULT_SECTION = '/admin/sub-types'

export function visibleSections(isAdmin: boolean): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => isAdmin || !s.adminOnly)
}

/** Resolve a cookie value to a valid, role-appropriate section href. */
export function resolveAdminSection(
  cookieValue: string | undefined,
  isAdmin: boolean,
): string {
  const match = ADMIN_SECTIONS.find((s) => s.href === cookieValue)
  if (match && (isAdmin || !match.adminOnly)) return match.href
  return DEFAULT_SECTION
}

/**
 * The section href to highlight for a locale-stripped pathname, matching nested
 * sub-pages (e.g. `/admin/sets/new`) to their parent section. `undefined` for `/admin`.
 */
export function activeSectionHref(pathname: string): string | undefined {
  const match = ADMIN_SECTIONS.find(
    (s) => pathname === s.href || pathname.startsWith(s.href + '/'),
  )
  return match?.href
}
