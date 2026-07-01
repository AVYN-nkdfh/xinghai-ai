export function MobileAbilityCards({ abilities }) {
  return (
    <div className="mobile-ability-list" id="abilities">
      {abilities.map((ability) => {
        const Icon = ability.icon;

        return (
          <article className="mobile-ability-card" key={ability.id}>
            <div className="mobile-card-heading">
              <span className="mobile-card-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={1.9} />
              </span>
              <h3>{ability.name}</h3>
            </div>
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
      })}
    </div>
  );
}
