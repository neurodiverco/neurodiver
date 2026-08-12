import { FirebaseError } from 'firebase/app'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import type { BrainStatusType } from '@/lib/data'
import { db } from '@/lib/firebase'
import { trackAnalyticsEvent } from '@/lib/product-analytics'
import { DEFAULT_STRATEGY_SEED } from '@/lib/strategy-seed'
import type {
  Strategy,
  StrategyFeedback,
  StrategyFeedbackReason,
  StrategyFilters,
  StrategyUsageRecord,
  UserStrategyState,
} from '@/types/strategy'
import { EMPTY_STRATEGY_STATE } from '@/types/strategy'

const STRATEGIES_COLLECTION = 'strategies'

function getUserRef(userId: string) {
  return doc(db, 'users', userId)
}

function getStrategyRef(strategyId: string) {
  return doc(db, STRATEGIES_COLLECTION, strategyId)
}

function mapStrategyDoc(id: string, data: Record<string, unknown>): Strategy {
  const bestWhen = Array.isArray(data.bestWhen)
    ? (data.bestWhen as Strategy['bestWhen'])
    : []
  const tryThis = Array.isArray(data.tryThis) ? (data.tryThis as string[]) : []
  const recommendedFor = Array.isArray(data.recommendedFor)
    ? (data.recommendedFor as BrainStatusType[])
    : []

  return {
    id,
    title: String(data.title ?? ''),
    category: data.category as Strategy['category'],
    challenge: String(data.challenge ?? ''),
    situation: String(data.situation ?? ''),
    internalThoughts: String(data.internalThoughts ?? ''),
    gentleReminder: String(data.gentleReminder ?? data.description ?? ''),
    whatsHappening: String(data.whatsHappening ?? ''),
    tryThis,
    whyThisHelps: String(data.whyThisHelps ?? ''),
    expectedOutcome: String(data.expectedOutcome ?? ''),
    estimatedTime: String(data.estimatedTime ?? ''),
    timerEnabled: data.timerEnabled === true,
    estimatedMinutes:
      typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : undefined,
    timerOptions: Array.isArray(data.timerOptions)
      ? data.timerOptions.filter((value): value is number => typeof value === 'number')
      : undefined,
    energyRequired: (data.energyRequired as Strategy['energyRequired']) ?? 'Low',
    difficulty: (data.difficulty as Strategy['difficulty']) ?? 'Easy',
    bestWhen,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    relatedStrategies: Array.isArray(data.relatedStrategies)
      ? (data.relatedStrategies as string[])
      : [],
    evidenceLevel:
      (data.evidenceLevel as Strategy['evidenceLevel']) ?? 'Community-informed',
    source: String(data.source ?? ''),
    status: (data.status as Strategy['status']) ?? 'Published',
    order: typeof data.order === 'number' ? data.order : 0,
    isActive: data.isActive !== false,
    description: String(data.description ?? data.gentleReminder ?? ''),
    tip: String(data.tip ?? tryThis[0] ?? ''),
    recommendedFor,
  }
}

function mapUserStrategyState(data: unknown): UserStrategyState {
  if (!data || typeof data !== 'object') {
    return EMPTY_STRATEGY_STATE
  }

  const state = data as Partial<UserStrategyState>

  return {
    savedIds: Array.isArray(state.savedIds) ? state.savedIds : [],
    lastViewedId:
      typeof state.lastViewedId === 'string' ? state.lastViewedId : null,
    usage:
      state.usage && typeof state.usage === 'object'
        ? (state.usage as Record<string, StrategyUsageRecord>)
        : {},
  }
}

function sortStrategies(strategies: Strategy[]): Strategy[] {
  return [...strategies].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title),
  )
}

function seedFallbackStrategies(): Strategy[] {
  return sortStrategies(
    DEFAULT_STRATEGY_SEED.map(({ id, ...rest }) => ({ id, ...rest })),
  )
}

