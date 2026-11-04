export const money = (amount: number) =>
  `${amount < 0 ? "-" : ""}$${Math.abs(amount).toLocaleString("en-US")}`;

export const signedMoney = (amount: number) => `${amount > 0 ? "+" : ""}${money(amount)}`;

export const multiplier = (odds: number | string) => `${Number(odds)}x`;

/** Matches the database: stake × odds, rounded to the nearest dollar. */
export const payoutFor = (stake: number, odds: number | string) =>
  Math.round((stake * Math.round(Number(odds) * 100)) / 100);

export const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
