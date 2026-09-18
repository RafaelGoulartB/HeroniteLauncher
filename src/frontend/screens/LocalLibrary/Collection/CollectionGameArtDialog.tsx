import type { SyntheticEvent } from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tab, Tabs } from '@mui/material'
import type { GameInfo, Runner } from 'common/types'
import type {
  CollectionArtKind,
  CollectionGameArt,
  CollectionGameDetailsPatch,
  CollectionGameMetadata,
  LocalGameMeta
} from 'common/types/local-library'
import { CachedImage, TabPanel, TextInputField } from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import CollectionWebImageDialog from './CollectionWebImageDialog'
import CollectionTagField from './CollectionTagField'
import { EMPTY_TAG_OPTIONS, type CollectionTagKind } from './collectionTags'
import './CollectionGameArtDialog.css'

type Props = {
  game: GameInfo
  title: string
  art?: CollectionGameArt
  metadata?: CollectionGameMetadata
  meta?: LocalGameMeta
  defaultCover: string
  defaultHero?: string
  tagOptions?: Record<CollectionTagKind, string[]>
  onChange: (art: CollectionGameArt) => void
  onDetailsChange: (result: {
    metadata: CollectionGameMetadata
    meta?: LocalGameMeta
  }) => void
  onClose: () => void
}

type ConfigTab = 'images' | 'details'

type DetailsForm = {
  title: string
  description: string
  releaseDate: string
  developers: string[]
  publishers: string[]
  series: string
  genres: string[]
  themes: string[]
  gameModes: string[]
  platforms: string[]
  features: string[]
  criticScore: string
  websites: string
  notes: string
}

const IMAGE_FILTERS = [
  {
    name: 'Images',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']
  },
  { name: 'All', extensions: ['*'] }
]

function joinList(values?: string[]) {
  return values?.join(', ') ?? ''
}

function splitList(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function sameList(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  )
}

function formFrom(
  title: string,
  metadata?: CollectionGameMetadata,
  meta?: LocalGameMeta
): DetailsForm {
  return {
    title: metadata?.title?.trim() || title,
    description: metadata?.description || '',
    releaseDate: metadata?.releaseDate || '',
    developers: [...(metadata?.developers ?? [])],
    publishers: [...(metadata?.publishers ?? [])],
    series: metadata?.series || '',
    genres: [...(metadata?.genres ?? [])],
    themes: [...(metadata?.themes ?? [])],
    gameModes: [...(metadata?.gameModes ?? [])],
    platforms: [...(metadata?.platforms ?? [])],
    features: [...(metadata?.features ?? [])],
    criticScore:
      typeof metadata?.criticScore === 'number'
        ? String(metadata.criticScore)
        : '',
    websites: joinList(metadata?.websites),
    notes: metadata?.notes || meta?.notes || ''
  }
}

function sameForm(left: DetailsForm, right: DetailsForm) {
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.releaseDate === right.releaseDate &&
    left.series === right.series &&
    left.criticScore === right.criticScore &&
    left.websites === right.websites &&
    left.notes === right.notes &&
    sameList(left.developers, right.developers) &&
    sameList(left.publishers, right.publishers) &&
    sameList(left.genres, right.genres) &&
    sameList(left.themes, right.themes) &&
    sameList(left.gameModes, right.gameModes) &&
    sameList(left.platforms, right.platforms) &&
    sameList(left.features, right.features)
  )
}

function parseScore(value: string): number | null | 'invalid' {
  const trimmed = value.trim()
  if (!trimmed) return null
  const next = Number(trimmed)
  if (!Number.isFinite(next)) return 'invalid'
  return Math.round(next)
}

