import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, FilterList } from '@mui/icons-material'
import CollectionDropdown from './CollectionDropdown'
import type {
  CollectionFacetFilters,
  CollectionFacetKind,
  CollectionFacetOption
} from './collectionFacets'
import { FACET_KINDS, facetKey } from './collectionFacets'
import './FacetFilterMenu.css'

type Props = {
  filters: CollectionFacetFilters
  options: Record<CollectionFacetKind, CollectionFacetOption[]>
  onChange: (kind: CollectionFacetKind, value: string) => void
  onClear: () => void
}

function FacetFlyout({
  kind,
  label,
  selected,
  options,
  onChange
}: {
  kind: CollectionFacetKind
  label: string
  selected: string | null
  options: CollectionFacetOption[]
  onChange: (kind: CollectionFacetKind, value: string) => void
}) {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [openLeft, setOpenLeft] = useState(false)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((item) => item.value.toLowerCase().includes(needle))
  }, [options, query])

  function show() {
    const rect = wrapRef.current?.getBoundingClientRect()
    setOpenLeft(Boolean(rect && rect.right > window.innerWidth - 320))
    setOpen(true)
  }

  function hide() {
    setOpen(false)
    setQuery('')
  }

  return (
    <div
      ref={wrapRef}
      className="collectionFacetMenu__row"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        className={`collectionFacetMenu__kind${selected ? ' is-active' : ''}${open ? ' is-open' : ''}`}
      >
        <span className="collectionFacetMenu__kindLabel">
          {label}
          {selected ? <em>{selected}</em> : null}
        </span>
        <ChevronRight className="collectionFacetMenu__chevron" />
      </button>
      {open && (
        <div
          className={
            openLeft
              ? 'collectionFacetMenu__flyout collectionFacetMenu__flyout--left'
              : 'collectionFacetMenu__flyout'
          }
        >
          <input
            className="collectionFacetMenu__search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('collection.filter.facets.search', 'Filter list')}
            aria-label={`${label}: ${t('collection.filter.facets.search', 'Filter list')}`}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            className={`collectionFacetMenu__item${selected ? '' : ' is-active'}`}
            onClick={() => {
              if (selected) onChange(kind, selected)
            }}
          >
            {t('collection.filter.facets.all', 'All')}
          </button>
          {visible.length === 0 ? (
            <p className="collectionFacetMenu__empty">
              {t('collection.filter.facets.empty', 'None in this library')}
            </p>
          ) : (
            visible.map((item) => {
              const isSelected =
                Boolean(selected) &&
                facetKey(selected as string) === facetKey(item.value)
              return (
                <button
                  key={`${kind}:${facetKey(item.value)}`}
                  type="button"
                  className={`collectionFacetMenu__item${isSelected ? ' is-active' : ''}`}
                  onClick={() => onChange(kind, item.value)}
                >
                  <span>
                    {isSelected ? (
                      <Check className="collectionFacetMenu__check" />
                    ) : null}
                    {item.value}
                  </span>
                  <em>{item.count}</em>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default function FacetFilterMenu({
  filters,
  options,
  onChange,
  onClear
}: Props) {
  const { t } = useTranslation()
  const active = FACET_KINDS.some((kind) => Boolean(filters[kind]))

  const labels: Record<CollectionFacetKind, string> = {
    series: t('collection.filter.facets.series', 'Series'),
    developer: t('collection.filter.facets.developer', 'Developer'),
    publisher: t('collection.filter.facets.publisher', 'Publisher'),
    genre: t('collection.filter.facets.genre', 'Genre'),
    platform: t('collection.filter.facets.platform', 'Platform')
  }

  const summary = FACET_KINDS.map((kind) => filters[kind])
    .filter(Boolean)
    .join(' · ')

  return (
    <CollectionDropdown
      title={
        <span
          className="collection__toolLabel"
          title={
            summary
              ? `${t('collection.filter.facets.menu', 'Filter')}: ${summary}`
              : t(
                  'collection.filter.facets.menu',
                  'Filter by series, developer, publisher, platform'
                )
          }
        >
          <FilterList />
        </span>
      }
      className="collectionFacetMenu"
      buttonClass={`collection__toolBtn${active ? ' is-active' : ''}`}
      popUpOnHover
    >
      {active && (
        <button
          type="button"
          className="collectionFacetMenu__clear"
          onClick={onClear}
        >
          {t('collection.filter.facets.clear', 'Clear filters')}
        </button>
      )}
      {FACET_KINDS.map((kind) => (
        <FacetFlyout
          key={kind}
          kind={kind}
          label={labels[kind]}
          selected={filters[kind]}
          options={options[kind]}
          onChange={onChange}
        />
      ))}
    </CollectionDropdown>
  )
}
