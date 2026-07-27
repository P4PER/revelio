import { describe, it, expect } from 'vitest'
import robots from '../robots'

describe('robots', () => {
  const result = robots()
  const rules = [result.rules].flat().filter(Boolean) as Exclude<
    ReturnType<typeof robots>['rules'],
    unknown[] | undefined
  >[]
  const generalRule = rules.find((r) => r.userAgent === '*')!
  const generalDisallow = [generalRule.disallow].flat().filter(Boolean) as string[]
  const trainingRule = rules.find((r) => Array.isArray(r.userAgent))!

  it('does not enumerate sensitive paths (kept out via noindex, not robots.txt)', () => {
    for (const secret of ['admin', 'login', 'register', 'collection', 'edit', 'mine']) {
      expect(generalDisallow.some((d) => d.includes(secret))).toBe(false)
    }
  })

  it('allows the general crawler everything except the non-indexable api surface', () => {
    expect(generalRule.allow).toBe('/')
    expect(generalDisallow).toContain('/api/')
    expect(result.sitemap).toMatch(/\/sitemap\.xml$/)
  })

  it('blocks known AI training crawlers entirely', () => {
    const agents = trainingRule.userAgent as string[]
    for (const bot of ['GPTBot', 'Google-Extended', 'CCBot', 'ClaudeBot']) {
      expect(agents).toContain(bot)
    }
    expect(trainingRule.disallow).toBe('/')
    expect(trainingRule.allow).toBeUndefined()
  })

  it('does not block answer/search assistants (they fall under the * group)', () => {
    const agents = trainingRule.userAgent as string[]
    for (const answerBot of ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot', 'Googlebot']) {
      expect(agents).not.toContain(answerBot)
    }
  })
})
