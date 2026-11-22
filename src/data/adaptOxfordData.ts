import type { LevelCard, OxfordWord, QuizPos } from './types.ts'

const REQUIRED_KEYS = [
  'id',
  'word',
  'cefr',
  'partOfSpeech',
  'definitionZh',
  'phonetic',
  'exampleEn',
  'exampleZh',
] as const

/**
 * Level cards always include the scale the review UI was designed around.
 * Counts come from the dataset. B2 and C1–C2 stay visible at 0 because this
 * extract ends at B1 "effectively" and does not invent the missing headwords.
 */
const LEVEL_DEFS = [
  { id: 'A1', label: 'A1', cefrs: ['A1'], emoji: '🌱' },
  { id: 'A2', label: 'A2', cefrs: ['A2'], emoji: '🌿' },
  { id: 'B1', label: 'B1', cefrs: ['B1'], emoji: '🔥' },
  { id: 'B2', label: 'B2', cefrs: ['B2'], emoji: '⚡' },
  { id: 'C1-C2', label: 'C1-C2', cefrs: ['C1', 'C2'], emoji: '🏆' },
] as const

const QUIZ_POS = new Set<QuizPos>(['noun', 'verb', 'adjective', 'adverb'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(row: Record<string, unknown>, key: string, index: number): string {
  const value = row[key]
  if (typeof value !== 'string') {
    throw new Error(`Oxford entry ${index} is missing a string "${key}"`)
  }
  return value
}

/** Validate the raw dataset and return the word list the UI is allowed to use. */
export function adaptOxfordData(raw: readonly unknown[]): OxfordWord[] {
  const seen = new Set<string>()
  return raw.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Oxford entry ${index} is not an object`)
    }
    for (const key of REQUIRED_KEYS) {
      readString(item, key, index)
    }
    const word: OxfordWord = {
      id: readString(item, 'id', index),
      word: readString(item, 'word', index),
      cefr: readString(item, 'cefr', index),
      partOfSpeech: readString(item, 'partOfSpeech', index),
      definitionZh: readString(item, 'definitionZh', index),
      phonetic: readString(item, 'phonetic', index),
      exampleEn: readString(item, 'exampleEn', index),
      exampleZh: readString(item, 'exampleZh', index),
    }
    if (!word.id.trim() || !word.word.trim()) {
      throw new Error(`Oxford entry ${index} is missing an id or headword`)
    }
    if (seen.has(word.id)) {
      throw new Error(`Duplicate Oxford id ${word.id}`)
    }
    seen.add(word.id)
    return word
  })
}

export function buildLevelCards(words: readonly OxfordWord[]): LevelCard[] {
  const cards: LevelCard[] = LEVEL_DEFS.map(level => ({
    id: level.id,
    label: level.label,
    cefrs: level.cefrs,
    emoji: level.emoji,
    count: words.filter(word => (level.cefrs as readonly string[]).includes(word.cefr)).length,
  }))

  const known = new Set<string>(LEVEL_DEFS.flatMap(level => [...level.cefrs]))
  const extras = [...new Set(words.map(word => word.cefr).filter(cefr => !known.has(cefr)))].sort()
  for (const cefr of extras) {
    cards.push({
      id: cefr,
      label: cefr,
      cefrs: [cefr],
      emoji: '📘',
      count: words.filter(word => word.cefr === cefr).length,
    })
  }
  return cards
}

export function wordsForLevelIds(words: readonly OxfordWord[], levelIds: readonly string[]): OxfordWord[] {
  const cefrs = new Set<string>()
  for (const id of levelIds) {
    const match = LEVEL_DEFS.find(level => level.id === id)
    if (match) {
      match.cefrs.forEach(cefr => cefrs.add(cefr))
    } else {
      cefrs.add(id)
    }
  }
  return words.filter(word => cefrs.has(word.cefr))
}

function partTokens(partOfSpeech: string): string[] {
  return partOfSpeech
    .split(/[,/]/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean)
}

function tokenToQuizPos(token: string): QuizPos | null {
  if (QUIZ_POS.has(token as QuizPos)) return token as QuizPos
  if (token === 'modal verb' || token === 'auxiliary verb') return 'verb'
  return null
}

/** First quiz button that matches this part-of-speech label, if any. */
export function primaryQuizPos(partOfSpeech: string): QuizPos | null {
  for (const token of partTokens(partOfSpeech)) {
    const quizPos = tokenToQuizPos(token)
    if (quizPos) return quizPos
  }
  return null
}

/** True when the chosen button is one of the headword's listed parts of speech. */
export function matchesQuizPos(partOfSpeech: string, option: string): boolean {
  return partTokens(partOfSpeech).some(token => tokenToQuizPos(token) === option)
}

/**
 * Letters for the bubble quiz. Phrases, glosses in parentheses, and
 * single-letter headwords are not spellable and should use another mode.
 */
export function spellingLetters(word: string): string[] | null {
  const core = word
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
  if (!/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(core)) return null
  const letters = core.toLowerCase().replace(/['’-]/g, '').split('')
  if (letters.length < 2) return null
  return letters
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exampleNeedles(word: string): string[] {
  const withoutSuperscript = word.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, '').trim()
  const withoutGloss = withoutSuperscript.replace(/\s*\([^)]*\)/g, '').trim()
  const pieces = withoutGloss
    .split(/[,/]/)
    .map(piece => piece.trim())
    .filter(Boolean)
  return [...new Set([withoutGloss, ...pieces, withoutSuperscript, word.trim()].filter(Boolean))]
    .sort((a, b) => b.length - a.length)
}

const ACCENT: Record<string, string> = {
  a: '[aàáâäãå]',
  e: '[eèéêë]',
  i: '[iìíîï]',
  o: '[oòóôöõ]',
  u: '[uùúûü]',
  c: '[cç]',
  n: '[nñ]',
}

function accentPattern(form: string): string {
  return [...form]
    .map(char => {
      if (char === "'" || char === '’' || char === '‘') return "['’‘]"
      return ACCENT[char.toLowerCase()] ?? escapeRegExp(char)
    })
    .join('')
}

function canInflect(needle: string): boolean {
  if (!/^[a-z]+(?:[ '-][a-z]+)*$/i.test(needle)) return false
  return needle.split(/[ '-]/).every(part => part.length >= 3)
}

function inflect(lower: string): string[] {
  const forms = [
    `${lower}s`,
    `${lower}es`,
    `${lower}ed`,
    `${lower}ing`,
    `${lower}er`,
    `${lower}est`,
    `${lower}ly`,
    `${lower}d`,
  ]
  if (lower.endsWith('y') && lower.length > 2 && !/[aeiou]y$/i.test(lower)) {
    const stem = lower.slice(0, -1)
    forms.push(`${stem}ies`, `${stem}ied`, `${stem}ier`, `${stem}iest`, `${stem}ily`)
  }
  if (lower.endsWith('e') && lower.length > 2) {
    const stem = lower.slice(0, -1)
    forms.push(`${stem}ing`, `${stem}ed`)
  }
  if (/[aeiou][^aeiouy]$/i.test(lower) && lower.length >= 3 && lower.length <= 5) {
    const doubled = lower + lower.slice(-1)
    forms.push(`${doubled}ed`, `${doubled}ing`, `${doubled}er`, `${doubled}est`)
  }
  return forms
}

function deinflect(lower: string): string | null {
  if (lower.length < 5) return null
  if (lower.endsWith('ies')) return lower.slice(0, -3) + 'y'
  if (lower.endsWith('ing')) {
    const stem = lower.slice(0, -3)
    return stem.length >= 3 ? stem : null
  }
  if (lower.endsWith('ied')) return lower.slice(0, -3) + 'y'
  if (lower.endsWith('es')) return lower.slice(0, -2)
  if (lower.endsWith('ed')) return lower.slice(0, -2)
  if (lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1)
  return null
}

function expandedForms(needle: string): string[] {
  const lower = needle.toLowerCase()
  const forms = new Set<string>([lower])
  if (!canInflect(lower)) return [...forms]
  const seeds = new Set<string>([lower])
  const base = deinflect(lower)
  if (base) {
    seeds.add(base)
    seeds.add(`${base}e`)
  }
  for (const seed of seeds) {
    forms.add(seed)
    inflect(seed).forEach(form => forms.add(form))
  }
  return [...forms].sort((a, b) => b.length - a.length)
}

/** Example sentence with the headword blanked out, or null when it cannot be hidden. */
export function blankedExample(word: OxfordWord): string | null {
  const source = word.exampleEn
  if (!source.trim()) return null
  for (const needle of exampleNeedles(word.word)) {
    const forms = expandedForms(needle)
    const pattern = new RegExp(
      `(^|[^A-Za-z])(?:${forms.map(accentPattern).join('|')})(?=[^A-Za-z]|$)`,
      'ig',
    )
    const next = source.replace(pattern, '$1______')
    if (next !== source) return next
  }
  return null
}

export function pickDistractorWords(
  words: readonly OxfordWord[],
  targetId: string,
  count = 3,
): string[] {
  const target = words.find(word => word.id === targetId)
  const banned = new Set<string>()
  if (target) banned.add(target.word.toLowerCase())
  const pool = words.filter(word => word.id !== targetId && !banned.has(word.word.toLowerCase()))
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const left = shuffled[i]
    const right = shuffled[j]
    if (!left || !right) continue
    shuffled[i] = right
    shuffled[j] = left
  }
  const seen = new Set<string>()
  const picked: string[] = []
  for (const item of shuffled) {
    const key = item.word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    picked.push(item.word)
    if (picked.length >= count) break
  }
  return picked
}
