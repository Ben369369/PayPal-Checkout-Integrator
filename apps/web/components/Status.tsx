const LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  awaiting_approval: "Waiting for plan approval",
  passed: "Passed",
  failed: "Failed",
  error: "Error",
  skipped: "Skipped",
  rejected: "Plan rejected",
  pass: "Pass",
  fail: "Fail",
};

/** A status in plain words, coloured by meaning (navy = good, red = bad), never a pill. */
export function Status({ value }: { value: string }) {
  const cls = ["passed", "pass"].includes(value) ? "pass" : ["failed", "fail", "error"].includes(value) ? "fail" : "skipped";
  return <span className={`status-word ${cls}`}>{LABELS[value] ?? value}</span>;
}

export function kindLabel(kind: string) {
  return kind === "add_paypal" ? "Add PayPal" : "PR check";
}

export function statusLabel(value: string) {
  return LABELS[value] ?? value;
}
