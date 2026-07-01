export function HotspotCard({ ability, className = "", isOpen }) {
  return (
    <article
      className={`hotspot-card ${className} ${isOpen ? "is-visible" : ""}`}
      aria-hidden={!isOpen}
    >
      <p className="card-eyebrow">能力区</p>
      <h3>{ability.name}</h3>
      <p className="card-tagline">{ability.tagline}</p>
      <dl>
        <div>
          <dt>训练能力</dt>
          <dd>{ability.training}</dd>
        </div>
        <div>
          <dt>孩子会做</dt>
          <dd>{ability.childBuilds}</dd>
        </div>
        <div>
          <dt>最终产出</dt>
          <dd>{ability.output}</dd>
        </div>
      </dl>
    </article>
  );
}
