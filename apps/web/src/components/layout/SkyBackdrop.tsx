import type { CSSProperties } from "react";

/** A puffy cloud: overlapping circles on a flat base, white on top with a faint sky shadow underneath. */
function Cloud({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 260 100" className="cloud-bob size-full" aria-hidden>
      <defs>
        <linearGradient id={`cloud-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dcecfb" />
        </linearGradient>
      </defs>
      <g fill={`url(#cloud-${id})`}>
        <circle cx="70" cy="62" r="30" />
        <circle cx="112" cy="44" r="38" />
        <circle cx="160" cy="52" r="32" />
        <circle cx="198" cy="66" r="24" />
        <circle cx="40" cy="74" r="20" />
        <rect x="40" y="62" width="182" height="32" rx="16" />
      </g>
    </svg>
  );
}

// Each cloud: width, vertical position, opacity, blur, drift duration and a negative delay so the sky starts populated.
const CLOUDS = [
  { w: 460, top: "6%", o: 0.9, b: 0, d: 160, delay: -20 },
  { w: 300, top: "18%", o: 0.75, b: 1, d: 210, delay: -120 },
  { w: 560, top: "38%", o: 0.55, b: 2, d: 260, delay: -60 },
  { w: 240, top: "54%", o: 0.6, b: 1, d: 190, delay: -150 },
  { w: 380, top: "72%", o: 0.45, b: 3, d: 240, delay: -200 },
  { w: 200, top: "10%", o: 0.65, b: 1, d: 180, delay: -95 },
] as const;

/** Soft clouds drifting across a sky-blue backdrop behind every page. Purely decorative; stills under reduced motion. */
export function SkyBackdrop() {
  return (
    <div className="sky-layer" aria-hidden data-print-hide>
      <div className="absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(70%_80%_at_80%_0%,rgba(125,211,252,0.35),transparent_70%)]" />
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="cloud"
          style={{ top: c.top, "--w": `${c.w}px`, "--o": c.o, "--b": `${c.b}px`, "--d": `${c.d}s`, "--delay": `${c.delay}s` } as CSSProperties}
        >
          <Cloud id={String(i)} />
        </div>
      ))}
    </div>
  );
}
