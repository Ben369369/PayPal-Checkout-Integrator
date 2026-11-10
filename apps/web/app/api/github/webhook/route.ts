import { NextResponse, type NextRequest } from "next/server";
import { verify } from "@octokit/webhooks-methods";
import { deactivateInstallation, upsertInstallation, webhookSecret } from "@paypal-checkout-integrator/shared";
import { startPullRequestCheck, syncInstallation } from "@/lib/github";
import { ensureDb } from "@/lib/server";

type Repo = { full_name: string; default_branch?: string };
type Payload = {
  action?: string;
  installation?: { id: number };
  repositories?: Repo[];
  repositories_added?: Repo[];
  repositories_removed?: Repo[];
  repository?: Repo;
  pull_request?: { number: number; head: { sha: string; ref: string } };
  check_run?: { head_sha: string; app?: { id: number }; pull_requests?: { number: number; head: { ref: string } }[] };
};

export async function POST(request: NextRequest) {
  await ensureDb();
  const body = await request.text();
  const secret = await webhookSecret();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !signature || !(await verify(secret, body, signature))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const payload = JSON.parse(body) as Payload;
  const installationId = payload.installation?.id;

  try {
    switch (event) {
      case "installation":
        if (!installationId) break;
        if (payload.action === "deleted" || payload.action === "suspend") await deactivateInstallation(installationId);
        else await syncInstallation(installationId);
        break;
      case "installation_repositories":
        if (!installationId) break;
        for (const r of payload.repositories_removed ?? []) await deactivateInstallation(installationId, r.full_name);
        if (payload.repositories_added?.length) await syncInstallation(installationId);
        break;
      case "repository":
        if (installationId && payload.repository?.default_branch) {
          await upsertInstallation(installationId, payload.repository.full_name, payload.repository.default_branch);
        }
        break;
      case "pull_request":
        if (["opened", "synchronize", "reopened"].includes(payload.action ?? "") && payload.pull_request && payload.repository) {
          const result = await startPullRequestCheck({
            fullName: payload.repository.full_name,
            prNumber: payload.pull_request.number,
            headSha: payload.pull_request.head.sha,
            headRef: payload.pull_request.head.ref,
          });
          return NextResponse.json({ ok: true, ...result });
        }
        break;
      case "check_run":
        if (payload.action === "rerequested" && payload.check_run?.pull_requests?.[0] && payload.repository) {
          const pr = payload.check_run.pull_requests[0];
          const result = await startPullRequestCheck({
            fullName: payload.repository.full_name,
            prNumber: pr.number,
            headSha: payload.check_run.head_sha,
            headRef: pr.head.ref,
          });
          return NextResponse.json({ ok: true, ...result });
        }
        break;
    }
  } catch (err) {
    console.error("[github webhook]", event, err);
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
