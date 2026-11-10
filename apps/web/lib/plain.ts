/** Plain-language wording for the Simple view. */

export const PLAIN_SCENARIOS: Record<number, string> = {
  1: "A shopper buys one item with PayPal",
  2: "A shopper buys several items at once",
  3: "A shopper changes their mind and closes PayPal",
  4: "A shopper's payment is declined",
  5: "PayPal sends the same payment notice twice",
  6: "Someone sends a fake payment notice",
  7: "Someone tries to change the price in their browser",
  8: "You refund an order",
  9: "Card payments still work as before",
};

export const PLAIN_STEPS = [
  { key: "read", label: "Reading your store" },
  { key: "plan", label: "Writing a plan" },
  { key: "approve", label: "Waiting for your OK" },
  { key: "build", label: "Adding PayPal checkout" },
  { key: "test", label: "Testing with real test purchases" },
  { key: "ready", label: "Ready for you to accept" },
] as const;

/** Index of the current plain step for an add-PayPal run (or PLAIN_STEPS.length when finished). */
export function plainStepIndex(status: string, stage: string | null): number {
  if (["passed", "failed", "error", "rejected"].includes(status)) return PLAIN_STEPS.length;
  if (status === "awaiting_approval") return 2;
  const s = (stage ?? "").split(/[-\s]/)[0];
  if (s === "plan") return 1;
  if (s === "implement") return 3;
  if (s === "check" || s === "repair" || s === "Scenario") return 4;
  if (s === "publish") return 5;
  return 0;
}

export const PLAIN_STATUS: Record<string, string> = {
  queued: "Starting",
  running: "Working on it",
  awaiting_approval: "Needs your OK",
  passed: "All tests passed",
  failed: "Some tests failed",
  error: "Something went wrong",
  skipped: "Nothing to test",
  rejected: "You said no to the plan",
};
