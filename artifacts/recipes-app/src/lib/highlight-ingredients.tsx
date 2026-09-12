import { Fragment, type ReactNode } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bolds every occurrence of a recipe's ingredient names within a step's
// instruction text, so a reader scanning a step can immediately spot which
// ingredients it calls for. Matches the longest ingredient names first so
// e.g. "dried guajillo chiles" wins over a shorter "chiles" also present in
// the ingredient list, and only matches whole words so "egg" doesn't light
// up inside "eggplant".
export function highlightIngredients(text: string, ingredientNames: string[]): ReactNode {
  const names = Array.from(new Set(ingredientNames.map((n) => n.trim()).filter(Boolean))).sort(
    (a, b) => b.length - a.length,
  );
  if (names.length === 0) return text;

  const pattern = new RegExp(`\\b(${names.map(escapeRegExp).join('|')})\\b`, 'gi');
  const parts = text.split(pattern);
  if (parts.length === 1) return text;

  const lowerNames = new Set(names.map((n) => n.toLowerCase()));

  return (
    <>
      {parts.map((part, i) =>
        lowerNames.has(part.toLowerCase()) ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
