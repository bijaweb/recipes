// Weight and volume conversion for the metric/imperial toggle, plus simple
// batch scaling. Only ingredient rows with a parsed amountValue + unit can
// be converted/scaled; everything else (e.g. "to taste") is shown as-is.

const WEIGHT_TO_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  tsp: 4.92892,
  tbsp: 14.7868,
  fl_oz: 29.5735,
  cup: 236.588,
  qt: 946.353,
  gal: 3785.41,
};

export const UNIT_LABELS: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  oz: 'oz',
  lb: 'lb',
  ml: 'ml',
  l: 'L',
  tsp: 'tsp',
  tbsp: 'tbsp',
  cup: 'cup',
  fl_oz: 'fl oz',
  qt: 'qt',
  gal: 'gal',
  each: '',
};

export type UnitSystem = 'metric' | 'imperial';

function unitCategory(unit: string): 'weight' | 'volume' | 'other' {
  if (unit in WEIGHT_TO_G) return 'weight';
  if (unit in VOLUME_TO_ML) return 'volume';
  return 'other';
}

export function convertAmount(value: number, fromUnit: string, system: UnitSystem): { value: number; unit: string } {
  const category = unitCategory(fromUnit);

  if (category === 'weight') {
    const grams = value * WEIGHT_TO_G[fromUnit];
    if (system === 'metric') {
      return grams >= 1000 ? { value: grams / 1000, unit: 'kg' } : { value: grams, unit: 'g' };
    }
    const ounces = grams / WEIGHT_TO_G.oz;
    return ounces >= 16 ? { value: ounces / 16, unit: 'lb' } : { value: ounces, unit: 'oz' };
  }

  if (category === 'volume') {
    const ml = value * VOLUME_TO_ML[fromUnit];
    if (system === 'metric') {
      return ml >= 1000 ? { value: ml / 1000, unit: 'l' } : { value: ml, unit: 'ml' };
    }
    const cups = ml / VOLUME_TO_ML.cup;
    if (cups >= 0.25) return { value: cups, unit: 'cup' };
    const tbsp = ml / VOLUME_TO_ML.tbsp;
    if (tbsp >= 1) return { value: tbsp, unit: 'tbsp' };
    return { value: ml / VOLUME_TO_ML.tsp, unit: 'tsp' };
  }

  return { value, unit: fromUnit };
}

export function formatAmount(value: number, roundUp = false): string {
  if (roundUp) return String(Math.ceil(value));
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
}

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}
