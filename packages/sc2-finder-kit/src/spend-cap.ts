// The session's spend cap: the Finder calls Jev until its estimated spend this session
// reaches the cap ($1.00 unless `--budget` sets another), then shows the narrowing's order and
// says why. The check comes before each call, so the last call may take the spend a little past.

/** US dollars a session may spend on Jev unless told otherwise. */
export const DEFAULT_BUDGET = 1;

export type SpendCap = {
  readonly limit: number;
  /** US dollars spent this session, estimated. */
  readonly spent: number;
  /** Whether another call is allowed. */
  readonly allows: () => boolean;
  record(cost: number): void;
  /** Why no call is made once the cap is reached. */
  readonly reason: string;
};

export const dollars = (amount: number): string => `$${amount.toFixed(2)}`;

export function spendCap(limit: number = DEFAULT_BUDGET): SpendCap {
  if (!(limit >= 0)) throw new Error(`The spend cap takes US dollars, 0 or more, not ${limit}`);
  let spent = 0;
  return {
    limit,
    get spent() {
      return spent;
    },
    allows: () => spent < limit,
    record(cost) {
      spent += cost;
    },
    reason: `the spend cap of ${dollars(limit)} for this session is reached, so Jev isn't called and the narrowing's order is shown. Start the Finder again with a higher --budget to rank more`,
  };
}
