// The zone instants (a deck's last update) are formatted in, on the server and
// in the browser. Without it next-intl falls back to the host's own zone, so the
// server and the browser could print different days for the same moment.
// Calendar days stored at UTC midnight do not depend on it; they use the
// calendarDay format in formats.ts, which pins UTC.
//
// Its own module rather than request.ts, which pulls in request-scoped Next
// APIs that the email templates must not import.
export const TIME_ZONE = 'Europe/Berlin'
