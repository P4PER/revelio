// Types shared by sibling components in this folder.

// The minimal user shape the header needs to render the account UI. Built
// server-side in SiteHeader from the session and passed to AccountMenu/MobileNav.
export type AccountUser = {
  email: string
  username?: string | null
  displayUsername?: string | null
}
