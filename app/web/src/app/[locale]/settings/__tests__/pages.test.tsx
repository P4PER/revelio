import { it, expect, vi } from 'vitest'
import { Children, type ReactElement } from 'react'

vi.mock('@/lib/server/settings-user', () => ({
  requireSettingsUser: async () => ({
    id: 'u1', username: 'a', displayUsername: 'a', email: 'a@b.c', role: 'user', createdAt: '2026-01-01T00:00:00.000Z',
  }),
}))

// The appearance page reads the theme cookie, which needs a request scope.
vi.mock('next/headers', () => ({ cookies: async () => new Map() }))

import ProfilePage from '../profile/page'
import AppearancePage from '../appearance/page'
import EmailPage from '../email/page'
import SafetyPage from '../safety/page'
import { ProfilePane } from '@/components/settings/profile-pane'
import { AppearanceForm } from '@/components/settings/appearance-form'
import { EmailPane } from '@/components/settings/email-pane'
import { ExportDataSection } from '@/components/settings/export-data-section'
import { DeleteAccountSection } from '@/components/settings/delete-account-section'

// Guards against copy-paste miswiring (e.g. email/page rendering ProfilePane).
it('each settings route renders its own pane', async () => {
  expect((await ProfilePage()).type).toBe(ProfilePane)
  expect((await AppearancePage()).type).toBe(AppearanceForm)
  expect((await EmailPage()).type).toBe(EmailPane)
})

// The safety route is the one page that stacks two sections instead of one pane.
it('the safety route renders both of its sections', async () => {
  const tree = await SafetyPage()
  const types = Children.toArray(tree.props.children).map((c) => (c as ReactElement).type)
  expect(types).toContain(ExportDataSection)
  expect(types).toContain(DeleteAccountSection)
})
