import type { CSSProperties } from "react";
import type { ScenarioRow } from "@paypal-checkout-integrator/shared";
import { Icon, type IconName } from "@/components/landing/Icons";
import { PLAIN_SCENARIOS } from "@/lib/plain";

/** Donut showing passed out of total; draws itself in on load. */
export function ScoreRing({ passed, total, label = "passed", size = 136 }: { passed: number; total: number; label?: string; size?: number }) {
  const c = 2 * Math.PI * 52;
  const off = total ? c * (1 - passed / total) : c;
  const ok = total > 0 && passed === total;
  return (
    <div className={`ring ${ok ? "ok" : "bad"}`} style={{ width: size, height: size }} role="img" aria-label={`${passed} of ${total} ${label}`}>
      <svg viewBox="0 0 120 120" aria-hidden>
        <circle className="ring-track" cx="60" cy="60" r="52" />
        <circle
          className="ring-fill"
          cx="60"
          cy="60"
          r="52"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 60 60)"
          style={{ "--c": c } as CSSProperties}
        />
      </svg>
      <div className="ring-text">
        <strong>
          {passed}
          <span>/{total}</span>
        </strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

export type TrackerStep = { key: string; label: string; icon: IconName };

/** Horizontal step tracker: done steps get a check, the current one pulses. */
export function Tracker({ steps, current, stopped }: { steps: readonly TrackerStep[]; current: number; stopped?: boolean }) {
  return (
    <ol className="tracker" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? (stopped ? "stopped" : "current") : "todo";
        return (
          <li key={s.key} className={state} aria-current={state === "current" ? "step" : undefined}>
            <span className="tracker-dot">
              <Icon name={state === "done" ? "check" : state === "stopped" ? "x" : s.icon} size={18} />
            </span>
            <span className="tracker-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const SCENARIO_ICONS: Record<number, IconName> = {
  1: "bag",
  2: "cart",
  3: "back",
  4: "declined",
  5: "duplicate",
  6: "shield",
  7: "price",
  8: "refund",
  9: "card",
};

/** The scenario results as a grid of tiles, one per test purchase. */
export function ScenarioTiles({ rows, developer, traceBase }: { rows: ScenarioRow[]; developer?: boolean; traceBase?: string }) {
  return (
    <div className="tiles">
      {rows.map((s, i) => {
        const failed = s.checks.filter((c) => !c.pass);
        const state = s.status === "pass" ? "ok" : s.status === "skipped" ? "skip" : "bad";
        const plain = PLAIN_SCENARIOS[s.scenario] ?? s.name;
        return (
          <div key={s.scenario} className={`tile ${state}`} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="tile-head">
              <span className="tile-icon">
                <Icon name={SCENARIO_ICONS[s.scenario] ?? "check"} size={22} />
              </span>
              <span className="tile-mark" aria-label={s.status}>
                <Icon name={state === "ok" ? "check" : state === "skip" ? "arrow" : "x"} size={14} />
              </span>
            </div>
            <p className="tile-title">{developer ? s.name : plain}</p>
            {developer && <p className="tile-sub">{plain}</p>}
            {(failed.length > 0 || s.error) && state === "bad" && <p className="tile-fail">{s.error ?? failed.map((c) => c.name).join("; ")}</p>}
            {state === "skip" && s.notes?.[0] && <p className="tile-sub">{s.notes[0]}</p>}
            <div className="tile-foot">
              <span>
                {s.checks.filter((c) => c.pass).length} of {s.checks.length} checks
              </span>
              <span className="tile-links">
                {s.video_url && (
                  <a href={s.video_url}>
                    <Icon name="play" size={12} /> Video
                  </a>
                )}
                {developer && s.trace_url && traceBase && <a href={`https://trace.playwright.dev/?trace=${encodeURIComponent(`${traceBase}${s.trace_url}`)}`}>Trace</a>}
              </span>
            </div>
            {developer && s.paypal_order_id && <code className="tile-order">{s.paypal_order_id}</code>}
          </div>
        );
      })}
    </div>
  );
}

/** A small drawing of the owner's store: card button always, PayPal button once added. */
export function StoreMock({ name, hasPayPal, compact }: { name: string; hasPayPal: boolean; compact?: boolean }) {
  return (
    <div className={`store-mock${compact ? " compact" : ""}`} aria-hidden>
      <div className="browser-bar">
        <span />
        <span />
        <span />
        <div className="browser-url">{name.toLowerCase()}.com/cart</div>
      </div>
      <div className="sm-body">
        <div className="sm-line">
          <i style={{ width: "46%" }} />
          <i style={{ width: "14%" }} />
        </div>
        <div className="sm-line">
          <i style={{ width: "36%" }} />
          <i style={{ width: "12%" }} />
        </div>
        <div className="sm-btn card">Pay with card</div>
        {hasPayPal ? (
          <div className="sm-btn paypal">
            <span className="pp-pay">Pay</span>
            <span className="pp-pal">Pal</span>
          </div>
        ) : (
          <div className="sm-btn slot">
            <Icon name="plus" size={14} /> PayPal goes here
          </div>
        )}
      </div>
    </div>
  );
}

/** Animated "we're on it" panel for a stage that is still running. */
export function Working({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="working">
      <div className="working-orb">
        <Icon name={icon} size={30} />
      </div>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

/** Small status label with an icon; rectangular, colour by meaning. */
export function Badge({ status, children }: { status: string; children: React.ReactNode }) {
  const tone = ["passed", "pass"].includes(status) ? "ok" : ["failed", "fail", "error", "rejected"].includes(status) ? "bad" : ["queued", "running", "awaiting_approval"].includes(status) ? "wait" : "neutral";
  const icon: IconName = tone === "ok" ? "check" : tone === "bad" ? "x" : tone === "wait" ? "clock" : "pulse";
  return (
    <span className={`badge ${tone}`}>
      <Icon name={icon} size={13} /> {children}
    </span>
  );
}
