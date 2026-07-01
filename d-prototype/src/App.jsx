import { ArrowDown, CalendarCheck, ChevronRight, Play, Sparkles } from "lucide-react";
import {
  abilities,
  assetSlots,
  faqs,
  heroBadges,
  journey,
  navItems,
  outputs,
  proofPoints,
} from "./data/siteContent.js";

function Nav() {
  return (
    <header className="site-nav" aria-label="星海计划导航">
      <a className="brand-mark" href="#top" aria-label="回到顶部">
        <span className="brand-orb" aria-hidden="true" />
        <span>AI的朋友</span>
      </a>
      <nav className="nav-links" aria-label="页面导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a key={item.href} href={item.href}>
              {Icon ? <Icon size={16} strokeWidth={1.8} /> : null}
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
    </header>
  );
}

function OrbitalBackdrop() {
  return (
    <div className="orbital-backdrop" aria-hidden="true">
      <div className="hero-media-fallback">
        <div className="stellar-field" />
        <div className="planet-core" />
        <div className="planet-ring ring-one" />
        <div className="planet-ring ring-two" />
        <div className="planet-ring ring-three" />
        <div className="city-lights" />
      </div>
      <video
        className="hero-video"
        autoPlay
        muted
        loop
        playsInline
        poster={assetSlots.heroPoster}
        aria-hidden="true"
      >
        <source src={assetSlots.heroVideo} type="video/mp4" />
      </video>
      <div className="hero-texture" />
      <div className="hero-vignette" />
    </div>
  );
}

function AbilityNode({ ability }) {
  const Icon = ability.icon;
  return (
    <button
      className="ability-node"
      style={{
        "--node-x": `${ability.coordinates.x}%`,
        "--node-y": `${ability.coordinates.y}%`,
        "--node-accent": ability.accent,
        "--node-delay": `${ability.orbit * 120}ms`,
      }}
      type="button"
      aria-label={`${ability.name}：${ability.tagline}`}
    >
      <span className="node-pulse" aria-hidden="true" />
      <span className="node-icon">
        <Icon size={22} strokeWidth={1.8} />
      </span>
      <span className="node-card">
        <strong>{ability.name}</strong>
        <em>{ability.tagline}</em>
        <small>{ability.output}</small>
      </span>
    </button>
  );
}

function AssetLayer({ src }) {
  return <div className="asset-layer" style={{ "--asset-image": `url(${src})` }} />;
}

