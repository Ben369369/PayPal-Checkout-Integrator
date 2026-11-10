import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RunReport, ScenarioResult } from "@paypal-checkout-integrator/harness";
import { saveArtifact, saveScenarioResults, type ScenarioRow } from "@paypal-checkout-integrator/shared";

const publicBase = () => (process.env.PUBLIC_URL ?? "").replace(/\/$/, "");

async function upload(runId: string, file: string, contentType: string): Promise<string | null> {
  if (!existsSync(file)) return null;
  const id = await saveArtifact(runId, path.basename(file), contentType, readFileSync(file));
  return `/api/artifacts/${id}`;
}

/** Saves a harness run's scenario results, uploading each scenario's video and trace. */
export async function saveHarnessEvidence(runId: string, report: RunReport, runsDir: string) {
  const dir = path.join(runsDir, report.runId);
  const rows: ScenarioRow[] = [];
  for (const s of report.scenarios as ScenarioResult[]) {
    const video = s.videos?.[0] ? await upload(runId, path.join(dir, s.videos[0]), "video/webm") : null;
    const trace = s.trace ? await upload(runId, path.join(dir, s.trace), "application/zip") : null;
    rows.push({
      scenario: s.id,
      name: s.name,
      provider: s.provider,
      status: s.status,
      paypal_order_id: s.paypalOrderId ?? null,
      store_order_id: s.storeOrderId ?? null,
      checks: s.checks,
      api_evidence: s.apiEvidence ?? null,
      db_snapshot: (s.dbSnapshot as ScenarioRow["db_snapshot"]) ?? null,
      parity_diff: s.parityDiff ?? null,
      notes: s.notes,
      error: s.error ?? null,
      video_url: video,
      trace_url: trace,
      duration_ms: s.durationMs,
    });
  }
  await saveScenarioResults(runId, rows);
}

export function reportUrl(runId: string): string {
  return `${publicBase()}/runs/${runId}/report`;
}

export function passedCount(report: RunReport | null | undefined): { passed: number; total: number } {
  const scenarios = report?.scenarios ?? [];
  return { passed: scenarios.filter((s) => s.status === "pass").length, total: scenarios.length };
}
