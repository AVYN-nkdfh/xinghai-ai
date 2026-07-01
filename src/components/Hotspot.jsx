import { HotspotCard } from "./HotspotCard.jsx";

export function Hotspot({
  ability,
  index,
  isActive,
  isPreviewed,
  onActivate,
  onPreviewStart,
  onPreviewEnd,
}) {
  const Icon = ability.icon;
  const isOpen = isActive || isPreviewed;
  const alignClass = ability.x > 70 ? "hotspot-card-right" : "hotspot-card-left";

  return (
    <div
      className={`hotspot ${isOpen ? "is-open" : ""}`}
      style={{
        left: `${ability.x}%`,
        top: `${ability.y}%`,
        "--hotspot-delay": `${0.75 + index * 0.14}s`,
      }}
      onMouseEnter={onPreviewStart}
      onMouseLeave={onPreviewEnd}
    >
      <button
        className="hotspot-button"
        type="button"
        aria-label={`查看${ability.name}`}
        aria-expanded={isOpen}
        onClick={onActivate}
        onFocus={onPreviewStart}
        onBlur={onPreviewEnd}
      >
        <span className="hotspot-pulse" aria-hidden="true" />
        <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
      </button>
      <HotspotCard ability={ability} className={alignClass} isOpen={isOpen} />
    </div>
  );
}
