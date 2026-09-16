# Terms of Service design

Date: 2026-09-16
Status: implemented

## Problem

Discord's developer portal asks for a Terms of Service URL and a Privacy Policy URL
for the bot. Revelio has a privacy policy (`/privacy`) and an imprint (`/imprint`),
but no terms. The two documents are not interchangeable: the privacy policy is a
GDPR information duty (Art. 13), the terms are the contract governing use of the
website, the account and the bot.

Two gaps surfaced while scoping this, both of which the terms would otherwise
misdescribe:

- **Nothing records that a user accepted anything.** Terms only bind a user once
  they are incorporated into the contract (§ 305(2) BGB), and the operator bears the
  burden of proving that.
- **A ban is silent.** `banUser` in `web/src/lib/actions/user-admin-actions.ts`
  stores a `banReason` the user never sees. Art. 17 DSA requires a statement of
  reasons for suspending an account, and it applies to every hosting service with no
  micro-enterprise exemption. Revelio hosts user content that it disseminates to the
  public (public decks, public collections, usernames), so it is a hosting service.

This is drafted against German law by a non-lawyer, following current case law. It is
not legal advice; a short review by a lawyer before relying on it is recommended.

## Goals

- A `/terms` page in English and German, valid under §§ 305-310 BGB, meeting the
  Art. 14 DSA content requirements for terms and conditions.
- Terms incorporated for every new account at registration.
- A record of which terms version each account accepted, and a way for existing
  accounts to accept the current version.
- Account bans that tell the user why and how to object, so the moderation section of
  the terms is true.

## Non-goals

- **A consent checkbox at registration.** § 305(2) BGB needs an express notice and a
  reasonable opportunity to read the terms, not a tick. A checkbox adds friction and
  no legal weight.
- **Withdrawal notice (Widerrufsbelehrung) or cancellation button (§ 312k BGB).** Both
  apply only to contracts where the consumer pays. Revelio processes personal data
  solely to provide the service, so § 312(1a) BGB keeps it out of scope.
- **A link to the EU ODR platform.** Regulation (EU) 2024/3228 repealed the ODR
  Regulation; the platform closed on 20 July 2025.
- **A blocking acceptance wall** for existing users. Users who have not accepted
  simply remain on the statutory position; nothing about the service depends on it.
- **An internal complaint-handling system (Art. 20 DSA).** Art. 19 exempts micro and
  small enterprises. The terms still offer an objection by contact form.
- **Content-level moderation tooling** (hiding a single public deck from the admin
  UI). Admins can ban or delete accounts in the UI; removing a single piece of content
  is done by the operator by hand, which the terms may describe without a UI for it.
- **New site settings.** Operator name, address and contact email already live in
  `site_settings` and are reused.

## Phases

Each phase gets its own plan under `docs/superpowers/plans/` and ships as its own PR. Phase 1 shares its PR with this spec and the three plans.

### Phase 1: the `/terms` page and incorporation at registration

**Content as MDX.** The terms body is legal prose of about fifty numbered paragraphs, so it
lives in `web/content/legal/terms.en.mdx` and `terms.de.mdx` rather than as message keys:
one reviewable file per language, readable diffs, and links as plain markdown. It sits
in `content/legal/`, not `content/docs/`, so it stays out of the docs registry, sidebar,
pager and "Edit this page" link. Short UI strings stay in the message catalogs: the page
`title`/`metaTitle`, the operator block's labels, the effective-date line, the footer
label and the registration notice.

**Loader.** `web/src/lib/legal/terms-documents.ts` maps each locale to a literal
`import()` of its file, constrained with `satisfies Record<Locale, ...>` over
`routing.locales`, so a missing translation fails `npm run typecheck` the way the docs
registry does.

**Page.** `web/src/app/[locale]/terms/page.tsx`: the default export loads the locale's
document and the site settings, and hands both to a sync, prop-driven `TermsContent`
(testable without a server), rendered in `ProseShell` with `export const dynamic =
'force-dynamic'` and the effective date from `TERMS_VERSION` at the foot.

- **Styling.** Next's MDX provider (`src/mdx-components.tsx`) gives `h2`, `p`, lists and
  links the docs type scale. The page passes a `LEGAL_COMPONENTS` map that turns those
  back into plain elements, so `ProseShell` styles `/terms` exactly like `/privacy` and
  `/imprint`. Internal links still go through next-intl's `Link`; external links open in
  a new tab.
