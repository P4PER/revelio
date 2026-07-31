import { it, expect, vi } from 'vitest'

vi.mock('@/lib/settings-user', () => ({
  requireSettingsUser: async () => ({
    id: 'u1', username: 'a', displayUsername: 'a', email: 'a@b.c', role: 'user', createdAt: '2026-01-01T00:00:00.000Z',
  }),
}))

import ProfilePage from '../profile/page'
import EmailPage from '../email/page'
import DataPage from '../data/page'
import DangerPage from '../danger/page'
import { ProfilePane } from '@/components/settings/profile-pane'
import { EmailPane } from '@/components/settings/email-pane'
import { DataPane } from '@/components/settings/data-pane'
import { DangerPane } from '@/components/settings/danger-pane'

// Guards against copy-paste miswiring (e.g. email/page rendering ProfilePane).
it('each settings route renders its own pane', async () => {
  expect((await ProfilePage()).type).toBe(ProfilePane)
  expect((await EmailPage()).type).toBe(EmailPane)
  expect((await DataPage()).type).toBe(DataPane)
  expect((await DangerPage()).type).toBe(DangerPane)
})
