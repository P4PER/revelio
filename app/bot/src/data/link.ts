import { getUserIdByDiscordAccount, type DB } from '@revelio/db'

// One indirection on purpose: every personal command goes through this, so the
// "who is this Discord user" rule has exactly one implementation to audit.
export async function resolveLinkedUser(
  db: DB,
  discordUserId: string,
): Promise<string | null> {
  return getUserIdByDiscordAccount(db, discordUserId)
}
