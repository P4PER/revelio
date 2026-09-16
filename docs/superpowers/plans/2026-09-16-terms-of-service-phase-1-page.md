# Terms of Service, Phase 1: the `/terms` page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Terms of Service at `/terms` in English and German, link them from the footer, the sitemap and the Discord docs, and incorporate them at registration with a notice above the Register button.

**Architecture:** The terms body is MDX, one file per language under `web/content/legal/`, loaded through a small locale-keyed registry whose `satisfies` clause turns a missing translation into a typecheck error. The page renders the document inside `ProseShell` with a legal component map that undoes the docs styling, injects operator data from site settings as MDX props, and gives each section a language-independent anchor. Short UI strings (title, labels, effective date, footer label, registration notice) stay in the message catalogs. The effective date lives in one isomorphic constant, `TERMS_VERSION`, which Phase 2 stores per user.

**Tech Stack:** Next.js 16 App Router, `@next/mdx` (remark-toc + rehype-slug), next-intl, React 19, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` (Phase 1)

## Global Constraints

- All app commands run from `app/`. Node and npm are at `/usr/local/bin`; prefix them if `npm` is not on `PATH`.
- The terms body lives in `web/content/legal/terms.{en,de}.mdx`. Every other user-facing string comes from `web/messages/en.json` and `web/messages/de.json`; never hardcode copy in components.
- Both language versions are declared equally binding: a paragraph added to one MDX file must be added to the other in the same commit.
- The German terms address the reader as "Sie" (like `privacy.*`); the registration notice uses "du" (like `auth.*`).
- English message copy uses the typographic apostrophe `’`, never `'`, so ICU never treats it as an escape. MDX files may use either.
- Code comments are ASCII-only: no em-dashes, no unicode arrows.
- Locale-aware links use `Link` from `@/../i18n/navigation`, never `next/link`.
- `type` aliases only; type-only imports say `type`. Declaration order: types, constants, helpers, exported functions.
- Commits: Conventional Commits, scope `web` (or `docs(plans)`), no tool attribution. Sign with `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- Work on `feat/terms-of-service-page`, the branch that already carries the spec and the three plans, never on `main`. Phase 1 ships in the same PR as its spec and plans.

---

### Task 1: Terms version, MDX documents and page

**Files:**
- Create: `app/web/src/lib/terms.ts`
- Create: `app/web/src/lib/__tests__/terms.test.ts`
- Create: `app/web/content/legal/terms.en.mdx`
- Create: `app/web/content/legal/terms.de.mdx`
- Create: `app/web/src/lib/legal/terms-documents.ts`
- Create: `app/web/src/components/legal/legal-mdx.tsx`
- Create: `app/web/src/app/[locale]/terms/page.tsx`
- Create: `app/web/src/app/[locale]/terms/__tests__/terms.test.tsx`
- Modify: `app/web/messages/en.json` (new top-level `terms` namespace, directly after `privacy`)
- Modify: `app/web/messages/de.json` (same)

**Interfaces:**
- Produces: `TERMS_VERSION: string` (ISO date, `YYYY-MM-DD`) and `TERMS_EFFECTIVE_DATE: Date` from `@/lib/terms`. Phase 2 imports `TERMS_VERSION`.
- Produces: `TERMS_DOCUMENTS: Record<'en' | 'de', () => Promise<{ default: MDXContent }>>` from `@/lib/legal/terms-documents`.
- Produces: `LEGAL_COMPONENTS: MDXComponents`, `Anchor`, `OperatorDetails` from `@/components/legal/legal-mdx`.
- Produces: section anchors `#scope`, `#service`, `#contract`, `#account`, `#acceptable-use`, `#content`, `#rights`, `#moderation`, `#discord`, `#liability`, `#termination`, `#changes`, `#final`, identical in both languages. Task 3 links `/terms#acceptable-use`; Phase 3 cites sections 5 and 8.

- [ ] **Step 1: Switch to the planning branch**

The spec and plans are already committed on `feat/terms-of-service-page`; Phase 1 builds on top of them rather than on a fresh branch.

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git switch feat/terms-of-service-page
git log --oneline -3   # expect the spec and plans commits on top of main
git fetch origin && git rebase origin/main
```

- [ ] **Step 2: Write the failing constant test**

`app/web/src/lib/__tests__/terms.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TERMS_VERSION, TERMS_EFFECTIVE_DATE } from '../terms'

