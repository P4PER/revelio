'use client'
import { useRouter } from '@/../i18n/navigation'
import { signOut } from '@/lib/auth-client'

// Signs out, then routes home and refreshes the server tree so the header (which
// reads the server session) reflects the signed-out state. Shared by AccountMenu
// and MobileNav. Fire-and-forget: the redirect runs on success.
export function useSignOut() {
  const router = useRouter()
  return () =>
    signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/')
          router.refresh()
        },
      },
    })
}
