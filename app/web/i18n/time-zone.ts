// The one zone every date is formatted in, on the server and in the browser.
// Without it next-intl falls back to the server's own zone, so the same page
// could print a different day per host. Calendar days (the terms effective
// date, the privacy policy date, a ban's end) are stored at UTC midnight;
// Europe/Berlin, the operator's zone, is always ahead of UTC, so they print as
// the same day.
//
// Its own module rather than request.ts, which pulls in request-scoped Next
// APIs that the email templates must not import.
export const TIME_ZONE = 'Europe/Berlin'
