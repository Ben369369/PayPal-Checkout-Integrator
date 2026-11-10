import { PLAIN_SCENARIOS } from "@/lib/plain";

/** Public front page for store owners (signed out). */
export function Landing({ reportUrl, error }: { reportUrl: string | null; error?: string }) {
  return (
    <>
      <section className="hero">
        <p className="kicker">For owners of custom-built online stores</p>
        <h1>Add PayPal to your store, without touching code</h1>
        <p className="finding">
          Your store was built by a freelancer, an agency, or an AI site builder. We add PayPal checkout next to your card payments, test it with real PayPal test
          purchases, and hand you the finished change to accept. Nothing changes until you say yes.
        </p>
        {error && <p className="fail">Sign-in didn&apos;t work. Please try again.</p>}
        <div className="actions">
          <a className="btn" href="/api/auth/login">
            Sign in with GitHub
          </a>
          {reportUrl && (
            <a className="btn secondary" href={reportUrl}>
              See a real test report
            </a>
          )}
        </div>
      </section>

      <section className="section" id="how">
        <p className="kicker">How it works</p>
        <div className="big-number">
          9 <span className="of">real test purchases before you accept anything</span>
        </div>
        <div className="grid-3" style={{ marginTop: 28 }}>
          <div className="item best">
            <h3>1. Connect your store</h3>
            <p>Sign in with GitHub, where your store&apos;s code lives, and choose the store. Then paste your free PayPal test-account details; we show you exactly where to find them.</p>
          </div>
          <div className="item">
            <h3>2. Approve a plan in plain English</h3>
            <p>Our AI reads your store and explains what it will add, what your customers will see, and what stays the same. You decide before anything is written.</p>
          </div>
          <div className="item">
            <h3>3. Accept the tested change</h3>
            <p>We build it, then a robot shopper makes real PayPal test purchases. You get a report and a ready-made change to accept on GitHub. It goes live the next time your site is published.</p>
          </div>
        </div>
        <p className="lede" style={{ marginTop: 20 }}>
          After that, every future change to your store is re-tested with PayPal before it goes live, so nobody breaks your checkout by accident.
        </p>
      </section>

      <section className="section">
        <h2>What every test run checks</h2>
        <div className="grid-2">
          <ol className="plain-list">
            {Object.values(PLAIN_SCENARIOS).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <dl className="details">
            <dt>Money</dt>
            <dd>PayPal&apos;s test mode only: no real money moves during testing.</dd>
            <dt>Your card payments</dt>
            <dd>Never modified. We test that they still work.</dd>
            <dt>Who decides</dt>
            <dd>You approve the plan and accept the change. Pass or fail comes from PayPal&apos;s own records, not from the AI.</dd>
          </dl>
        </div>
      </section>

      <section className="section" id="who">
        <h2>Who it&apos;s for</h2>
        <div className="grid-2">
          <div className="item best">
            <h3>A good fit</h3>
            <ul className="plain-list">
              <li>Your store&apos;s code is on GitHub (built by a developer, agency, or AI builder).</li>
              <li>You take card payments with Stripe and want to offer PayPal too.</li>
              <li>Today we support stores built with Next.js and Prisma. More are coming.</li>
            </ul>
          </div>
          <div className="item">
            <h3>Not needed</h3>
            <ul className="plain-list">
              <li>Shopify, Wix, Squarespace, and similar: PayPal is already a setting there.</li>
            </ul>
            <p className="small muted">Developers can switch to the Developer view at any time for the full technical detail: plans, file changes, test evidence, and logs.</p>
          </div>
        </div>
      </section>
    </>
  );
}
