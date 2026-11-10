import Link from "next/link";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <>
      <p className="kicker">404</p>
      <h1>This page doesn&apos;t exist</h1>
      <p className="finding">The run, repository, or page you followed isn&apos;t here. It may have been removed, or the link is mistyped.</p>
      <div className="actions">
        <Link className="btn" href="/">
          Go to repositories
        </Link>
        <Link className="btn secondary" href="/runs">
          See all runs
        </Link>
      </div>
    </>
  );
}
