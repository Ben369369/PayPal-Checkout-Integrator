import { HeroDemo } from "./landing/HeroDemo";
import { HowItWorks } from "./landing/HowItWorks";
import { Icon, type IconName } from "./landing/Icons";
import { ScenarioGrid } from "./landing/ScenarioGrid";

const FAQ = [
  ["Do I need to know how to code?", "No. You sign in, click a button, read a plain-English plan, and approve it. When the tests pass, you accept the change on GitHub with one click. Whoever publishes your website just publishes it as usual."],
  ["Is my money or my customers' money at risk?", "No. Everything runs in PayPal's test mode (the sandbox), where no real money moves. Your card payments are never modified, and we test that they still work."],
  ["What if the AI gets something wrong?", "The AI writes the code, but it never decides whether it works. A robot shopper makes nine real test purchases and PayPal's own records decide pass or fail. If something fails, the AI gets the exact evidence and fixes it before you see anything."],
  ["Which stores does it work with?", "Custom-built stores whose code is on GitHub and take card payments with Stripe. Today we support stores built with Next.js and Prisma, the most common setup for AI-built and agency-built shops. Shopify, Wix, and Squarespace already have PayPal built in."],
  ["What happens after PayPal is added?", "Every future change to your store is re-tested with PayPal test purchases before it goes live. If a change would break checkout, you see a red warning on GitHub with a plain explanation."],
];

/** Public front page for store owners (signed out). */
export const SOURCE_URL = "https://github.com/Ben369369/PayPal-Checkout-Integrator";

type LandingProps = {
  reportUrl: string | null;
  videoUrl: string | null;
  prUrl: string | null;
  caughtReportUrl: string | null;
  caughtPrUrl: string | null;
  robotOnline: boolean;
  error?: string;
};

/** "See it working in 60 seconds": direct links to real evidence, no install needed. */
function ProofPanel({ reportUrl, prUrl, caughtReportUrl, caughtPrUrl, robotOnline }: Omit<LandingProps, "videoUrl" | "error">) {
  const cards: { icon: IconName; title: string; text: string; href: string | null; cta: string }[] = [
    { icon: "receipt", title: "A real test report", text: "Nine test purchases, PayPal's own record of each one, the video, and Stripe side by side.", href: reportUrl, cta: "Open the report" },
    { icon: "github", title: "The change it handed over", text: "The pull request it opened on our demo store, with the green PayPal checkout check.", href: prUrl, cta: "Open on GitHub" },
    { icon: "shield", title: "A bug it caught", text: "A later change would have let a shopper pay one cent for $129. The check went red and explained why.", href: caughtPrUrl ?? caughtReportUrl, cta: "See the red check" },
    { icon: "code", title: "The source code", text: "Open source: the agent, the test robot, the GitHub App, and this site.", href: SOURCE_URL, cta: "View on GitHub" },
  ];
  return (
    <section className="lp-proof-panel" id="proof">
      <div className="lp-proof-head">
        <div>
          <p className="kicker">See it working in 60 seconds</p>
          <h2 className="lp-h2">Real evidence, no install needed</h2>
        </div>
        <p className={`robot-status${robotOnline ? " on" : ""}`}>
          <span className="robot-dot" aria-hidden /> Test robot {robotOnline ? "online now" : "offline right now (requests wait in line)"}
        </p>
      </div>
      <div className="lp-proof-cards">
        {cards.map((c) =>
          c.href ? (
            <a key={c.title} className="lp-proof-card" href={c.href}>
              <span className="lp-proof-icon">
                <Icon name={c.icon} size={22} />
              </span>
              <strong>{c.title}</strong>
              <span className="lp-proof-text">{c.text}</span>
              <span className="lp-proof-cta">
                {c.cta} <Icon name="arrow" size={14} />
              </span>
            </a>
          ) : null,
        )}
      </div>
      {caughtReportUrl && caughtPrUrl && (
        <p className="small muted" style={{ marginTop: 12 }}>
          Prefer a plain page to GitHub? Here is the <a href={caughtReportUrl}>report for the caught bug</a>.
        </p>
      )}
    </section>
  );
}

