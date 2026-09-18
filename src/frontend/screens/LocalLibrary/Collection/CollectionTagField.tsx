import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import Chip from '@mui/material/Chip'
import TextField from '@mui/material/TextField'
import { facetKey } from './collectionFacets'
import './CollectionTagField.css'

type CommonProps = {
  htmlId: string
  label: string
  options: string[]
  placeholder?: string
}

type Props =
  | (CommonProps & {
      multiple: true
      value: string[]
      onChange: (value: string[]) => void
    })
  | (CommonProps & {
      multiple?: false
      value: string
      onChange: (value: string) => void
    })

const filter = createFilterOptions<string>()

function normalizeTag(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueTags(values: string[]) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const raw of values) {
    const value = normalizeTag(raw)
    if (!value) continue
    const key = facetKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(value)
  }
  return next
}

function splitTyped(value: string) {
  return uniqueTags(value.split(/[,;\n]+/))
}

function mergedOptions(options: string[], selected: string[]) {
  const seen = new Set(selected.map((item) => facetKey(item)))
  const next = [...selected]
  for (const option of options) {
    const value = normalizeTag(option)
    if (!value) continue
    const key = facetKey(value)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(value)
  }
  return next
}

function withTypedOption(
  items: string[],
  params: { inputValue: string; getOptionLabel: (option: string) => string }
) {
  const filtered = filter(items, params)
  for (const typed of splitTyped(params.inputValue)) {
    if (!filtered.some((item) => facetKey(item) === facetKey(typed))) {
      filtered.push(typed)
    }
  }
  return filtered
}

export default function CollectionTagField(props: Props) {
  const { t } = useTranslation()
  const placeholder =
    props.placeholder ||
    t('collection.gameConfig.tagPlaceholder', 'Select or type to add')

  if (props.multiple) {
    return (
      <MultiTagField
        htmlId={props.htmlId}
        label={props.label}
        options={props.options}
        value={props.value}
        placeholder={placeholder}
        onChange={props.onChange}
      />
    )
  }

  return (
    <SingleTagField
      htmlId={props.htmlId}
      label={props.label}
      options={props.options}
      value={props.value}
      placeholder={placeholder}
      onChange={props.onChange}
    />
  )
}

function MultiTagField({
  htmlId,
  label,
  options,
  value,
  placeholder,
  onChange
}: CommonProps & {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const selected = uniqueTags(value)
  const merged = useMemo(
    () => mergedOptions(options, selected),
    [options, selected]
  )

  return (
    <label className="CollectionTagField" htmlFor={htmlId}>
      <span>{label}</span>
      <Autocomplete
        multiple
        freeSolo
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        options={merged}
        value={selected}
        filterOptions={(items, params) => withTypedOption(items, params)}
        onChange={(_, next) => {
          onChange(uniqueTags(next.flatMap((item) => splitTyped(String(item)))))
        }}
        renderTags={(tags, getTagProps) =>
          tags.map((option, index) => {
            const { key, ...rest } = getTagProps({ index })
            return (
              <Chip
                {...rest}
                key={key}
                size="small"
                label={option}
                className="CollectionTagField__chip"
              />
            )
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            id={htmlId}
            placeholder={selected.length ? '' : placeholder}
          />
        )}
      />
    </label>
  )
}

function SingleTagField({
  htmlId,
  label,
  options,
  value,
  placeholder,
  onChange
}: CommonProps & {
  value: string
  onChange: (value: string) => void
}) {
  const selected = normalizeTag(value)
  const merged = useMemo(
    () => mergedOptions(options, selected ? [selected] : []),
    [options, selected]
  )

  return (
    <label className="CollectionTagField" htmlFor={htmlId}>
      <span>{label}</span>
      <Autocomplete
        freeSolo
        selectOnFocus
        clearOnBlur
        handleHomeEndKeys
        options={merged}
        value={selected}
        filterOptions={(items, params) => withTypedOption(items, params)}
        onChange={(_, next) => {
          onChange(typeof next === 'string' ? normalizeTag(next) : '')
        }}
        renderInput={(params) => (
          <TextField {...params} id={htmlId} placeholder={placeholder} />
        )}
      />
    </label>
  )
}
