import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  BarChart2,
  BookMarked,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  HelpCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trophy,
  Volume2,
  XCircle,
  Zap,
} from 'lucide-react'
import type { LevelCard, OxfordWord } from './data/types.ts'
import { useOxfordWords } from './hooks/useOxfordWords.ts'

type Screen = 'SETUP' | 'GAME' | 'RESULT' | 'SRS_REVIEW' | 'FLASHCARD_HUB'
type StudyMode = 'MIXED' | 'SPELLING' | 'DEFINITION' | 'POS' | 'EXAMPLE'
type QuestionType = Exclude<StudyMode, 'MIXED'>
type ReviewScope = 'ALL' | 'MISTAKES'

interface LetterBubble {
  id: string
  char: string
  used: boolean
}

interface UserStats {
  exp: number
  coins: number
  gamesPlayed: number
}

interface SrsEntry {
  addedAt: number
  streak: number
}

const POS_OPTIONS = [
  { label: 'Noun (名詞)', value: 'noun' },
  { label: 'Verb (動詞)', value: 'verb' },
  { label: 'Adjective (形容詞)', value: 'adjective' },
  { label: 'Adverb (副詞)', value: 'adverb' },
] as const

const STUDY_MODES: { id: StudyMode; name: string; desc: string; color: string }[] = [
  { id: 'MIXED', name: '🎲 綜合模式', desc: '隨機切換四大防暴雷題型', color: 'bg-[#FF69B4]' },
  { id: 'SPELLING', name: '🔤 拼字特訓 (Spelling)', desc: '字母亂序泡泡構詞', color: 'bg-[#FFCC00]' },
  { id: 'DEFINITION', name: '💬 字義挑戰 (Definition)', desc: '語意情境題 4 選 1', color: 'bg-[#00A3FF]' },
  { id: 'POS', name: '🏷️ 詞性分類 (Part of Speech)', desc: '分類名 / 動 / 形 / 副詞', color: 'bg-[#FF8A00]' },
  { id: 'EXAMPLE', name: '📝 例句填空 (Sentence Gap)', desc: '上下文空缺填詞', color: 'bg-[#00A3FF]' },
]

const QUESTION_EMOJI: Record<QuestionType, string> = {
  SPELLING: '🔤',
  DEFINITION: '💬',
  POS: '🏷️',
  EXAMPLE: '📝',
}

const DEFAULT_STATS: UserStats = { exp: 120, coins: 45, gamesPlayed: 3 }
const ITEMS_PER_PAGE = 10

function speakText(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-US'
  utterance.rate = 0.85
  window.speechSynthesis.speak(utterance)
}

function shuffleArray<T>(arr: readonly T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const left = copy[i]
    const right = copy[j]
    if (left === undefined || right === undefined) continue
    copy[i] = right
    copy[j] = left
  }
  return copy
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as unknown
  } catch (error) {
    console.error('LocalStorage load error:', error)
    return null
  }
}

function readStats(): UserStats | null {
  const parsed = readStorage('oxford_user_stats_v2')
  if (!isRecord(parsed)) return null
  if (
    typeof parsed.exp !== 'number' ||
    typeof parsed.coins !== 'number' ||
    typeof parsed.gamesPlayed !== 'number'
  ) {
    return null
  }
  return { exp: parsed.exp, coins: parsed.coins, gamesPlayed: parsed.gamesPlayed }
}

function readSrs(): Record<string, SrsEntry> {
  const parsed = readStorage('oxford_srs_data_v2')
  if (!isRecord(parsed)) return {}
  const next: Record<string, SrsEntry> = {}
  for (const [id, value] of Object.entries(parsed)) {
    if (!isRecord(value) || typeof value.addedAt !== 'number') continue
    next[id] = {
      addedAt: value.addedAt,
      streak: typeof value.streak === 'number' ? value.streak : 0,
    }
  }
  return next
}

function readMastered(): Record<string, boolean> {
  const parsed = readStorage('oxford_mastered_words_v1')
  if (!isRecord(parsed)) return {}
  const next: Record<string, boolean> = {}
  for (const [id, value] of Object.entries(parsed)) {
    if (typeof value === 'boolean') next[id] = value
  }
  return next
}

function toggleLevel(current: readonly string[], id: string): string[] {
  if (current.includes(id)) {
    if (current.length === 1) return [...current]
    return current.filter(level => level !== id)
  }
  return [...current, id]
}

function posLabel(value: string): string {
  return POS_OPTIONS.find(option => option.value === value)?.label ?? value
}

function BookMascot({ className = '' }: { className?: string }) {
  return (
    <div className={`relative shrink-0 ${className}`} aria-hidden="true">
      <div className="flex h-24 w-24 items-center justify-center rounded-[1.7rem] border-4 border-[#001A80] bg-white text-5xl shadow-[4px_4px_0px_0px_#001A80]">
        📖
      </div>
      <span className="absolute -right-3 -top-3 text-4xl">🎧</span>
    </div>
  )
}

function LevelCards({
  levels,
  selected,
  onToggle,
  tone,
}: {
  levels: readonly LevelCard[]
  selected: readonly string[]
  onToggle: (id: string) => void
  tone: 'blue' | 'pink'
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {levels.map(level => {
        const active = selected.includes(level.id)
        const activeClass =
          tone === 'pink'
            ? 'border-[#001A80] bg-[#FF69B4] text-white shadow-[4px_4px_0px_0px_#001A80] -translate-y-0.5'
            : 'border-[#001A80] bg-[#00A3FF] text-[#001A80] shadow-[4px_4px_0px_0px_#001A80] -translate-y-0.5'
        return (
          <button
            key={level.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(level.id)}
            className={`rounded-3xl border-3 px-2 py-3 text-center font-black transition-all ${
              active ? activeClass : 'border-slate-300 bg-slate-100 text-slate-400 hover:bg-slate-200'
            }`}
          >
            <div className="text-xl leading-none">{level.emoji}</div>
            <div className="mt-1 text-sm">{level.label}</div>
            <div className="text-[10px] font-bold opacity-80">{level.count} 字</div>
          </button>
        )
      })}
    </div>
  )
}