function Hero() {
  return (
    <section className="hero-section" id="top" aria-labelledby="hero-title">
      <OrbitalBackdrop />
      <Nav />

      <div className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={16} strokeWidth={1.8} />
            少年 AI 创造者黑客营
          </div>
          <h1 id="hero-title">AI的朋友 · 星海计划</h1>
          <p className="hero-lead">
            不是学几个 AI 工具，而是进入一颗未来创造星球，把商业、代码、创造、表达与个人 IP
            训练成孩子自己的作品能力。
          </p>
          <div className="hero-actions" aria-label="首屏行动">
            <a className="action-primary" href="#assessment">
              <CalendarCheck size={18} strokeWidth={1.8} />
              预约 1V1 项目评估
            </a>
            <a className="action-secondary" href="#abilities">
              <ArrowDown size={18} strokeWidth={1.8} />
              探索五大能力星图
            </a>
          </div>
          <div className="hero-badges" aria-label="项目特点">
            {heroBadges.map((badge) => (
              <span key={badge.label}>
                <strong>{badge.label}</strong>
                <small>{badge.value}</small>
              </span>
            ))}
          </div>
        </div>

        <div className="orbit-stage" aria-label="五大能力星图">
          <div className="orbit-halo halo-one" aria-hidden="true" />
          <div className="orbit-halo halo-two" aria-hidden="true" />
          <div className="orbit-halo halo-three" aria-hidden="true" />
          <div className="orbit-core">
            <span>星海</span>
            <small>AI 创造星球</small>
          </div>
          {abilities.map((ability) => (
            <AbilityNode key={ability.id} ability={ability} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DifferenceSection() {
  return (
    <section className="section difference-section" aria-labelledby="difference-title">
      <div className="section-kicker">不是工具课</div>
      <div className="section-heading">
        <h2 id="difference-title">从“会用 AI”到“能做作品”</h2>
        <p>
          星海计划把 AI 学习放进真实项目里。孩子不是记工具按钮，而是学会提出想法、组织内容、
          做出原型、完成表达，并把作品发布出来。
        </p>
      </div>
      <div className="proof-grid">
        {proofPoints.map((point) => {
          const Icon = point.icon;
          return (
            <article className="glass-card proof-card" key={point.title}>
              <Icon size={24} strokeWidth={1.7} />
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AbilitiesSection() {
  return (
    <section className="section abilities-section" id="abilities" aria-labelledby="abilities-title">
      <div className="section-kicker">五大能力区</div>
      <div className="section-heading wide">
        <h2 id="abilities-title">每个孩子都从一张能力星图开始</h2>
        <p>
          五大能力区不是独立课程，而是一个项目从想法到发布需要经历的完整训练系统。
        </p>
      </div>
      <div className="ability-bento">
        {abilities.map((ability, index) => {
          const Icon = ability.icon;
          return (
            <article
              className={`ability-card ability-card-${index + 1}`}
              key={ability.id}
              style={{ "--card-accent": ability.accent }}
            >
              <div className="ability-media" aria-hidden="true">
                <AssetLayer src={ability.image} />
                <div className="media-fallback" />
              </div>
              <div className="ability-content">
                <span className="ability-icon">
                  <Icon size={22} strokeWidth={1.8} />
                </span>
                <h3>{ability.name}</h3>
                <p>{ability.tagline}</p>
                <dl>
                  <div>
                    <dt>训练</dt>
                    <dd>{ability.training}</dd>
                  </div>
                  <div>
                    <dt>孩子会做</dt>
                    <dd>{ability.childBuilds}</dd>
                  </div>
                  <div>
                    <dt>产出</dt>
                    <dd>{ability.output}</dd>
                  </div>
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function JourneySection() {
  return (
    <section className="section journey-section" id="journey" aria-labelledby="journey-title">
      <div className="section-kicker">项目路径</div>
      <div className="section-heading">
        <h2 id="journey-title">一次项目，走完整个创造闭环</h2>
        <p>我们把抽象能力变成可见路径，让孩子知道每一步为什么做、做完能得到什么。</p>
      </div>
      <div className="journey-track">
        {journey.map((item) => (
          <article className="journey-step" key={item.step}>
            <span>{item.step}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function OutputsSection() {
  return (
    <section className="section outputs-section" id="outputs" aria-labelledby="outputs-title">
      <div className="showcase-panel">
        <div className="showcase-media" aria-hidden="true">
          <AssetLayer src={assetSlots.showcase} />
          <div className="showcase-fallback" />
        </div>
        <div className="showcase-copy">
          <div className="section-kicker">作品产出</div>
          <h2 id="outputs-title">最后不是一张结课证书，而是一组能展示的作品</h2>
          <p>
            星海计划的成果要能被看见、被讲清楚、被继续迭代。每个孩子都可以从自己的项目开始，
            慢慢建立真实作品集。
          </p>
          <div className="output-tags">
            {outputs.map((output) => (
              <span key={output}>{output}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section className="section faq-section" aria-labelledby="faq-title">
      <div className="section-kicker">家长关心</div>
      <div className="section-heading compact">
        <h2 id="faq-title">先评估，再进入合适的项目路径</h2>
      </div>
      <div className="faq-list">
        {faqs.map((faq) => (
          <article className="faq-item" key={faq.question}>
            <h3>{faq.question}</h3>
            <p>{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final-cta" id="assessment" aria-labelledby="assessment-title">
      <div className="cta-media" aria-hidden="true">
        <AssetLayer src={assetSlots.finalCta} />
        <div className="cta-fallback" />
      </div>
      <div className="cta-card">
        <span className="cta-label">
          <Play size={14} fill="currentColor" strokeWidth={1.8} />
          开始前先做一次项目评估
        </span>
        <h2 id="assessment-title">看看孩子适合从哪颗能力星球出发</h2>
        <p>
          预约 1V1 项目评估，我们会根据孩子的兴趣、基础和表达状态，推荐第一阶段项目方向。
        </p>
        <a className="action-primary" href="#top">
          <CalendarCheck size={18} strokeWidth={1.8} />
          预约 1V1 项目评估
          <ChevronRight size={18} strokeWidth={1.8} />
        </a>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <main>
      <Hero />
      <DifferenceSection />
      <AbilitiesSection />
      <JourneySection />
      <OutputsSection />
      <FaqSection />
      <FinalCta />
    </main>
  );
}
