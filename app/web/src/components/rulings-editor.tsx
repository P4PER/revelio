'use client'
import { useEffect, useImperativeHandle, useRef } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from '@/../i18n/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { saveRulingsAction, type RulingsSaveResult } from '@/lib/rulings-actions'
import { Button } from '@/components/ui/button'
import { AutoTextarea } from '@/components/ui/auto-textarea'
import { DatePicker } from '@/components/date-picker'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { makeRulingsSchema } from '@/lib/schemas/rulings'

type Row = { id: string | null; date: string; source: string; text: string }
type Initial = { id: string; date: string; source: string; text: string }

export type RulingsEditorHandle = { save: () => Promise<RulingsSaveResult> }

export function RulingsEditor({
  cardId,
  lang,
  initial,
  sources = [],
  embedded = false,
  ref,
}: {
  cardId: string
  lang: string
  initial: Initial[]
  sources?: string[]
  embedded?: boolean
  ref?: React.Ref<RulingsEditorHandle>
}) {
  const t = useTranslations('edit')
  const tv = useTranslations('validation')
  const router = useRouter()
  const form = useForm<{ rows: Row[] }>({
    resolver: zodResolver(makeRulingsSchema((k) => tv(k))),
    defaultValues: {
      rows: initial.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text })),
    },
    mode: 'onSubmit',
    reValidateMode: 'onChange',
  })
  // keyName '_key' so useFieldArray's generated key doesn't clobber our `id` field.
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'rows', keyName: '_key' })
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollPending = useRef(false)

  // After a newly added ruling has rendered, scroll it into view and focus its
  // first field so the editor lands on the new entry.
  useEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    const last = fields[fields.length - 1]
    if (!last) return
    const el = rowRefs.current.get(last._key)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector('input')?.focus()
  }, [fields])

  function addRuling() {
    scrollPending.current = true
    append({ id: null, date: '', source: '', text: '' })
  }

  // Persist the rulings; validate all rows first so an embedding parent
  // (CardEditForm) gets { ok:false, error:'invalid' } when a row is incomplete.
  async function save(): Promise<RulingsSaveResult> {
    const valid = await form.trigger()
    if (!valid) return { ok: false, error: 'invalid' }
    const rows = form.getValues('rows')
    return saveRulingsAction({
      cardId,
      lang,
      rulings: rows.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text })),
    })
  }

  useImperativeHandle(ref, () => ({ save }))

  async function onSave() {
    const res = await save()
    if (!res.ok) return // inline messages already show which fields are missing
    toast.success(t('rulingsSaved'))
    router.refresh()
  }

  return (
    <Form {...form}>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('rulings')}</h2>
          <Button type="button" variant="outline" size="sm" onClick={addRuling}>
            {t('addRuling')}
          </Button>
        </div>

        {fields.map((f, i) => (
          <div
            key={f._key}
            ref={(el) => {
              if (el) rowRefs.current.set(f._key, el)
              else rowRefs.current.delete(f._key)
            }}
            className="space-y-3 rounded-md border p-4"
          >
            <div className="flex items-start justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" aria-label={t('moveUp')} onClick={() => move(i, i - 1)}>
                <ChevronUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" aria-label={t('moveDown')} onClick={() => move(i, i + 1)}>
                <ChevronDown className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" aria-label={t('removeRuling')} onClick={() => remove(i)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex gap-3">
              <FormField
                control={form.control}
                name={`rows.${i}.date` as const}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <span className="text-sm font-medium">{t('rulingDate')}</span>
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      ariaLabel={t('rulingDate')}
                      placeholder={t('rulingDate')}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`rows.${i}.source` as const}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <span className="text-sm font-medium">{t('rulingSource')}</span>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('rulingSource')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sources.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name={`rows.${i}.text` as const}
              render={({ field, fieldState }) => (
                <FormItem>
                  <span className="text-sm font-medium">{t('rulingText')}</span>
                  <AutoTextarea
                    aria-label={t('rulingText')}
                    aria-invalid={!!fieldState.error}
                    value={field.value}
                    onChange={field.onChange}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ))}

        {!embedded && (
          <Button type="button" disabled={form.formState.isSubmitting} onClick={onSave}>
            {t('saveRulings')}
          </Button>
        )}
      </section>
    </Form>
  )
}