export function getFirestoreStrategyErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === 'permission-denied') {
      return 'Unable to access strategies. Make sure Firestore rules are deployed and you are signed in.'
    }

    if (error.code === 'failed-precondition') {
      return 'Strategies are still setting up. Refresh in a moment, or run npm run deploy:rules to publish Firestore indexes.'
    }

    if (error.code === 'unavailable') {
      return 'Strategies are temporarily unavailable. Check your connection and try again.'
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong while loading strategies.'
}

// ─── Global catalog (strategies collection) ────────────────────────────────

function mapActiveStrategies(
  docs: { id: string; data: () => Record<string, unknown> }[],
): Strategy[] {
  return sortStrategies(
    docs
      .map((entry) => mapStrategyDoc(entry.id, entry.data()))
      .filter((strategy) => strategy.isActive),
  )
}

export async function fetchStrategies(): Promise<Strategy[]> {
  const strategiesQuery = query(
    collection(db, STRATEGIES_COLLECTION),
    orderBy('order', 'asc'),
  )

  const snapshot = await getDocs(strategiesQuery)

  if (snapshot.empty) {
    return seedFallbackStrategies()
  }

  return mapActiveStrategies(snapshot.docs)
}

export function subscribeToStrategies(
  onData: (strategies: Strategy[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const strategiesQuery = query(
    collection(db, STRATEGIES_COLLECTION),
    orderBy('order', 'asc'),
  )

  return onSnapshot(
    strategiesQuery,
    (snapshot) => {
      if (snapshot.empty) {
        onData(seedFallbackStrategies())
        return
      }

      onData(mapActiveStrategies(snapshot.docs))
    },
    (error) => onError?.(error),
  )
}

export function filterStrategies(
  strategies: Strategy[],
  filters: StrategyFilters = {},
): Strategy[] {
  let result = strategies

  if (filters.category) {
    result = result.filter((strategy) => strategy.category === filters.category)
  }

  if (filters.brainStatus) {
    result = result.filter((strategy) =>
      strategy.recommendedFor.includes(filters.brainStatus!),
    )
  }

  if (filters.savedOnly && filters.savedIds) {
    const saved = new Set(filters.savedIds)
    result = result.filter((strategy) => saved.has(strategy.id))
  }

  return result
}

export function getRecommendedStrategies(
  strategies: Strategy[],
  brainStatus: BrainStatusType,
  limit = 3,
): Strategy[] {
  return filterStrategies(strategies, { brainStatus }).slice(0, limit)
}

/**
 * Idempotent seed — writes default strategies if missing.
 * Requires one-time write access to the strategies collection.
 */
export async function seedDefaultStrategies(): Promise<number> {
  const batch = writeBatch(db)
  let written = 0

  for (const entry of DEFAULT_STRATEGY_SEED) {
    const { id, ...payload } = entry
    batch.set(
      getStrategyRef(id),
      {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    written++
  }

  await batch.commit()
  return written
}

// ─── User strategy state (users/{uid}.strategyState) ───────────────────────

export function subscribeToUserStrategyState(
  userId: string,
  onData: (state: UserStrategyState) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    getUserRef(userId),
    (snapshot) => {
      const data = snapshot.data()
      onData(mapUserStrategyState(data?.strategyState))
    },
    (error) => onError?.(error),
  )
}

export async function toggleSavedStrategy(
  userId: string,
  strategyId: string,
): Promise<boolean> {
  const userRef = getUserRef(userId)
  let isSaved = false

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef)
    const current = mapUserStrategyState(snapshot.data()?.strategyState)
    const savedSet = new Set(current.savedIds)

    if (savedSet.has(strategyId)) {
      savedSet.delete(strategyId)
      isSaved = false
    } else {
      savedSet.add(strategyId)
      isSaved = true
    }

    transaction.set(
      userRef,
      {
        strategyState: {
          ...current,
          savedIds: [...savedSet],
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  if (isSaved) {
    void trackAnalyticsEvent(userId, 'saved_strategy', { strategyId })
  }

  return isSaved
}

export async function setLastViewedStrategy(
  userId: string,
  strategyId: string,
): Promise<void> {
  const userRef = getUserRef(userId)

  await setDoc(
    userRef,
    {
      'strategyState.lastViewedId': strategyId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function recordStrategyView(
  userId: string,
  strategyId: string,
): Promise<void> {
  const userRef = getUserRef(userId)
  const now = new Date().toISOString()

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef)
    const current = mapUserStrategyState(snapshot.data()?.strategyState)
    const existing = current.usage[strategyId]

    const updatedRecord: StrategyUsageRecord = {
      timesViewed: (existing?.timesViewed ?? 0) + 1,
      timesMarkedHelpful: existing?.timesMarkedHelpful ?? 0,
      lastViewedAt: now,
      lastMarkedHelpfulAt: existing?.lastMarkedHelpfulAt ?? null,
      lastFeedback: existing?.lastFeedback ?? null,
      lastFeedbackAt: existing?.lastFeedbackAt ?? null,
    }

    transaction.set(
      userRef,
      {
        strategyState: {
          ...current,
          lastViewedId: strategyId,
          usage: {
            ...current.usage,
            [strategyId]: updatedRecord,
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  void trackAnalyticsEvent(userId, 'opened_strategy_card', { strategyId })
}

export async function markStrategyHelpful(
  userId: string,
  strategyId: string,
): Promise<void> {
  const userRef = getUserRef(userId)
  const now = new Date().toISOString()

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef)
    const current = mapUserStrategyState(snapshot.data()?.strategyState)
    const existing = current.usage[strategyId]

    const updatedRecord: StrategyUsageRecord = {
      timesViewed: existing?.timesViewed ?? 0,
      timesMarkedHelpful: (existing?.timesMarkedHelpful ?? 0) + 1,
      lastViewedAt: existing?.lastViewedAt ?? null,
      lastMarkedHelpfulAt: now,
      lastFeedback: 'helped',
      lastFeedbackAt: now,
    }

    transaction.set(
      userRef,
      {
        strategyState: {
          ...current,
          usage: {
            ...current.usage,
            [strategyId]: updatedRecord,
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  void trackAnalyticsEvent(userId, 'submitted_feedback', { strategyId })
}

export async function recordStrategyFeedback(
  userId: string,
  strategyId: string,
  feedback: StrategyFeedback,
  reason?: StrategyFeedbackReason,
): Promise<void> {
  const userRef = getUserRef(userId)
  const now = new Date().toISOString()

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef)
    const current = mapUserStrategyState(snapshot.data()?.strategyState)
    const existing = current.usage[strategyId]

    const updatedRecord: StrategyUsageRecord = {
      timesViewed: existing?.timesViewed ?? 0,
      timesMarkedHelpful:
        feedback === 'helped'
          ? (existing?.timesMarkedHelpful ?? 0) + 1
          : (existing?.timesMarkedHelpful ?? 0),
      lastViewedAt: existing?.lastViewedAt ?? null,
      lastMarkedHelpfulAt:
        feedback === 'helped' ? now : (existing?.lastMarkedHelpfulAt ?? null),
      lastFeedback: feedback,
      lastFeedbackReason: reason ?? null,
      lastFeedbackAt: now,
    }

    transaction.set(
      userRef,
      {
        strategyState: {
          ...current,
          usage: {
            ...current.usage,
            [strategyId]: updatedRecord,
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })

  void trackAnalyticsEvent(userId, 'submitted_feedback', {
    strategyId,
    feedback,
    ...(reason ? { reason } : {}),
  })
}

export function isStrategySaved(
  state: UserStrategyState,
  strategyId: string,
): boolean {
  return state.savedIds.includes(strategyId)
}

export function getStrategyUsage(
  state: UserStrategyState,
  strategyId: string,
): StrategyUsageRecord | null {
  return state.usage[strategyId] ?? null
}