export default function App() {
  const {
    words,
    levels,
    total,
    wordsForLevels,
    distractorsFor,
    blankedExample,
    matchesQuizPos,
    primaryQuizPos,
    spellingLetters,
  } = useOxfordWords()
  const [currentScreen, setCurrentScreen] = useState<Screen>('SETUP')

  const [selectedLevels, setSelectedLevels] = useState<string[]>(['A1'])
  const [selectedMode, setSelectedMode] = useState<StudyMode>('MIXED')
  const [questionCount, setQuestionCount] = useState(10)

  const [reviewLevels, setReviewLevels] = useState<string[]>(['A1'])
  const [reviewScope, setReviewScope] = useState<ReviewScope>('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({})
  const [masteredWords, setMasteredWords] = useState<Record<string, boolean>>(() => readMastered())

  const [sessionQuestions, setSessionQuestions] = useState<OxfordWord[]>([])
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [maxStreak, setMaxStreak] = useState(0)
  const [wrongAnswers, setWrongAnswers] = useState<OxfordWord[]>([])

  const [questionType, setQuestionType] = useState<QuestionType | ''>('')
  const [scrambledLetters, setScrambledLetters] = useState<LetterBubble[]>([])
  const [selectedLetterBubbles, setSelectedLetterBubbles] = useState<LetterBubble[]>([])
  const [showPhoneticHint, setShowPhoneticHint] = useState(false)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [options, setOptions] = useState<string[]>([])

  const [userStats, setUserStats] = useState<UserStats>(() => readStats() ?? DEFAULT_STATS)
  const [srsItems, setSrsItems] = useState<Record<string, SrsEntry>>(() => readSrs())

  const updateStats = (expGained: number, coinsGained: number) => {
    setUserStats(prev => {
      const updated = {
        ...prev,
        exp: prev.exp + expGained,
        coins: prev.coins + coinsGained,
        gamesPlayed: prev.gamesPlayed + 1,
      }
      localStorage.setItem('oxford_user_stats_v2', JSON.stringify(updated))
      return updated
    })
  }

  const addWordToSrs = (wordId: string) => {
    setSrsItems(prev => {
      const updated = { ...prev, [wordId]: { addedAt: Date.now(), streak: 0 } }
      localStorage.setItem('oxford_srs_data_v2', JSON.stringify(updated))
      return updated
    })
  }

  const removeWordFromSrs = (wordId: string) => {
    setSrsItems(prev => {
      const updated = { ...prev }
      delete updated[wordId]
      localStorage.setItem('oxford_srs_data_v2', JSON.stringify(updated))
      return updated
    })
  }

  const toggleMastery = (wordId: string) => {
    setMasteredWords(prev => {
      const updated = { ...prev, [wordId]: !prev[wordId] }
      localStorage.setItem('oxford_mastered_words_v1', JSON.stringify(updated))
      return updated
    })
  }

  const toggleCardFlip = (wordId: string) => {
    setFlippedCards(prev => ({ ...prev, [wordId]: !prev[wordId] }))
  }

  const filteredReviewWords = useMemo(() => {
    return wordsForLevels(reviewLevels).filter(item => {
      if (reviewScope === 'MISTAKES') return !!srsItems[item.id]
      return true
    })
  }, [wordsForLevels, reviewLevels, reviewScope, srsItems])

  const totalPages = Math.max(1, Math.ceil(filteredReviewWords.length / ITEMS_PER_PAGE))
  const matchedPages =
    filteredReviewWords.length === 0 ? 0 : Math.ceil(filteredReviewWords.length / ITEMS_PER_PAGE)
  const paginatedReviewWords = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredReviewWords.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredReviewWords, currentPage])

  const selectedPool = useMemo(
    () => wordsForLevels(selectedLevels),
    [wordsForLevels, selectedLevels],
  )

  const srsReviewList = useMemo(
    () => words.filter(item => srsItems[item.id]),
    [words, srsItems],
  )

  const masteredCount = useMemo(
    () => words.filter(word => masteredWords[word.id]).length,
    [words, masteredWords],
  )

  const prepareAntiSpoilerQuestion = (index: number, questionsList: readonly OxfordWord[] = sessionQuestions) => {
    const target = questionsList[index]
    if (!target) return

    setSelectedLetterBubbles([])
    setSelectedOption(null)
    setIsAnswered(false)
    setIsCorrect(false)
    setShowPhoneticHint(false)

    const mixedModes: QuestionType[] = ['SPELLING', 'DEFINITION', 'POS', 'EXAMPLE']
    let activeMode: QuestionType =
      selectedMode === 'MIXED'
        ? (mixedModes[Math.floor(Math.random() * mixedModes.length)] ?? 'DEFINITION')
        : selectedMode

    if (activeMode === 'SPELLING' && !spellingLetters(target.word)) activeMode = 'DEFINITION'
    if (activeMode === 'POS' && !primaryQuizPos(target.partOfSpeech)) activeMode = 'DEFINITION'
    if (activeMode === 'EXAMPLE' && !blankedExample(target)) activeMode = 'DEFINITION'
    setQuestionType(activeMode)

    if (activeMode === 'SPELLING') {
      const chars = spellingLetters(target.word) ?? target.word.toLowerCase().split('')
      setScrambledLetters(
        shuffleArray(chars).map((char, i) => ({
          id: `bubble_${i}_${char}_${Math.random().toString(36).substring(2, 7)}`,
          char,
          used: false,
        })),
      )
      setOptions([])
    } else if (activeMode === 'DEFINITION' || activeMode === 'EXAMPLE') {
      setOptions(shuffleArray([...distractorsFor(target.id, 3), target.word]))
    } else {
      setOptions(POS_OPTIONS.map(option => option.value))
    }
  }

  const handleStartGame = (customQuestions: readonly OxfordWord[] | null = null) => {
    let pool = customQuestions ? [...customQuestions] : [...selectedPool]
    if (selectedMode === 'SPELLING') {
      const spellable = pool.filter(item => spellingLetters(item.word))
      if (spellable.length > 0) pool = spellable
    } else if (selectedMode === 'POS') {
      const tagged = pool.filter(item => primaryQuizPos(item.partOfSpeech))
      if (tagged.length > 0) pool = tagged
    } else if (selectedMode === 'EXAMPLE') {
      const withGap = pool.filter(item => blankedExample(item))
      if (withGap.length > 0) pool = withGap
    }

    if (pool.length === 0) {
      alert('這個範圍目前沒有單字，請再選擇其他級別！')
      return
    }

    const shuffled = shuffleArray(pool)
    const count = Math.min(questionCount, shuffled.length)
    const selected = shuffled.slice(0, count)

    setSessionQuestions(selected)
    setCurrentQuestionIdx(0)
    setScore(0)
    setStreak(0)
    setMaxStreak(0)
    setWrongAnswers([])
    setCurrentScreen('GAME')
    prepareAntiSpoilerQuestion(0, selected)
  }

  const handleBubbleClick = (bubble: LetterBubble) => {
    if (isAnswered) return
    if (bubble.used) {
      setScrambledLetters(prev => prev.map(item => (item.id === bubble.id ? { ...item, used: false } : item)))
      setSelectedLetterBubbles(prev => prev.filter(item => item.id !== bubble.id))
    } else {
      setScrambledLetters(prev => prev.map(item => (item.id === bubble.id ? { ...item, used: true } : item)))
      setSelectedLetterBubbles(prev => [...prev, bubble])
    }
  }

  const handleResetSpellingBubbles = () => {
    if (isAnswered) return
    setScrambledLetters(prev => prev.map(item => ({ ...item, used: false })))
    setSelectedLetterBubbles([])
  }

  const markAnswer = (target: OxfordWord, correct: boolean) => {
    setIsAnswered(true)
    setIsCorrect(correct)
    speakText(target.word)
    if (correct) {
      const bonus = 100 + streak * 15
      setScore(prev => prev + bonus)
      setStreak(prev => {
        const next = prev + 1
        if (next > maxStreak) setMaxStreak(next)
        return next
      })
    } else {
      setStreak(0)
      setWrongAnswers(prev => [...prev, target])
      addWordToSrs(target.id)
    }
  }

  const verifySpellingAnswer = () => {
    const target = sessionQuestions[currentQuestionIdx]
    if (!target) return
    const userSpelling = selectedLetterBubbles.map(bubble => bubble.char).join('')
    const expected = (spellingLetters(target.word) ?? target.word.toLowerCase().split('')).join('')
    markAnswer(target, userSpelling.toLowerCase() === expected)
  }

  const handleMCQAnswer = (optionVal: string) => {
    if (isAnswered) return
    const target = sessionQuestions[currentQuestionIdx]
    if (!target) return
    let correct = false
    if (questionType === 'DEFINITION' || questionType === 'EXAMPLE') {
      correct = optionVal.toLowerCase() === target.word.toLowerCase()
    } else if (questionType === 'POS') {
      correct = matchesQuizPos(target.partOfSpeech, optionVal)
    }
    setSelectedOption(optionVal)
    markAnswer(target, correct)
  }

  const handleNextQuestion = () => {
    if (currentQuestionIdx + 1 < sessionQuestions.length) {
      const nextIdx = currentQuestionIdx + 1
      setCurrentQuestionIdx(nextIdx)
      prepareAntiSpoilerQuestion(nextIdx)
    } else {
      const expEarned = score + maxStreak * 25
      const coinsEarned = Math.floor(score / 8)
      updateStats(expEarned, coinsEarned)
      setCurrentScreen('RESULT')
    }
  }

  const currentQuestion = sessionQuestions[currentQuestionIdx]
  const accuracy =
    sessionQuestions.length === 0
      ? 0
      : Math.round(((sessionQuestions.length - wrongAnswers.length) / sessionQuestions.length) * 100)
  const allLevelIds = levels.map(level => level.id)
  const allReviewSelected = allLevelIds.every(id => reviewLevels.includes(id))
  const reviewQuizCount = Math.min(questionCount, filteredReviewWords.length)

  return (
    <div className="adventure-bg flex min-h-screen flex-col justify-between p-3 font-sans text-white selection:bg-[#FFCC00] selection:text-[#001A80] md:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-grow flex-col space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-full border-4 border-[#001A80] bg-white p-3.5 shadow-[6px_6px_0px_0px_#001A80] md:p-4">
          <div className="flex cursor-pointer items-center gap-2 md:gap-3" onClick={() => setCurrentScreen('SETUP')}>
            <div className="flex -rotate-6 items-center gap-2 rounded-full border-3 border-[#001A80] bg-[#FFCC00] p-2.5 shadow-[2px_2px_0px_0px_#001A80]">
              <BookOpen className="h-5 w-5 text-[#001A80] md:h-6 md:w-6" />
              <span className="pr-1 text-sm font-black tracking-wider text-[#001A80] md:text-base">OXFORD 3000</span>
              <span aria-hidden="true">🎧</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setCurrentScreen('FLASHCARD_HUB')}
              className="flex items-center gap-1.5 rounded-full border-3 border-[#001A80] bg-[#FF69B4] px-4 py-2 text-xs font-black text-white shadow-[3px_3px_0px_0px_#001A80] transition-transform hover:bg-[#ff52a3] active:translate-y-0.5"
            >
              <BookMarked className="h-4 w-4 text-white" />
              <span>📚</span>
              <span className="hidden sm:inline">生字卡片</span>
            </button>
            <div className="flex items-center gap-1.5 rounded-full border-3 border-[#001A80] bg-[#00A3FF] px-3.5 py-2 text-xs font-black text-[#001A80] shadow-[3px_3px_0px_0px_#001A80]">
              <Sparkles className="h-4 w-4 fill-[#001A80]" />
              <span>✨ {userStats.exp} XP</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border-3 border-[#001A80] bg-[#FF8A00] px-3.5 py-2 text-xs font-black text-white shadow-[3px_3px_0px_0px_#001A80]">
              <Trophy className="h-4 w-4 text-white" />
              <span>🪙 {userStats.coins}</span>
            </div>
          </div>
        </header>

        {currentScreen === 'SETUP' && (
          <div className="space-y-6">
            <div className="rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[8px_8px_0px_0px_#001A80] md:p-8">
              <div className="flex flex-col items-start gap-5 md:flex-row md:items-center">
                <BookMascot />
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-1 rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-3 py-1 text-xs font-black tracking-wider text-[#001A80]">
                    📖 OXFORD 3000
                  </div>
                  <h1 className="text-4xl font-black leading-tight text-[#001A80] md:text-5xl">字彙大冒險</h1>
                  <p className="max-w-xl text-sm font-extrabold text-[#001A80]">
                    ✨ 結合亂序字母泡泡、語意聯想與音標線索，玩轉英文核心詞彙！
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-black text-[#001A80]">
                    <span className="rounded-full border-2 border-[#001A80] bg-[#00A3FF] px-3 py-1">
                      ✨ {userStats.exp} XP
                    </span>
                    <span className="rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-3 py-1">
                      📖 {total} 字
                    </span>
                    <span className="rounded-full border-2 border-[#001A80] bg-[#FF69B4] px-3 py-1 text-white">
                      🗺️ {userStats.gamesPlayed} 次冒險
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl border-4 border-[#001A80] bg-[#FFCC00] p-4 text-center text-[#001A80] shadow-[5px_5px_0px_0px_#001A80]">
                <div className="text-2xl">📚</div>
                <div className="text-2xl font-black">{total}</div>
                <div className="text-[11px] font-black">示範字庫</div>
              </div>
              <div className="rounded-3xl border-4 border-[#001A80] bg-[#00A3FF] p-4 text-center text-[#001A80] shadow-[5px_5px_0px_0px_#001A80]">
                <div className="text-2xl">✅</div>
                <div className="text-2xl font-black">{masteredCount}</div>
                <div className="text-[11px] font-black">已掌握</div>
              </div>
              <div className="rounded-3xl border-4 border-[#001A80] bg-[#FF69B4] p-4 text-center text-white shadow-[5px_5px_0px_0px_#001A80]">
                <div className="text-2xl">📒</div>
                <div className="text-2xl font-black">{srsReviewList.length}</div>
                <div className="text-[11px] font-black">錯題本</div>
              </div>
            </div>

            <div className="space-y-6 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[8px_8px_0px_0px_#001A80] md:p-8">
              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#001A80]">
                  <BarChart2 className="h-5 w-5 text-[#0047FF]" /> 1. CEFR 級別與快速難度模式
                </label>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedLevels(allLevelIds)}
                    className="rounded-full border-2 border-[#001A80] bg-[#FF69B4] px-3.5 py-1.5 text-xs font-black text-white shadow-[2px_2px_0px_0px_#001A80] transition-all hover:bg-[#ff52a3] active:translate-y-0.5"
                  >
                    ⚡ 快速記憶：全選 (A1 – C1-C2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLevels(['A1', 'A2'])}
                    className="rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-3.5 py-1.5 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] transition-all hover:bg-amber-300 active:translate-y-0.5"
                  >
                    🌱 基礎入門難度 (A1 + A2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLevels(['B1', 'B2', 'C1-C2'])}
                    className="rounded-full border-2 border-[#001A80] bg-[#00A3FF] px-3.5 py-1.5 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] transition-all hover:bg-sky-400 active:translate-y-0.5"
                  >
                    🔥 進階挑戰難度 (B1 – C1-C2)
                  </button>
                </div>
                <LevelCards
                  levels={levels}
                  selected={selectedLevels}
                  tone="blue"
                  onToggle={id => setSelectedLevels(current => toggleLevel(current, id))}
                />
                <p className="mt-3 text-xs font-black text-[#0047FF]">
                  🎯 已選範圍 {selectedPool.length} 個單字
                </p>
              </div>

              <div>
                <label className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wide text-[#001A80]">
                  <Zap className="h-5 w-5 text-[#FF8A00]" /> 2. 學習目標模式
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {STUDY_MODES.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSelectedMode(mode.id)}
                      className={`rounded-3xl border-3 p-4 text-left transition-all ${
                        selectedMode === mode.id
                          ? `${mode.color} -translate-y-0.5 border-[#001A80] text-[#001A80] shadow-[4px_4px_0px_0px_#001A80]`
                          : 'border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      <div className="mb-1 text-sm font-black">{mode.name}</div>
                      <div className="text-xs font-bold opacity-80">{mode.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-3 flex items-center justify-between text-sm font-black uppercase tracking-wide text-[#001A80]">
                  <span>3. 單局題數</span>
                  <span className="text-[#0047FF]">{questionCount} 題</span>
                </label>
                <div className="flex gap-3">
                  {[5, 10, 15, 20].map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setQuestionCount(count)}
                      className={`flex-1 rounded-full border-3 py-3 text-xs font-black transition-all ${
                        questionCount === count
                          ? 'border-[#001A80] bg-[#FFCC00] text-[#001A80] shadow-[3px_3px_0px_0px_#001A80]'
                          : 'border-slate-300 bg-slate-100 text-slate-400'
                      }`}
                    >
                      {count} 題
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleStartGame()}
                disabled={selectedPool.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-full border-4 border-[#001A80] bg-[#FFCC00] py-4 text-lg font-black uppercase tracking-wide text-[#001A80] shadow-[6px_6px_0px_0px_#001A80] transition-transform hover:bg-amber-300 active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Play className="h-6 w-6 fill-[#001A80]" /> 開始冒險 Let's Play
              </button>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCurrentScreen('FLASHCARD_HUB')}
                  className="flex items-center justify-center gap-2 rounded-full border-3 border-[#001A80] bg-[#FF69B4] px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0px_0px_#001A80] transition-transform active:translate-y-0.5"
                >
                  <BookMarked className="h-5 w-5" />
                  <span>
                    📚 生字重溫
                    <span className="mt-0.5 block text-[10px] font-bold opacity-80">Review Hub</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentScreen('SRS_REVIEW')}
                  className="flex items-center justify-center gap-2 rounded-full border-3 border-[#001A80] bg-[#FF8A00] px-4 py-3 text-sm font-black text-white shadow-[4px_4px_0px_0px_#001A80] transition-transform active:translate-y-0.5"
                >
                  <Brain className="h-5 w-5" />
                  <span>
                    🧠 智慧複習
                    <span className="mt-0.5 block text-[10px] font-bold opacity-90">
                      Review Arena{srsReviewList.length > 0 ? ` · ${srsReviewList.length}` : ''}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {currentScreen === 'FLASHCARD_HUB' && (
          <div className="space-y-6">
            <div className="space-y-4 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[6px_6px_0px_0px_#001A80]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrentScreen('SETUP')}
                    className="flex items-center gap-1 rounded-full border-3 border-[#001A80] bg-[#FFCC00] px-3 py-2 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80]"
                  >
                    <ArrowLeft className="h-5 w-5" /> 主選單
                  </button>
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-black text-[#001A80]">
                      <BookMarked className="h-6 w-6 text-[#FF69B4]" /> 📚 生字重溫
                    </h2>
                    <p className="text-xs font-bold text-slate-500">雙面翻轉卡，每頁 10 個單字，點一下就能聽發音</p>
                  </div>
                </div>
                <div className="rounded-full border-3 border-[#001A80] bg-[#00A3FF] px-3 py-1.5 text-xs font-black text-[#001A80]">
                  共 {filteredReviewWords.length} 個單字
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 border-t-2 border-slate-200 pt-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-[#001A80]">🎯 選擇級別</span>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewLevels(allLevelIds)
                        setCurrentPage(1)
                      }}
                      className={`rounded-full border-2 px-3 py-1 text-xs font-black ${
                        allReviewSelected
                          ? 'border-[#001A80] bg-[#FFCC00] text-[#001A80] shadow-[2px_2px_0px_0px_#001A80]'
                          : 'border-slate-300 bg-slate-100 text-slate-500'
                      }`}
                    >
                      ✨ 全選
                    </button>
                  </div>
                  <LevelCards
                    levels={levels}
                    selected={reviewLevels}
                    tone="pink"
                    onToggle={id => {
                      setReviewLevels(current => toggleLevel(current, id))
                      setCurrentPage(1)
                    }}
                  />
                </div>

                <div>
                  <span className="mb-2 block text-xs font-black uppercase text-[#001A80]">重溫範圍</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReviewScope('ALL')
                        setCurrentPage(1)
                      }}
                      className={`flex-1 rounded-full border-2 px-3 py-2 text-xs font-black transition-all ${
                        reviewScope === 'ALL'
                          ? 'border-[#001A80] bg-[#FFCC00] text-[#001A80] shadow-[2px_2px_0px_0px_#001A80]'
                          : 'border-slate-300 bg-slate-100 text-slate-400'
                      }`}
                    >
                      📖 全部字庫重溫
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewScope('MISTAKES')
                        setCurrentPage(1)
                      }}
                      className={`flex-1 rounded-full border-2 px-3 py-2 text-xs font-black transition-all ${
                        reviewScope === 'MISTAKES'
                          ? 'border-[#001A80] bg-[#FF8A00] text-white shadow-[2px_2px_0px_0px_#001A80]'
                          : 'border-slate-300 bg-slate-100 text-slate-400'
                      }`}
                    >
                      🧠 智能錯題本 ({srsReviewList.length})
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-3xl border-3 border-[#001A80] bg-[#FFCC00]/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-black text-[#001A80]">
                    🎯 符合 {filteredReviewWords.length} 個單字 · {matchedPages} 頁
                    {reviewQuizCount > 0 ? ` · 本局 ${reviewQuizCount} 題` : ''}
                  </p>
                  <button
                    type="button"
                    disabled={filteredReviewWords.length === 0}
                    onClick={() => handleStartGame(filteredReviewWords)}
                    className="rounded-full border-3 border-[#001A80] bg-[#FFCC00] px-5 py-2.5 text-sm font-black text-[#001A80] shadow-[3px_3px_0px_0px_#001A80] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ▶️ 開始重溫
                  </button>
                </div>
              </div>
            </div>

            {filteredReviewWords.length === 0 ? (
              <div className="space-y-3 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-12 text-center shadow-[8px_8px_0px_0px_#001A80]">
                <div className="text-4xl">🔍</div>
                <HelpCircle className="mx-auto h-12 w-12 text-[#0047FF]" />
                <h3 className="text-lg font-black text-[#001A80]">沒有找到任何單字</h3>
                <p className="text-xs font-bold text-slate-500">請嘗試勾選更多 CEFR 級別，或切換為全部字庫重溫</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {paginatedReviewWords.map(item => {
                  const isFlipped = !!flippedCards[item.id]
                  const isMastered = !!masteredWords[item.id]
                  return (
                    <div key={item.id} className="[perspective:900px]">
                      <div
                        key={isFlipped ? `${item.id}-back` : `${item.id}-front`}
                        className={`card-swap flex min-h-[230px] flex-col justify-between rounded-[2rem] border-4 border-[#001A80] p-5 shadow-[6px_6px_0px_0px_#001A80] ${
                          isFlipped ? 'bg-[#FFCC00]/35' : isMastered ? 'bg-[#00A3FF]/15' : 'bg-white'
                        }`}
                      >
                        {!isFlipped ? (
                        <div className="flex flex-1 flex-col justify-between">
                          <div>
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="break-words text-2xl font-black tracking-wide text-[#001A80]">
                                  {item.word}
                                </span>
                                <span className="rounded-full border border-[#001A80] bg-[#FF69B4] px-2.5 py-0.5 text-[10px] font-black uppercase text-white">
                                  {item.partOfSpeech}
                                </span>
                                <span className="rounded-full border border-[#001A80] bg-[#FFCC00] px-2.5 py-0.5 text-[10px] font-black text-[#001A80]">
                                  {item.cefr}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation()
                                    speakText(item.word)
                                  }}
                                  className="rounded-full border-2 border-[#001A80] bg-[#FFCC00] p-2 font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] active:translate-y-0.5"
                                >
                                  <Volume2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={event => {
                                    event.stopPropagation()
                                    toggleMastery(item.id)
                                  }}
                                  aria-pressed={isMastered}
                                  title={isMastered ? '取消熟練' : '標記熟練'}
                                  className={`rounded-full border-2 border-[#001A80] p-2 font-black shadow-[2px_2px_0px_0px_#001A80] active:translate-y-0.5 ${
                                    isMastered
                                      ? 'bg-[#00A3FF] text-[#001A80]'
                                      : 'bg-slate-100 text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <div
                              onClick={() => toggleCardFlip(item.id)}
                              className="flex min-h-[85px] cursor-pointer flex-col items-center justify-center space-y-1 rounded-2xl border-3 border-[#001A80] bg-slate-50 p-4 text-center transition-all hover:bg-slate-100"
                            >
                              <span className="flex items-center justify-center gap-1 text-xs font-black text-[#0047FF]">
                                <Eye className="h-4 w-4" /> 點擊翻轉卡片查看詳細
                              </span>
                              <span className="block font-mono text-[11px] text-slate-400">{item.phonetic}</span>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-slate-400">
                            <span>{isMastered ? '✅ 已標記熟練' : '📘 未完結學習'}</span>
                            <button
                              type="button"
                              onClick={() => toggleCardFlip(item.id)}
                              className="flex items-center gap-1 font-black text-[#FF69B4]"
                            >
                              <RefreshCw className="h-3 w-3" /> 查看詳細
                            </button>
                          </div>
                        </div>
                        ) : (
                        <div className="flex flex-1 flex-col justify-between">
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-black text-[#FF8A00]">中文釋義：</span>
                                <span className="ml-1 text-base font-black text-[#001A80]">{item.definitionZh}</span>
                              </div>
                              <span className="shrink-0 font-mono text-xs font-bold text-slate-500">
                                ({item.phonetic})
                              </span>
                            </div>
                            <div className="rounded-xl border border-[#001A80]/30 bg-white/70 p-2.5">
                              <p className="text-xs font-extrabold text-[#0047FF]">"{item.exampleEn}"</p>
                              <p className="mt-0.5 text-[11px] font-bold text-slate-600">{item.exampleZh}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-3 text-[11px] font-bold text-slate-500">
                            <button
                              type="button"
                              onClick={() => speakText(item.exampleEn)}
                              className="flex items-center gap-1 rounded-full border border-[#001A80] bg-white px-2.5 py-1 font-black text-[#0047FF] shadow-[1px_1px_0px_0px_#001A80]"
                            >
                              <Volume2 className="h-3 w-3" /> 🔊 例句發音
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCardFlip(item.id)}
                              className="flex items-center gap-1 rounded-full border border-[#001A80] bg-white px-2.5 py-1 font-black text-[#FF69B4] shadow-[1px_1px_0px_0px_#001A80]"
                            >
                              <RefreshCw className="h-3 w-3" /> 翻回正面
                            </button>
                          </div>
                        </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {filteredReviewWords.length > 0 && (
              <div className="flex items-center justify-between rounded-full border-4 border-[#001A80] bg-white p-4 shadow-[6px_6px_0px_0px_#001A80]">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  className="flex items-center gap-1 rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-4 py-2 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" /> 上一頁
                </button>
                <div className="text-xs font-black text-[#001A80]">
                  📄 頁次 {currentPage} / {totalPages}
                </div>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  className="flex items-center gap-1 rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-4 py-2 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] disabled:opacity-40"
                >
                  下一頁 <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {currentScreen === 'GAME' && currentQuestion && (
          <div className="space-y-6">
            <div className="flex items-center justify-between rounded-full border-4 border-[#001A80] bg-white p-4 shadow-[6px_6px_0px_0px_#001A80]">
              <button
                type="button"
                onClick={() => setCurrentScreen('SETUP')}
                className="rounded-full border-2 border-[#001A80] bg-[#FFCC00] p-2 text-[#001A80]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="mx-4 flex-1">
                <div className="mb-1 flex justify-between text-xs font-black text-[#001A80]">
                  <span>
                    🎯 Question {currentQuestionIdx + 1} / {sessionQuestions.length}
                  </span>
                  <span>🌟 Score: {score}</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[#001A80] bg-slate-200">
                  <div
                    className="h-full bg-[#00A3FF] transition-all duration-300"
                    style={{ width: `${((currentQuestionIdx + 1) / sessionQuestions.length) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1 rounded-full border-2 border-[#001A80] bg-[#FF8A00] px-3 py-1 text-xs font-black text-white shadow-[2px_2px_0px_0px_#001A80]">
                <Flame className="h-4 w-4 fill-white" />
                <span>🔥 {streak}x</span>
              </div>
            </div>

            <div className="space-y-6 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[8px_8px_0px_0px_#001A80] md:p-8">
              <div className="flex items-center justify-between border-b-2 border-slate-100 pb-4">
                <span className="rounded-full border-2 border-[#001A80] bg-[#FF69B4] px-3 py-1 text-xs font-black uppercase text-white">
                  {questionType ? `${QUESTION_EMOJI[questionType]} ${questionType} MODE` : 'MODE'}
                </span>
                <button
                  type="button"
                  onClick={() => speakText(currentQuestion.word)}
                  className="flex items-center gap-1.5 rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-3.5 py-1.5 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] hover:bg-amber-300"
                >
                  <Volume2 className="h-4 w-4" /> 🔊 點擊發音
                </button>
              </div>

              {questionType === 'SPELLING' && (
                <div className="space-y-6 text-center">
                  <div>
                    <h3 className="mb-1 text-2xl font-black leading-snug text-[#001A80]">
                      {currentQuestion.definitionZh}
                    </h3>
                    <p className="text-xs font-black uppercase text-[#0047FF]">[{currentQuestion.partOfSpeech}]</p>
                  </div>
                  <div>
                    {showPhoneticHint ? (
                      <span className="font-mono text-sm font-black text-[#FF8A00]">{currentQuestion.phonetic}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowPhoneticHint(true)}
                        className="mx-auto flex items-center justify-center gap-1 text-xs font-black text-[#00A3FF] underline"
                      >
                        <HelpCircle className="h-3.5 w-3.5" /> 顯示音標提示
                      </button>
                    )}
                  </div>
                  <div className="flex min-h-[56px] flex-wrap justify-center gap-2 rounded-3xl border-3 border-[#001A80] bg-slate-50 p-3">
                    {selectedLetterBubbles.map((bubble, idx) => (
                      <button
                        key={`selected_${bubble.id}_${idx}`}
                        type="button"
                        onClick={() => handleBubbleClick(bubble)}
                        className="h-11 w-11 rounded-2xl border-3 border-[#001A80] bg-[#00A3FF] text-xl font-black text-[#001A80] shadow-[3px_3px_0px_0px_#001A80]"
                      >
                        {bubble.char}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {scrambledLetters.map(bubble => (
                      <button
                        key={`pool_${bubble.id}`}
                        type="button"
                        disabled={bubble.used || isAnswered}
                        onClick={() => handleBubbleClick(bubble)}
                        className={`h-11 w-11 rounded-2xl border-3 text-xl font-black transition-all ${
                          bubble.used
                            ? 'border-slate-300 bg-slate-100 text-slate-300 opacity-40'
                            : 'border-[#001A80] bg-[#FFCC00] text-[#001A80] shadow-[3px_3px_0px_0px_#001A80] hover:-translate-y-0.5'
                        }`}
                      >
                        {bubble.char}
                      </button>
                    ))}
                  </div>
                  {!isAnswered && (
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleResetSpellingBubbles}
                        className="rounded-full border-3 border-[#001A80] bg-slate-200 px-5 py-3 text-sm font-black text-[#001A80] shadow-[3px_3px_0px_0px_#001A80] hover:bg-slate-300"
                      >
                        🔁 還原重置
                      </button>
                      <button
                        type="button"
                        disabled={selectedLetterBubbles.length === 0}
                        onClick={verifySpellingAnswer}
                        className="flex-1 rounded-full border-3 border-[#001A80] bg-[#00A3FF] py-3 text-sm font-black text-[#001A80] shadow-[4px_4px_0px_0px_#001A80] hover:bg-sky-400 disabled:opacity-50"
                      >
                        ✅ 送出答案
                      </button>
                    </div>
                  )}
                </div>
              )}

              {(questionType === 'DEFINITION' || questionType === 'EXAMPLE' || questionType === 'POS') && (
                <div className="space-y-6">
                  <div className="space-y-2 text-center">
                    {questionType === 'DEFINITION' && (
                      <h3 className="text-2xl font-black leading-snug text-[#001A80]">{currentQuestion.definitionZh}</h3>
                    )}
                    {questionType === 'EXAMPLE' && (
                      <p className="text-lg font-black leading-relaxed text-[#001A80]">
                        "{blankedExample(currentQuestion) ?? currentQuestion.exampleEn}"
                      </p>
                    )}
                    {questionType === 'POS' && (
                      <h3 className="text-3xl font-black text-[#0047FF]">{currentQuestion.word}</h3>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {options.map((opt, i) => {
                      let btnStyle = 'border-slate-300 bg-slate-50 text-[#001A80] hover:bg-slate-100'
                      if (isAnswered) {
                        const isTarget =
                          questionType === 'POS'
                            ? matchesQuizPos(currentQuestion.partOfSpeech, opt)
                            : opt.toLowerCase() === currentQuestion.word.toLowerCase()
                        if (isTarget) {
                          btnStyle = 'border-[#001A80] bg-[#00A3FF] text-[#001A80] shadow-[3px_3px_0px_0px_#001A80]'
                        } else if (selectedOption === opt) {
                          btnStyle = 'border-[#001A80] bg-[#FF69B4] text-white shadow-[3px_3px_0px_0px_#001A80]'
                        }
                      }
                      return (
                        <button
                          key={`${opt}-${i}`}
                          type="button"
                          disabled={isAnswered}
                          onClick={() => handleMCQAnswer(opt)}
                          className={`rounded-2xl border-3 p-4 text-left text-sm font-black transition-all ${btnStyle}`}
                        >
                          {questionType === 'POS' ? posLabel(opt) : opt}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {isAnswered && (
                <div
                  className={`flex items-center justify-between rounded-3xl border-3 p-4 ${
                    isCorrect
                      ? 'border-[#00A3FF] bg-[#00A3FF]/20 text-[#001A80]'
                      : 'border-[#FF69B4] bg-[#FF69B4]/20 text-[#001A80]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-black">
                      {isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-[#00A3FF]" />
                      ) : (
                        <XCircle className="h-5 w-5 text-[#FF69B4]" />
                      )}
                      {isCorrect ? '🎉 回答正確！' : `正確答案為: ${currentQuestion.word}`}
                    </div>
                    <p className="mt-1 text-xs font-bold opacity-90">
                      [{currentQuestion.partOfSpeech}] {currentQuestion.definitionZh}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-4 py-2 text-xs font-black text-[#001A80] shadow-[2px_2px_0px_0px_#001A80] hover:bg-amber-300"
                  >
                    下一題 ➡️
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {currentScreen === 'RESULT' && (
          <div className="space-y-6">
            <div className="space-y-4 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-8 text-center shadow-[8px_8px_0px_0px_#001A80]">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#001A80] bg-[#FFCC00] shadow-[4px_4px_0px_0px_#001A80]">
                <Trophy className="h-10 w-10 text-[#001A80]" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-[#001A80]">🎉 挑戰完成！成績結算</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">恭喜完成本次防暴雷訓練關卡</p>
              </div>
              <div className="mx-auto grid max-w-md grid-cols-3 gap-3 pt-2">
                <div className="rounded-2xl border-3 border-[#001A80] bg-[#00A3FF]/20 p-3">
                  <div className="text-xs font-black text-[#001A80]">🌟 獲得總分</div>
                  <div className="text-2xl font-black text-[#0047FF]">{score}</div>
                </div>
                <div className="rounded-2xl border-3 border-[#001A80] bg-[#FFCC00]/30 p-3">
                  <div className="text-xs font-black text-[#001A80]">🔥 最高連擊</div>
                  <div className="text-2xl font-black text-[#FF8A00]">{maxStreak}x</div>
                </div>
                <div className="rounded-2xl border-3 border-[#001A80] bg-[#FF69B4]/20 p-3">
                  <div className="text-xs font-black text-[#001A80]">🎯 正確率</div>
                  <div className="text-2xl font-black text-[#FF69B4]">{accuracy}%</div>
                </div>
              </div>
            </div>

            {wrongAnswers.length > 0 && (
              <div className="space-y-3 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[6px_6px_0px_0px_#001A80]">
                <h3 className="flex items-center gap-2 text-sm font-black text-[#FF8A00]">
                  <ShieldAlert className="h-5 w-5" /> 📒 本局錯題 (已存入智慧 SRS 複習本)
                </h3>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-2">
                  {wrongAnswers.map(word => (
                    <div
                      key={word.id}
                      className="flex items-center justify-between rounded-2xl border-2 border-[#001A80] bg-slate-50 p-3"
                    >
                      <div>
                        <span className="mr-2 text-sm font-black text-[#001A80]">{word.word}</span>
                        <span className="text-xs font-bold text-slate-500">
                          [{word.partOfSpeech}] {word.definitionZh}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => speakText(word.word)}
                        className="rounded-full bg-[#FFCC00] p-1.5 text-[#001A80]"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setCurrentScreen('SETUP')}
                className="flex-1 rounded-full border-3 border-[#001A80] bg-white py-4 text-sm font-black text-[#001A80] shadow-[4px_4px_0px_0px_#001A80]"
              >
                🏠 返回大廳
              </button>
              <button
                type="button"
                onClick={() => handleStartGame()}
                className="flex-1 rounded-full border-3 border-[#001A80] bg-[#FFCC00] py-4 text-sm font-black text-[#001A80] shadow-[4px_4px_0px_0px_#001A80]"
              >
                🔁 再玩一次
              </button>
            </div>
          </div>
        )}

        {currentScreen === 'SRS_REVIEW' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[6px_6px_0px_0px_#001A80]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentScreen('SETUP')}
                  className="flex items-center gap-1 rounded-full border-2 border-[#001A80] bg-[#FFCC00] px-3 py-2 text-xs font-black text-[#001A80]"
                >
                  <ArrowLeft className="h-5 w-5" /> 主選單
                </button>
                <div>
                  <h2 className="text-xl font-black text-[#001A80]">🧠 智慧複習</h2>
                  <p className="text-xs font-bold text-slate-500">Review Arena · 自動安排遺忘曲線補強訓練</p>
                </div>
              </div>
              {srsReviewList.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleStartGame(srsReviewList)}
                  className="rounded-full border-3 border-[#001A80] bg-[#00A3FF] px-5 py-2.5 text-xs font-black text-[#001A80] shadow-[3px_3px_0px_0px_#001A80]"
                >
                  ▶️ 開始錯題特訓
                </button>
              )}
            </div>

            <div className="space-y-4 rounded-[2.5rem] border-4 border-[#001A80] bg-white p-6 shadow-[8px_8px_0px_0px_#001A80]">
              {srsReviewList.length === 0 ? (
                <div className="space-y-2 py-12 text-center">
                  <div className="text-4xl">🎉</div>
                  <CheckCircle2 className="mx-auto h-12 w-12 text-[#00A3FF]" />
                  <h3 className="text-lg font-black text-[#001A80]">太棒了！目前沒有錯題記錄</h3>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {srsReviewList.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[#001A80] bg-slate-50 p-4"
                    >
                      <div>
                        <div className="text-base font-black text-[#001A80]">
                          {item.word} <span className="font-mono text-xs text-slate-400">{item.phonetic}</span>
                        </div>
                        <div className="text-xs font-bold text-slate-500">
                          [{item.partOfSpeech}] {item.definitionZh}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => speakText(item.word)}
                          className="rounded-full bg-[#FFCC00] p-2 text-[#001A80]"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeWordFromSrs(item.id)}
                          className="rounded-full bg-[#00A3FF] p-2 text-[#001A80]"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="py-4 text-center text-xs font-black text-white/80">
        📖 字彙大冒險 · OXFORD 3000
      </footer>
    </div>
  )
}
