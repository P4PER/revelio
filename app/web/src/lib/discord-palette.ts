// Discord's own surface palette, deliberately hardcoded rather than taken from the
// Revelio theme tokens: it depicts Discord's UI, which does not follow the visitor's
// light/dark choice. The /discord page's channel mock (components/discord/
// command-channel.tsx), its slash-command menu (command-picker.tsx) and its share image (lib/og-image.tsx) both draw that
// channel. It is a plain module so the server-only image renderer reads eight
// strings without importing a React component tree.
export const DISCORD_CHANNEL = '#313338'
export const DISCORD_EMBED = '#2b2d31'
export const DISCORD_INPUT = '#383a40'
export const DISCORD_HEADING = '#f2f3f5'
export const DISCORD_TEXT = '#dbdee1'
export const DISCORD_MUTED = '#949ba4'
// Discord's secondary text: descriptions and labels that carry content.
// DISCORD_MUTED is for metadata only; it drops to 3.6:1 on DISCORD_ACTIVE.
export const DISCORD_SECONDARY = '#b5bac1'
export const DISCORD_BLURPLE = '#5865F2'
export const DISCORD_MENTION = '#c2c5f7'
export const DISCORD_SELECT = '#1e1f22'
// The selected row of the slash-command menu, and the hairline under a channel header.
export const DISCORD_ACTIVE = '#404249'
export const DISCORD_RULE = '#26282c'
// Option pills in the slash-command menu: blurple at low alpha, as Discord tints them.
export const DISCORD_PILL = 'rgba(88, 101, 242, 0.18)'
export const DISCORD_PILL_BORDER = 'rgba(88, 101, 242, 0.45)'
// The option once picked, in the message box: a stronger tint, no border.
export const DISCORD_PILL_LIVE = 'rgba(88, 101, 242, 0.3)'

// The accent bar the bot gives a Charms card (the sample card is Alohomora).
export const LESSON_CHARMS = '#0069A9'
