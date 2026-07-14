'use client'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from 'lucide-react'
import {
  type ColumnDef,
  type SortingState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Link } from '@/../i18n/navigation'
import type { SetDTO } from '@revelio/core'
import { SetSymbol } from '@/components/set-symbol'
import { PaginationNav } from '@/components/pagination-nav'
import { formatReleaseMonth } from '@/lib/set-sort'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const nameOrCode: FilterFn<SetDTO> = (row, _id, value) => {
  const q = String(value).trim().toLowerCase()
  if (!q) return true
  return (
    row.original.name.toLowerCase().includes(q) ||
    row.original.code.toLowerCase().includes(q)
  )
}

export function AdminSetsTable({ sets, imageBase }: { sets: SetDTO[]; imageBase: string }) {
  const t = useTranslations('admin')
  const [globalFilter, setGlobalFilter] = useState('')
  const [showOfficial, setShowOfficial] = useState(false)
  const [showFan, setShowFan] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'releaseDate', desc: false }])

  // Official/Fan toggles are a pre-filter (custom none=all / both=all semantics);
  // search + sort + pagination are driven by the table below.
  const data = useMemo(() => {
    if (!showOfficial && !showFan) return sets
    return sets.filter((s) => (showOfficial && s.isOfficial) || (showFan && !s.isOfficial))
  }, [sets, showOfficial, showFan])

  const columns = useMemo<ColumnDef<SetDTO>[]>(
    () => [
      {
        id: 'symbol',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const s = row.original
          return (
            <span className="flex h-6 w-6 items-center justify-center">
              {s.symbol && imageBase ? (
                <SetSymbol code={s.code} base={imageBase} className="h-5 w-5 text-foreground/80" />
              ) : (
                <span className="text-[10px] text-muted-foreground">{s.code}</span>
              )}
            </span>
          )
        },
      },
      {
        accessorKey: 'name',
        header: t('sets.name'),
        cell: ({ row }) => (
          <Link href={`/admin/sets/${row.original.code}/edit`} className="font-medium hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'code',
        header: t('sets.code'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: 'releaseDate',
        header: t('sets.releaseDate'),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{formatReleaseMonth(getValue() as string | null)}</span>
        ),
      },
      {
        accessorKey: 'cardCount',
        header: t('sets.cardCount'),
        cell: ({ getValue }) => <span className="text-muted-foreground">{String(getValue())}</span>,
      },
      {
        id: 'official',
        header: t('sets.official'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.isOfficial ? t('sets.official') : t('sets.fan')}
          </span>
        ),
      },
    ],
    [t, imageBase],
  )

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: nameOrCode,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const rows = table.getRowModel().rows

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={t('sets.searchPlaceholder')}
            aria-label={t('sets.searchPlaceholder')}
            className="h-8 w-full pr-8"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              aria-label={t('clearSearch')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="button" size="sm" variant={showOfficial ? 'secondary' : 'outline'} aria-pressed={showOfficial} onClick={() => setShowOfficial((v) => !v)}>
          {t('sets.official')}
        </Button>
        <Button type="button" size="sm" variant={showFan ? 'secondary' : 'outline'} aria-pressed={showFan} onClick={() => setShowFan((v) => !v)}>
          {t('sets.fan')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="size-3" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="size-3" />
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-6 text-center text-muted-foreground">
                  {t('noResults')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationNav
        page={table.getState().pagination.pageIndex + 1}
        lastPage={table.getPageCount()}
        onPrev={() => table.previousPage()}
        onNext={() => table.nextPage()}
      />
    </div>
  )
}