export default function CollectionGameArtDialog({
  game,
  title,
  art,
  metadata,
  meta,
  defaultCover,
  defaultHero,
  tagOptions = EMPTY_TAG_OPTIONS,
  onChange,
  onDetailsChange,
  onClose
}: Props) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ConfigTab>('images')
  const [busy, setBusy] = useState<
    CollectionArtKind | 'clear' | 'details' | null
  >(null)
  const [searchKind, setSearchKind] = useState<CollectionArtKind | null>(null)
  const [error, setError] = useState('')
  const initialForm = useMemo(
    () => formFrom(title, metadata, meta),
    [title, metadata, meta]
  )
  const [form, setForm] = useState<DetailsForm>(initialForm)

  const coverSrc = art?.coverUrl || defaultCover
  const heroSrc = art?.heroUrl || defaultHero
  const runner: Runner = game.runner
  const dirty = !sameForm(form, initialForm)

  function handleTabChange(_event: SyntheticEvent, next: ConfigTab) {
    setActiveTab(next)
  }

  function patchForm<K extends keyof DetailsForm>(
    field: K,
    value: DetailsForm[K]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function pick(kind: CollectionArtKind) {
    const path = await window.api.openDialog({
      buttonLabel: t('box.select.button', 'Select'),
      properties: ['openFile'],
      title: t('box.select.image', 'Select Image'),
      filters: IMAGE_FILTERS
    })
    if (!path) return
    setBusy(kind)
    setError('')
    try {
      const next = await window.api.localLibrary.setGameArt({
        appName: game.app_name,
        runner,
        kind,
        sourcePath: path
      })
      onChange(next)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  async function reset(kind: CollectionArtKind) {
    setBusy(kind)
    setError('')
    try {
      const next = await window.api.localLibrary.clearGameArt({
        appName: game.app_name,
        runner,
        kind
      })
      onChange(next)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  async function saveDetails() {
    const score = parseScore(form.criticScore)
    if (score === 'invalid') {
      setError(
        t(
          'collection.gameConfig.scoreInvalid',
          'Score must be a number, or empty.'
        )
      )
      return
    }
    setBusy('details')
    setError('')
    const updateDetails = window.api.localLibrary.updateGameDetails
    if (typeof updateDetails !== 'function') {
      setBusy(null)
      setError(
        t(
          'collection.gameConfig.restart',
          'Restart Heroic Local to load game details editing.'
        )
      )
      return
    }
    try {
      const patch: CollectionGameDetailsPatch = {
        appName: game.app_name,
        runner: game.runner === 'zoom' ? 'sideload' : game.runner
      }
      if (form.title !== initialForm.title) patch.title = form.title
      if (form.notes !== initialForm.notes) patch.notes = form.notes
      if (form.description !== initialForm.description) {
        patch.description = form.description
      }
      if (form.releaseDate !== initialForm.releaseDate) {
        patch.releaseDate = form.releaseDate
      }
      if (form.series !== initialForm.series) patch.series = form.series
      if (!sameList(form.developers, initialForm.developers)) {
        patch.developers = form.developers
      }
      if (!sameList(form.publishers, initialForm.publishers)) {
        patch.publishers = form.publishers
      }
      if (!sameList(form.genres, initialForm.genres)) {
        patch.genres = form.genres
      }
      if (!sameList(form.themes, initialForm.themes)) {
        patch.themes = form.themes
      }
      if (!sameList(form.gameModes, initialForm.gameModes)) {
        patch.gameModes = form.gameModes
      }
      if (!sameList(form.platforms, initialForm.platforms)) {
        patch.platforms = form.platforms
      }
      if (!sameList(form.features, initialForm.features)) {
        patch.features = form.features
      }
      if (form.websites !== initialForm.websites) {
        patch.websites = splitList(form.websites)
      }
      if (form.criticScore !== initialForm.criticScore) {
        patch.criticScore = score
      }
      const next = await updateDetails(patch)
      onDetailsChange(next)
      setForm(
        formFrom(form.title.trim() || title, next.metadata, next.meta ?? meta)
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Dialog
        onClose={onClose}
        showCloseButton
        className="CollectionGameArtDialog"
      >
        <DialogHeader>
          {t('collection.gameConfig.title', 'Game settings')}
        </DialogHeader>
        <DialogContent className="CollectionGameArtDialog__content">
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            aria-label={t(
              'collection.gameConfig.tabsLabel',
              'Game settings tabs'
            )}
            variant="scrollable"
          >
            <Tab
              label={t('collection.gameConfig.tab.images', 'Images')}
              value="images"
            />
            <Tab
              label={t('collection.gameConfig.tab.details', 'Details')}
              value="details"
            />
          </Tabs>

          <TabPanel value={activeTab} index="images">
            <p className="CollectionGameArtDialog__help">
              {t(
                'collection.gameArt.help',
                'These images are used in Collection. Steam art stays cached; a custom file replaces it until you reset.'
              )}
            </p>
            <p className="CollectionGameArtDialog__game">{title}</p>

            <section className="CollectionGameArtDialog__slot">
              <div className="CollectionGameArtDialog__copy">
                <h4>{t('collection.gameArt.cover', 'Cover')}</h4>
                <p>
                  {art?.coverUrl
                    ? t('collection.gameArt.custom', 'Custom image')
                    : t('collection.gameArt.default', 'Default')}
                </p>
                <div className="CollectionGameArtDialog__actions">
                  <button
                    type="button"
                    className="button outline"
                    disabled={Boolean(busy)}
                    onClick={() => void pick('cover')}
                  >
                    {busy === 'cover'
                      ? t('collection.gameArt.saving', 'Saving…')
                      : t('collection.gameArt.change', 'Change')}
                  </button>
                  <button
                    type="button"
                    className="button outline"
                    disabled={Boolean(busy)}
                    onClick={() => setSearchKind('cover')}
                  >
                    {t('collection.gameArt.searchWeb', 'Search web')}
                  </button>
                  <button
                    type="button"
                    className="button outline"
                    disabled={Boolean(busy) || !art?.coverUrl}
                    onClick={() => void reset('cover')}
                  >
                    {t('collection.gameArt.reset', 'Reset')}
                  </button>
                </div>
              </div>
              <div className="CollectionGameArtDialog__preview CollectionGameArtDialog__preview--cover">
                {coverSrc ? (
                  <CachedImage key={coverSrc} src={coverSrc} alt="" />
                ) : (
                  <span>{t('collection.gameArt.empty', 'No image')}</span>
                )}
              </div>
            </section>

            <section className="CollectionGameArtDialog__slot CollectionGameArtDialog__slot--hero">
              <div className="CollectionGameArtDialog__copy">
                <h4>{t('collection.gameArt.hero', 'Background')}</h4>
                <p>
                  {art?.heroUrl
                    ? t('collection.gameArt.custom', 'Custom image')
                    : t('collection.gameArt.default', 'Default')}
                </p>
                <div className="CollectionGameArtDialog__actions">
                  <button
                    type="button"
                    className="button outline"
                    disabled={Boolean(busy)}
                    onClick={() => void pick('hero')}
                  >
                    {busy === 'hero'
                      ? t('collection.gameArt.saving', 'Saving…')
                      : t('collection.gameArt.change', 'Change')}
                  </button>
                  <button
                    type="button"
                    className="button outline"
                    disabled={Boolean(busy)}
                    onClick={() => setSearchKind('hero')}
                  >
                    {t('collection.gameArt.searchWeb', 'Search web')}
                  </button>
                  <button
                    type="button"
                    className="button outline"
                    disabled={Boolean(busy) || !art?.heroUrl}
                    onClick={() => void reset('hero')}
                  >
                    {t('collection.gameArt.reset', 'Reset')}
                  </button>
                </div>
              </div>
              <div className="CollectionGameArtDialog__preview CollectionGameArtDialog__preview--hero">
                {heroSrc ? (
                  <CachedImage key={heroSrc} src={heroSrc} alt="" />
                ) : (
                  <span>{t('collection.gameArt.empty', 'No image')}</span>
                )}
              </div>
            </section>
          </TabPanel>

          <TabPanel value={activeTab} index="details">
            <p className="CollectionGameArtDialog__help">
              {t(
                'collection.gameConfig.help',
                'These fields stay in Collection. Fetching metadata later will not overwrite values you edit here, unless you choose to overwrite.'
              )}
            </p>
            <p className="CollectionGameArtDialog__meta">
              {t(
                'collection.gameConfig.tagHelp',
                'Pick existing tags or type a new one and press Enter to create it.'
              )}
            </p>

            <div className="CollectionGameArtDialog__form">
              <TextInputField
                htmlId="collection-game-title"
                label={t('collection.gameConfig.name', 'Name')}
                value={form.title}
                onChange={(value) => patchForm('title', value)}
              />
              <label
                className="CollectionGameArtDialog__area"
                htmlFor="collection-game-description"
              >
                <span>
                  {t('collection.metadata.field.description', 'Description')}
                </span>
                <textarea
                  id="collection-game-description"
                  rows={6}
                  value={form.description}
                  onChange={(event) =>
                    patchForm('description', event.target.value)
                  }
                />
              </label>
              <div className="CollectionGameArtDialog__grid">
                <TextInputField
                  htmlId="collection-game-release"
                  label={t(
                    'collection.metadata.field.releaseDate',
                    'Release date'
                  )}
                  value={form.releaseDate}
                  onChange={(value) => patchForm('releaseDate', value)}
                />
                <TextInputField
                  htmlId="collection-game-score"
                  label={t('collection.metadata.field.criticScore', 'Score')}
                  value={form.criticScore}
                  onChange={(value) => patchForm('criticScore', value)}
                />
              </div>
              <div className="CollectionGameArtDialog__tags">
                <CollectionTagField
                  htmlId="collection-game-series"
                  label={t('collection.metadata.field.series', 'Series')}
                  options={tagOptions.series}
                  value={form.series}
                  onChange={(value) => patchForm('series', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-developers"
                  label={t(
                    'collection.metadata.field.developers',
                    'Developers'
                  )}
                  options={tagOptions.developers}
                  value={form.developers}
                  onChange={(value) => patchForm('developers', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-publishers"
                  label={t(
                    'collection.metadata.field.publishers',
                    'Publishers'
                  )}
                  options={tagOptions.publishers}
                  value={form.publishers}
                  onChange={(value) => patchForm('publishers', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-genres"
                  label={t('collection.metadata.field.genres', 'Genres')}
                  options={tagOptions.genres}
                  value={form.genres}
                  onChange={(value) => patchForm('genres', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-themes"
                  label={t('collection.metadata.field.themes', 'Themes')}
                  options={tagOptions.themes}
                  value={form.themes}
                  onChange={(value) => patchForm('themes', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-modes"
                  label={t('collection.metadata.field.gameModes', 'Game modes')}
                  options={tagOptions.gameModes}
                  value={form.gameModes}
                  onChange={(value) => patchForm('gameModes', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-platforms"
                  label={t('collection.metadata.field.platforms', 'Platforms')}
                  options={tagOptions.platforms}
                  value={form.platforms}
                  onChange={(value) => patchForm('platforms', value)}
                />
                <CollectionTagField
                  multiple
                  htmlId="collection-game-features"
                  label={t('collection.metadata.field.features', 'Features')}
                  options={tagOptions.features}
                  value={form.features}
                  onChange={(value) => patchForm('features', value)}
                />
              </div>
              <TextInputField
                htmlId="collection-game-websites"
                label={t('collection.gameConfig.websites', 'Websites')}
                value={form.websites}
                onChange={(value) => patchForm('websites', value)}
              />
              <label
                className="CollectionGameArtDialog__area"
                htmlFor="collection-game-notes"
              >
                <span>{t('collection.focus.notes', 'Notes')}</span>
                <textarea
                  id="collection-game-notes"
                  rows={4}
                  value={form.notes}
                  onChange={(event) => patchForm('notes', event.target.value)}
                />
              </label>
            </div>
          </TabPanel>

          {error && <p className="CollectionGameArtDialog__error">{error}</p>}
        </DialogContent>
        <DialogFooter>
          {activeTab === 'details' && (
            <button
              className="button is-primary"
              disabled={Boolean(busy) || !dirty}
              onClick={() => void saveDetails()}
            >
              {busy === 'details'
                ? t('collection.gameConfig.saving', 'Saving…')
                : t('collection.gameConfig.save', 'Save')}
            </button>
          )}
          <button
            className={
              activeTab === 'details' ? 'button outline' : 'button is-primary'
            }
            onClick={onClose}
          >
            {t('box.close', 'Close')}
          </button>
        </DialogFooter>
      </Dialog>
      {searchKind && (
        <CollectionWebImageDialog
          game={game}
          title={title}
          kind={searchKind}
          onChange={onChange}
          onClose={() => setSearchKind(null)}
        />
      )}
    </>
  )
}
