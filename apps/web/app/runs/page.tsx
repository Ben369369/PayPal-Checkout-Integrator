import Link from "next/link";
import { listRuns } from "@paypal-checkout-integrator/shared";
import { requireUser, userStores } from "@/lib/auth";
import { kindLabel, Status } from "@/components/Status";
import { duration, ensureDb, formatDate } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs" };

export default async function RunsPage() {
  await ensureDb();
  const user = await requireUser("/runs");
  const installations = await userStores(user);
  const repoName = new Map(installations.map((i) => [i.id, i.repo_full_name]));
  const runs = (await listRuns(undefined, 200)).filter((r) => repoName.has(r.installation_id));
  const finished = runs.filter((r) => ["passed", "failed"].includes(r.status));
  const passed = finished.filter((r) => r.status === "passed").length;

  return (
    <>
      <p className="kicker">Runs</p>
      <h1>Every integration and PR check</h1>
      <div className="big-number">
        {passed} <span className="of">of {finished.length} finished runs passed</span>
      </div>
      <section className="section">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Repository</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Stage</th>
                <th className="num">Scenarios</th>
                <th className="num">Took</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const s = r.summary as { passed?: number; total?: number } | null;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/runs/${r.id}`}>{formatDate(r.created_at)}</Link>
                    </td>
                    <td>{repoName.get(r.installation_id) ?? ""}</td>
                    <td>
                      {kindLabel(r.kind)}
                      {r.pr_number ? ` #${r.pr_number}` : ""}
                    </td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td className="muted">{r.stage ?? ""}</td>
                    <td className="num">{s?.total ? `${s.passed} of ${s.total}` : ""}</td>
                    <td className="num muted">{duration(r.started_at, r.finished_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {runs.length === 0 && <p className="muted">No runs yet.</p>}
      </section>
    </>
  );
}
