import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

// Locale-aware Link/redirect/etc. — handle the as-needed prefix automatically.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing)
