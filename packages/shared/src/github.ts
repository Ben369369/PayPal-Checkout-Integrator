import { App, Octokit } from "octokit";
import { decrypt, encrypt } from "./crypto";
import { one, q } from "./db";

export const CHECK_NAME = "PayPal checkout";
export const PRODUCT_NAME = "PayPal Checkout Integrator";
/** The branch the app opens its PayPal PR from. */
export const ADD_PAYPAL_BRANCH = "paypal-checkout-integrator/add-paypal";

export type GithubAppRow = {
  app_id: string;
  slug: string;
  name: string;
  owner: string | null;
  html_url: string | null;
  client_id: string | null;
  bot_user_id: string | null;
  private_key_enc: string;
  webhook_secret_enc: string;
};

export async function getGithubApp(): Promise<GithubAppRow | null> {
  return one<GithubAppRow>(`SELECT * FROM github_app WHERE id = 1`);
}

/** Stores the app created through GitHub's manifest flow (secrets encrypted at rest). */
export async function saveGithubApp(app: {
  id: number;
  slug: string;
  name: string;
  owner?: { login?: string } | null;
  html_url?: string;
  client_id?: string;
  client_secret?: string;
  webhook_secret?: string | null;
  pem: string;
}) {
  await q(
    `INSERT INTO github_app (id, app_id, slug, name, owner, html_url, client_id, private_key_enc, webhook_secret_enc, client_secret_enc)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET app_id = EXCLUDED.app_id, slug = EXCLUDED.slug, name = EXCLUDED.name, owner = EXCLUDED.owner,
       html_url = EXCLUDED.html_url, client_id = EXCLUDED.client_id, private_key_enc = EXCLUDED.private_key_enc,
       webhook_secret_enc = EXCLUDED.webhook_secret_enc, client_secret_enc = EXCLUDED.client_secret_enc, bot_user_id = NULL`,
    [
      app.id,
      app.slug,
      app.name,
      app.owner?.login ?? null,
      app.html_url ?? null,
      app.client_id ?? null,
      encrypt(app.pem),
      encrypt(app.webhook_secret ?? ""),
      app.client_secret ? encrypt(app.client_secret) : null,
    ],
  );
}

export async function webhookSecret(): Promise<string | null> {
  const row = await getGithubApp();
  return row ? decrypt(row.webhook_secret_enc) : null;
}

let cached: { appId: string; app: InstanceType<typeof App> } | null = null;

export async function githubApp(): Promise<InstanceType<typeof App>> {
  const row = await getGithubApp();
  if (!row) throw new Error("The GitHub App is not set up yet. Open /setup on the dashboard.");
  if (cached?.appId !== row.app_id) {
    cached = { appId: row.app_id, app: new App({ appId: Number(row.app_id), privateKey: decrypt(row.private_key_enc)! }) };
  }
  return cached.app;
}

export async function installationOctokit(installationId: number | string): Promise<Octokit> {
  return (await githubApp()).getInstallationOctokit(Number(installationId)) as unknown as Promise<Octokit>;
}

/** Short-lived token for git clone/push as the app. */
export async function installationToken(installationId: number | string): Promise<string> {
  const octokit = await installationOctokit(installationId);
  const auth = (await octokit.auth({ type: "installation" })) as { token: string };
  return auth.token;
}

/** Commit identity of the app's bot user, so commits show the app's avatar. */
export async function botIdentity(): Promise<{ name: string; email: string }> {
  const row = await getGithubApp();
  if (!row) throw new Error("GitHub App not set up");
  let botId = row.bot_user_id;
  if (!botId) {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(`${row.slug}[bot]`)}`);
    if (res.ok) {
      botId = String(((await res.json()) as { id: number }).id);
      await q(`UPDATE github_app SET bot_user_id = $1 WHERE id = 1`, [botId]);
    }
  }
  const name = `${row.slug}[bot]`;
  return { name, email: botId ? `${botId}+${name}@users.noreply.github.com` : `${name}@users.noreply.github.com` };
}

export function repoParts(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  return { owner, repo };
}
