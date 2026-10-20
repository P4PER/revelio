'use client'
import { useImperativeHandle, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
import type { LocalizationValues } from '@/lib/actions/card-edit-actions'
import { Input } from '@/components/ui/input'
import { AutoTextarea } from '@/components/ui/auto-textarea'
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

export type LocalizationFormHandle = {
  validate: (focus: boolean) => Promise<boolean>
  values: () => LocalizationValues
}

export function LocalizationForm({
  initial, kind, ref,
}: {
  initial: Initial
  kind: 'adventure' | 'match' | null
  ref?: React.Ref<LocalizationFormHandle>
}) {
  const t = useTranslations('edit')
  const tv = useTranslations('validation')
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

  // Shows the inline name error as a side effect, so CardEditForm can check
  // every section before it writes any of them. `focus` moves focus to the
  // field when it is invalid.
  function validate(focus: boolean) {
    return form.trigger('name', { shouldFocus: focus })
  }

  // This section's part of the save. CardEditForm writes it together with the
  // rulings in one action, after validating both.
  function values(): LocalizationValues {
    return {
      name: form.getValues('name'), text, flavorText, status,
      ...(kind === 'adventure' ? { adventure } : {}),
      ...(kind === 'match' ? { match } : {}),
    }
  }

  useImperativeHandle(ref, () => ({ validate, values }))

  return (
    <Form {...form}>
      <div className="space-y-4">
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
      </div>
    </Form>
  )
}
