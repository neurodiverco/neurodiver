import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bookmark, RotateCcw } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { OpenDayVisualDeck } from '@/components/strategies/open-day-visual-deck'
import { StrategyNavigatorHeader } from '@/components/strategies/strategy-navigator-header'
import { useAuth } from '@/context/auth-context'
import { useFeatureConfig } from '@/context/feature-config-context'
import { useStrategies } from '@/context/strategy-context'
import {
  filterStrategiesBySituation,
  getSituationChipLabel,
  SITUATION_CHIPS,
} from '@/data/strategy-navigator-chips'
import type { Strategy } from '@/types/strategy'

const VISIBLE_SITUATIONS = SITUATION_CHIPS.slice(0, 7)

export function StrategiesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { config: featureConfig } = useFeatureConfig()
  const {
    strategies,
    loading,
    error,
    getSaved,
    isSaved,
    toggleSaved,
    trackView,
    trackFeedback,
    clearError,
  } = useStrategies()
  const [filteredStrategies, setFilteredStrategies] = useState<Strategy[] | null>(null)
  const [filterLabel, setFilterLabel] = useState('All illustrated strategies')
  const [savePending, setSavePending] = useState(false)

  const savedStrategies = getSaved()
  const visibleStrategies = filteredStrategies ?? strategies

  useEffect(() => {
    const strategyId = searchParams.get('strategy')
    if (!strategyId || loading) return

    const strategy = strategies.find((item) => item.id === strategyId)
    if (!strategy) return

    setFilteredStrategies([strategy])
    setFilterLabel('Selected strategy')
  }, [loading, searchParams, strategies])

  const selectedSituationId = useMemo(() => {
    const selectedLabel = filterLabel.toLowerCase()
    return VISIBLE_SITUATIONS.find(
      (situation) => situation.label.toLowerCase() === selectedLabel,
    )?.id
  }, [filterLabel])

  const showAll = useCallback(() => {
    setSearchParams({}, { replace: true })
    setFilteredStrategies(null)
    setFilterLabel('All illustrated strategies')
  }, [setSearchParams])

  const handleSituationSelect = useCallback(
    (situationId: string) => {
      setSearchParams({}, { replace: true })
      setFilteredStrategies(filterStrategiesBySituation(strategies, situationId))
      setFilterLabel(getSituationChipLabel(situationId))
    },
    [setSearchParams, strategies],
  )

  const showSaved = useCallback(() => {
    setSearchParams({}, { replace: true })
    setFilteredStrategies(savedStrategies)
    setFilterLabel('Saved strategies')
  }, [savedStrategies, setSearchParams])

  const handleToggleSave = useCallback(
    async (strategyId: string) => {
      if (!user) return
      clearError()
      setSavePending(true)
      try {
        await toggleSaved(strategyId)
      } finally {
        setSavePending(false)
      }
    },
    [clearError, toggleSaved, user],
  )

  if (loading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <p className="text-sm text-text-muted">Loading strategies…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-6">
      {featureConfig.strategies.sections.header !== false ? (
        <>
          <div className="lg:hidden"><StrategyNavigatorHeader /></div>
          <div className="hidden lg:block"><StrategyNavigatorHeader desktop /></div>
        </>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-orange/10 px-4 py-3 text-sm text-orange" role="alert">
          {error}
        </p>
      ) : null}

      {featureConfig.strategies.sections.situations !== false ? (
        <section aria-labelledby="struggling-heading">
          <h2 id="struggling-heading" className="font-display text-xl font-semibold text-text">
            I&apos;m struggling with…
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {VISIBLE_SITUATIONS.map((situation) => {
              const selected = selectedSituationId === situation.id
              return (
                <button
                  key={situation.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => handleSituationSelect(situation.id)}
                  className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green ${
                    selected
                      ? 'border-green bg-green text-white'
                      : 'border-border bg-surface-solid text-text hover:border-green/30 hover:bg-green-muted'
                  }`}
                >
                  {situation.label}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-green">Showing</p>
          <h2 className="mt-1 font-display text-xl font-semibold text-text">{filterLabel}</h2>
          <p className="mt-1 text-sm text-text-muted">
            {visibleStrategies.length} {visibleStrategies.length === 1 ? 'strategy' : 'strategies'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {featureConfig.strategies.sections.saved !== false ? (
            <button
              type="button"
              disabled={savedStrategies.length === 0}
              onClick={showSaved}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface-solid px-4 text-sm font-semibold text-green transition-colors hover:bg-green-muted disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Bookmark className="h-4 w-4" aria-hidden="true" />
              Saved ({savedStrategies.length})
            </button>
          ) : null}
          {filteredStrategies ? (
            <button
              type="button"
              onClick={showAll}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface-solid px-4 text-sm font-semibold text-green transition-colors hover:bg-green-muted"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Show all
            </button>
          ) : null}
        </div>
      </div>

      {visibleStrategies.length > 0 ? (
        <OpenDayVisualDeck
          strategies={visibleStrategies}
          isSaved={isSaved}
          savePending={savePending}
          onToggleSave={user ? (strategyId) => void handleToggleSave(strategyId) : undefined}
          onReveal={(strategy) => void trackView(strategy.id)}
          onFeedback={
            user
              ? (strategyId, feedback, reason) =>
                  void trackFeedback(strategyId, feedback, reason)
              : undefined
          }
        />
      ) : (
        <div className="rounded-2xl border border-border bg-surface-solid px-5 py-12 text-center">
          <p className="text-lg text-text-muted">
            {filterLabel === 'Saved strategies'
              ? 'No illustrated strategies saved yet.'
              : 'No illustrated strategies match this filter yet.'}
          </p>
          <button type="button" className="mt-4 text-sm font-semibold text-green underline" onClick={showAll}>
            Show all strategies
          </button>
        </div>
      )}
    </div>
  )
}