describe('TERMS_VERSION', () => {
  // The version is what Phase 2 stores per user, so it must stay a plain,
  // sortable date string rather than drifting into a free-form label.
  it('is an ISO calendar date', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('derives the effective date from the version at UTC midnight', () => {
    expect(TERMS_EFFECTIVE_DATE.toISOString()).toBe(`${TERMS_VERSION}T00:00:00.000Z`)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -w web -- src/lib/__tests__/terms.test.ts`
Expected: FAIL, cannot resolve `../terms`.

- [ ] **Step 4: Create the constant**

Set the version to the date you implement this (run `date -u +%Y-%m-%d`); the example uses `2026-09-16`. Once merged it must never change for this text: Phase 2 stores it as the version each user accepted.

`app/web/src/lib/terms.ts`:

```ts
/**
 * Version of the Terms of Service currently published at /terms: the date
 * the text took effect. Isomorphic on purpose - the page renders it and the
 * acceptance record stores it, so the two can never disagree.
 *
 * Bump it only together with a change to content/legal/terms.*.mdx. A bump
 * makes every account whose stored version differs see the acceptance banner
 * again.
 */
export const TERMS_VERSION = '2026-09-16'

export const TERMS_EFFECTIVE_DATE = new Date(`${TERMS_VERSION}T00:00:00Z`)
```

- [ ] **Step 5: Run the constant test to verify it passes**

Run: `npm test -w web -- src/lib/__tests__/terms.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the UI strings**

In `app/web/messages/en.json`, add directly after the closing brace of `"privacy"`:

```json
  "terms": {
    "metaTitle": "Terms of Service",
    "title": "Terms of Service",
    "notConfigured": "Not configured",
    "operatorContactLabel": "Email:",
    "effective": "Effective from {date, date, long}"
  },
```

In `app/web/messages/de.json`, same place:

```json
  "terms": {
    "metaTitle": "Nutzungsbedingungen",
    "title": "Nutzungsbedingungen",
    "notConfigured": "Nicht konfiguriert",
    "operatorContactLabel": "E-Mail:",
    "effective": "Gültig ab {date, date, long}"
  },
```

- [ ] **Step 7: Write the English document**

`app/web/content/legal/terms.en.mdx`. Each section opens with `<Anchor id="..." />` on its own line, followed by a blank line, then the heading; MDX needs the blank line to keep the anchor out of a paragraph.

```mdx
These terms of service govern the use of Revelio, a searchable database for the
Harry Potter Trading Card Game. They apply to the website revelio.cards, to user
accounts and to the Revelio Discord bot.

<Anchor id="scope" />

## 1. Operator and scope

(1) Revelio is operated by:

<OperatorDetails name={props.operatorName} address={props.operatorAddress} email={props.contactEmail} />

(2) These terms apply to every use of the website revelio.cards, of a Revelio user
account and of the Revelio Discord bot (together, "Revelio"). Deviating terms of
users do not apply.

(3) Further information about the operator is in the [imprint](/imprint). How we
process personal data is explained in the [privacy policy](/privacy), which is not
part of these terms.

<Anchor id="service" />

## 2. The service

(1) Revelio is a free, non-commercial and unofficial fan project. It lets you search
the cards of the Harry Potter Trading Card Game, build and share decks, keep track of
your collection, and look cards up from Discord.

(2) Card data, translations and rulings are compiled from community sources and
provided for information only. They may be incomplete or out of date. For play and
tournaments, the official rules and the printed cards prevail.

(3) Revelio is provided free of charge. There is no entitlement to Revelio being
available at any particular time or offering any particular feature. We may extend,
change or restrict features, in particular to keep Revelio secure and working,
insofar as this is reasonable for you.

(4) You can export the data stored in your account at any time under Settings,
Safety Zone. We recommend doing so rather than relying on Revelio as your only copy.

<Anchor id="contract" />

## 3. Contract and eligibility

(1) You can browse Revelio and use the Discord bot without an account. These terms
apply to that use as well.

(2) By completing registration you conclude a free contract of use with the
operator. There is no entitlement to conclude it.

(3) You must be at least 13 years old to use Revelio. If you are under 18, you need
the consent of your parent or legal guardian to create an account.

<Anchor id="account" />

## 4. Your account

(1) Each person may hold one account. The information you provide at registration
must be true; in particular, the email address must be one at which you receive
mail.

(2) You sign in with one-time codes sent to your email address. Keep access to that
mailbox secure and tell us without delay if you suspect someone else is using your
account.

(3) Your username is public. It must not impersonate another person, infringe the
rights of others, or be offensive, discriminatory or otherwise unlawful.

(4) Accounts are personal and may not be passed on to others.

<Anchor id="acceptable-use" />

## 5. Acceptable use

(1) When using Revelio, you must comply with applicable law and these terms. In
particular, you must not:

- publish content that is unlawful, infringes the rights of others, or is harassing,
  hateful, discriminatory, pornographic or glorifies violence, including in
  usernames, deck names and other text you enter;
- harass or threaten other people or pass yourself off as someone else;
- access Revelio in an automated way (for example with scrapers or bots) in a manner
  that places more load on it than ordinary personal use;
- circumvent or probe security measures, rate limits, bans or access restrictions,
  or gain unauthorised access to data or systems;
- use the Discord bot to flood servers with messages or to disrupt other people's
  conversations;
- use Revelio for commercial advertising or to distribute malware.

(2) If you breach these rules, we may take the measures described in section 8.

<Anchor id="content" />

## 6. Your content

(1) You keep the rights to content you create on Revelio, such as decks, deck names
and your collection. You decide whether a deck or your collection is private or
public.

(2) So that we can operate Revelio, you grant us a simple (non-exclusive),
royalty-free right, unlimited in territory, to store, reproduce and make your content
publicly available, but only insofar as this is necessary to operate Revelio: in
particular to show public decks and collections to other visitors and to deliver the
Discord bot replies you request. This right ends when you delete the content or your
account; copies remaining in backups are deleted in the ordinary course.

(3) If you contribute to the shared card data as an editor, for example with rulings
or translations, you grant us a simple, royalty-free right, unlimited in time and
territory, to use, edit and publish these contributions as part of Revelio. Because
contributions are merged into the card data, this right continues after your account
is deleted. You agree that contributions are published without naming you.

(4) You may only enter content that you are entitled to use.

<Anchor id="rights" />

## 7. Third-party rights

(1) Harry Potter, the Harry Potter Trading Card Game, all card names, artwork, card
texts and trademarks are the property of Warner Bros. Entertainment Inc., Wizards of
the Coast LLC and their respective owners. Revelio is not affiliated with or endorsed
by them. Using Revelio grants you no rights to this material.

(2) The Revelio software, its design and its own texts are protected by copyright.
The source code is published for reference only, under a source-available licence
that grants no rights of use beyond reading it.

<Anchor id="moderation" />

## 8. Reporting and moderation

(1) Our single point of contact for users and for authorities under Articles 11 and
12 of the Digital Services Act (DSA) is the email address given in section 1 or our
[contact form](/contact). You can write to us in German or English.

(2) If you come across content on Revelio that you consider unlawful or in breach of
these terms, please report it to us through the same channels. Include the address
(URL) of the content, a sufficiently reasoned explanation of why you consider it
unlawful or in breach of these terms, your name and email address (unless the report
concerns the sexual abuse of children), and a statement that you believe in good
faith that the information in your report is accurate and complete. We confirm
receipt of your report and inform you of our decision.

(3) We review reports and suspected breaches individually and by hand; we do not use
automated tools to moderate content. Depending on the severity of the breach, and
taking your legitimate interests into account, we may remove or disable access to
individual content, suspend your account temporarily or permanently, or terminate
the contract (section 11). We choose the mildest suitable measure and, where
appropriate, warn you first.

(4) If we take a measure against your content or account, we inform you by email of
the measure, the facts and circumstances it is based on, and the provision of these
terms or of the law it relies on (Article 17 DSA). You can object through our contact
form; we will then review the decision again. Your right to take legal action remains
unaffected.

<Anchor id="discord" />

## 9. Discord bot

(1) The Revelio Discord bot runs on Discord. When you use it, Discord's
[Terms of Service](https://discord.com/terms) and
[Community Guidelines](https://discord.com/guidelines) also apply. We have no
influence on Discord's service.

(2) Replies to /card, /search and /deck are visible to everyone in the channel.
Replies to /collection and /mydecks show your own data and are visible only to you.

(3) Linking your Discord account to Revelio is optional. You can unlink it at any
time under Settings, Connections. Details are in the [privacy policy](/privacy).

(4) Anyone who adds the bot to a server is responsible for doing so in line with that
server's rules.

<Anchor id="liability" />

## 10. Liability

(1) We are liable without limitation for intent and gross negligence, for injury to
life, body or health, under the Product Liability Act, and insofar as we have given a
guarantee or fraudulently concealed a defect.

(2) In cases of slight negligence we are liable only for the breach of an essential
contractual obligation, meaning an obligation whose fulfilment makes the proper use
of Revelio possible in the first place and on whose fulfilment you may regularly
rely. In that case our liability is limited to the damage that was foreseeable and
typical for this kind of service when the contract was concluded.

(3) Otherwise, our liability for slight negligence is excluded.

(4) The limitations in paragraphs 2 and 3 also apply to the personal liability of our
representatives and vicarious agents.

<Anchor id="termination" />

## 11. Term and termination

(1) The contract of use runs for an indefinite period.

(2) You can terminate it at any time without notice by deleting your account under
Settings, Safety Zone.

(3) We can terminate it with four weeks' notice, in particular if we discontinue
Revelio. We inform you of this by email.

(4) The right of either party to terminate for good cause without notice remains
unaffected (§ 314 BGB). Good cause exists for us in particular in the case of a
serious or repeated breach of these terms. Such a termination generally requires a
prior warning, unless a warning is dispensable under § 314(2) BGB. Before
terminating, we consider whether a temporary suspension of the account is
sufficient.

(5) When the contract ends, we delete your account and the content linked to it,
subject to section 6(3) and statutory retention obligations.

<Anchor id="changes" />

## 12. Changes to these terms

(1) We may amend these terms with effect for the future, for example when the law
changes or when we add or change features.

(2) We inform registered users of planned changes by email at least four weeks
before they are to take effect, and show them the new version on Revelio. A change
becomes binding for your account only once you accept it. Your silence or continued
use does not count as acceptance.

(3) If you do not accept a change, the previous version continues to apply to your
account. In that case, both you and we can terminate the contract under section 11.

(4) Use without an account is subject to the version in force at the time of use.

<Anchor id="final" />

## 13. Final provisions

(1) The law of the Federal Republic of Germany applies, excluding the UN Convention
on Contracts for the International Sale of Goods. If you are a consumer, this choice
of law applies only insofar as it does not deprive you of the protection granted by
the mandatory provisions of the law of the country in which you have your habitual
residence.

(2) We are neither willing nor obliged to take part in dispute resolution
proceedings before a consumer arbitration board (§ 36 VSBG).

(3) These terms are available in German and English. Both versions are equally
binding.
```

- [ ] **Step 8: Write the German document**

`app/web/content/legal/terms.de.mdx`, same structure, same anchors in the same places:

```mdx
Diese Nutzungsbedingungen regeln die Nutzung von Revelio, einer durchsuchbaren
Datenbank für das Harry Potter Sammelkartenspiel. Sie gelten für die Website
revelio.cards, für Benutzerkonten und für den Revelio-Discord-Bot.

<Anchor id="scope" />

## 1. Anbieter und Geltungsbereich

(1) Revelio wird betrieben von:

<OperatorDetails name={props.operatorName} address={props.operatorAddress} email={props.contactEmail} />

(2) Diese Nutzungsbedingungen gelten für jede Nutzung der Website revelio.cards,
eines Revelio-Benutzerkontos und des Revelio-Discord-Bots (zusammen „Revelio“).
Abweichende Bedingungen von Nutzern gelten nicht.

(3) Weitere Angaben zum Anbieter finden Sie im [Impressum](/imprint). Wie wir
personenbezogene Daten verarbeiten, erklärt die [Datenschutzerklärung](/privacy);
sie ist nicht Bestandteil dieser Nutzungsbedingungen.

<Anchor id="service" />

## 2. Leistungen

(1) Revelio ist ein kostenloses, nicht-kommerzielles und inoffizielles Fan-Projekt.
Mit Revelio können Sie die Karten des Harry Potter Sammelkartenspiels durchsuchen,
Decks erstellen und teilen, Ihre Sammlung verwalten und Karten über Discord
nachschlagen.

(2) Kartendaten, Übersetzungen und Regelauslegungen (Rulings) werden aus Quellen der
Community zusammengestellt und dienen nur der Information. Sie können unvollständig
oder veraltet sein. Für das Spiel und für Turniere sind die offiziellen Regeln und
die gedruckten Karten maßgeblich.

(3) Revelio wird unentgeltlich bereitgestellt. Ein Anspruch darauf, dass Revelio zu
bestimmten Zeiten verfügbar ist oder bestimmte Funktionen bietet, besteht nicht. Wir
dürfen Funktionen erweitern, ändern oder einschränken, insbesondere um Revelio
sicher und funktionsfähig zu halten, soweit dies für Sie zumutbar ist.

(4) Die in Ihrem Konto gespeicherten Daten können Sie jederzeit unter Einstellungen,
Sicherheitsbereich exportieren. Wir empfehlen das, statt sich auf Revelio als
einzige Kopie zu verlassen.

<Anchor id="contract" />

## 3. Vertragsschluss und Voraussetzungen

(1) Sie können Revelio und den Discord-Bot auch ohne Konto nutzen. Auch für diese
Nutzung gelten diese Nutzungsbedingungen.

(2) Mit Abschluss der Registrierung kommt zwischen Ihnen und dem Anbieter ein
unentgeltlicher Nutzungsvertrag zustande. Ein Anspruch auf Vertragsschluss besteht
nicht.

(3) Für die Nutzung von Revelio müssen Sie mindestens 13 Jahre alt sein. Sind Sie
jünger als 18 Jahre, benötigen Sie für die Registrierung die Zustimmung Ihrer Eltern
oder Ihres gesetzlichen Vertreters.

<Anchor id="account" />

## 4. Ihr Konto

(1) Jede Person darf ein Konto führen. Ihre Angaben bei der Registrierung müssen
zutreffen; insbesondere muss die E-Mail-Adresse eine sein, unter der Sie E-Mails
empfangen.

(2) Sie melden sich mit Einmalcodes an, die an Ihre E-Mail-Adresse geschickt werden.
Schützen Sie den Zugang zu diesem Postfach und teilen Sie uns unverzüglich mit, wenn
Sie vermuten, dass jemand anderes Ihr Konto nutzt.

(3) Ihr Benutzername ist öffentlich. Er darf keine andere Person imitieren, keine
Rechte Dritter verletzen und nicht beleidigend, diskriminierend oder sonst
rechtswidrig sein.

(4) Konten sind persönlich und dürfen nicht an andere weitergegeben werden.

<Anchor id="acceptable-use" />

## 5. Zulässige Nutzung

(1) Bei der Nutzung von Revelio müssen Sie geltendes Recht und diese
Nutzungsbedingungen einhalten. Insbesondere dürfen Sie nicht:

- Inhalte veröffentlichen, die rechtswidrig sind, Rechte Dritter verletzen oder
  belästigend, hetzerisch, diskriminierend, pornografisch oder gewaltverherrlichend
  sind, auch nicht in Benutzernamen, Decknamen und anderen von Ihnen eingegebenen
  Texten;
- andere Personen belästigen oder bedrohen oder sich als eine andere Person
  ausgeben;
- automatisiert auf Revelio zugreifen (etwa mit Scrapern oder Bots), wenn dies
  Revelio stärker belastet als eine gewöhnliche private Nutzung;
- Sicherheitsmaßnahmen, Ratenbegrenzungen, Sperren oder Zugangsbeschränkungen
  umgehen oder austesten oder sich unbefugt Zugang zu Daten oder Systemen
  verschaffen;
- den Discord-Bot nutzen, um Server mit Nachrichten zu überfluten oder Unterhaltungen
  anderer zu stören;
- Revelio für kommerzielle Werbung oder zur Verbreitung von Schadsoftware nutzen.

(2) Verstoßen Sie gegen diese Regeln, können wir die in Abschnitt 8 beschriebenen
Maßnahmen ergreifen.

<Anchor id="content" />

## 6. Ihre Inhalte

(1) Die Rechte an Inhalten, die Sie auf Revelio erstellen, etwa Decks, Decknamen und
Ihre Sammlung, verbleiben bei Ihnen. Sie entscheiden, ob ein Deck oder Ihre Sammlung
privat oder öffentlich ist.

(2) Damit wir Revelio betreiben können, räumen Sie uns ein einfaches, unentgeltliches,
räumlich unbeschränktes Recht ein, Ihre Inhalte zu speichern, zu vervielfältigen und
öffentlich zugänglich zu machen, jedoch nur, soweit dies für den Betrieb von Revelio
erforderlich ist: insbesondere, um öffentliche Decks und Sammlungen anderen
Besuchern anzuzeigen und die von Ihnen angeforderten Antworten des Discord-Bots
auszuliefern. Dieses Recht endet, wenn Sie den Inhalt oder Ihr Konto löschen; in
Sicherungskopien verbliebene Kopien werden im regulären Ablauf gelöscht.

(3) Wenn Sie als Redakteur zu den gemeinsamen Kartendaten beitragen, etwa mit Rulings
oder Übersetzungen, räumen Sie uns ein einfaches, unentgeltliches, zeitlich und
räumlich unbeschränktes Recht ein, diese Beiträge als Teil von Revelio zu nutzen, zu
bearbeiten und zu veröffentlichen. Da Beiträge in die Kartendaten einfließen,
besteht dieses Recht auch nach der Löschung Ihres Kontos fort. Sie sind damit
einverstanden, dass Beiträge ohne Nennung Ihres Namens veröffentlicht werden.

(4) Sie dürfen nur Inhalte eingeben, zu deren Nutzung Sie berechtigt sind.

<Anchor id="rights" />

## 7. Rechte Dritter

(1) Harry Potter, das Harry Potter Sammelkartenspiel, alle Kartennamen,
Illustrationen, Kartentexte und Marken sind Eigentum von Warner Bros. Entertainment
Inc., Wizards of the Coast LLC und ihren jeweiligen Rechteinhabern. Revelio steht in
keiner Verbindung zu ihnen und wird nicht von ihnen unterstützt. Durch die Nutzung
von Revelio erhalten Sie an diesen Inhalten keine Rechte.

(2) Die Software von Revelio, ihre Gestaltung und ihre eigenen Texte sind
urheberrechtlich geschützt. Der Quellcode ist nur zur Einsicht unter einer
Source-Available-Lizenz veröffentlicht, die über das Lesen hinaus keine
Nutzungsrechte einräumt.

<Anchor id="moderation" />

## 8. Meldungen und Moderation

(1) Unsere zentrale Kontaktstelle für Nutzer und Behörden nach Art. 11 und 12 des
Digital Services Act (DSA) ist die in Abschnitt 1 genannte E-Mail-Adresse oder unser
[Kontaktformular](/contact). Sie können uns auf Deutsch oder Englisch schreiben.

(2) Wenn Sie auf Revelio Inhalte finden, die Sie für rechtswidrig oder für einen
Verstoß gegen diese Nutzungsbedingungen halten, melden Sie diese bitte über dieselben
Wege. Geben Sie dabei die Adresse (URL) des Inhalts an, eine hinreichend begründete
Erklärung, warum Sie ihn für rechtswidrig oder unzulässig halten, Ihren Namen und
Ihre E-Mail-Adresse (außer bei Meldungen zum sexuellen Missbrauch von Kindern) sowie
eine Erklärung, dass Sie in gutem Glauben davon überzeugt sind, dass die Angaben in
Ihrer Meldung richtig und vollständig sind. Wir bestätigen den Eingang Ihrer Meldung
und teilen Ihnen unsere Entscheidung mit.

(3) Wir prüfen Meldungen und Verdachtsfälle einzeln und von Hand; automatisierte
Moderationswerkzeuge setzen wir nicht ein. Je nach Schwere des Verstoßes und unter
Berücksichtigung Ihrer berechtigten Interessen können wir einzelne Inhalte entfernen
oder den Zugang zu ihnen sperren, Ihr Konto vorübergehend oder dauerhaft sperren oder
den Vertrag kündigen (Abschnitt 11). Wir wählen die mildeste geeignete Maßnahme und
mahnen Sie, wo es angemessen ist, zuvor ab.

(4) Ergreifen wir eine Maßnahme gegen Ihre Inhalte oder Ihr Konto, teilen wir Ihnen
per E-Mail die Maßnahme, die zugrunde liegenden Tatsachen und Umstände sowie die
Bestimmung dieser Nutzungsbedingungen oder des Gesetzes mit, auf die sie gestützt ist
(Art. 17 DSA). Sie können über unser Kontaktformular widersprechen; wir prüfen die
Entscheidung dann erneut. Ihr Recht, den Rechtsweg zu beschreiten, bleibt unberührt.

<Anchor id="discord" />

## 9. Discord-Bot

(1) Der Revelio-Discord-Bot läuft auf Discord. Wenn Sie ihn nutzen, gelten zusätzlich
die [Nutzungsbedingungen](https://discord.com/terms) und die
[Community-Richtlinien](https://discord.com/guidelines) von Discord. Auf den Dienst
von Discord haben wir keinen Einfluss.

(2) Antworten auf /card, /search und /deck sind für alle im Kanal sichtbar. Antworten
auf /collection und /mydecks zeigen Ihre eigenen Daten und sind nur für Sie sichtbar.

(3) Die Verknüpfung Ihres Discord-Kontos mit Revelio ist freiwillig. Sie können sie
jederzeit unter Einstellungen, Verknüpfungen aufheben. Einzelheiten finden Sie in der
[Datenschutzerklärung](/privacy).

(4) Wer den Bot zu einem Server hinzufügt, ist dafür verantwortlich, dass dies den
Regeln dieses Servers entspricht.

<Anchor id="liability" />

## 10. Haftung

(1) Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei der Verletzung
des Lebens, des Körpers oder der Gesundheit, nach dem Produkthaftungsgesetz sowie
soweit wir eine Garantie übernommen oder einen Mangel arglistig verschwiegen haben.

(2) Bei leichter Fahrlässigkeit haften wir nur für die Verletzung einer wesentlichen
Vertragspflicht, also einer Pflicht, deren Erfüllung die ordnungsgemäße Nutzung von
Revelio überhaupt erst ermöglicht und auf deren Einhaltung Sie regelmäßig vertrauen
dürfen. In diesem Fall ist unsere Haftung auf den bei Vertragsschluss vorhersehbaren,
für diese Art von Dienst typischen Schaden begrenzt.

(3) Im Übrigen ist unsere Haftung für leichte Fahrlässigkeit ausgeschlossen.

(4) Die Haftungsbeschränkungen der Absätze 2 und 3 gelten auch für die persönliche
Haftung unserer Vertreter und Erfüllungsgehilfen.

<Anchor id="termination" />

## 11. Laufzeit und Kündigung

(1) Der Nutzungsvertrag läuft auf unbestimmte Zeit.

(2) Sie können ihn jederzeit ohne Einhaltung einer Frist kündigen, indem Sie Ihr
Konto unter Einstellungen, Sicherheitsbereich löschen.

(3) Wir können ihn mit einer Frist von vier Wochen kündigen, insbesondere wenn wir
Revelio einstellen. Wir informieren Sie darüber per E-Mail.

(4) Das Recht beider Seiten zur Kündigung aus wichtigem Grund ohne Einhaltung einer
Frist bleibt unberührt (§ 314 BGB). Ein wichtiger Grund liegt für uns insbesondere bei
einem schwerwiegenden oder wiederholten Verstoß gegen diese Nutzungsbedingungen vor.
Eine solche Kündigung setzt in der Regel eine vorherige Abmahnung voraus, es sei
denn, diese ist nach § 314 Abs. 2 BGB entbehrlich. Vor einer Kündigung prüfen wir, ob
eine vorübergehende Sperre des Kontos ausreicht.

(5) Mit Vertragsende löschen wir Ihr Konto und die damit verbundenen Inhalte,
vorbehaltlich Abschnitt 6 Absatz 3 und gesetzlicher Aufbewahrungspflichten.

<Anchor id="changes" />

## 12. Änderungen dieser Nutzungsbedingungen

(1) Wir können diese Nutzungsbedingungen mit Wirkung für die Zukunft ändern, etwa bei
Änderungen der Rechtslage oder wenn wir Funktionen hinzufügen oder ändern.

(2) Registrierte Nutzer informieren wir über geplante Änderungen mindestens vier
Wochen vor deren Inkrafttreten per E-Mail und zeigen ihnen die neue Fassung auf
Revelio an. Eine Änderung wird für Ihr Konto erst verbindlich, wenn Sie ihr
zustimmen. Ihr Schweigen oder die weitere Nutzung gilt nicht als Zustimmung.

(3) Stimmen Sie einer Änderung nicht zu, gilt für Ihr Konto die bisherige Fassung
weiter. In diesem Fall können sowohl Sie als auch wir den Vertrag nach Abschnitt 11
kündigen.

(4) Für die Nutzung ohne Konto gilt die zum Zeitpunkt der Nutzung aktuelle Fassung.

<Anchor id="final" />

## 13. Schlussbestimmungen

(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des
UN-Kaufrechts. Sind Sie Verbraucher, gilt diese Rechtswahl nur, soweit Ihnen dadurch
nicht der Schutz entzogen wird, den Ihnen die zwingenden Bestimmungen des Rechts des
Staates gewähren, in dem Sie Ihren gewöhnlichen Aufenthalt haben.

(2) Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor
einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 VSBG).

(3) Diese Nutzungsbedingungen liegen auf Deutsch und Englisch vor. Beide Fassungen
sind gleichermaßen verbindlich.
```

- [ ] **Step 9: Write the failing page test**

`app/web/src/app/[locale]/terms/__tests__/terms.test.tsx`:

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import type { MDXContent } from 'mdx/types'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// next-intl's navigation Link needs the Next router, which jsdom lacks. A plain
// anchor keeps what the test asserts: the href.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import TermsEn from '@/../content/legal/terms.en.mdx'
import TermsDe from '@/../content/legal/terms.de.mdx'
import { TermsContent } from '../page'

type Operator = Omit<React.ComponentProps<typeof TermsContent>, 'Document'>

const FULL: Operator = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
}

const ANCHORS = [
  'scope', 'service', 'contract', 'account', 'acceptable-use', 'content', 'rights',
  'moderation', 'discord', 'liability', 'termination', 'changes', 'final',
]

const LOCALES = {
  en: { messages: en, Document: TermsEn as MDXContent },
  de: { messages: de, Document: TermsDe as MDXContent },
}

function renderTerms(locale: 'en' | 'de', operator: Operator = FULL) {
  const { messages, Document } = LOCALES[locale]
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <TermsContent Document={Document} {...operator} />
    </NextIntlClientProvider>,
  )
}

// Section anchors and the "(n)" number of every paragraph, in document order:
// the skeleton both language versions must share.
function outline(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-terms-anchor], p')).flatMap((el) => {
    if (el.hasAttribute('data-terms-anchor')) return [`#${el.id}`]
    const number = el.textContent?.match(/^\((\d+)\)/)
    return number ? [number[1]] : []
  })
}

