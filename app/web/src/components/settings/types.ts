export type SettingsSection = 'appearance' | 'profile' | 'email' | 'connections' | 'safety'

export type SettingsUser = {
  id: string
  username: string | null
  displayUsername: string | null
  email: string
  role: string | null
  createdAt: string
}

// Shared by connections-pane, which forwards them untouched, and
// discord-connection, which acts on them. accountName is optional because the
// page passes null whenever the lookup at Discord failed.
export type DiscordConnectionProps = {
  linked: boolean
  configured: boolean
  accountName?: string | null
  linkError?: string
}
