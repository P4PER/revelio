'use client'
import { useImperativeHandle, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, Link } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateLocalization, type SaveResult } from '@/lib/localization-actions'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { Button } from '@/components/ui/button'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { makeLocalizationSchema } from '@/lib/schemas/localization'

type Initial = {
  name: string
  text: string
  flavorText: string
  status: 'machine' | 'official'
  adventure: { effect: string; reward: string; toSolve: string }
  match: { prize: string; toWin: string }
}

export type LocalizationFormHandle = { save: () => Promise<SaveResult> }

export function LocalizationForm({
  cardId, lang, initial, kind, embedded = false, ref,
}: {
  cardId: string
  lang: string
  initial: Initial
  kind: 'adventure' | 'match' | null
  embedded?: boolean
  ref?: React.Ref<LocalizationFormHandle>
}) {
  const t = useTranslations('edit')
  const tv = useTranslations('validation')
  const router = useRouter()
  const [text, setText] = useState(initial.text)
  const [flavorText, setFlavor] = useState(initial.flavorText)
  const [status, setStatus] = useState<'machine' | 'official'>(initial.status)
  const [adventure, setAdventure] = useState(initial.adventure)
  const [match, setMatch] = useState(initial.match)

  // Only `name` needs validation, so RHF owns just that field; the free-text
  // fields stay in local state. Single form → <Controller> binds cleanly.
  const form = useForm<{ name: string }>({
    resolver: zodResolver(makeLocalizationSchema((k) => tv(k))),
    defaultValues: { name: initial.name },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  const name = form.watch('name')

  const dirty =
    name !== initial.name ||
    text !== initial.text ||
    flavorText !== initial.flavorText ||
    status !== initial.status ||
    JSON.stringify(adventure) !== JSON.stringify(initial.adventure) ||
    JSON.stringify(match) !== JSON.stringify(initial.match)

  // Persist just this localization; validate name first so an embedding parent
  // (CardEditForm) gets { ok:false, error:'invalid' } without a network call.
  async function save(): Promise<SaveResult> {
    const valid = await form.trigger('name')
    if (!valid) return { ok: false, error: 'invalid' }
    return updateLocalization({
      cardId, lang, name: form.getValues('name'), text, flavorText, status,
      ...(kind === 'adventure' ? { adventure } : {}),
      ...(kind === 'match' ? { match } : {}),
    })
  }

  useImperativeHandle(ref, () => ({ save }))

  async function onSubmit() {
    if (embedded) return
    const res = await save()
    if (!res.ok) return // the inline FormMessage already shows the name error
    if (res.warning) toast.warning(t('reindexWarning'))
    else toast.success(t('saved'))
    router.refresh()
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {kind === null && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t('text')}</span>
            <AutoTextarea
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('flavor')}</span>
          <AutoTextarea
            value={flavorText}
            onChange={(e) => setFlavor(e.target.value)}
          />
        </label>
        {kind === 'adventure' && (
          <fieldset className="space-y-3 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">{t('adventure')}</legend>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('effect')}</span>
              <AutoTextarea
                aria-label={t('effect')}
                value={adventure.effect}
                onChange={(e) => setAdventure({ ...adventure, effect: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('toSolve')}</span>
              <AutoTextarea
                aria-label={t('toSolve')}
                value={adventure.toSolve}
                onChange={(e) => setAdventure({ ...adventure, toSolve: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('reward')}</span>
              <AutoTextarea
                aria-label={t('reward')}
                value={adventure.reward}
                onChange={(e) => setAdventure({ ...adventure, reward: e.target.value })}
              />
            </label>
          </fieldset>
        )}
        {kind === 'match' && (
          <fieldset className="space-y-3 rounded-md border p-4">
            <legend className="px-1 text-sm font-medium">{t('match')}</legend>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('prize')}</span>
              <AutoTextarea
                aria-label={t('prize')}
                value={match.prize}
                onChange={(e) => setMatch({ ...match, prize: e.target.value })}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">{t('toWin')}</span>
              <AutoTextarea
                aria-label={t('toWin')}
                value={match.toWin}
                onChange={(e) => setMatch({ ...match, toWin: e.target.value })}
              />
            </label>
          </fieldset>
        )}
        <div className="space-y-1">
          <span className="text-sm font-medium">{t('status')}</span>
          <Select value={status} onValueChange={(v) => setStatus(v as 'machine' | 'official')}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="machine">{t('statusMachine')}</SelectItem>
              <SelectItem value="official">{t('statusOfficial')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!embedded && (
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={form.formState.isSubmitting || !dirty}>{t('save')}</Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={`/card/${cardId}`}>{t('cancel')}</Link>
            </Button>
          </div>
        )}
      </form>
    </Form>
  )
}
