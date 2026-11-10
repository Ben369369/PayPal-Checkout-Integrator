/** Simple 24px line icons in the brand navy (stroke = currentColor). */
const PATHS: Record<string, string> = {
  bag: "M6 7h12l-1 13H7L6 7Z M9 7a3 3 0 0 1 6 0",
  cart: "M3 4h2l2.4 11h10.2L20 8H6.4 M9 20h.01 M17 20h.01",
  back: "M9 7 4 12l5 5 M4 12h11a5 5 0 0 1 0 10h-2",
  declined: "M3 6h18v12H3z M3 10h18 M15 14l4 4 M19 14l-4 4",
  duplicate: "M8 8h11v11H8z M5 16V5h11",
  shield: "M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z M9.5 12.5l2 2 3.5-4",
  price: "M3 12V4h8l10 10-8 8L3 12Z M7.5 8.5h.01",
  refund: "M4 9a8 8 0 0 1 14-3l2 2 M20 4v4h-4 M20 15a8 8 0 0 1-14 3l-2-2 M4 20v-4h4",
  card: "M3 6h18v12H3z M3 10h18 M7 15h4",
  github: "M12 3a9 9 0 0 0-3 17.5c.5.1.6-.2.6-.5v-1.7c-2.5.5-3-1.1-3-1.1-.4-1-1-1.3-1-1.3-.8-.6.1-.6.1-.6.9.1 1.4 1 1.4 1 .8 1.4 2.2 1 2.7.8.1-.6.3-1 .6-1.2-2-.2-4.1-1-4.1-4.4 0-1 .4-1.8 1-2.4-.1-.3-.4-1.2.1-2.4 0 0 .8-.3 2.5.9a8.6 8.6 0 0 1 4.6 0c1.7-1.2 2.5-.9 2.5-.9.5 1.2.2 2.1.1 2.4.6.6 1 1.4 1 2.4 0 3.4-2.1 4.2-4.1 4.4.3.3.6.8.6 1.6v2.4c0 .3.2.6.6.5A9 9 0 0 0 12 3Z",
  spark: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M6 18l2.5-2.5 M15.5 8.5 18 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M12 7v5l3 2",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
};

export function Icon({ name, size = 24 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export type IconName = keyof typeof PATHS;
