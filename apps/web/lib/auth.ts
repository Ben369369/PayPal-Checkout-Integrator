import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  deleteSession,
  getGithubApp,
  getSession,
  listInstallations,
  sessionToken,
  updateSessionInstallations,
  type Installation,
  type Session,
} from "@paypal-checkout-integrator/shared";
import { ensureDb } from "./server";

export const SESSION_COOKIE = "pci_session";

export type User = { sessionId: string; login: string; name: string | null; avatarUrl: string | null; installationIds: Set<string> };

const gh = (token: string, path: string) =>
  fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });

/** Installations of our app that this GitHub user can access. */
export async function fetchUserInstallationIds(token: string): Promise<number[] | null> {
  const res = await gh(token, "/user/installations?per_page=100");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GitHub /user/installations failed: ${res.status}`);
  const json = (await res.json()) as { installations: { id: number }[] };
  return json.installations.map((i) => i.id);
}

/** The signed-in user, or null. Refreshes which installations they can see at most once a minute. */
export async function currentUser(): Promise<User | null> {
  await ensureDb();
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
  let session: Session | null = await getSession(id);
  if (!session) return null;

  const stale = !session.installations_checked_at || Date.now() - new Date(session.installations_checked_at).getTime() > 60_000;
  if (stale) {
    const ids = await fetchUserInstallationIds(sessionToken(session) ?? "").catch(() => session!.installation_ids.map(Number));
    if (ids === null) {
      await deleteSession(id); // GitHub token expired or revoked: sign in again
      return null;
    }
    await updateSessionInstallations(id, ids);
    session = { ...session, installation_ids: ids.map(String) };
  }
  return {
    sessionId: id,
    login: session.login,
    name: session.name,
    avatarUrl: session.avatar_url,
    installationIds: new Set(session.installation_ids.map(String)),
  };
}

export async function requireUser(next = "/"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/api/auth/login?next=${encodeURIComponent(next)}`);
  return user;
}

export function canAccess(user: User, inst: Pick<Installation, "github_installation_id">): boolean {
  return user.installationIds.has(String(inst.github_installation_id));
}

/** Stores (repositories) this user can see. */
export async function userStores(user: User): Promise<Installation[]> {
  return (await listInstallations()).filter((i) => canAccess(user, i));
}

/** The person who created the GitHub App (Chui Labs' operator) can see the setup page. */
export async function isOperator(user: User | null): Promise<boolean> {
  if (!user) return false;
  const app = await getGithubApp();
  return Boolean(app?.owner && app.owner.toLowerCase() === user.login.toLowerCase());
}
