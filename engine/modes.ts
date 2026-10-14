// Product-type detection for auto-enabling modes. Shared by the web app and the CLI.
// All functions check combined strainName + notes, since the analyzer may put the
// product type in notes.

function combineFields(strainName: string, notes?: string): string {
  return (strainName + ' ' + (notes || '')).toLowerCase();
}

function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some(keyword => text.includes(keyword));
}

export function isResinProduct(strainName: string, notes?: string): boolean {
  return containsAny(combineFields(strainName, notes), ['resin', 'rosin', 'sauce', 'solventless']);
}

// Rosin runs lower than resin (72-85% across every batch to date), so it gets its own
// badge: 75%+ (Malcolm, Oct 14 2026). Images made before then keep 80%+, which is still
// legal on every current rosin box (all print 78%+).
export function isRosinProduct(strainName: string, notes?: string): boolean {
  return containsAny(combineFields(strainName, notes), ['rosin', 'solventless']);
}

export function isCbdProduct(strainName: string, notes?: string): boolean {
  const combined = combineFields(strainName, notes);
  return combined.includes('cbd') || /\b\d+:\d+\b/.test(combined);
}

export function isBatteryProduct(strainName: string, notes?: string): boolean {
  return containsAny(combineFields(strainName, notes), ['battery', 'batteries']);
}
