"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { decidePlan, getInstallation, getRun, saveSandboxSettings } from "@paypal-checkout-integrator/shared";
import { startAddPaypal, syncAllInstallations } from "@/lib/github";
import { ensureDb } from "@/lib/server";

export async function startAddPaypalAction(formData: FormData) {
  await ensureDb();
  const installationId = Number(formData.get("installationId"));
  if (!(await getInstallation(installationId))) throw new Error("Unknown repository");
  const run = await startAddPaypal(installationId);
  redirect(`/runs/${run.id}`);
}

export async function decidePlanAction(formData: FormData) {
  await ensureDb();
  const runId = String(formData.get("runId"));
  const approve = formData.get("decision") === "approve";
  const run = await getRun(runId);
  if (!run || run.status !== "awaiting_approval") throw new Error("This run is not waiting for approval");
  await decidePlan(runId, approve);
  revalidatePath(`/runs/${runId}`);
}

export async function saveSettingsAction(formData: FormData) {
  await ensureDb();
  const installationId = Number(formData.get("installationId"));
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || undefined;
  };
  const stripeKey = str("stripeSecretKey");
  if (stripeKey && !stripeKey.startsWith("sk_test_")) throw new Error("Only Stripe test-mode keys (sk_test_…) are allowed");
  await saveSandboxSettings(installationId, {
    paypalClientId: str("paypalClientId"),
    paypalClientSecret: str("paypalClientSecret"),
    buyerEmail: str("buyerEmail"),
    buyerPassword: str("buyerPassword"),
    stripeSecretKey: stripeKey,
    appDir: str("appDir"),
  });
  revalidatePath(`/repos/${installationId}`);
  redirect(`/repos/${installationId}?saved=1`);
}

export async function syncInstallationsAction() {
  await ensureDb();
  await syncAllInstallations();
  revalidatePath("/");
  redirect("/");
}
