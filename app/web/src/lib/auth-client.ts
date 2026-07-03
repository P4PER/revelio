import { createAuthClient } from 'better-auth/react'
import { emailOTPClient, usernameClient, adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  plugins: [emailOTPClient(), usernameClient(), adminClient()],
})

export const { useSession, signOut } = authClient
