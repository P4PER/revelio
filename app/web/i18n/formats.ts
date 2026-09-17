import type { Formats } from 'next-intl'

// App-wide named formats for ICU messages ({date, date, calendarDay}).
//
// calendarDay is for days stored at UTC midnight: the terms effective date, a
// legal page's last update, a ban's end. It pins its own zone to UTC, so the
// day prints as stored whatever the app or viewer zone is. next-intl merges the
// global zone in underneath a format's own settings, so this one wins.
//
// Every translator that renders such a message must receive these formats. An
// unregistered style name does not throw; it silently prints a short numeric
// date in the global zone.
export const FORMATS = {
  dateTime: {
    calendarDay: { dateStyle: 'long', timeZone: 'UTC' },
  },
} satisfies Formats
