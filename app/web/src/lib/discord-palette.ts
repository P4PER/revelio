// Discord's own surface palette, deliberately hardcoded rather than taken from the
// Revelio theme tokens: it depicts Discord's UI, which does not follow the visitor's
// light/dark choice. The /discord page's channel mock (components/discord/
// command-channel.tsx) and its share image (lib/og-image.tsx) both draw that
// channel. It is a plain module so the server-only image renderer reads eight
// strings without importing a React component tree.
export const DISCORD_CHANNEL = '#313338'
export const DISCORD_EMBED = '#2b2d31'
export const DISCORD_INPUT = '#383a40'
export const DISCORD_HEADING = '#f2f3f5'
export const DISCORD_TEXT = '#dbdee1'
export const DISCORD_MUTED = '#949ba4'
export const DISCORD_BLURPLE = '#5865F2'
export const DISCORD_MENTION = '#c2c5f7'
export const DISCORD_SELECT = '#1e1f22'

// The accent bar the bot gives a Charms card (the sample card is Alohomora).
export const LESSON_CHARMS = '#0069A9'
