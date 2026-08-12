import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { BrainStatusType } from '@/lib/data'
import {
  filterStrategies,
  getFirestoreStrategyErrorMessage,
  getRecommendedStrategies,
  isStrategySaved,
  markStrategyHelpful,
  recordStrategyFeedback,
  recordStrategyView,
  subscribeToUserStrategyState,
  toggleSavedStrategy,
} from '@/lib/strategies'
import type {
  Strategy,
  StrategyCategory,
  StrategyFeedback,
  StrategyFeedbackReason,
  UserStrategyState,
} from '@/types/strategy'
import { EMPTY_STRATEGY_STATE } from '@/types/strategy'
import { useAuth } from '@/context/auth-context'
import { OPEN_DAY_STRATEGIES } from '@/data/open-day-strategies'

const ILLUSTRATED_STRATEGIES = OPEN_DAY_STRATEGIES.filter(
  (strategy) =>
    strategy.category === 'Executive Function' && /^work-\d+(?:-a)?$/.test(strategy.id),
)

interface StrategyContextValue {
  strategies: Strategy[]
  userState: UserStrategyState
  loading: boolean
  error: string | null
  getRecommended: (brainStatus: BrainStatusType, limit?: number) => Strategy[]
  getByCategory: (category: StrategyCategory) => Strategy[]
  getSaved: () => Strategy[]
  isSaved: (strategyId: string) => boolean
  toggleSaved: (strategyId: string) => Promise<boolean>
  trackView: (strategyId: string) => Promise<void>
  trackHelpful: (strategyId: string) => Promise<void>
  trackFeedback: (
    strategyId: string,
    feedback: StrategyFeedback,
    reason?: StrategyFeedbackReason,
  ) => Promise<void>
  clearError: () => void
}

const StrategyContext = createContext<StrategyContextValue | null>(null)

export function StrategyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [strategies] = useState<Strategy[]>(ILLUSTRATED_STRATEGIES)
  const [userState, setUserState] = useState<UserStrategyState>(EMPTY_STRATEGY_STATE)
  const catalogLoading = false
  const [userLoading, setUserLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading || !user) {
      setUserState(EMPTY_STRATEGY_STATE)
      setUserLoading(!authLoading && !user ? false : authLoading)
      return
    }

    setUserLoading(true)

    const unsubscribe = subscribeToUserStrategyState(
      user.uid,
      (state) => {
        setUserState(state)
        setUserLoading(false)
        setError(null)
      },
      (subscriptionError) => {
        setError(getFirestoreStrategyErrorMessage(subscriptionError))
        setUserLoading(false)
      },
    )

    return unsubscribe
  }, [authLoading, user])

  const getRecommended = useCallback(
    (brainStatus: BrainStatusType, limit = 3) => {
      return getRecommendedStrategies(strategies, brainStatus, limit)
    },
    [strategies],
  )

  const getByCategory = useCallback(
    (category: StrategyCategory) => {
      return filterStrategies(strategies, { category })
    },
    [strategies],
  )

  const getSaved = useCallback(() => {
    return filterStrategies(strategies, {
      savedOnly: true,
      savedIds: userState.savedIds,
    })
  }, [strategies, userState.savedIds])

  const isSaved = useCallback(
    (strategyId: string) => isStrategySaved(userState, strategyId),
    [userState],
  )

  const toggleSaved = useCallback(
    async (strategyId: string) => {
      if (!user) {
        throw new Error('You must be signed in to save strategies.')
      }

      setError(null)

      try {
        return await toggleSavedStrategy(user.uid, strategyId)
      } catch (toggleError) {
        const message = getFirestoreStrategyErrorMessage(toggleError)
        setError(message)
        throw toggleError
      }
    },
    [user],
  )

  const trackView = useCallback(
    async (strategyId: string) => {
      if (!user) return

      try {
        await recordStrategyView(user.uid, strategyId)
      } catch (viewError) {
        setError(getFirestoreStrategyErrorMessage(viewError))
      }
    },
    [user],
  )

  const trackHelpful = useCallback(
    async (strategyId: string) => {
      if (!user) {
        throw new Error('You must be signed in to rate strategies.')
      }

      setError(null)

      try {
        await markStrategyHelpful(user.uid, strategyId)
      } catch (helpfulError) {
        const message = getFirestoreStrategyErrorMessage(helpfulError)
        setError(message)
        throw helpfulError
      }
    },
    [user],
  )

  const trackFeedback = useCallback(
    async (
      strategyId: string,
      feedback: StrategyFeedback,
      reason?: StrategyFeedbackReason,
    ) => {
      if (!user) {
        throw new Error('You must be signed in to share feedback.')
      }

      setError(null)

      try {
        await recordStrategyFeedback(user.uid, strategyId, feedback, reason)
      } catch (feedbackError) {
        const message = getFirestoreStrategyErrorMessage(feedbackError)
        setError(message)
        throw feedbackError
      }
    },
    [user],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const value = useMemo<StrategyContextValue>(
    () => ({
      strategies,
      userState,
      loading: authLoading || catalogLoading || userLoading,
      error,
      getRecommended,
      getByCategory,
      getSaved,
      isSaved,
      toggleSaved,
      trackView,
      trackHelpful,
      trackFeedback,
      clearError,
    }),
    [
      strategies,
      userState,
      authLoading,
      catalogLoading,
      userLoading,
      error,
      getRecommended,
      getByCategory,
      getSaved,
      isSaved,
      toggleSaved,
      trackView,
      trackHelpful,
      trackFeedback,
      clearError,
    ],
  )

  return (
    <StrategyContext.Provider value={value}>{children}</StrategyContext.Provider>
  )
}

export function useStrategies() {
  const context = useContext(StrategyContext)
  if (!context) {
    throw new Error('useStrategies must be used within StrategyProvider')
  }
  return context
}

export {
  fetchStrategies,
  filterStrategies,
  getRecommendedStrategies,
  seedDefaultStrategies,
} from '@/lib/strategies'
