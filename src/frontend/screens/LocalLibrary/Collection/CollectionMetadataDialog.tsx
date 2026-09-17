import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameInfo } from 'common/types'
import type {
  CollectionGameMetadata,
  CollectionMetadataPreview,
  MetadataField,
  MetadataSourceId
} from 'common/types/local-library'
import { METADATA_FIELDS } from 'common/types/local-library'
import { CachedImage, SelectField } from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import { MenuItem } from '@mui/material'
import './CollectionMetadataDialog.css'

type Props = {
  game: GameInfo
  title: string
  steamAppId?: string
  metadata?: CollectionGameMetadata
  onChange: (metadata: CollectionGameMetadata) => void
  onClose: () => void
}

type FetchSource = MetadataSourceId | 'auto'
type FieldPick = MetadataSourceId | 'keep'

const FIELD_LABELS: Record<MetadataField, string> = {
  description: 'Description',
  releaseDate: 'Release date',
  developers: 'Developers',
  publishers: 'Publishers',
  genres: 'Genres',
  themes: 'Themes',
  gameModes: 'Game modes',
  platforms: 'Platforms',
  series: 'Series',
  features: 'Features',
  criticScore: 'Score',
  cover: 'Cover',
  hero: 'Background'
}

const SOURCE_LABELS: Record<FetchSource, string> = {
  auto: 'Auto (IGDB first)',
  igdb: 'IGDB',
  steam: 'Steam',
  store: 'Store',
  playnite: 'Playnite',
  lutris: 'Lutris',
  manual: 'Manual'
}

function formatValue(
  metadata: CollectionGameMetadata | undefined,
  field: MetadataField
) {
  if (!metadata) return ''
  if (field === 'description') return metadata.description || ''
  if (field === 'releaseDate') return metadata.releaseDate || ''
  if (field === 'series') return metadata.series || ''
  if (field === 'criticScore') {
    return typeof metadata.criticScore === 'number'
      ? String(metadata.criticScore)
      : ''
  }
  if (field === 'cover') return metadata.coverUrl || ''
  if (field === 'hero') return metadata.heroUrl || ''
  const values = metadata[field]
  return Array.isArray(values) ? values.join(', ') : ''
}

function hasValue(
  metadata: CollectionGameMetadata | undefined,
  field: MetadataField
) {
  return Boolean(formatValue(metadata, field))
}

