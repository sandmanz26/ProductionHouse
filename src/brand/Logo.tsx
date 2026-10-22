import { BRAND } from "./brand";

/**
 * The mark is a dovetail joint seen from the face: two boards that only hold because each cut
 * was measured. Upper board in the accent (jati), lower board at reduced strength so the
 * joint reads at 16 px. Kept to straight lines so it survives print and small sizes.
 */
export function LogoMark({ className = "size-6", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M4 4H28V14H24L26 22H18L20 14H12L14 22H6L8 14H4Z" fill="currentColor" />
      <path d="M4 14H8L6 22H14L12 14H20L18 22H26L24 14H28V28H4Z" fill="currentColor" opacity="0.38" />
    </svg>
  );
}

/** Mark + lowercase name, set in the display serif. */
export function Wordmark({ className = "", size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className={`${lg ? "size-8" : "size-[22px]"} shrink-0 text-accent`} />
      <span className={`font-display font-semibold tracking-[-0.02em] ${lg ? "text-[28px] leading-none" : "text-[19px] leading-none"}`}>
        {BRAND.name.toLowerCase()}
      </span>
    </span>
  );
}

/**
 * End-grain rings, the one decorative device the product allows itself. Used on the welcome
 * panel and the not-found page only — never behind data.
 */
export function GrainRings({ className = "" }: { className?: string }) {
  const rings = [18, 34, 52, 68, 88, 104, 126, 146, 170, 192, 218, 244, 272];
  return (
    <svg viewBox="0 0 600 600" className={className} aria-hidden="true" fill="none">
      <g stroke="currentColor" strokeWidth="1.25">
        {rings.map((r, i) => (
          // Slightly eccentric ellipses: real growth rings are never concentric.
          <ellipse key={r} cx={300 + i * 3.2} cy={300 - i * 1.6} rx={r * 1.08} ry={r} transform={`rotate(${-8 + i * 0.9} 300 300)`} />
        ))}
        <path d="M300 300 L590 214" strokeWidth="1" opacity="0.6" />
        <path d="M300 300 L478 588" strokeWidth="1" opacity="0.45" />
      </g>
    </svg>
  );
}
