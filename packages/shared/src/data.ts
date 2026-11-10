import { decrypt, encrypt } from "./crypto";
import { one, q } from "./db";

export type Installation = {
  id: number;
  github_installation_id: string;
  repo_full_name: string;
  default_branch: string;
  active: boolean;
  created_at: Date;
};

export type RunKind = "add_paypal" | "check";
export type RunStatus = "queued" | "running" | "awaiting_approval" | "passed" | "failed" | "error" | "skipped" | "rejected";

export type Run = {
  id: string;
  installation_id: number;
  kind: RunKind;
  status: RunStatus;
  stage: string | null;
  commit_sha: string | null;
  pr_number: number | null;
  pr_url: string | null;
  branch: string | null;
  check_run_id: string | null;
  summary: Record<string, unknown> | null;
  error: string | null;
  cost_usd: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
};

/* Installations ---------------------------------------------------- */

export async function upsertInstallation(githubInstallationId: number, repoFullName: string, defaultBranch: string) {
  return one<Installation>(
    `INSERT INTO installations (github_installation_id, repo_full_name, default_branch, active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (repo_full_name) DO UPDATE SET github_installation_id = EXCLUDED.github_installation_id,
       default_branch = EXCLUDED.default_branch, active = true
     RETURNING *`,
    [githubInstallationId, repoFullName, defaultBranch],
  );
}

export async function deactivateInstallation(githubInstallationId: number, repoFullName?: string) {
  if (repoFullName) await q(`UPDATE installations SET active = false WHERE github_installation_id = $1 AND repo_full_name = $2`, [githubInstallationId, repoFullName]);
  else await q(`UPDATE installations SET active = false WHERE github_installation_id = $1`, [githubInstallationId]);
}

export const listInstallations = () => q<Installation>(`SELECT * FROM installations WHERE active ORDER BY created_at`);
export const getInstallation = (id: number) => one<Installation>(`SELECT * FROM installations WHERE id = $1`, [id]);
export const findInstallationByRepo = (fullName: string) =>
  one<Installation>(`SELECT * FROM installations WHERE repo_full_name = $1 AND active`, [fullName]);

/* PayPal / Stripe sandbox settings ----------------------------------- */

export type SandboxSettings = {
  paypalClientId: string | null;
  paypalClientSecret: string | null;
  buyerEmail: string | null;
  buyerPassword: string | null;
  stripeSecretKey: string | null;
  appDir: string;
};

export async function getSandboxSettings(installationId: number): Promise<SandboxSettings & { configured: boolean }> {
  const row = await one<Record<string, string | null>>(`SELECT * FROM paypal_configs WHERE installation_id = $1`, [installationId]);
  const s: SandboxSettings = {
    paypalClientId: row?.client_id ?? null,
    paypalClientSecret: decrypt(row?.client_secret_enc),
    buyerEmail: decrypt(row?.buyer_email_enc),
    buyerPassword: decrypt(row?.buyer_password_enc),
    stripeSecretKey: decrypt(row?.stripe_secret_key_enc),
    appDir: row?.app_dir ?? ".",
  };
  return { ...s, configured: Boolean(s.paypalClientId && s.paypalClientSecret && s.buyerEmail && s.buyerPassword) };
}

/** Saves settings; empty secret fields keep the stored value. */
export async function saveSandboxSettings(installationId: number, input: Partial<SandboxSettings>) {
  const enc = (v: string | null | undefined) => (v ? encrypt(v) : null);
  await q(
    `INSERT INTO paypal_configs (installation_id, client_id, client_secret_enc, buyer_email_enc, buyer_password_enc, stripe_secret_key_enc, app_dir, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '.'), now())
     ON CONFLICT (installation_id) DO UPDATE SET
       client_id = COALESCE(EXCLUDED.client_id, paypal_configs.client_id),
       client_secret_enc = COALESCE(EXCLUDED.client_secret_enc, paypal_configs.client_secret_enc),
       buyer_email_enc = COALESCE(EXCLUDED.buyer_email_enc, paypal_configs.buyer_email_enc),
       buyer_password_enc = COALESCE(EXCLUDED.buyer_password_enc, paypal_configs.buyer_password_enc),
       stripe_secret_key_enc = COALESCE(EXCLUDED.stripe_secret_key_enc, paypal_configs.stripe_secret_key_enc),
       app_dir = COALESCE($7, paypal_configs.app_dir),
       updated_at = now()`,
    [
      installationId,
      input.paypalClientId || null,
      enc(input.paypalClientSecret),
      enc(input.buyerEmail),
      enc(input.buyerPassword),
      enc(input.stripeSecretKey),
      input.appDir || null,
    ],
  );
}

