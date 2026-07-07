import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { DatePicker, parseYMD, toYMD } from '../date-picker'
import { Calendar } from '../ui/calendar'

function renderDP(value: string, onChange = () => {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DatePicker value={value} onChange={onChange} ariaLabel="Release date" placeholder="Pick a date" />
    </NextIntlClientProvider>,
  )
}

describe('parseYMD/toYMD (no timezone shift)', () => {
  it('round-trips a YYYY-MM-DD string through a local Date unchanged', () => {
    expect(toYMD(parseYMD('2001-08-01')!)).toBe('2001-08-01')
    expect(toYMD(parseYMD('2020-12-31')!)).toBe('2020-12-31')
    expect(toYMD(parseYMD('2001-01-01')!)).toBe('2001-01-01')
  })
  it('reads local calendar fields, so the day never shifts', () => {
    const d = parseYMD('2001-08-01')!
    expect(d.getFullYear()).toBe(2001)
    expect(d.getMonth()).toBe(7) // August (0-indexed)
    expect(d.getDate()).toBe(1)
  })
  it('returns undefined for empty/invalid input', () => {
    expect(parseYMD('')).toBeUndefined()
    expect(parseYMD('not-a-date')).toBeUndefined()
  })
})

describe('DatePicker', () => {
  it('shows the placeholder when there is no value', () => {
    renderDP('')
    expect(screen.getByRole('button', { name: 'Release date' })).toHaveTextContent('Pick a date')
  })
  it('shows the formatted date for a value (no off-by-one)', () => {
    renderDP('2001-08-01')
    // en medium format → "Aug 1, 2001"; the day must be 1, not Jul 31
    expect(screen.getByRole('button', { name: 'Release date' })).toHaveTextContent('Aug 1, 2001')
  })
})

describe('Calendar month/year dropdowns', () => {
  // Render the shadcn Calendar directly (NOT through the Popover) to avoid the
  // jsdom Radix-portal problem, and assert the dropdown caption layout renders
  // both a month and a year <select>, with the year range bounded.
  it('renders month + year dropdowns with a bounded year range', () => {
    render(
      <Calendar
        mode="single"
        captionLayout="dropdown"
        startMonth={new Date(1990, 0)}
        endMonth={new Date(2027, 11)}
        defaultMonth={new Date(2001, 7)}
      />,
    )
    // react-day-picker's dropdowns are native <select> elements (combobox role).
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2)
    // The bounded year range must include 2001 as a selectable option.
    expect(screen.getByRole('option', { name: '2001' })).toBeInTheDocument()
  })
})
