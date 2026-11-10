"use client";

import { useEffect, useState } from "react";

const STEPS = [
  { title: "Connect your store", blurb: "Sign in with GitHub, where your store's code lives, and pick the store. Add your free PayPal test account with our 2-minute guide." },
  { title: "Approve a plan in plain English", blurb: "Our AI reads your store and tells you what shoppers will see, what changes, and what stays the same. Nothing is written until you say yes." },
  { title: "Accept the tested change", blurb: "We build it and a robot shopper makes real PayPal test purchases. You get a report and a ready-made change to accept with one click." },
];

function ConnectMock() {
  return (
    <div className="mock">
      <p className="mock-kicker">GitHub · Choose a store to connect</p>
      {[
        ["tidepool-goods", "Next.js store · updated 2 hours ago", true],
        ["company-website", "Marketing site · updated last week", false],
        ["inventory-scripts", "Scripts · updated last month", false],
      ].map(([name, meta, on]) => (
        <div key={String(name)} className={`mock-row${on ? " on" : ""}`}>
          <span className="mock-check">{on ? "✓" : ""}</span>
          <div>
            <strong>{name}</strong>
            <div className="mock-meta">{meta}</div>
          </div>
        </div>
      ))}
      <div className="mock-btn">Connect</div>
    </div>
  );
}

function PlanMock() {
  return (
    <div className="mock">
      <p className="mock-kicker teal">The plan, explained by AI</p>
      <p className="mock-headline">Your cart page gets a PayPal button right next to card checkout.</p>
      <div className="mock-cols">
        <div>
          <strong>Shoppers will see</strong>
          <ul>
            <li>A PayPal button on the cart</li>
            <li>A &ldquo;Pay in 4&rdquo; message</li>
            <li>The same thank-you page</li>
          </ul>
        </div>
        <div>
          <strong>Stays the same</strong>
          <ul>
            <li>Card payments, untouched</li>
            <li>Your prices and products</li>
            <li>Your orders page</li>
          </ul>
        </div>
      </div>
      <div className="mock-actions">
        <span className="mock-btn">Looks good, build it</span>
        <span className="mock-btn ghost">No thanks</span>
      </div>
    </div>
  );
}

function AcceptMock() {
  return (
    <div className="mock gh">
      <p className="mock-kicker">GitHub · Proposed change</p>
      <p className="mock-headline">Add PayPal checkout (verified in the PayPal sandbox)</p>
      <div className="gh-check ok">
        <span className="gh-dot">✓</span>
        <div>
          <strong>PayPal checkout</strong>
          <div className="mock-meta">9 of 9 sandbox scenarios passed</div>
        </div>
      </div>
      <div className="gh-merge">Merge pull request</div>
      <p className="mock-meta">One click, then your site shows PayPal the next time it&apos;s published.</p>
    </div>
  );
}

const MOCKS = [ConnectMock, PlanMock, AcceptMock];

/** Clickable three-step walkthrough; advances on its own until the visitor picks a step. */
export function HowItWorks() {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 5200);
    return () => clearInterval(t);
  }, [auto]);

  const Mock = MOCKS[step];
  return (
    <div className="how">
      <div className="how-tabs" role="tablist" aria-label="How it works">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            role="tab"
            aria-selected={i === step}
            className={`how-tab${i === step ? " active" : ""}`}
            onClick={() => {
              setStep(i);
              setAuto(false);
            }}
          >
            <span className="how-num">{i + 1}</span>
            <span>
              <strong>{s.title}</strong>
              <span className="how-blurb">{s.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="how-panel" role="tabpanel" key={step}>
        <Mock />
      </div>
    </div>
  );
}