- **Operator data.** The MDX renders `<OperatorDetails name={props.operatorName}
  address={props.operatorAddress} email={props.contactEmail} />`; the page passes the
  three values as props to the document. A module-level component, not a closure built
  during render.
- **Stable anchors.** `rehype-slug` derives heading ids from the translated text, so
  German headings get German ids. Each section therefore starts with
  `<Anchor id="acceptable-use" />` (and so on), an empty block element with a
  language-independent id; registration links `/terms#acceptable-use` in both locales.

**Terms version.** A single exported constant, `TERMS_VERSION` (the effective date as
`'2026-09-16'`-style string), in `web/src/lib/terms.ts`, isomorphic. The page renders
its date from it; Phase 2 stores it. One source, so the page and the acceptance record
cannot disagree.

**Sections**, in order:

1. **Operator and scope** (`#scope`). Operator name, address and contact email from
   site settings (with the same `notConfigured` fallback the privacy page uses).
   The terms cover the website, the user account and the Discord bot.
2. **The service** (`#service`). Free, unofficial, non-commercial fan project. Card
   data is compiled from community sources and provided for information only; for
   tournament rules the official rules prevail. No entitlement to any particular
   availability; features may change. Users can export their data under Settings,
   Safety. This is a description of the service, deliberately not a liability
   exclusion.