describe('TermsContent', () => {
  it('renders the English title and injects operator values', () => {
    renderTerms('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'hi@example.com' })).toHaveAttribute(
      'href',
      'mailto:hi@example.com',
    )
  })

  it('renders the German title and operator values', () => {
    renderTerms('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Nutzungsbedingungen' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })

  it('falls back to "Not configured" when operator values are null', () => {
    renderTerms('en', { operatorName: null, operatorAddress: null, contactEmail: null })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })

  // Registration deep-links #acceptable-use and the ban email cites sections by
  // number, so the anchors are a public contract. rehype-slug ids follow the
  // translated heading, which is exactly why they are not relied on.
  it('puts a language-independent anchor before every section heading', () => {
    for (const locale of ['en', 'de'] as const) {
      const { container } = renderTerms(locale)
      for (const id of ANCHORS) {
        expect(container.querySelector(`#${id}`)?.nextElementSibling?.tagName, `${locale} #${id}`).toBe('H2')
      }
      cleanup()
    }
  })

  // Both versions are declared equally binding (section 13), so a paragraph
  // present in one and missing in the other is a legal defect, not a typo.
  it('gives both languages the same sections and numbered paragraphs', () => {
    const enOutline = outline(renderTerms('en').container)
    cleanup()
    const deOutline = outline(renderTerms('de').container)
    expect(enOutline).toContain('#acceptable-use')
    expect(deOutline).toEqual(enOutline)
  })

  // A liability clause that drops any of these carve-outs is void as a whole
  // under § 309 No. 7 BGB, so the test pins each of them in both languages.
  it('keeps the mandatory carve-outs in the liability clause', () => {
    renderTerms('en')
    expect(screen.getByText(/intent and gross negligence/)).toBeInTheDocument()
    expect(screen.getByText(/injury to\s+life, body or health/)).toBeInTheDocument()
    expect(screen.getByText(/Product Liability Act/)).toBeInTheDocument()
    expect(screen.getByText(/foreseeable and\s+typical/)).toBeInTheDocument()
    cleanup()
    renderTerms('de')
    expect(screen.getByText(/Vorsatz und grober Fahrlässigkeit/)).toBeInTheDocument()
    expect(screen.getByText(/vorhersehbaren,\s+für diese Art von Dienst typischen Schaden/)).toBeInTheDocument()
  })

  // BGH XI ZR 26/20: deemed consent by silence is void, so the change clause
  // must say outright that silence does not count.
  it('does not treat silence as acceptance of a change', () => {
    renderTerms('en')
    expect(screen.getByText(/silence or continued\s+use does not count as acceptance/)).toBeInTheDocument()
  })

  it('keeps the consumer-law caveat on the choice of law', () => {
    renderTerms('en')
    expect(screen.getByText(/habitual\s+residence/)).toBeInTheDocument()
  })

  it('routes internal links through next-intl and opens external ones in a new tab', () => {
    renderTerms('en')
    expect(screen.getByRole('link', { name: 'contact form' })).toHaveAttribute('href', '/contact')
    expect(screen.getAllByRole('link', { name: 'privacy policy' })[0]).toHaveAttribute('href', '/privacy')
    const discordTerms = screen.getByRole('link', { name: 'Terms of Service' })
    expect(discordTerms).toHaveAttribute('href', 'https://discord.com/terms')
    expect(discordTerms).toHaveAttribute('target', '_blank')
    expect(discordTerms).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // The docs component map gives headings and paragraphs their own classes;
  // /terms must look like /privacy and /imprint instead.
  it('renders headings and paragraphs without the docs styling', () => {
    const { container } = renderTerms('en')
    expect(container.querySelector('h2')?.className ?? '').toBe('')
    expect(container.querySelector('p')?.className ?? '').toBe('')
  })

  it('shows the effective date', () => {
    renderTerms('en')
    expect(screen.getByText(/^Effective from \w+ \d{1,2}, \d{4}$/)).toBeInTheDocument()
  })
})
```

In the test render, the MDX files are compiled by `vitest.config.mts` without Next's provider, so the docs styles are absent anyway. The styling test still pins that `LEGAL_COMPONENTS` does not add classes of its own; in the Next build it is what overrides the provider, and Step 15 checks that in the browser.

- [ ] **Step 10: Run it to verify it fails**

Run: `npm test -w web -- 'src/app/\[locale\]/terms/__tests__/terms.test.tsx'`
Expected: FAIL, cannot resolve `../page`.

- [ ] **Step 11: Write the legal component map**

`app/web/src/components/legal/legal-mdx.tsx`:

```tsx
import type { MDXComponents } from 'mdx/types'
import type { ComponentPropsWithoutRef } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { ContactEmail } from '@/components/legal/contact-email'

type AnchorProps = { id: string }

type OperatorDetailsProps = {
  name: string | null
  address: string | null
  email: string | null
}

/**
 * Component map for legal MDX (content/legal/). Next's MDX provider,
 * src/mdx-components.tsx, gives headings, paragraphs, lists and links the docs
 * type scale; these plain elements override it so ProseShell styles a legal
 * page exactly like /privacy and /imprint. Internal links still go through
 * next-intl's Link: a bare <a href="/privacy"> would drop a German reader onto
 * the English page.
 */
export const LEGAL_COMPONENTS: MDXComponents = {
  h2: (props: ComponentPropsWithoutRef<'h2'>) => <h2 {...props} />,
  h3: (props: ComponentPropsWithoutRef<'h3'>) => <h3 {...props} />,
  p: (props: ComponentPropsWithoutRef<'p'>) => <p {...props} />,
  ul: (props: ComponentPropsWithoutRef<'ul'>) => <ul {...props} />,
  ol: (props: ComponentPropsWithoutRef<'ol'>) => <ol {...props} />,
  li: (props: ComponentPropsWithoutRef<'li'>) => <li {...props} />,
  a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) =>
    href?.startsWith('/') ? (
      <Link {...props} href={href} />
    ) : (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer" />
    ),
  Anchor,
  OperatorDetails,
}

/**
 * Deep-link target placed before each section heading. rehype-slug derives
 * heading ids from the translated text, so the German page would otherwise
 * answer a German id and /terms#acceptable-use would not scroll.
 */
export function Anchor({ id }: AnchorProps) {
  return <span id={id} data-terms-anchor="" className="block scroll-mt-20" />
}

/** Operator name, address and contact email, from site settings via MDX props. */
export function OperatorDetails({ name, address, email }: OperatorDetailsProps) {
  const t = useTranslations('terms')
  const nc = t('notConfigured')
  return (
    <>
      <p className="whitespace-pre-line">{`${name ?? nc}\n${address ?? nc}`}</p>
      <p>
        {t('operatorContactLabel')} <ContactEmail email={email} fallback={nc} />
      </p>
    </>
  )
}
```

`Anchor` and `OperatorDetails` are function declarations, so they are hoisted and the map above them can reference them.

- [ ] **Step 12: Write the document registry**

`app/web/src/lib/legal/terms-documents.ts`:

```ts
import type { MDXContent } from 'mdx/types'
import type { routing } from '@/../i18n/routing'

type TermsLocale = (typeof routing.locales)[number]

type TermsDocumentLoader = () => Promise<{ default: MDXContent }>

/**
 * The terms body per locale. The `satisfies` clause is the point, as in
 * lib/docs/registry.ts: adding a locale to routing.locales fails the typecheck
 * until the terms are translated, instead of silently serving English. Literal
 * import paths keep each file statically analyzable.
 */
export const TERMS_DOCUMENTS = {
  en: () => import('@/../content/legal/terms.en.mdx'),
  de: () => import('@/../content/legal/terms.de.mdx'),
} satisfies Record<TermsLocale, TermsDocumentLoader>
```

- [ ] **Step 13: Write the page**

`app/web/src/app/[locale]/terms/page.tsx`:

```tsx
import type { Metadata } from 'next'
import type { MDXContent } from 'mdx/types'
import { notFound } from 'next/navigation'
import { hasLocale, useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { ProseShell } from '@/components/legal/prose-shell'
import { LEGAL_COMPONENTS } from '@/components/legal/legal-mdx'
import { TERMS_DOCUMENTS } from '@/lib/legal/terms-documents'
import { getCachedSiteSettings } from '@/lib/server/site-settings'
import { TERMS_EFFECTIVE_DATE } from '@/lib/terms'

type TermsContentProps = {
  Document: MDXContent
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
}

type TermsPageProps = { params: Promise<{ locale: string }> }

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms')
  return { title: t('metaTitle') }
}

/**
 * Sync and prop-driven so it renders in a test tree as well as on the server.
 * The operator values reach the MDX as props, where <OperatorDetails> reads
 * them from `props`.
 */
export function TermsContent({ Document, operatorName, operatorAddress, contactEmail }: TermsContentProps) {
  const t = useTranslations('terms')
  return (
    <ProseShell>
      <h1>{t('title')}</h1>
      <Document
        components={LEGAL_COMPONENTS}
        operatorName={operatorName}
        operatorAddress={operatorAddress}
        contactEmail={contactEmail}
      />
      <p className="mt-8 text-xs text-muted-foreground/70">
        {t('effective', { date: TERMS_EFFECTIVE_DATE })}
      </p>
    </ProseShell>
  )
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  const [{ default: Document }, settings] = await Promise.all([
    TERMS_DOCUMENTS[locale](),
    getCachedSiteSettings(),
  ])
  return (
    <TermsContent
      Document={Document}
      operatorName={settings?.operatorName ?? null}
      operatorAddress={settings?.operatorAddress ?? null}
      contactEmail={settings?.contactEmail ?? null}
    />
  )
}
```

- [ ] **Step 14: Run the page test to verify it passes**

Run: `npm test -w web -- 'src/app/\[locale\]/terms/__tests__/terms.test.tsx' src/lib/__tests__/terms.test.ts`
Expected: PASS (11 page tests, 2 constant tests).

If a text assertion fails only because MDX kept a source line break where the regex has a space, widen that regex with `\s+`; do not reflow the MDX to suit a test. If "shows the effective date" fails, print `screen.getByText(/Effective from/).textContent` and fix the regex to the real format.

- [ ] **Step 15: Check the real build path**

The test compiles MDX without Next's provider, so check the provider override in the app. With `npm run dev -w web`, open `http://localhost:3000/terms` and `http://localhost:3000/de/terms` with Playwright chromium (scratchpad only) and assert in the script:

- `document.querySelector('main h2').className` is `""` (no docs heading classes leaked in);
- the computed `font-size` of the first body paragraph equals that of the first paragraph on `/privacy`;
- navigating to `/de/terms#acceptable-use` leaves the "5. Zulässige Nutzung" heading in the viewport below the header.

Expected: all three hold. If headings carry docs classes, the provider is winning; confirm `components={LEGAL_COMPONENTS}` reaches `Document`.

- [ ] **Step 16: Typecheck and lint the new files**

Run: `npm run typecheck && npm run lint -w web`
Expected: PASS. If lint flags the component map (for example a display-name rule on the inline arrow components), give each entry a named function in `legal-mdx.tsx` rather than disabling the rule.

- [ ] **Step 17: Commit**

```bash
git add app/web/src/lib/terms.ts app/web/src/lib/__tests__/terms.test.ts app/web/content/legal \
  app/web/src/lib/legal app/web/src/components/legal/legal-mdx.tsx \
  'app/web/src/app/[locale]/terms' app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): publish terms of service at /terms" \
  -m "Discord's developer portal requires a Terms of Service URL for the bot,
and the privacy policy is not one. The body is MDX, one file per language,
so a legal text reviews as prose rather than as message keys; anchors are
explicit because rehype-slug ids follow the translated headings. The
liability clause keeps every carve-out § 309 No. 7 BGB makes mandatory,
since dropping one voids the clause as a whole."
```

---

### Task 2: Footer link and sitemap entry

**Files:**
- Modify: `app/web/src/components/layout/site-footer.tsx:129-132`
- Modify: `app/web/src/components/layout/__tests__/site-footer.test.tsx` (the `renders the legal links` test)
- Modify: `app/web/src/lib/sitemap.ts:42-43`
- Modify: `app/web/src/lib/__tests__/sitemap.test.ts`
- Modify: `app/web/messages/en.json` and `de.json` (`footer.terms`)

**Interfaces:**
- Consumes: the `/terms` route from Task 1.

- [ ] **Step 1: Extend the footer test**

In `site-footer.test.tsx`, replace the `renders the legal links` test with:

```tsx
  it('renders the legal links', () => {
    renderFooter()
    const legal = screen.getByRole('navigation', { name: 'Legal' })
    expect(within(legal).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(within(legal).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(within(legal).getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/imprint')
  })
```

- [ ] **Step 2: Add the sitemap assertion**

In `sitemap.test.ts`, add inside `describe('buildSitemap', ...)`:

```ts
  // Discord links the bot's Terms of Service URL, and the page is indexable
  // like the privacy policy and imprint next to it.
  it('lists the terms of service', () => {
    expect(STATIC_ROUTES).toContain('/terms')
    expect(urls).toContain(`${BASE}/terms`)
    expect(urls).toContain(`${BASE}/de/terms`)
  })
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx src/lib/__tests__/sitemap.test.ts`
Expected: FAIL, no link named "Terms of Service"; `STATIC_ROUTES` does not contain `/terms`.

- [ ] **Step 4: Add the message keys**

`en.json`, in `footer`, directly after `"privacy": "Privacy Policy",`:

```json
    "terms": "Terms of Service",
```

`de.json`, in `footer`, directly after `"privacy": "Datenschutz",`:

```json
    "terms": "Nutzungsbedingungen",
```

- [ ] **Step 5: Add the footer link**

In `site-footer.tsx`, change the legal nav to:

```tsx
            <nav aria-label={t('legal')} className="flex items-center gap-4">
              <LegalLink href="/privacy">{t('privacy')}</LegalLink>
              <LegalLink href="/terms">{t('terms')}</LegalLink>
              <LegalLink href="/imprint">{t('imprint')}</LegalLink>
            </nav>
```

Three links at `gap-4` fit a 320px phone on one line (roughly 60 + 110 + 50px plus gaps). Check it in Step 8.

- [ ] **Step 6: Add the sitemap route**

In `sitemap.ts`, change the two lines to:

```ts
  '/imprint',
  '/privacy',
  '/terms',
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test -w web -- src/components/layout/__tests__/site-footer.test.tsx src/lib/__tests__/sitemap.test.ts`
Expected: PASS.

- [ ] **Step 8: Check the footer at phone width**

With the dev server running (`npm run dev -w web`), take a 320px-wide screenshot of the footer with the repo's Playwright chromium (no Chrome is installed; import Playwright by absolute path from `app/node_modules/playwright`). Save the script and output in the session scratchpad, not the repo. Expected: the three legal links sit on one line and none is clipped. If they wrap, add `flex-wrap gap-y-1` to the nav's class list.

- [ ] **Step 9: Commit**

```bash
git add app/web/src/components/layout app/web/src/lib/sitemap.ts \
  app/web/src/lib/__tests__/sitemap.test.ts app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(web): link the terms of service from the footer and sitemap"
```

---

### Task 3: Terms notice at registration

**Files:**
- Modify: `app/web/src/components/auth/auth-form.tsx` (email step, register mode)
- Modify: `app/web/src/components/auth/__tests__/auth-form.test.tsx`
- Modify: `app/web/src/components/auth/__tests__/auth-i18n.test.ts`
- Modify: `app/web/messages/en.json` and `de.json` (`auth.termsNotice`)

**Interfaces:**
- Consumes: `/terms`, `/terms#acceptable-use` (Task 1), `/privacy`.
- Produces: nothing for later tasks. Phase 2 adds the acceptance record to the same `verify()` function.

- [ ] **Step 1: Write the failing tests**

In `auth-form.test.tsx`, add inside `describe('AuthForm', ...)`:

```tsx
  // § 305(2) BGB: the terms bind only if the visitor is pointed to them before
  // the click that concludes the contract. The notice names that button by its
  // real label, so a renamed button cannot leave it quoting a stale one.
  it('register mode tells the visitor what pressing Register agrees to', () => {
    renderForm('register')
    expect(screen.getByText(/By pressing “Register” you agree to our/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'rules for acceptable use' })).toHaveAttribute(
      'href',
      '/terms#acceptable-use',
    )
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('places the notice before the Register button', () => {
    renderForm('register')
    const notice = screen.getByText(/By pressing “Register”/)
    const button = screen.getByRole('button', { name: 'Register' })
    expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('login mode shows no terms notice', () => {
    renderForm('login')
    expect(screen.queryByRole('link', { name: 'Terms of Service' })).not.toBeInTheDocument()
  })
```

In `auth-i18n.test.ts`, add inside the `describe`:

```ts
  it('carries the terms notice with its button placeholder in both locales', () => {
    for (const m of [en, de]) {
      expect(m.auth.termsNotice).toContain('{button}')
      expect(m.auth.termsNotice).toContain('<terms>')
      expect(m.auth.termsNotice).toContain('<rules>')
      expect(m.auth.termsNotice).toContain('<privacy>')
    }
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -w web -- src/components/auth/__tests__/auth-form.test.tsx src/components/auth/__tests__/auth-i18n.test.ts`
Expected: FAIL, no text matching "By pressing"; `termsNotice` undefined.

- [ ] **Step 3: Add the message keys**

`en.json`, in `auth`, directly after `"usernameTaken": ...` (add a comma to the previous line):

```json
    "termsNotice": "By pressing “{button}” you agree to our <terms>Terms of Service</terms> and to follow our <rules>rules for acceptable use</rules>. Our <privacy>Privacy Policy</privacy> explains how we handle your data."
```

`de.json`, in `auth`, at the same place:

```json
    "termsNotice": "Mit Klick auf „{button}“ stimmst du unseren <terms>Nutzungsbedingungen</terms> zu und verpflichtest dich, unsere <rules>Regeln zur zulässigen Nutzung</rules> einzuhalten. Wie wir mit deinen Daten umgehen, erklärt unsere <privacy>Datenschutzerklärung</privacy>."
```

The privacy policy is linked as information, never as something agreed to: processing rests on Art. 6(1)(b) GDPR, and consent wording would misstate that.

- [ ] **Step 4: Render the notice**

In `auth-form.tsx`, in the email-step form, between `<FieldError>{emailForm.formState.errors.root?.message}</FieldError>` and the submit `<Button>`, insert:

```tsx
          {register && (
            // Incorporates the terms (§ 305(2) BGB): shown before the click that
            // concludes the contract. Links open in a new tab so reading the terms
            // does not throw away what the visitor has typed.
            <p className="text-sm text-muted-foreground">
              {t.rich('termsNotice', {
                button: t('register'),
                terms: (chunks) => (
                  <Link href="/terms" target="_blank" className="text-foreground underline">
                    {chunks}
                  </Link>
                ),
                rules: (chunks) => (
                  <Link href="/terms#acceptable-use" target="_blank" className="text-foreground underline">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" target="_blank" className="text-foreground underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          )}
```

`Link` is already imported from `@/../i18n/navigation` in this file.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -w web -- src/components/auth/__tests__/auth-form.test.tsx src/components/auth/__tests__/auth-i18n.test.ts`
Expected: PASS, including every pre-existing test in both files.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/components/auth app/web/messages/en.json app/web/messages/de.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "feat(auth): incorporate the terms of service at registration" \
  -m "A notice before the Register button is what § 305(2) BGB asks for; a
checkbox would add friction without legal weight. The privacy policy is
linked as information rather than agreed to, since processing rests on
the contract and not on consent."
```

---

### Task 4: Link the terms from the Discord docs

**Files:**
- Modify: `app/web/content/docs/discord-privacy.en.mdx` (append)
- Modify: `app/web/content/docs/discord-privacy.de.mdx` (append)

**Interfaces:**
- Consumes: `/terms`, `/privacy`. MDX links are root-relative; the docs pipeline makes them locale-aware.

- [ ] **Step 1: Append the English section**

At the end of `discord-privacy.en.mdx`, after the final paragraph and one blank line:

```mdx
## Legal

Using the bot is subject to the [Terms of Service](/terms). How Revelio handles
personal data, including for linked Discord accounts, is set out in the
[Privacy Policy](/privacy).
```

- [ ] **Step 2: Append the German section**

At the end of `discord-privacy.de.mdx`:

```mdx
## Rechtliches

Für die Nutzung des Bots gelten die [Nutzungsbedingungen](/terms). Wie Revelio mit
personenbezogenen Daten umgeht, auch bei verknüpften Discord-Konten, steht in der
[Datenschutzerklärung](/privacy).
```

- [ ] **Step 3: Run the docs tests**

Run: `npm test -w web -- 'src/app/\[locale\]/docs' src/lib/docs src/components/docs`
Expected: PASS. A table-of-contents snapshot or heading-count assertion that fails because of the new heading is updated to include "Legal" / "Rechtliches"; any other failure is a real defect.

- [ ] **Step 4: Commit**

```bash
git add app/web/content/docs/discord-privacy.en.mdx app/web/content/docs/discord-privacy.de.mdx
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(web): link the terms and privacy policy from the bot privacy page"
```

---

### Task 5: Verify and open the PR

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-terms-of-service-design.md` (status line only)

- [ ] **Step 1: Run the full checks**

From `app/`:

```bash
npm test -w web
npm run typecheck
npm run lint
```

Expected: all pass. Record the web test count for the PR. The two test files that need Meilisearch at `localhost:7700` fail without it; if they do, start the stack (`docker compose up -d meilisearch`) and rerun rather than reporting them as passing.

- [ ] **Step 2: Look at the page in both languages**

With `npm run dev -w web`, screenshot `http://localhost:3000/terms` and `http://localhost:3000/de/terms` at 1280px and 375px, plus `/register` at 375px, with Playwright chromium (scratchpad only). Check: headings numbered 1 to 13, the operator block filled from site settings, the effective date at the foot, `/terms#acceptable-use` scrolls with the heading clear of the header, and the notice sits above the Register button without crowding it.

- [ ] **Step 3: Mark the spec's Phase 1 as implemented**

Change the spec's status line to:

```markdown
Status: approved; Phase 1 implemented
```

```bash
git add docs/superpowers/specs/2026-09-16-terms-of-service-design.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs(plans): mark terms of service phase 1 as implemented"
```

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/terms-of-service-page
/opt/homebrew/bin/gh pr create --base main \
  --title "feat(web): publish terms of service and incorporate them at registration" \
  --body-file <scratchpad>/pr-body.md
```

The body follows `.github/pull_request_template.md`: opening prose (Discord requires a Terms of Service URL; the privacy policy is a different document), `## What changed`, `## Verification` with one bullet per command actually run and its real result, `## Deployment`, and a link to the spec and this plan. Say in the body that the PR also adds the spec and the plans for all three phases; Phases 2 and 3 follow in their own PRs. `## Deployment` must say:

- In the Discord developer portal, set Terms of Service URL to `https://revelio.cards/terms` and Privacy Policy URL to `https://revelio.cards/privacy`.
- No env var, migration or ingest run.

Also note in the body that the text was drafted against German law without a lawyer, and recommend a review before relying on it.
