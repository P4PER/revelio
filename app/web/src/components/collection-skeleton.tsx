import { Skeleton } from '@/components/ui/skeleton'

// Static ghost of the signed-in collection page: heading and summary, tab bar,
// set rail, card grid. Column counts mirror CollectionView so the shape behind
// the teaser is the shape the visitor gets after signing in.
export function CollectionSkeleton() {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36 rounded-full" />
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-9 w-56 rounded-lg" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8">
        <div className="flex w-full flex-col gap-4 min-[1024px]:w-56">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[768px]:grid-cols-4 min-[1780px]:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-[5/7] w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
