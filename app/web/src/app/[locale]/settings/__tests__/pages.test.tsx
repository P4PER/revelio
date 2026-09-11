import { it, expect, vi } from 'vitest'
import { Children, type ReactElement } from 'react'

vi.mock('@/lib/server/settings-user', () => ({
  requireSettingsUser: async () => ({
    id: 'u1', username: 'a', displayUsername: 'a', email: 'a@b.c', role: 'user', createdAt: '2026-01-01T00:00:00.000Z',
  }),
}))

// The appearance page reads the theme cookie, which needs a request scope.
vi.mock('next/headers', () => ({ cookies: async () => new Map() }))

// The connections page reads the account table and the provider config; neither
// is what this file is checking.
vi.mock('@revelio/db', () => ({
  getLinkedProviderIds: async () => ['discord'],
  // No row id means no Discord handle to print, so the pane renders the plain
  // linked badge - the state this test asserts, without reaching Discord.
  getAccountRowId: async () => null,
}))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/server/auth', () => ({ discordLinkingConfigured: true }))

import ProfilePage from '../profile/page'
import AppearancePage from '../appearance/page'
import EmailPage from '../email/page'
import ConnectionsPage from '../connections/page'
import SafetyPage from '../safety/page'
import { ProfilePane } from '@/components/settings/profile-pane'
import { AppearanceForm } from '@/components/settings/appearance-form'
import { EmailPane } from '@/components/settings/email-pane'
import { ConnectionsPane } from '@/components/settings/connections-pane'
import { ExportDataSection } from '@/components/settings/export-data-section'
import { DeleteAccountSection } from '@/components/settings/delete-account-section'

// Guards against copy-paste miswiring (e.g. email/page rendering ProfilePane).
it('each settings route renders its own pane', async () => {
  expect((await ProfilePage()).type).toBe(ProfilePane)
  expect((await AppearancePage()).type).toBe(AppearanceForm)
  expect((await EmailPage()).type).toBe(EmailPane)
  expect((await ConnectionsPage({ searchParams: Promise.resolve({}) })).type).toBe(ConnectionsPane)
})

// The safety route is the one page that stacks two sections instead of one pane.
it('the safety route renders both of its sections', async () => {
  const tree = await SafetyPage()
  const types = Children.toArray(tree.props.children).map((c) => (c as ReactElement).type)
  expect(types).toContain(ExportDataSection)
  expect(types).toContain(DeleteAccountSection)
})
