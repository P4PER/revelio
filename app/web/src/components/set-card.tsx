import Image from 'next/image'
import { Link } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { symbolKey, imageUrl } from '@revelio/core'

export function SetCard({ set, imageBase }: { set: SetDTO; imageBase: string }) {
  return (
    <Link
      href={`/sets/${set.code}`}
      className="flex items-center gap-4 rounded-lg border border-border/60 bg-card p-4 transition hover:border-primary/60"
    >
      {set.symbol && imageBase ? (
        <Image
          src={imageUrl(imageBase, symbolKey(set.code))}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 object-contain"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
          {set.code}
        </span>
      )}
      <span className="flex-1">
        <span className="block font-medium">{set.name}</span>
        <span className="block text-sm text-muted-foreground">
          {set.cardCount} · {set.releaseDate ?? '—'}
          {set.isOfficial ? '' : ' · Fan'}
        </span>
      </span>
    </Link>
  )
}
