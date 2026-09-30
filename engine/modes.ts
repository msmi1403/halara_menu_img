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

export function isCbdProduct(strainName: string, notes?: string): boolean {
  const combined = combineFields(strainName, notes);
  return combined.includes('cbd') || /\b\d+:\d+\b/.test(combined);
}

export function isBatteryProduct(strainName: string, notes?: string): boolean {
  return containsAny(combineFields(strainName, notes), ['battery', 'batteries']);
}
