import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  GalleryHorizontal,
  Grid3X3,
  RotateCcw,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type {
  Strategy,
  StrategyFeedback,
  StrategyFeedbackReason,
} from '@/types/strategy'

interface OpenDayVisualCard {
  strategy: Strategy
  groupId: string
  code: string
  imagePath: string
  optionNumber: number
  optionCount: number
}

interface OpenDayVisualDeckProps {
  strategies: Strategy[]
  isSaved?: (strategyId: string) => boolean
  savePending?: boolean
  onToggleSave?: (strategyId: string) => void
  onReveal?: (strategy: Strategy) => void
  onFeedback?: (
    strategyId: string,
    feedback: StrategyFeedback,
    reason?: StrategyFeedbackReason,
  ) => void
}

const NOT_HELPFUL_REASONS: Array<{
  label: string
  value: StrategyFeedbackReason
}> = [
  { label: 'Too many steps', value: 'too-many-steps' },
  { label: "It didn't fit my situation", value: 'not-my-situation' },
  { label: 'It needed too much energy', value: 'too-much-energy' },
  { label: 'Not right now', value: 'not-right-now' },
]

function getOpenDayVisualCards(strategies: Strategy[]): OpenDayVisualCard[] {
  const groups = new Map<string, Strategy[]>()

  for (const strategy of strategies) {
    if (strategy.category !== 'Executive Function') continue

    const match = strategy.id.match(/^(work-\d+)/)
    if (!match) continue

    const group = groups.get(match[1]) ?? []
    group.push(strategy)
    groups.set(match[1], group)
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      const aNumber = Number(a.match(/\d+/)?.[0] ?? 0)
      const bNumber = Number(b.match(/\d+/)?.[0] ?? 0)
      return aNumber - bNumber
    })
    .flatMap(([groupId, groupStrategies]) => {
      const sorted = [...groupStrategies].sort((a, b) => a.order - b.order)

      return sorted.map((strategy, index) => ({
        strategy,
        groupId,
        code: groupId.toUpperCase(),
        imagePath: `/open-day-v3/${groupId}-a.webp`,
        optionNumber: index + 1,
        optionCount: sorted.length,
      }))
    })
}