/* Runs ----------------------------------------------------------------- */

export async function createRun(input: {
  installationId: number;
  kind: RunKind;
  commitSha?: string | null;
  prNumber?: number | null;
  branch?: string | null;
}): Promise<Run> {
  return (await one<Run>(
    `INSERT INTO runs (installation_id, kind, commit_sha, pr_number, branch) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.installationId, input.kind, input.commitSha ?? null, input.prNumber ?? null, input.branch ?? null],
  ))!;
}

export const getRun = (id: string) => one<Run>(`SELECT * FROM runs WHERE id = $1`, [id]);

export const listRuns = (installationId?: number, limit = 50) =>
  installationId
    ? q<Run>(`SELECT * FROM runs WHERE installation_id = $1 ORDER BY created_at DESC LIMIT $2`, [installationId, limit])
    : q<Run>(`SELECT * FROM runs ORDER BY created_at DESC LIMIT $1`, [limit]);

const RUN_COLUMNS = new Set(["status", "stage", "commit_sha", "pr_number", "pr_url", "branch", "check_run_id", "summary", "error", "cost_usd", "started_at", "finished_at"]);

export async function updateRun(id: string, fields: Partial<Record<string, unknown>>) {
  const entries = Object.entries(fields).filter(([k]) => RUN_COLUMNS.has(k));
  if (!entries.length) return;
  const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(", ");
  await q(`UPDATE runs SET ${sets} WHERE id = $1`, [id, ...entries.map(([k, v]) => (k === "summary" ? JSON.stringify(v) : v))]);
}

export async function addEvent(runId: string, message: string) {
  await q(`INSERT INTO run_events (run_id, message) VALUES ($1, $2)`, [runId, message.slice(0, 2000)]);
}

export const listEvents = (runId: string, afterId = 0) =>
  q<{ id: string; at: Date; message: string }>(`SELECT id, at, message FROM run_events WHERE run_id = $1 AND id > $2 ORDER BY id LIMIT 500`, [runId, afterId]);

/* Plans ---------------------------------------------------------------- */

export async function savePlan(runId: string, repoMap: unknown, filePlan: unknown) {
  await q(
    `INSERT INTO plans (run_id, repo_map, file_plan) VALUES ($1, $2, $3)
     ON CONFLICT (run_id) DO UPDATE SET repo_map = EXCLUDED.repo_map, file_plan = EXCLUDED.file_plan, approved_at = NULL, rejected_at = NULL`,
    [runId, JSON.stringify(repoMap), JSON.stringify(filePlan)],
  );
}

export const getPlan = (runId: string) =>
  one<{ run_id: string; repo_map: unknown; file_plan: unknown; approved_at: Date | null; rejected_at: Date | null }>(
    `SELECT * FROM plans WHERE run_id = $1`,
    [runId],
  );

export async function decidePlan(runId: string, approve: boolean) {
  await q(`UPDATE plans SET ${approve ? "approved_at" : "rejected_at"} = now() WHERE run_id = $1 AND approved_at IS NULL AND rejected_at IS NULL`, [runId]);
}

/* Attempts and scenario results ---------------------------------------- */

export async function saveAttempt(runId: string, a: {
  iteration: number;
  commitSha: string;
  diff: string;
  checks: unknown;
  failingCheck: string | null;
  errorSummary: string | null;
  harnessRunId?: string;
  repair?: unknown;
}) {
  await q(
    `INSERT INTO attempts (run_id, iteration, commit_sha, diff, checks, failing_check, error_summary, harness_run_id, repair)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (run_id, iteration) DO UPDATE SET commit_sha = EXCLUDED.commit_sha, diff = EXCLUDED.diff, checks = EXCLUDED.checks,
       failing_check = EXCLUDED.failing_check, error_summary = EXCLUDED.error_summary, harness_run_id = EXCLUDED.harness_run_id, repair = EXCLUDED.repair`,
    [runId, a.iteration, a.commitSha, a.diff, JSON.stringify(a.checks), a.failingCheck, a.errorSummary, a.harnessRunId ?? null, a.repair ? JSON.stringify(a.repair) : null],
  );
}

export const listAttempts = (runId: string) =>
  q<{ iteration: number; commit_sha: string; diff: string; checks: { name: string; pass: boolean; output: string }[]; failing_check: string | null; error_summary: string | null; repair: { summary?: string } | null }>(
    `SELECT * FROM attempts WHERE run_id = $1 ORDER BY iteration`,
    [runId],
  );

export type ScenarioRow = {
  scenario: number;
  name: string;
  provider: string;
  status: string;
  paypal_order_id: string | null;
  store_order_id: string | null;
  checks: { name: string; pass: boolean; detail?: string }[];
  api_evidence: Record<string, unknown> | null;
  db_snapshot: { paypal?: { order: Record<string, unknown>; items: unknown[] } | null; stripe?: { order: Record<string, unknown>; items: unknown[] } | null } | null;
  parity_diff: string[] | null;
  notes: string[] | null;
  error: string | null;
  video_url: string | null;
  trace_url: string | null;
  duration_ms: number | null;
};

export async function saveScenarioResults(runId: string, rows: Omit<ScenarioRow, never>[]) {
  await q(`DELETE FROM scenario_results WHERE run_id = $1`, [runId]);
  for (const r of rows) {
    await q(
      `INSERT INTO scenario_results (run_id, scenario, name, provider, status, paypal_order_id, store_order_id, checks, api_evidence, db_snapshot, parity_diff, notes, error, video_url, trace_url, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        runId, r.scenario, r.name, r.provider, r.status, r.paypal_order_id, r.store_order_id,
        JSON.stringify(r.checks), JSON.stringify(r.api_evidence), JSON.stringify(r.db_snapshot),
        JSON.stringify(r.parity_diff), JSON.stringify(r.notes), r.error, r.video_url, r.trace_url, r.duration_ms,
      ],
    );
  }
}

