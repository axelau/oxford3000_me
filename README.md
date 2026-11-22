# 字彙大冒險 · Oxford 3000

A playful purple, yellow, and pink quiz for the first 2,000 Oxford 3000 headwords. Practice spelling, meaning, part of speech, and gap-fill examples, then review cards or the mistake book.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Production build

```bash
npm run build
npm run preview
```

`npm run build` typechecks with `tsc -b` and writes a static site to `dist/`.

## How the word list is loaded

The dataset is the source of truth. The screen does not keep its own copy of the words.

| Layer | File | Role |
| --- | --- | --- |
| Source | `src/data/ox3000_date.ts` | Exported `OXFORD_DATA` (2,000 headwords) |
| Types | `src/data/types.ts` | `OxfordWord` and level-card types |
| Adapter | `src/data/adaptOxfordData.ts` | Validates each entry, counts levels, and prepares quiz helpers |
| UI hook | `src/hooks/useOxfordWords.ts` | The only catalog the screens read |
| UI | `src/App.tsx` | Home, review hub, quiz, results, and the mistake arena |

Each item is `{ id, word, cefr, partOfSpeech, definitionZh, phonetic, exampleEn, exampleZh }`. Headwords and CEFR labels follow the Oxford 3000 list; Chinese definitions, phonetics, and examples are credited in the header of `src/data/ox3000_date.ts`.

## Levels

Counts are computed from the file:

- A1, A2, and the start of B1 (through “effectively”) are in the extract.
- B2 and C1–C2 stay on the level cards with a count of 0. This file does not add words for those levels.

Progress (XP, coins, adventures, mastered cards, and the mistake book) is stored in the browser under the same `localStorage` keys as the original screen.

## GitHub Pages

`.github/workflows/pages.yml` builds with `GITHUB_PAGES=true`, so asset paths use `/oxford3000_me/`. After this is merged, Pages can serve https://axelau.github.io/oxford3000_me/ if the repository Pages setting uses **GitHub Actions**. The workflow does not turn Pages on by itself.

Local `npm run dev` and `npm run build` keep the site at `/`.