export function OpenDayVisualDeck({
  strategies,
  isSaved = () => false,
  savePending = false,
  onToggleSave,
  onReveal,
  onFeedback,
}: OpenDayVisualDeckProps) {
  const cards = useMemo(() => getOpenDayVisualCards(strategies), [strategies])
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Record<string, HTMLElement | null>>({})
  const viewModeRef = useRef<'carousel' | 'grid'>('carousel')
  const lastCarouselIndexRef = useRef(0)
  const restoringCarouselRef = useRef(false)
  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel')
  const [activeIndex, setActiveIndex] = useState(0)
  const [flippedIds, setFlippedIds] = useState<Set<string>>(() => new Set())
  const [feedbackByStrategy, setFeedbackByStrategy] = useState<
    Record<
      string,
      {
        feedback?: StrategyFeedback
        choosingReason?: boolean
        reason?: StrategyFeedbackReason
      }
    >
  >({})

  const setFlipped = (strategyId: string, flipped: boolean) => {
    setFlippedIds((current) => {
      const next = new Set(current)
      if (flipped) next.add(strategyId)
      else next.delete(strategyId)
      return next
    })
  }

  const revealStrategy = (strategy: Strategy) => {
    setFlipped(strategy.id, true)
    onReveal?.(strategy)
  }

  const answerHelped = (strategyId: string) => {
    setFeedbackByStrategy((current) => ({
      ...current,
      [strategyId]: { feedback: 'helped' },
    }))
    onFeedback?.(strategyId, 'helped')
  }

  const answerNotReally = (strategyId: string) => {
    setFeedbackByStrategy((current) => ({
      ...current,
      [strategyId]: { feedback: 'not-helpful', choosingReason: true },
    }))
  }

  const selectReason = (
    strategyId: string,
    reason: StrategyFeedbackReason,
  ) => {
    setFeedbackByStrategy((current) => ({
      ...current,
      [strategyId]: { feedback: 'not-helpful', reason },
    }))
    onFeedback?.(strategyId, 'not-helpful', reason)
  }

  const getCenteredScrollLeft = (
    container: HTMLDivElement,
    target: HTMLElement,
  ) => {
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    return (
      container.scrollLeft +
      targetRect.left -
      containerRect.left -
      (container.clientWidth - target.clientWidth) / 2
    )
  }

  useEffect(() => {
    if (viewMode !== 'carousel') return

    restoringCarouselRef.current = true
    let releaseFrame = 0
    const positionFrame = window.requestAnimationFrame(() => {
      const restoredIndex = lastCarouselIndexRef.current
      const container = carouselRef.current
      const targetCard = cards[restoredIndex]
      const target = targetCard
        ? cardRefs.current[targetCard.strategy.id]
        : null

      if (container && target) {
        container.scrollTo({
          left: getCenteredScrollLeft(container, target),
          behavior: 'auto',
        })
        setActiveIndex(restoredIndex)
      }

      releaseFrame = window.requestAnimationFrame(() => {
        restoringCarouselRef.current = false
      })
    })

    return () => {
      window.cancelAnimationFrame(positionFrame)
      window.cancelAnimationFrame(releaseFrame)
      restoringCarouselRef.current = false
    }
  }, [cards, viewMode])

  const scrollToCard = (cardIndex: number) => {
    const container = carouselRef.current
    const targetCard = cards[cardIndex]
    const target = targetCard
      ? cardRefs.current[targetCard.strategy.id]
      : null
    if (!targetCard || !target) return

    setActiveIndex(cardIndex)
    lastCarouselIndexRef.current = cardIndex

    if (viewMode === 'carousel' && container) {
      container.scrollTo({
        left: getCenteredScrollLeft(container, target),
        behavior: 'smooth',
      })
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleCarouselScroll = () => {
    if (
      viewModeRef.current !== 'carousel' ||
      restoringCarouselRef.current
    ) {
      return
    }

    const container = carouselRef.current
    if (!container) return

    const containerCenter =
      container.getBoundingClientRect().left + container.clientWidth / 2
    let nearestIndex = activeIndex
    let nearestDistance = Number.POSITIVE_INFINITY

    cards.forEach((card, index) => {
      const element = cardRefs.current[card.strategy.id]
      if (!element) return

      const rect = element.getBoundingClientRect()
      const distance = Math.abs(rect.left + rect.width / 2 - containerCenter)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })

    if (nearestIndex !== activeIndex) {
      lastCarouselIndexRef.current = nearestIndex
      setActiveIndex(nearestIndex)
    }
  }

  const changeViewMode = (nextMode: 'carousel' | 'grid') => {
    if (nextMode === 'grid') lastCarouselIndexRef.current = activeIndex
    viewModeRef.current = nextMode
    setViewMode(nextMode)
    if (nextMode === 'carousel') {
      const restoredIndex = lastCarouselIndexRef.current
      setActiveIndex(restoredIndex)
    }
  }

  const showNextOption = (cardIndex: number) => {
    const nextCard = cards[cardIndex + 1]
    if (!nextCard) return

    setFlipped(nextCard.strategy.id, true)
    window.requestAnimationFrame(() => scrollToCard(cardIndex + 1))
  }

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-green">Strategy deck</p>
          <h2 className="mt-1 font-display text-3xl font-semibold text-text">
            Choose the situation that feels familiar
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted sm:text-base">
            Scroll through the deck, then tap a card to reveal one strategy.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface-solid px-4 text-sm font-semibold text-green shadow-sm transition-colors hover:bg-green-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
          onClick={() =>
            changeViewMode(viewMode === 'carousel' ? 'grid' : 'carousel')
          }
        >
          {viewMode === 'carousel' ? (
            <>
              <Grid3X3 className="h-4 w-4" aria-hidden="true" />
              View all
            </>
          ) : (
            <>
              <GalleryHorizontal className="h-4 w-4" aria-hidden="true" />
              Card scroll
            </>
          )}
        </button>
      </div>

      {viewMode === 'carousel' ? (
        <div className="mb-4 flex items-center justify-center gap-3">
          <button
            type="button"
            aria-label="Previous strategy"
            disabled={activeIndex === 0}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-solid text-green shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 hover:bg-green-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
            onClick={() => scrollToCard(Math.max(0, activeIndex - 1))}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <span
            className="min-w-20 text-center text-sm font-semibold text-text-muted"
            aria-live="polite"
          >
            {activeIndex + 1} of {cards.length}
          </span>
          <button
            type="button"
            aria-label="Next strategy"
            disabled={activeIndex === cards.length - 1}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-solid text-green shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 hover:bg-green-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
            onClick={() =>
              scrollToCard(Math.min(cards.length - 1, activeIndex + 1))
            }
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div
        ref={carouselRef}
        onScroll={viewMode === 'carousel' ? handleCarouselScroll : undefined}
        className={
          viewMode === 'carousel'
            ? '-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[9vw] pb-7 pt-3 [scrollbar-width:none] sm:-mx-6 sm:px-[calc(50%-11rem)] [&::-webkit-scrollbar]:hidden'
            : 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
        }
      >
        {cards.map((card, cardIndex) => {
          const { strategy } = card
          const flipped = flippedIds.has(strategy.id)
          const response = feedbackByStrategy[strategy.id]
          const feedbackComplete =
            response?.feedback === 'helped' || Boolean(response?.reason)
          const hasAnotherOption =
            card.optionNumber < card.optionCount &&
            cards[cardIndex + 1]?.groupId === card.groupId

          return (
            <article
              key={strategy.id}
              ref={(element) => {
                cardRefs.current[strategy.id] = element
              }}
              data-strategy-card={strategy.id}
              className={`[perspective:1200px] ${
                viewMode === 'carousel'
                  ? `w-[82vw] max-w-[22rem] shrink-0 snap-center transition-all duration-300 ${
                      activeIndex === cardIndex
                        ? 'z-10 scale-100 opacity-100'
                        : 'scale-[0.9] opacity-45 saturate-50'
                    }`
                  : ''
              }`}
            >
              <div
                className={`relative min-h-[35rem] transition-transform duration-500 [transform-style:preserve-3d] motion-reduce:transition-none ${
                  flipped ? '[transform:rotateY(180deg)]' : ''
                }`}
              >
                <button
                  type="button"
                  aria-label={`Reveal strategy for: ${strategy.situation}`}
                  aria-pressed={flipped}
                  aria-hidden={flipped}
                  tabIndex={flipped ? -1 : 0}
                  onClick={() => revealStrategy(strategy)}
                  className="group absolute inset-0 flex w-full flex-col overflow-hidden rounded-[1.4rem] border border-border bg-surface-solid text-left shadow-[0_10px_30px_rgba(31,42,36,0.08)] transition-shadow [backface-visibility:hidden] hover:border-green/30 hover:shadow-[0_16px_40px_rgba(31,42,36,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2"
                >
                  <div className="flex w-full items-center justify-between gap-3 px-4 pt-4">
                    <span className="text-[0.65rem] font-semibold tracking-[0.12em] text-text-muted">
                      {card.code}
                    </span>
                    <span className="rounded-full bg-green px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-white">
                      {strategy.category}
                    </span>
                  </div>

                  <div className="mx-4 mt-3 overflow-hidden rounded-xl bg-cream">
                    <img
                      src={card.imagePath}
                      alt=""
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <div className="flex flex-1 flex-col px-5 py-5">
                    <p className="font-display text-lg font-semibold italic leading-relaxed text-text">
                      &ldquo;{strategy.situation}&rdquo;
                    </p>

                    <span className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm font-semibold text-green">
                      Flip to reveal
                      <ArrowRight
                        className="h-5 w-5 transition-transform group-hover:translate-x-1"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </button>

                <div
                  aria-hidden={!flipped}
                  inert={!flipped}
                  className="absolute inset-0 flex flex-col overflow-y-auto rounded-[1.4rem] bg-[#07351E] p-5 text-white shadow-[0_14px_36px_rgba(7,53,30,0.22)] [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
                        {card.optionCount > 1
                          ? `Strategy ${card.optionNumber} of ${card.optionCount}`
                          : 'Your strategy'}
                      </p>
                      <p className="mt-1 text-sm text-white/70">{card.code}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {onToggleSave ? (
                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-3 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                          disabled={savePending}
                          onClick={() => onToggleSave(strategy.id)}
                        >
                          <Bookmark
                            className={`h-4 w-4 ${isSaved(strategy.id) ? 'fill-current' : ''}`}
                            aria-hidden="true"
                          />
                          {isSaved(strategy.id) ? 'Saved' : 'Save'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/25 px-3 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        onClick={() => setFlipped(strategy.id, false)}
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Flip back
                      </button>
                    </div>
                  </div>

                  <ol className="mt-6 space-y-4 text-sm leading-relaxed sm:text-base">
                    {strategy.tryThis.map((step, stepIndex) => (
                      <li
                        key={`${strategy.id}-${stepIndex}`}
                        className="flex gap-3"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-green">
                          {stepIndex + 1}
                        </span>
                        <span className="pt-0.5">{step}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="mt-auto border-t border-white/15 pt-5">
                    {!response?.feedback ? (
                      <>
                        <p className="text-base font-semibold">Did this help?</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="min-h-11 rounded-full bg-white text-green shadow-none hover:bg-cream"
                            onClick={() => answerHelped(strategy.id)}
                          >
                            <Check
                              className="mr-2 h-4 w-4"
                              aria-hidden="true"
                            />
                            Yes
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="min-h-11 rounded-full border border-white/35 bg-transparent text-white shadow-none hover:bg-white/10"
                            onClick={() => answerNotReally(strategy.id)}
                          >
                            <X className="mr-2 h-4 w-4" aria-hidden="true" />
                            Not really
                          </Button>
                        </div>
                      </>
                    ) : null}

                    {response?.choosingReason ? (
                      <>
                        <p className="text-sm font-semibold">If not, why?</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {NOT_HELPFUL_REASONS.map((reason) => (
                            <button
                              key={reason.value}
                              type="button"
                              className="rounded-full border border-white/30 bg-white/10 px-3 py-2 text-left text-xs font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                              onClick={() =>
                                selectReason(strategy.id, reason.value)
                              }
                            >
                              {reason.label}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {feedbackComplete ? (
                      <div className="rounded-2xl bg-white/10 p-4">
                        <p className="text-sm font-medium">
                          {response.feedback === 'helped'
                            ? 'Thanks for letting us know.'
                            : 'Thanks. That helps us understand what works for you.'}
                        </p>
                        {hasAnotherOption ? (
                          <button
                            type="button"
                            className="mt-3 inline-flex min-h-10 items-center gap-2 text-left text-sm font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                            onClick={() => showNextOption(cardIndex)}
                          >
                            I have another strategy for this
                            <ArrowRight
                              className="h-4 w-4 shrink-0"
                              aria-hidden="true"
                            />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
