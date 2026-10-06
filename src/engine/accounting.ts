export function assertMoney(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('INVALID_MONEY');
}
export function roundHalfUp(numerator: bigint, denominator: bigint): number {
  const result = Number((numerator + denominator / 2n) / denominator);
  assertMoney(result); return result;
}
export function settledPayout(requestedCents: number, paidCents: number, capCents: number): number {
  [requestedCents,paidCents,capCents].forEach(assertMoney);
  return Math.min(requestedCents, Math.max(0,capCents-paidCents));
}
export function formatMoney(cents: number, language: 'bg' | 'en' = 'bg'): string {
  return new Intl.NumberFormat(language === 'bg' ? 'bg-BG' : 'en-GB', { style:'currency', currency:'EUR' }).format(cents/100);
}
