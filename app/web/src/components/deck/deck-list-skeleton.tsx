import { Skeleton } from '@/components/ui/skeleton'

// Static ghost of the signed-in deck list: the same 1/2/4-column card grid
// DeckList renders, with a name line, a format badge and a fill bar per card.
// The page heading is NOT part of this - the page renders it for real, above
// the ghost - so only the "New deck" button is ghosted on this row.
export function DeckListSkeleton() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-end gap-4">
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-input bg-card/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="size-4" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
