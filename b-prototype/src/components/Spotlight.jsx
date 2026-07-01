export function Spotlight() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="spotlight-beam spotlight-beam-main" />
      <div className="spotlight-beam spotlight-beam-soft" />
    </div>
  );
}
