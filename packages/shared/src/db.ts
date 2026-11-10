import pg from "pg";

let pool: pg.Pool | null = null;

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** Render's external Postgres URLs require TLS; its internal ones and localhost don't. */
export function sslFor(url: string): pg.PoolConfig["ssl"] {
  return /\.render\.com|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined;
}

export function db(): pg.Pool {
  if (!pool) {
    const url = databaseUrl();
    pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), max: 5 });
  }
  return pool;
}

export async function q<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db().query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS github_app (
     id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
     app_id bigint NOT NULL,
     slug text NOT NULL,
     name text NOT NULL,
     owner text,
     html_url text,
     client_id text,
     bot_user_id bigint,
     private_key_enc text NOT NULL,
     webhook_secret_enc text NOT NULL,
     client_secret_enc text,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS installations (
     id serial PRIMARY KEY,
     github_installation_id bigint NOT NULL,
     repo_full_name text NOT NULL,
     default_branch text NOT NULL DEFAULT 'main',
     active boolean NOT NULL DEFAULT true,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (repo_full_name)
   )`,
  `CREATE TABLE IF NOT EXISTS paypal_configs (
     installation_id int PRIMARY KEY REFERENCES installations(id) ON DELETE CASCADE,
     client_id text,
     client_secret_enc text,
     webhook_id text,
     buyer_email_enc text,
     buyer_password_enc text,
     stripe_secret_key_enc text,
     app_dir text NOT NULL DEFAULT '.',
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS runs (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     installation_id int NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
     kind text NOT NULL CHECK (kind IN ('add_paypal', 'check')),
     status text NOT NULL DEFAULT 'queued',
     stage text,
     commit_sha text,
     pr_number int,
     pr_url text,
     branch text,
     check_run_id bigint,
     summary jsonb,
     error text,
     cost_usd numeric,
     created_at timestamptz NOT NULL DEFAULT now(),
     started_at timestamptz,
     finished_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS runs_installation_idx ON runs (installation_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS plans (
     run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
     repo_map jsonb NOT NULL,
     file_plan jsonb NOT NULL,
     approved_at timestamptz,
     rejected_at timestamptz
   )`,
  `CREATE TABLE IF NOT EXISTS attempts (
     id serial PRIMARY KEY,
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     iteration int NOT NULL,
     commit_sha text,
     diff text,
     checks jsonb,
     failing_check text,
     error_summary text,
     harness_run_id text,
     repair jsonb,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (run_id, iteration)
   )`,
  `CREATE TABLE IF NOT EXISTS scenario_results (
     id serial PRIMARY KEY,
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     scenario int NOT NULL,
     name text NOT NULL,
     provider text NOT NULL,
     status text NOT NULL,
     paypal_order_id text,
     store_order_id text,
     checks jsonb,
     api_evidence jsonb,
     db_snapshot jsonb,
     parity_diff jsonb,
     notes jsonb,
     error text,
     video_url text,
     trace_url text,
     duration_ms int,
     UNIQUE (run_id, scenario)
   )`,
  `CREATE TABLE IF NOT EXISTS run_events (
     id bigserial PRIMARY KEY,
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     at timestamptz NOT NULL DEFAULT now(),
     message text NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS run_events_run_idx ON run_events (run_id, id)`,
  `CREATE TABLE IF NOT EXISTS artifacts (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     name text NOT NULL,
     content_type text NOT NULL,
     bytes bytea NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS paypal_webhook_events (
     id bigserial PRIMARY KEY,
     relay_key text NOT NULL,
     received_at timestamptz NOT NULL DEFAULT now(),
     headers jsonb NOT NULL,
     raw_body text NOT NULL,
     event_id text,
     event_type text,
     resource_id text,
     related_order_id text
   )`,
  `CREATE INDEX IF NOT EXISTS paypal_webhook_events_key_idx ON paypal_webhook_events (relay_key, id)`,
];

/** Idempotent schema setup; safe to run on every boot of web and worker. */
export async function migrate() {
  for (const sql of MIGRATIONS) await db().query(sql);
}
