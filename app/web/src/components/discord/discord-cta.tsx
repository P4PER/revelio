import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { DiscordMark } from '@/components/discord-mark'

/**
 * The bot install button. The invite URL is an admin-editable site setting, so
 * it is legitimately absent on a fresh database: returning null here is what
 * saves every caller from guarding. No URL, no button, and the page still reads
 * as a command reference.
 */
export function DiscordCta({ inviteUrl }: { inviteUrl: string | null }) {
  const t = useTranslations('discord')
  if (!inviteUrl) return null
  return (
    <Button asChild className="bg-brand-discord text-white hover:bg-brand-discord/90">
      <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
        <DiscordMark className="size-4" />
        {t('install')}
      </a>
    </Button>
  )
}
