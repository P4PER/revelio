import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table'

/**
 * The TanStack Table features both admin tables use: global search, sorting
 * and pagination. v9 exposes only what is registered here.
 * columnFilteringFeature is listed because globalFilteringFeature requires it.
 * The three sort functions are what 'auto' sort picks from (mixed strings,
 * plain strings, Dates); v9 resolves 'auto' only against this registry, so
 * leaving them out silently changes the order.
 */
export const adminTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime },
})

export type AdminTableFeatures = typeof adminTableFeatures