3. **Contract and eligibility** (`#contract`). Browsing and the bot are usable without
   an account. An account contract is concluded by completing registration. Minimum
   age 13 (Discord's own minimum). Users under 18 need the consent of a legal guardian
   (§§ 107, 108 BGB: the terms impose obligations, so the contract is not purely
   advantageous to the minor).
4. **Your account** (`#account`). One account per person, true email address, keep
   access to that inbox secure (it is the only sign-in factor). Usernames must not
   impersonate others, infringe rights, or be offensive.
5. **Acceptable use** (`#acceptable-use`). No unlawful content; no harassment; no
   automated access that puts load on the service beyond ordinary use; no attempts to
   circumvent security, rate limits or bans; no misuse of the bot to spam a server.
6. **Your content** (`#content`). Decks, deck names and collections remain yours. A
   simple (non-exclusive), royalty-free licence, limited to operating the service
   (storing, displaying public decks and collections, delivering bot replies,
   backups), ending when the content or the account is deleted, subject to backup
   rotation. Editors' contributions to shared card data (rulings, translations): a
   simple, perpetual, royalty-free licence, since those are merged into the dataset;
   editors agree not to be named individually (§ 13 UrhG may be restricted by
   agreement).
7. **Third-party rights** (`#rights`). Card names, artwork and texts belong to Warner
   Bros. Entertainment Inc., Wizards of the Coast and their owners; Revelio claims no
   licence and grants none. The Revelio source code is published under the
   source-available licence in the repository's `LICENSE`, which grants no use rights.
8. **Reporting and moderation** (`#moderation`). Art. 11, 12, 14, 16, 17 DSA:
   - Single point of contact for authorities and users: the contact email and contact
     form; languages German and English.
   - Notices of illegal content or breaches of these terms via contact form or email,
     naming the content's URL and the reason.
   - Possible measures: removal of content, temporary ban, permanent ban, deletion of
     the account. Chosen proportionately, after human review; no automated moderation.
   - The affected user is informed of the measure, its reasons and the ground relied
     on, and may object via the contact form. Recourse to the courts is unaffected.
9. **Discord bot** (`#discord`). Use of the bot is additionally subject to Discord's
   Terms of Service and Community Guidelines. Replies about a user's own collection
   and decks are visible only to them. Linking and unlinking are optional and
   described in the privacy policy.
10. **Liability** (`#liability`). See "Liability clause" below; verbatim.
11. **Term and termination** (`#termination`). Indefinite term. Users may terminate at
    any time by deleting their account under Settings, Safety. The operator may
    terminate with four weeks' notice, including by discontinuing the service, and
    without notice for cause (§ 314 BGB); a temporary ban is the milder measure and is
    considered first.
12. **Changes to these terms** (`#changes`). Registered users are notified by email at
    least four weeks before a change. A change binds an existing account only once the
    user accepts it; there is no deemed-consent-by-silence mechanism (BGH, 27 April
    2021, XI ZR 26/20). A user who does not accept may keep using the service under the
    previous terms, and either side may terminate under section 11.
13. **Final provisions** (`#final`). German law applies, excluding the UN Convention on
    Contracts for the International Sale of Goods; for consumers only insofar as this
    does not deprive them of the protection of the mandatory law of their habitual
    residence (Art. 6(2) Rome I; without this caveat the clause is misleading, CJEU
    C-191/15). No jurisdiction clause (only valid between merchants). The operator is
    neither willing nor obliged to take part in consumer arbitration (§ 36 VSBG). No
    severability or replacement clause: § 306 BGB already governs invalid terms, and a
    replacement clause in standard terms is itself invalid. The terms are available in
    German and English; both versions are equally binding.

**Liability clause.** A blanket "no liability" clause is invalid in standard terms
(§ 309 No. 7 a and b BGB, § 307(2) No. 2 BGB), and because of the ban on reduction to a
valid core, a court would strike it entirely, leaving unlimited statutory liability.
The clause below survives that review. It does not rely on applying the gratuitous
contract privileges (§§ 521, 599 BGB) to a free online service, which is disputed.
"Essential contractual obligation" is defined in the text, since the bare term fails the
transparency requirement (§ 307(1) sentence 2 BGB).

English:

> (1) We are liable without limitation for intent and gross negligence, for injury to
> life, body or health, under the Product Liability Act, and insofar as we have given a
> guarantee or fraudulently concealed a defect.
>
> (2) In cases of slight negligence we are liable only for the breach of an essential
> contractual obligation, meaning an obligation whose fulfilment makes the proper use of
> Revelio possible in the first place and on whose fulfilment you may regularly rely. In
> that case our liability is limited to the damage that was foreseeable and typical for
> this kind of service when the contract was concluded.
>
> (3) Otherwise, our liability for slight negligence is excluded.
>
> (4) The limitations in paragraphs 2 and 3 also apply to the personal liability of our
> representatives and vicarious agents.

German:

> (1) Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung
> des Lebens, des Körpers oder der Gesundheit, nach dem Produkthaftungsgesetz sowie
> soweit wir eine Garantie übernommen oder einen Mangel arglistig verschwiegen haben.
>
> (2) Bei leichter Fahrlässigkeit haften wir nur für die Verletzung einer wesentlichen
> Vertragspflicht, also einer Pflicht, deren Erfüllung die ordnungsgemäße Nutzung von
> Revelio überhaupt erst ermöglicht und auf deren Einhaltung Sie regelmäßig vertrauen
> dürfen. In diesem Fall ist unsere Haftung auf den bei Vertragsschluss vorhersehbaren,
> für diese Art von Dienst typischen Schaden begrenzt.
>
> (3) Im Übrigen ist unsere Haftung für leichte Fahrlässigkeit ausgeschlossen.
>
> (4) Die Haftungsbeschränkungen der Absätze 2 und 3 gelten auch für die persönliche
> Haftung unserer Vertreter und Erfüllungsgehilfen.

The German terms address the reader as "Sie", matching the privacy policy and imprint
(`privacy.*`, `imprint.*` in `de.json`). The registration notice below uses "du",
matching the rest of the `auth` namespace it sits in.

**Registration notice.** In `web/src/components/auth/auth-form.tsx`, register mode
only, between the username field and the submit button, so it is read before the
click. Rendered with `t.rich` so the three links are next-intl `Link`s:

> By pressing "Register" you agree to our Terms of Service and to follow our rules for
> acceptable use. Our Privacy Policy explains how we handle your data.

> Mit Klick auf „Registrieren" stimmst du unseren Nutzungsbedingungen zu und
> verpflichtest dich, unsere Regeln zur zulässigen Nutzung einzuhalten. Wie wir mit
> deinen Daten umgehen, erklärt unsere Datenschutzerklärung.

The quoted button name is interpolated from the same `auth.register` message the
button renders, so renaming the button cannot leave the notice quoting a stale label.
The privacy policy is linked as information, not as something agreed to: processing
rests on Art. 6(1)(b) GDPR, and wording it as consent would misstate the legal basis.

**Links.**

- Footer legal column: `Terms of Service` between Privacy Policy and Imprint
  (`web/src/components/layout/site-footer.tsx`, `footer.terms`).
- `STATIC_ROUTES` in `web/src/lib/sitemap.ts`: add `/terms`.
- `content/docs/discord-privacy.{en,de}.mdx`: a closing "Legal" section linking the
  terms and the privacy policy. The `/discord` landing page carries no legal links of
  its own (the footer covers it), so it is left alone.

**Discord developer portal** (manual, recorded in the PR's Deployment section):
Terms of Service URL `https://revelio.cards/terms`, Privacy Policy URL
`https://revelio.cards/privacy`.

**Tests.** `terms/__tests__/terms.test.tsx` mirroring `privacy.test.tsx` (renders
operator data and the not-configured fallback, every section anchor present, liability
paragraphs present); footer test for the new link; sitemap test for `/terms`;
`auth-form` test that register mode shows the notice with links to `/terms`,
`/terms#acceptable-use` and `/privacy` and login mode does not. Because both language
versions are declared equally binding, the page test renders both documents and asserts
they have the same section anchors and the same numbered paragraphs in each section.

### Phase 2: recording acceptance

**Schema.** Two nullable columns on the Better Auth `user` table, declared as
`additionalFields` in `web/src/lib/server/auth.ts` (`input: false`, so a client cannot
set them through Better Auth's endpoints) and mirrored in `db/src/auth-schema.ts`:

- `terms_version text` - the `TERMS_VERSION` accepted.
- `terms_accepted_at timestamp` - when.

One generated migration, committed with the schema edit. Existing rows stay null,
meaning "never accepted"; no backfill, since nothing was accepted.

**At registration.** `auth-form.tsx` sets the username client-side with
`authClient.updateUser` after `signIn.emailOtp`. Once that succeeds, the form calls a
new server action, `acceptTermsAction`, which takes no arguments: it reads the user
from the session and the version from `TERMS_VERSION`, and stamps `now()` on the
server, so the record cannot be forged or back-dated by the client. A registration
whose username step fails does not record acceptance. The banner below uses the same
action.

**Existing accounts.** A banner in the `[locale]` layout for signed-in users whose
`terms_version` differs from `TERMS_VERSION`, linking the terms and offering "Accept".
Not blocking and not dismissible-without-accepting: it stays until accepted, and
closing the tab is the only way to ignore it. Accepting calls a server action that
writes the current version and timestamp for the session user. The same banner is the
acceptance path for future versions, which is what section 12 relies on.

**Privacy policy.** `privacy.accountBody` gains the acceptance record (version and
timestamp, Art. 6(1)(f) GDPR: the legitimate interest in being able to prove which
terms were agreed); `LAST_UPDATED`
moves.

**Tests.** DB query tests from `ingest/test` via `withMigratedDb` (the established
home for `@revelio/db` query coverage); server action tests that the version comes from
the constant and the user from the session; banner renders only for a stale or null
version; registration records acceptance only on success.

### Phase 3: statement of reasons for bans

**Email.** `banUser` sends the banned user an email after the ban is stored: that the
account was suspended, until when (or permanently), the reason the admin entered, the
term relied on (a link to `/terms#acceptable-use` or the relevant section), and that
they can object via the contact form. A new template beside `otp-template.tsx` and
`contact-template.tsx`, sharing `RenderedEmail`. The user table stores no locale, so the email
goes out in English; the template takes an optional `locale` (with `en` and `de` copy in both
catalogs) for when the account stores a language, rather than a bilingual body that grows with
every locale added.

**Reason becomes required.** `banUser` currently accepts an empty reason
(`reason.trim() || null`). Art. 17(3) requires the facts and grounds, so the admin ban
form requires a reason and the action rejects an empty one.

**Mail failure.** The ban is the safety-relevant part and stands even if mail fails;
the action logs the failure and returns a result the admin form surfaces ("banned, but
the notification could not be sent"), so the admin can follow up by hand.

**Unban.** No email; lifting a restriction needs no statement of reasons.

**Privacy policy.** A sentence under moderation-related processing: the ban reason is
stored and sent to the affected user (Art. 6(1)(c) GDPR with Art. 17 DSA).

**Tests.** Action rejects an empty reason; sends the email with reason, expiry and
objection path; a mail failure keeps the ban and reports it.

## Deployment

- Phase 1: set the two URLs in the Discord developer portal.
- Phase 2: apply the migration (`migrate-cli` from the host, or
  `docker compose run --rm --build migrate`; confirm with `\d "user"`).
- Phase 3: none beyond the existing mail configuration.
