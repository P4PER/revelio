import { useLocale, useTranslations } from 'next-intl'
import {
  BOT_COMMANDS,
  LESSONS,
  TYPES,
  attrLabel,
  type BotCommandName,
  type CommandOptionSpec,
} from '@revelio/core'

const CELL = 'border-b border-border/60 px-4 py-2.5 align-top text-muted-foreground'
const HEAD =
  'border-b border-border px-4 py-2 text-left text-[0.68rem] font-semibold uppercase tracking-wider text-muted-foreground'

// The manifest names a scope rather than listing values, so a new lesson or
// card type reaches the docs without anyone editing them.
function choiceCodes(scope: CommandOptionSpec['choices']): string[] {
  if (scope === 'lessons') return LESSONS.map((lesson) => lesson.code)
  if (scope === 'types') return TYPES.map((type) => type.code)
  return []
}

/**
 * The reference table for one slash command.
 *
 * Structure comes from BOT_COMMANDS in @revelio/core, which the bot's own
 * registration is tested against, so a renamed or added option cannot leave a
 * stale row here. Prose comes from the docs.commands message catalog, because
 * Discord's own descriptions are capped at 100 characters and read nothing like
 * documentation.
 *
 * Option names are never translated: Discord sends the same keys in every
 * language, so both locales show the same thing to type.
 */
export function CommandTable({ name }: { name: BotCommandName }) {
  const t = useTranslations('docs')
  const locale = useLocale()
  const command = BOT_COMMANDS.find((entry) => entry.name === name)
  if (!command) return null

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="font-mono text-sm font-medium text-primary-ink">/{command.name}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {command.ephemeral ? t('commandTable.ephemeral') : t('commandTable.public')}
          </span>
          {command.linkRequired && (
            <span className="rounded-full border border-secondary-ink/45 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-secondary-ink">
              {t('commandTable.linkRequired')}
            </span>
          )}
        </span>
      </div>

      {command.options.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{t('commandTable.noOptions')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={HEAD}>{t('commandTable.option')}</th>
                <th className={HEAD}>{t('commandTable.type')}</th>
                <th className={HEAD}>{t('commandTable.required')}</th>
                <th className={HEAD}>{t('commandTable.notes')}</th>
              </tr>
            </thead>
            <tbody>
              {command.options.map((option) => {
                const codes = choiceCodes(option.choices)
                return (
                  <tr key={option.name}>
                    <td className={`${CELL} font-mono font-medium text-foreground`}>
                      {option.name}
                    </td>
                    <td className={CELL}>
                      {option.choices
                        ? t('commandTable.typeChoice')
                        : option.type === 'integer'
                          ? t('commandTable.typeInteger')
                          : t('commandTable.typeString')}
                    </td>
                    <td className={CELL}>
                      {option.required ? (
                        <span className="font-semibold text-primary-ink">
                          {t('commandTable.isRequired')}
                        </span>
                      ) : (
                        t('commandTable.isOptional')
                      )}
                    </td>
                    <td className={CELL}>
                      {t(`commands.${command.name}.options.${option.name}`)}
                      {option.min !== undefined &&
                        ` ${t('commandTable.minimum', { min: option.min })}`}
                      {codes.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1">
                          {codes.map((code) => (
                            <li
                              key={code}
                              className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                            >
                              {attrLabel(
                                option.choices === 'lessons' ? 'lessons' : 'types',
                                code,
                                locale,
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
