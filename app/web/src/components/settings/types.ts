export type SettingsSection = 'appearance' | 'profile' | 'email' | 'data' | 'danger'

export type SettingsUser = {
  id: string
  username: string | null
  displayUsername: string | null
  email: string
  role: string | null
  createdAt: string
}
