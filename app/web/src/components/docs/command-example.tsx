import { Children, type ReactNode } from 'react'

type CommandOption = { name: string; value: string }

type Invocation = { command: string; options: CommandOption[] }

// An option name is lower-case and ends at its first colon. Anchoring on that
// shape is what keeps `deck:https://revelio.cards/...` one option rather than
// two: only the first colon of the token separates a name from its value, and
// a fragment starting with a digit or a scheme's `//` never matches at all.
const OPTION = /^([a-z][a-z0-9_]*):(.*)$/

/**
 * Split `/search query:lumos set:Chamber of Secrets` into its parts.
 *
 * Whitespace alone does not delimit an option: a value may contain spaces, so
 * a fragment belongs to the option before it until a fragment appears that
 * looks like a new option name.
 */
function parse(source: string): Invocation {
  const [command, ...rest] = source.trim().split(/\s+/)
  const options: CommandOption[] = []
  for (const fragment of rest) {
    const match = OPTION.exec(fragment)
    if (match) {
      options.push({ name: match[1], value: match[2] })
    } else if (options.length > 0) {
      const last = options[options.length - 1]
      last.value = last.value ? `${last.value} ${fragment}` : fragment
    }
  }
  return { command, options }
}

function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('')
}

/**
 * One slash command as a reader would type it into Discord, with the command,
 * its option names and their values each in their own colour.
 *
 * Written as a component rather than a fenced code block with a language tag
 * because no highlighter knows Discord's invocation syntax - it is not a
 * programming language, it is three token kinds and a rule about where a value
 * ends. Tokenising it here is both shorter than a grammar and testable.
 *
 * The value colour is `foreground` and the command's is `primary-ink`, both
 * already text-safe on `muted`. The option name needed a token of its own:
 * `secondary-ink`, the obvious choice, measures 3.16:1 there in dark mode.
 */
export function CommandExample({ children }: { children: ReactNode }) {
  const { command, options } = parse(textOf(children))

  return (
    <pre className="mt-5 overflow-x-auto rounded-xl border border-border bg-muted p-4 font-mono text-sm">
      <code>
        <span className="text-primary-ink">{command}</span>
        {options.map((option) => (
          <span key={option.name}>
            {' '}
            <span className="text-syntax-option">{option.name}:</span>
            <span className="text-foreground">{option.value}</span>
          </span>
        ))}
      </code>
    </pre>
  )
}
