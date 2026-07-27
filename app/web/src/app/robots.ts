import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Crawlers used to build AI *training* datasets. Answer/search assistants
// (OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot, Googlebot, Bingbot,
// …) are deliberately NOT listed, so they fall under the permissive `*` group —
// Revelio wants to surface in AI answers, just not to be scraped for training.
// Note: honoring robots.txt is voluntary; this expresses intent, not a barrier.
const AI_TRAINING_BOTS = [
  'GPTBot', // OpenAI model training
  'Google-Extended', // Google Gemini/Vertex training
  'CCBot', // Common Crawl (feeds many training sets)
  'ClaudeBot', // Anthropic crawler used for training
  'anthropic-ai', // legacy Anthropic training token
  'Applebot-Extended', // Apple foundation-model training
  'Meta-ExternalAgent', // Meta AI training
  'FacebookBot', // Meta training
  'Bytespider', // ByteDance training
  'Omgilibot', // Webz.io — resells crawl data for training
  'Diffbot', // bulk extraction for training
]

// robots.txt is world-readable and is NOT an access control, so it deliberately
// does not enumerate admin/auth/editor routes — that would only advertise them.
// Private pages are kept out of search with per-page `noindex` metadata instead
// (admin layout, login, register, collections, decks/mine, decks/new); auth-
// gated routes already 404/redirect for outsiders. Only the non-indexable API
// surface is disallowed for the general crawler.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: '/api/',
      },
      {
        userAgent: AI_TRAINING_BOTS,
        disallow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
