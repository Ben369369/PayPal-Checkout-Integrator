"use client";

import { useState } from "react";
import { Icon, type IconName } from "./Icons";

const SCENARIOS = [
  { icon: "bag" as IconName, title: "A shopper buys one item", why: "The basic path: PayPal confirms the payment and your order is marked paid, exactly like a card order." },
  { icon: "cart" as IconName, title: "A shopper buys several items", why: "Quantities and prices add up to the cent, and PayPal's receipt lists the same items as your order." },
  { icon: "back" as IconName, title: "A shopper closes PayPal halfway", why: "No order is charged, and their cart is still there so they can try again or pay by card." },
  { icon: "declined" as IconName, title: "A payment is declined", why: "The shopper sees a clear message and nothing is marked paid by mistake." },
  { icon: "duplicate" as IconName, title: "PayPal sends a notice twice", why: "Your store counts the payment once. No double shipping, no double bookkeeping." },
  { icon: "shield" as IconName, title: "Someone sends a fake notice", why: "Notices that don't come from PayPal are rejected, so nobody can fake a payment." },
  { icon: "price" as IconName, title: "Someone edits the price in their browser", why: "Your store sets the price, never the shopper's browser. We try to pay one cent and make sure it fails." },
  { icon: "refund" as IconName, title: "You refund an order", why: "The money goes back through PayPal and the order shows refunded, same as a card refund." },
  { icon: "card" as IconName, title: "Card payments still work", why: "Your existing card checkout is untouched and keeps working, tested every time." },
];

/** The nine checks; each expands to say why it matters. */
export function ScenarioGrid() {
  const [open, setOpen] = useState<number | null>(6);
  return (
    <div className="scen-grid">
      {SCENARIOS.map((s, i) => (
        <button key={s.title} className={`scen${open === i ? " open" : ""}`} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
          <span className="scen-icon" aria-hidden>
            <Icon name={s.icon} />
          </span>
          <span className="scen-title">{s.title}</span>
          <span className="scen-why">{s.why}</span>
        </button>
      ))}
    </div>
  );
}
