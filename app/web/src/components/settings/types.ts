export type SettingsSection = 'appearance' | 'profile' | 'email' | 'connections' | 'safety'

export type SettingsUser = {
  id: string
  username: string | null
  displayUsername: string | null
  email: string
  role: string | null
  createdAt: string
}
