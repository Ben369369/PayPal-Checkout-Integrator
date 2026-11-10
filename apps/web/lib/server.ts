import "server-only";
import { migrate } from "@paypal-checkout-integrator/shared";

let ready: Promise<void> | null = null;

/** Runs the idempotent schema setup once per server process. */
export function ensureDb(): Promise<void> {
  ready ??= migrate().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export function publicUrl(): string {
  return (process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
}

export function duration(start: Date | string | null, end: Date | string | null): string {
  if (!start) return "";
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return m ? `${m} min ${s} s` : `${s} s`;
}
