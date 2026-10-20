import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DiscordMark } from '@/components/discord-mark'

/**
 * The bot install button. The invite URL is an admin-editable site setting, so
 * it is legitimately absent on a fresh database: returning null here is what
 * saves every caller from guarding. No URL, no button, and the page still reads
 * as a command reference.
 */
export function DiscordCta({
  inviteUrl,
  size,
  className,
}: {
  inviteUrl: string | null
  size?: 'sm' | 'default' | 'lg'
  className?: string
}) {
  const t = useTranslations('discord')
  if (!inviteUrl) return null
  return (
    <Button
      asChild
      size={size}
      className={cn('bg-brand-discord text-white hover:bg-brand-discord/90', className)}
    >
      <a href={inviteUrl} target="_blank" rel="noopener noreferrer">
        {/* The mark keeps its proportion to the button: 20px on lg, 16px below. */}
        <DiscordMark className={size === 'lg' ? 'size-5' : 'size-4'} />
        {t('install')}
      </a>
    </Button>
  )
}
