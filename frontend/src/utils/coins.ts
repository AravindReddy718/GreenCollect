// Same formula the server uses when a pickup is completed (backend/routes/wasteRequest.js calculateCoinsValue),
// so the estimate shown while booking matches what is actually credited.
const MULTIPLIERS: Record<string, number> = {
  electronics: 1.5,
  metal: 1.3,
  plastic: 1.2,
  paper: 1.1
};

export const estimateCoins = (weightKg: number, wasteType: string): number =>
  Math.round(weightKg * 10 * (MULTIPLIERS[wasteType.toLowerCase()] ?? 1));
