<!-- Title: a Conventional Commit line, same form and scope as the commits.
     e.g. fix(web): keep the deck sheet inside its column on a phone -->

<!-- Open with one to three sentences on what this is and why, before the first heading.
     Then keep, rename or drop the sections below - a multi-part PR is better served by
     descriptive headings ("## 1. A ban only blocked new sign-ins") than by this skeleton. -->

## What changed

## Verification

<!-- One bullet per command actually run, with its real result. Do not list a command you
     did not run; if something is untested, say which part and why. -->

- `npm test -w web` -
- `npm run typecheck` -
- `npm run lint` -

## Deployment

<!-- Drop this section when the merge needs nothing outside the diff. Otherwise: a new env
     var and which service it goes on, a migration to apply, or an ingest run (a change to
     CARD_INDEX_SETTINGS does nothing to the live index until ingest runs). -->
