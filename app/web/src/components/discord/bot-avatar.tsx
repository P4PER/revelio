import Image from 'next/image'
import { cn } from '@/lib/utils'

// The dark-background wand mark, on the midnight circle a Discord avatar crops
// to: the circle carries the brand's background so the avatar reads as Revelio
// against Discord's grey surface. Shared by the channel mock and the
// slash-command menu, so the bot looks the same in both.
// Decorative: the bot's name is printed beside it wherever it appears.
export function BotAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full',
        className,
      )}
      style={{ background: '#13122A' }}
    >
      <Image
        src="/revelio-icon-on-dark.svg"
        alt=""
        width={68}
        height={68}
        aria-hidden
        className="size-[62%]"
      />
    </span>
  )
}
