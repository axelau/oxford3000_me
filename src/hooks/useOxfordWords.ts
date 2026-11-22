import { useCallback, useMemo } from 'react'
import {
  adaptOxfordData,
  blankedExample,
  buildLevelCards,
  matchesQuizPos,
  pickDistractorWords,
  primaryQuizPos,
  spellingLetters,
  wordsForLevelIds,
} from '../data/adaptOxfordData.ts'
import { OXFORD_DATA } from '../data/ox3000_date.ts'

const WORDS = adaptOxfordData(OXFORD_DATA as readonly unknown[])

if (WORDS.length === 0) {
  throw new Error('Oxford dataset loaded with no headwords')
}

/**
 * UI entry point for the word list.
 * ox3000_date.ts is the source of truth; this hook only exposes the adapted catalog.
 */
export function useOxfordWords() {
  const levels = useMemo(() => buildLevelCards(WORDS), [])

  const wordsForLevels = useCallback(
    (levelIds: readonly string[]) => wordsForLevelIds(WORDS, levelIds),
    [],
  )

  const distractorsFor = useCallback(
    (targetId: string, count = 3) => pickDistractorWords(WORDS, targetId, count),
    [],
  )

  return {
    words: WORDS,
    levels,
    total: WORDS.length,
    wordsForLevels,
    distractorsFor,
    blankedExample,
    matchesQuizPos,
    primaryQuizPos,
    spellingLetters,
  }
}