export default function CollectionMetadataDialog({
  game,
  title,
  steamAppId,
  metadata,
  onChange,
  onClose
}: Props) {
  const { t } = useTranslation()
  const [source, setSource] = useState<FetchSource>('auto')
  const [preview, setPreview] = useState<CollectionMetadataPreview | null>(null)
  const [picks, setPicks] = useState<Partial<Record<MetadataField, FieldPick>>>(
    {}
  )
  const [search, setSearch] = useState(title)
  const [hits, setHits] = useState<
    Array<{ id: string; name: string; year?: number }>
  >([])
  const [igdbId, setIgdbId] = useState<number | undefined>(metadata?.igdbId)
  const [busy, setBusy] = useState<'preview' | 'apply' | 'search' | null>(null)
  const [error, setError] = useState('')

  const runner = game.runner === 'zoom' ? 'sideload' : game.runner

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  async function runPreview(nextIgdbId = igdbId) {
    setBusy('preview')
    setError('')
    try {
      const next = await window.api.localLibrary.previewMetadata({
        appName: game.app_name,
        runner,
        title,
        steamAppId,
        source,
        igdbId: nextIgdbId,
        overwriteExisting: true,
        preserveManual: false
      })
      setPreview(next)
      const nextPicks: Partial<Record<MetadataField, FieldPick>> = {}
      for (const field of METADATA_FIELDS) {
        const chosen = next.proposed.fieldSources[field]
        if (!chosen) continue
        nextPicks[field] = chosen === 'manual' ? 'keep' : chosen
      }
      setPicks(nextPicks)
      if (next.proposed.igdbId) setIgdbId(next.proposed.igdbId)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  async function runSearch() {
    setBusy('search')
    setError('')
    try {
      const next = await window.api.localLibrary.searchMetadata({
        title: search.trim() || title
      })
      setHits(
        next.map((item) => ({ id: item.id, name: item.name, year: item.year }))
      )
      if (!next.length) {
        setError(
          t(
            'collection.metadata.noMatches',
            'No IGDB matches. Check the title or add Twitch API credentials in Collection settings.'
          )
        )
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  async function apply() {
    setBusy('apply')
    setError('')
    try {
      const next = await window.api.localLibrary.applyMetadata({
        appName: game.app_name,
        runner,
        title,
        steamAppId,
        source,
        igdbId,
        fieldPicks: picks,
        overwriteExisting: true,
        preserveManual: false
      })
      onChange(next)
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  const visibleFields = METADATA_FIELDS.filter((field) => {
    if (hasValue(preview?.current ?? metadata, field)) return true
    if (hasValue(preview?.proposed, field)) return true
    for (const candidate of preview?.candidates ?? []) {
      if (hasValue(candidate.metadata, field)) return true
    }
    return false
  })

  return (
    <Dialog
      onClose={onClose}
      showCloseButton
      className="CollectionMetadataDialog"
    >
      <DialogHeader>
        {t('collection.metadata.title', 'Collection metadata')}
      </DialogHeader>
      <DialogContent className="CollectionMetadataDialog__content">
        <p className="CollectionMetadataDialog__help">
          {t(
            'collection.metadata.help',
            'IGDB is tried first, then Steam, the store page, Lutris, and Playnite files. Use this for games that are not on Steam.'
          )}
        </p>
        <p className="CollectionMetadataDialog__game">{title}</p>
        {preview && !preview.igdbConfigured && (
          <p className="CollectionMetadataDialog__warn">
            {t(
              'collection.metadata.igdbMissing',
              'IGDB is not configured. Add a Twitch Client ID and Secret in Collection settings for the richest data.'
            )}
          </p>
        )}

        <div className="CollectionMetadataDialog__row">
          <SelectField
            htmlId="collection-metadata-source"
            label={t('collection.metadata.source', 'Source')}
            value={source}
            disabled={Boolean(busy)}
            onChange={(event) => setSource(event.target.value as FetchSource)}
          >
            {(Object.keys(SOURCE_LABELS) as FetchSource[])
              .filter((item) => item !== 'manual')
              .map((item) => (
                <MenuItem key={item} value={item}>
                  {t(`collection.metadata.source.${item}`, SOURCE_LABELS[item])}
                </MenuItem>
              ))}
          </SelectField>
          <button
            type="button"
            className="button is-primary"
            disabled={Boolean(busy)}
            onClick={() => void runPreview()}
          >
            {busy === 'preview'
              ? t('collection.metadata.fetching', 'Fetching…')
              : t('collection.metadata.fetch', 'Fetch')}
          </button>
        </div>

        <div className="CollectionMetadataDialog__search">
          <input
            value={search}
            disabled={Boolean(busy)}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(
              'collection.metadata.searchPlaceholder',
              'Search IGDB title'
            )}
          />
          <button
            type="button"
            className="button outline"
            disabled={Boolean(busy)}
            onClick={() => void runSearch()}
          >
            {busy === 'search'
              ? t('collection.metadata.searching', 'Searching…')
              : t('collection.metadata.search', 'Find on IGDB')}
          </button>
        </div>
        {hits.length > 0 && (
          <ul className="CollectionMetadataDialog__hits">
            {hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  className={
                    String(igdbId) === hit.id ? 'is-selected' : undefined
                  }
                  onClick={() => {
                    const id = Number(hit.id)
                    setIgdbId(id)
                    void runPreview(id)
                  }}
                >
                  {hit.name}
                  {hit.year ? ` (${hit.year})` : ''}
                </button>
              </li>
            ))}
          </ul>
        )}

        {preview && (
          <div className="CollectionMetadataDialog__compare">
            {visibleFields.map((field) => {
              const options: Array<{
                id: FieldPick
                label: string
                value: string
              }> = [
                {
                  id: 'keep',
                  label: t('collection.metadata.keep', 'Keep current'),
                  value: formatValue(preview.current ?? metadata, field)
                }
              ]
              for (const candidate of preview.candidates) {
                const value = formatValue(candidate.metadata, field)
                if (!value) continue
                options.push({
                  id: candidate.source,
                  label: SOURCE_LABELS[candidate.source],
                  value
                })
              }
              if (options.length <= 1 && !options[0]?.value) return null
              const selectedPick =
                picks[field] || preview.proposed.fieldSources[field] || 'keep'
              const selected =
                selectedPick === 'manual' ? 'keep' : selectedPick
              return (
                <section
                  key={field}
                  className="CollectionMetadataDialog__field"
                >
                  <h4>
                    {t(
                      `collection.metadata.field.${field}`,
                      FIELD_LABELS[field]
                    )}
                  </h4>
                  <div className="CollectionMetadataDialog__choices">
                    {options.map((option) => (
                      <label
                        key={option.id}
                        className={
                          selected === option.id ? 'is-selected' : undefined
                        }
                      >
                        <input
                          type="radio"
                          name={`meta-${field}`}
                          checked={selected === option.id}
                          onChange={() =>
                            setPicks((current) => ({
                              ...current,
                              [field]: option.id
                            }))
                          }
                        />
                        <span>
                          <strong>{option.label}</strong>
                          {field === 'cover' || field === 'hero' ? (
                            option.value &&
                            (option.value.startsWith('http') ||
                              option.value.startsWith('localart:')) ? (
                              <CachedImage src={option.value} alt="" />
                            ) : (
                              <em>
                                {option.value
                                  ? t(
                                      'collection.metadata.localFile',
                                      'Local file'
                                    )
                                  : t('collection.metadata.empty', 'Empty')}
                              </em>
                            )
                          ) : (
                            <em>
                              {option.value ||
                                t('collection.metadata.empty', 'Empty')}
                            </em>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
        {error && <p className="CollectionMetadataDialog__error">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <button
          className="button is-primary"
          disabled={Boolean(busy) || !preview}
          onClick={() => void apply()}
        >
          {busy === 'apply'
            ? t('collection.metadata.applying', 'Saving…')
            : t('collection.metadata.apply', 'Apply')}
        </button>
        <button className="button outline" onClick={onClose}>
          {t('box.close', 'Close')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
