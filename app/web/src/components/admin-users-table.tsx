'use client'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, ChevronsUpDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  type ColumnDef, type SortingState, type FilterFn,
  flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Link } from '@/../i18n/navigation'
import type { UserAdminRow } from '@revelio/db'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const nameEmailUser: FilterFn<UserAdminRow> = (row, _id, value) => {
  const q = String(value).trim().toLowerCase()
  if (!q) return true
  const u = row.original
  return (
    u.name.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q) ||
    (u.username?.toLowerCase().includes(q) ?? false)
  )
}

export function AdminUsersTable({ users }: { users: UserAdminRow[] }) {
  const t = useTranslations('admin.users')
  const [globalFilter, setGlobalFilter] = useState('')
  const [showActive, setShowActive] = useState(false)
  const [showBanned, setShowBanned] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'createdAt', desc: true }])

  const data = useMemo(() => {
    if (!showActive && !showBanned) return users
    return users.filter((u) => (showActive && !u.banned) || (showBanned && u.banned))
  }, [users, showActive, showBanned])

  const columns = useMemo<ColumnDef<UserAdminRow>[]>(() => [
    {
      accessorKey: 'name',
      header: t('name'),
      cell: ({ row }) => (
        <Link href={`/admin/users/${row.original.id}/edit`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'email',
      header: t('email'),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.email}
          {row.original.emailVerified && (
            <span className="ml-2 text-xs text-primary">{t('verified')}</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'username',
      header: t('username'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">{String(getValue() ?? '—')}</span>
      ),
    },
    {
      accessorKey: 'role',
      header: t('role'),
      cell: ({ getValue }) => {
        const r = String(getValue())
        const label = r === 'admin' ? t('roleAdmin') : r === 'editor' ? t('roleEditor') : t('roleUser')
        return <Badge variant="secondary">{label}</Badge>
      },
    },
    {
      id: 'status',
      accessorFn: (u) => (u.banned ? 'banned' : 'active'),
      header: t('status'),
      enableSorting: false,
      cell: ({ row }) =>
        row.original.banned
          ? <Badge variant="destructive">{t('banned')}</Badge>
          : <span className="text-xs text-muted-foreground">{t('active')}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: t('joined'),
      cell: ({ getValue }) => (
        <span className="text-muted-foreground">
          {(getValue() as Date).toISOString().slice(0, 10)}
        </span>
      ),
    },
  ], [t])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: nameEmailUser,
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
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="h-8 w-full pr-8"
          />
          {globalFilter && (
            <button
              type="button"
              onClick={() => setGlobalFilter('')}
              aria-label={t('searchPlaceholder')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="button" size="sm" variant={showActive ? 'secondary' : 'outline'} aria-pressed={showActive} onClick={() => setShowActive((v) => !v)}>
          {t('active')}
        </Button>
        <Button type="button" size="sm" variant={showBanned ? 'secondary' : 'outline'} aria-pressed={showBanned} onClick={() => setShowBanned((v) => !v)}>
          {t('banned')}
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => {
                  const sortable = h.column.getCanSort()
                  const dir = h.column.getIsSorted()
                  return (
                    <TableHead key={h.id}>
                      {sortable ? (
                        <button
                          type="button"
                          className="flex items-center gap-1"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? <ArrowUp className="size-3" />
                            : dir === 'desc' ? <ArrowDown className="size-3" />
                              : <ChevronsUpDown className="size-3 opacity-50" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                  {t('noResults')}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  {r.getVisibleCells().map((c) => (
                    <TableCell key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