export const listScenarioResults = (runId: string) =>
  q<ScenarioRow>(`SELECT * FROM scenario_results WHERE run_id = $1 ORDER BY scenario`, [runId]);

/* Artifacts (videos, traces) ------------------------------------------- */

export async function saveArtifact(runId: string, name: string, contentType: string, bytes: Buffer): Promise<string> {
  const row = await one<{ id: string }>(`INSERT INTO artifacts (run_id, name, content_type, bytes) VALUES ($1, $2, $3, $4) RETURNING id`, [runId, name, contentType, bytes]);
  return row!.id;
}

export const getArtifact = (id: string) =>
  one<{ id: string; run_id: string; name: string; content_type: string; bytes: Buffer }>(`SELECT * FROM artifacts WHERE id = $1`, [id]);

/* PayPal webhook relay -------------------------------------------------- */

export async function storeRelayedEvent(relayKey: string, headers: Record<string, string>, rawBody: string) {
  let parsed: { id?: string; event_type?: string; resource?: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } } } = {};
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    /* store anyway */
  }
  await q(
    `INSERT INTO paypal_webhook_events (relay_key, headers, raw_body, event_id, event_type, resource_id, related_order_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [relayKey, JSON.stringify(headers), rawBody, parsed.id ?? null, parsed.event_type ?? null, parsed.resource?.id ?? null, parsed.resource?.supplementary_data?.related_ids?.order_id ?? null],
  );
}

export const listRelayedEvents = (relayKey: string, afterId = 0) =>
  q<{ id: string; received_at: Date; headers: Record<string, string>; raw_body: string; event_id: string | null; event_type: string | null; resource_id: string | null; related_order_id: string | null }>(
    `SELECT * FROM paypal_webhook_events WHERE relay_key = $1 AND id > $2 ORDER BY id`,
    [relayKey, afterId],
  );
