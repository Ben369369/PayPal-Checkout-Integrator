"use client";

import { useEffect, useState } from "react";

const CHECKS = [
  "Buys one item",
  "Buys several items",
  "Closes PayPal halfway",
  "Payment declined",
  "Duplicate payment notice",
  "Fake payment notice",
  "Price changed in the browser",
  "Refund",
  "Card payments still work",
];

/**
 * Animated product preview: a store's cart gains a PayPal button, then the
 * nine test purchases tick through. Loops; static final frame for reduced motion.
 */
export function HeroDemo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTick(99);
      return;
    }
    const t = setInterval(() => setTick((n) => (n >= 17 ? 0 : n + 1)), 650);
    return () => clearInterval(t);
  }, []);

  const showPayPal = tick >= 2;
  const testing = tick >= 4;
  const passed = Math.max(0, Math.min(CHECKS.length, tick - 4));
  const done = passed === CHECKS.length;

  return (
    <div className="demo" aria-label="Preview: PayPal is added to a store's cart and tested with nine test purchases">
      {/* Photo by Unsplash (free under the Unsplash License): a small online seller packing an order. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="demo-photo" src="/bg/seller.webp" alt="A small online store owner packing an order next to her laptop" width={1400} height={885} />
      <div className="browser">
        <div className="browser-bar">
          <span />
          <span />
          <span />
          <div className="browser-url">yourstore.com/cart</div>
        </div>
        <div className="browser-body">
          <p className="demo-store">Tidepool Goods</p>
          <h4 className="demo-h">Your cart</h4>
          <div className="demo-line">
            <span>Canvas Tote</span>
            <span>$19.99</span>
          </div>
          <div className="demo-line">
            <span>Stoneware Mug Set × 2</span>
            <span>$69.00</span>
          </div>
          <div className="demo-line demo-total">
            <span>Subtotal</span>
            <span>$88.99</span>
          </div>
          <div className="demo-btn card">Pay with card</div>
          <div className={`demo-btn paypal${showPayPal ? " in" : ""}`} aria-hidden={!showPayPal}>
            <span className="pp-pay">Pay</span>
            <span className="pp-pal">Pal</span>
          </div>
          <p className={`demo-paylater${showPayPal ? " in" : ""}`}>Pay in 4 interest-free payments of $22.25</p>
        </div>
      </div>

      <div className={`checks-card${testing ? " in" : ""}`}>
        <p className="checks-title">{done ? "All test purchases passed" : "Testing with real test purchases…"}</p>
        <div className="checks-count">
          <strong>{passed}</strong> of {CHECKS.length}
        </div>
        <div className="checks-bar">
          <span style={{ width: `${(passed / CHECKS.length) * 100}%` }} />
        </div>
        <ul className="checks-list">
          {CHECKS.map((c, i) => (
            <li key={c} className={i < passed ? "ok" : i === passed && testing && !done ? "now" : undefined}>
              <span className="mark" aria-hidden>
                {i < passed ? "✓" : ""}
              </span>
              {c}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
