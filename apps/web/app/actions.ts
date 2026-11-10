"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decidePlan, getInstallation, getRun, saveSandboxSettings, type Installation } from "@paypal-checkout-integrator/shared";
import { canAccess, requireUser, type User } from "@/lib/auth";
import { startAddPaypal, syncInstallation } from "@/lib/github";
import { ensureDb } from "@/lib/server";

async function ownedStore(user: User, installationId: number): Promise<Installation> {
  const inst = await getInstallation(installationId);
  if (!inst || !canAccess(user, inst)) throw new Error("You don't have access to this store");
  return inst;
}

export async function startAddPaypalAction(formData: FormData) {
  await ensureDb();
  const user = await requireUser();
  const inst = await ownedStore(user, Number(formData.get("installationId")));
  const run = await startAddPaypal(inst.id);
  redirect(`/runs/${run.id}`);
}

export async function decidePlanAction(formData: FormData) {
  await ensureDb();
  const user = await requireUser();
  const runId = String(formData.get("runId"));
  const approve = formData.get("decision") === "approve";
  const run = await getRun(runId);
  if (!run) throw new Error("Run not found");
  await ownedStore(user, run.installation_id);
  if (run.status !== "awaiting_approval") throw new Error("This run is not waiting for approval");
  await decidePlan(runId, approve);
  revalidatePath(`/runs/${runId}`);
}

export async function saveSettingsAction(formData: FormData) {
  await ensureDb();
  const user = await requireUser();
  const inst = await ownedStore(user, Number(formData.get("installationId")));
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const stripeKey = str("stripeSecretKey");
  if (stripeKey && !stripeKey.startsWith("sk_test_")) throw new Error("Only Stripe test-mode keys (sk_test_…) are allowed");
  await saveSandboxSettings(inst.id, {
    paypalClientId: str("paypalClientId"),
    paypalClientSecret: str("paypalClientSecret"),
    buyerEmail: str("buyerEmail"),
    buyerPassword: str("buyerPassword"),
    stripeSecretKey: stripeKey,
    appDir: str("appDir"),
  });
  revalidatePath(`/repos/${inst.id}`);
  redirect(`/repos/${inst.id}?saved=1`);
}

/** Re-reads from GitHub the stores this user has connected (recovers from a missed webhook). */
export async function syncInstallationsAction() {
  await ensureDb();
  const user = await requireUser();
  for (const id of user.installationIds) await syncInstallation(Number(id));
  revalidatePath("/");
  redirect("/");
}
