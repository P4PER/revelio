import { eq, sql, and, or, isNull, isNotNull } from 'drizzle-orm'
import type { DB } from '../client'
import { user, account } from '../auth-schema'

export type UnlinkedAccount = { accessToken: string | null; refreshToken: string | null }

// Better Auth writes one `account` row per linked provider, so the Discord
// snowflake to Revelio user mapping needs no table of our own. The bot reads
// this to turn an interaction's user id into an account it can answer for.
export async function getUserIdByDiscordAccount(
  db: DB, discordUserId: string,
): Promise<string | null> {
  // providerId is part of the predicate on purpose: accountId is only unique
  // within a provider, so a matching id under another provider is a different
  // person.
  //
  // The join is what enforces a ban in Discord: banning deletes the user's web
  // sessions but leaves the account row alone, so without this the bot would
  // keep answering a banned user indefinitely. A ban with banExpires in the
  // past has lapsed and does not count.
  const [row] = await db
    .select({ userId: account.userId })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(
      eq(account.providerId, 'discord'),
      eq(account.accountId, discordUserId),
      or(
        eq(user.banned, false),
        isNull(user.banned),
        and(isNotNull(user.banExpires), sql`${user.banExpires} <= now()`),
      ),
    ))
    .limit(1)
  return row?.userId ?? null
}

export async function getLinkedProviderIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))
  return rows.map((r) => r.providerId)
}

// Deliberately not Better Auth's POST /unlink-account. That endpoint sits behind
// its fresh-session middleware, which measures age from session.createdAt, so a
// session in daily use is permanently past freshAge after a day and unlinking
// answers 403 forever. Rather than switch that control off globally for one
// low-risk operation - unlinking grants nothing and re-linking costs a full
// OAuth round-trip - we own this one deletion and leave every Better Auth
// default alone. The caller must resolve userId from the session, never trust it
// from a client.
// Returns the tokens it deleted so the caller can revoke them at the provider:
// dropping the row only ends our half of the link, and an unrevoked token stays
// valid until it expires.
export async function unlinkProvider(
  db: DB, userId: string, providerId: string,
): Promise<UnlinkedAccount[]> {
  return db
    .delete(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    .returning({ accessToken: account.accessToken, refreshToken: account.refreshToken })
}