export function Landing({ reportUrl, videoUrl, prUrl, caughtReportUrl, caughtPrUrl, robotOnline, error }: LandingProps) {
  return (
    <div className="landing">
      {/* Hero ------------------------------------------------------------ */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <p className="kicker">For owners of custom-built online stores</p>
          <h1>Add PayPal to your store. Without touching code.</h1>
          <p className="lp-sub">
            Your store was built by a freelancer, an agency, or an AI site builder. We add PayPal checkout next to your card payments, prove it works with real test purchases, and hand you
            the finished change to accept.
          </p>
          {error && <p className="fail">Sign-in didn&apos;t work. Please try again.</p>}
          <div className="actions">
            <a className="btn btn-lg" href="/api/auth/login">
              <Icon name="github" size={18} /> Start free with GitHub
            </a>
            {reportUrl && (
              <a className="btn btn-lg secondary" href={reportUrl}>
                See a real test report
              </a>
            )}
          </div>
          <ul className="lp-proof">
            <li>
              <Icon name="clock" size={18} /> About 30 minutes, start to finish
            </li>
            <li>
              <Icon name="lock" size={18} /> Test mode only. No real money moves
            </li>
            <li>
              <Icon name="card" size={18} /> Card payments never touched
            </li>
          </ul>
        </div>
        <HeroDemo />
      </section>

      <ProofPanel reportUrl={reportUrl} prUrl={prUrl} caughtReportUrl={caughtReportUrl} caughtPrUrl={caughtPrUrl} robotOnline={robotOnline} />

      {/* Numbers --------------------------------------------------------- */}
      <section className="lp-stats">
        <div>
          <div className="big-number">9</div>
          <p>real test purchases before you accept anything</p>
        </div>
        <div>
          <div className="big-number">0</div>
          <p>lines of code you write or read</p>
        </div>
        <div>
          <div className="big-number">1</div>
          <p>click to accept the finished change</p>
        </div>
        <div>
          <div className="big-number">∞</div>
          <p>future changes re-tested automatically</p>
        </div>
      </section>

      {/* How it works ---------------------------------------------------- */}
      <section className="lp-section" id="how">
        <p className="kicker">How it works</p>
        <h2 className="lp-h2">Three steps. You stay in control of each one.</h2>
        <HowItWorks />
      </section>

      {/* Real video ------------------------------------------------------ */}
      {videoUrl && (
        <section className="lp-section lp-tint">
          <div className="lp-split">
            <div>
              <p className="kicker">Not a mock-up</p>
              <h2 className="lp-h2">Watch our robot shopper buy from a real store</h2>
              <p className="lp-sub">
                This is an actual recording from a test run: the shopper adds items to the cart, checks out with PayPal&apos;s test mode, and lands on the thank-you page. PayPal&apos;s own
                records then confirm the payment, to the cent.
              </p>
              {reportUrl && (
                <a className="text-link" href={reportUrl}>
                  Open the full test report →
                </a>
              )}
            </div>
            <div className="video-frame">
              {/* Start a few seconds in so the first frame shows the store, not a blank page load. */}
              <video src={`${videoUrl}#t=4`} controls muted playsInline preload="metadata" />
            </div>
          </div>
        </section>
      )}

      {/* What we test ---------------------------------------------------- */}
      <section className="lp-section">
        <p className="kicker">What every test run checks</p>
        <h2 className="lp-h2">Nine things that go wrong with real payments. We try them all.</h2>
        <p className="lp-sub">Click any one to see why it matters.</p>
        <ScenarioGrid />
      </section>

      {/* Stay protected -------------------------------------------------- */}
      <section className="lp-section lp-tint">
        <div className="lp-split">
          <div>
            <p className="kicker">After you go live</p>
            <h2 className="lp-h2">Nobody breaks your checkout by accident</h2>
            <p className="lp-sub">
              Every future change to your store gets re-tested with PayPal before it goes live. In one of our tests, a well-meaning change would have let a shopper pay one cent for a
              $129 blanket. It was caught before anyone accepted it.
            </p>
          </div>
          <div className="mock gh lp-protect">
            <p className="mock-kicker">GitHub · Proposed change #3</p>
            <p className="mock-headline">Checkout: show PayPal the total from the cart page</p>
            <div className="gh-check bad">
              <span className="gh-dot">✕</span>
              <div>
                <strong>PayPal checkout</strong>
                <div className="mock-meta">7 of 9 sandbox scenarios passed</div>
              </div>
            </div>
            <div className="gh-comment">
              <strong>PayPal Checkout Integrator</strong>
              <p>
                A shopper could pay <mark>one cent for a $129 order</mark>, so this change should not be accepted yet. Ask the person who made it to let the store set the price.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for ---------------------------------------------------- */}
      <section className="lp-section" id="who">
        <p className="kicker">Who it&apos;s for</p>
        <h2 className="lp-h2">Made for store owners, with a Developer view for the technical folks</h2>
        <div className="lp-cards">
          <div className="lp-card best">
            <Icon name="bag" />
            <h3>Store owners</h3>
            <p>Plain English throughout: what we&apos;ll change, what your shoppers will see, and what to do next. No jargon, no code.</p>
          </div>
          <div className="lp-card">
            <Icon name="github" />
            <h3>Agencies and freelancers</h3>
            <p>Add PayPal to client stores in an afternoon, with a test report you can hand the client as proof.</p>
          </div>
          <div className="lp-card">
            <Icon name="spark" />
            <h3>Developers</h3>
            <p>Switch to the Developer view for the plan, every changed file, the test evidence, and live logs. Built on PayPal&apos;s official SDKs.</p>
          </div>
        </div>
      </section>

      {/* FAQ --------------------------------------------------------------- */}
      <section className="lp-section">
        <p className="kicker">Questions</p>
        <h2 className="lp-h2">Good questions, straight answers</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA ------------------------------------------------------- */}
      <section className="lp-cta">
        <h2>Ready to offer PayPal?</h2>
        <p>Connect your store and see the plan in a few minutes. Nothing changes until you approve it.</p>
        <a className="btn btn-lg btn-light" href="/api/auth/login">
          <Icon name="github" size={18} /> Start free with GitHub
        </a>
        <p className="lp-cta-small">Built with PayPal&apos;s official SDKs, APIMatic, and Claude. A Chui Labs product.</p>
      </section>
    </div>
  );
}
