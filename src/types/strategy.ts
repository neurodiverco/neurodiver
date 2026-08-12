import type { BrainStatusType } from '@/lib/data'

export type StrategyCategory =
  | 'Executive Function'
  | 'Emotional Regulation'
  | 'Sensory Management'
  | 'Social & Communication'
  | 'Daily Living'
  | 'Energy & Burnout'

export type BestWhenLabel =
  | 'Running Low'
  | 'Steady'
  | 'High Energy'
  | 'Recovery Needed'

export type EnergyRequired = 'Low' | 'Medium'
export type StrategyDifficulty = 'Easy' | 'Moderate' | 'Advanced'
export type EvidenceLevel =
  | 'Clinical practice'
  | 'Community-informed'
  | 'Research-supported'
export type StrategyStatus = 'Published' | 'Draft'

/** Global strategy catalog document — stored at strategies/{strategyId} */
export interface StrategyDocument {
  title: string
  category: StrategyCategory
  challenge: string
  situation: string
  internalThoughts: string
  gentleReminder: string
  whatsHappening: string
  tryThis: string[]
  whyThisHelps: string
  expectedOutcome: string
  estimatedTime: string
  timerEnabled?: boolean
  estimatedMinutes?: number
  timerOptions?: number[]
  energyRequired: EnergyRequired
  difficulty: StrategyDifficulty
  bestWhen: BestWhenLabel[]
  tags: string[]
  relatedStrategies: string[]
  evidenceLevel: EvidenceLevel
  source: string
  status: StrategyStatus
  order: number
  isActive: boolean
  /** Legacy card fields — derived at seed time for compatibility */
  description: string
  tip: string
  recommendedFor: BrainStatusType[]
}

/** Client-facing strategy with its Firestore document id */
export interface Strategy extends StrategyDocument {
  id: string
}

/** Per-strategy engagement stored on the user document */
export type StrategyFeedback = 'helped' | 'unsure' | 'not-helpful'

export type StrategyFeedbackReason =
  | 'too-many-steps'
  | 'not-my-situation'
  | 'too-much-energy'
  | 'not-right-now'

export interface StrategyUsageRecord {
  timesViewed: number
  timesMarkedHelpful: number
  lastViewedAt: string | null
  lastMarkedHelpfulAt: string | null
  lastFeedback?: StrategyFeedback | null
  lastFeedbackReason?: StrategyFeedbackReason | null
  lastFeedbackAt?: string | null
}

/** Nested under users/{uid}.strategyState */
export interface UserStrategyState {
  savedIds: string[]
  lastViewedId: string | null
  usage: Record<string, StrategyUsageRecord>
}

export const EMPTY_STRATEGY_STATE: UserStrategyState = {
  savedIds: [],
  lastViewedId: null,
  usage: {},
}

export interface StrategyFilters {
  category?: StrategyCategory
  brainStatus?: BrainStatusType
  savedOnly?: boolean
  savedIds?: string[]
}
