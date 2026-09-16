export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`} aria-label="Biddly">
      <span className="brand-monogram">B</span>
      {!compact ? <span className="brand-word">Biddly</span> : null}
    </div>
  );
}
