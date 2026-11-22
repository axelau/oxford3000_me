export interface OxfordWord {
  id: string
  word: string
  cefr: string
  partOfSpeech: string
  definitionZh: string
  phonetic: string
  exampleEn: string
  exampleZh: string
}

export interface LevelCard {
  id: string
  label: string
  cefrs: readonly string[]
  emoji: string
  count: number
}

export type QuizPos = 'noun' | 'verb' | 'adjective' | 'adverb'
