# Night Roulette

A couples party game with a dark rose aesthetic. Players spin a roulette wheel that picks escalating intimate actions across 4 phases (Warm Up → Spicy → No Going Back → Nirvana).

## Run & Operate

- `pnpm --filter @workspace/night-roulette run dev` — run the game
- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, framer-motion
- Fonts: Playfair Display + Cormorant Garamond (Google Fonts)
- State: React Context + useReducer
- Persistence: localStorage (key: `nightroulette_v2`)
- Sound: Web Audio API (no external audio files)

## Where things live

- `artifacts/night-roulette/src/lib/gameState.tsx` — all game logic and state context
- `artifacts/night-roulette/src/lib/audioEngine.ts` — Web Audio sounds
- `artifacts/night-roulette/src/lib/storage.ts` — localStorage save/load
- `artifacts/night-roulette/src/components/` — all UI components
- `artifacts/night-roulette/src/index.css` — theme palette (dark rose) + Google Fonts import

## Architecture decisions

- No backend — all state is client-side localStorage; the app works fully offline
- Game logic lives in a useReducer context, not scattered global variables
- localStorage key is versioned (`nightroulette_v2`) — bump version + add migration when state shape changes
- The `pick<T,>` generic uses a trailing comma to avoid TSX ambiguity with JSX angle brackets

## Product

- 8 roulette items with per-phase weighted probabilities across 4 escalating phases
- Three game modes: Casual, Competitive (Shifumi loser does the action), Turn-based
- Roll/Hot Roll: player picks their action from personal lists (pool depletion removes used items)
- Joker: extra time bonus, reroll option
- Double or Nothing: random chance to multiply roll duration
- Skip system: 1 skip per player per phase (for Roll/Hot Roll/Uno)
- Full settings panel: probabilities, action lists, player names, hidden anti-repetition rules
- Phase transition animations + sound effects

## User preferences

- Preserve the original dark rose design (fonts, colors, animations)

## Gotchas

- Google Fonts `@import url(...)` MUST be the very first line of `index.css` — PostCSS fails silently if it's not
- `pick<T,>` needs the trailing comma in `.tsx` files or Vite treats `<T>` as JSX

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
