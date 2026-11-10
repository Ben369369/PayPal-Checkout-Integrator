"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Event = { id: number; at: string; message: string };
const DONE = new Set(["passed", "failed", "error", "skipped", "rejected"]);

/** Streams a run's progress by polling its events; refreshes the page when the status changes. */
export function LiveLog({ runId, initialStatus }: { runId: string; initialStatus: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/events?after=${last.current}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { status: string; events: Event[] };
          if (data.events.length) {
            last.current = data.events[data.events.length - 1].id;
            setEvents((prev) => [...prev, ...data.events]);
          }
          setStatus((prev) => {
            if (prev !== data.status) router.refresh();
            return data.status;
          });
          if (DONE.has(data.status) && !data.events.length) return;
        }
      } catch {
        /* retry */
      }
      if (!stopped) timer = setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [runId, router]);

  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [events]);

  return (
    <div className="log" ref={box} aria-live="polite" data-status={status}>
      {events.length === 0 && <span className="muted">Waiting for the worker…</span>}
      {events.map((e) => (
        <div key={e.id} className={e.message.startsWith("▶") ? "stage" : /✗|error|failed/i.test(e.message) ? "bad" : undefined}>
          <time>{new Date(e.at).toLocaleTimeString("en-US", { hour12: false })}</time>
          {e.message}
        </div>
      ))}
    </div>
  );
}
