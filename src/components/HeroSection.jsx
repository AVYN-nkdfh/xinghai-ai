import { useState } from "react";
import { ArrowDown, CalendarCheck } from "lucide-react";
import { abilities } from "../data/abilities.js";
import { Hotspot } from "./Hotspot.jsx";
import { MobileAbilityCards } from "./MobileAbilityCards.jsx";

const heroImage = "/assets/hero-xinghai.png";

export function HeroSection() {
  const [activeId, setActiveId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <main className="hero-shell">
      <div className="hero-background" aria-hidden="true">
        <img src={heroImage} alt="" />
      </div>
      <div className="hero-vignette" aria-hidden="true" />

      <section className="hero-copy" aria-labelledby="hero-title">
        <div className="hero-kicker">少年 AI 创造者黑客营</div>
        <h1 id="hero-title">AI的朋友 · 星海计划</h1>
        <p className="hero-subtitle">少年 AI 创造者黑客营</p>
        <p className="hero-description">
          不是学几个 AI 工具，
          <br />
          而是进入一座未来创造都市，
          <br />
          把商业、代码、创造、表达与个人IP，
          <br />
          训练成孩子自己的作品能力。
        </p>
        <div className="hero-actions" aria-label="首屏行动按钮">
          <a className="button button-primary" href="#assessment">
            <CalendarCheck size={18} strokeWidth={1.8} />
            <span>预约 1V1 项目评估</span>
          </a>
          <a className="button button-secondary" href="#abilities">
            <ArrowDown size={18} strokeWidth={1.8} />
            <span>探索五大能力区</span>
          </a>
        </div>
      </section>

      <section className="hero-hotspots" aria-label="五大能力区热点">
        {abilities.map((ability, index) => (
          <Hotspot
            key={ability.id}
            ability={ability}
            index={index}
            isActive={activeId === ability.id}
            isPreviewed={hoveredId === ability.id}
            onActivate={() => setActiveId(ability.id)}
            onPreviewStart={() => setHoveredId(ability.id)}
            onPreviewEnd={() => setHoveredId(null)}
          />
        ))}
      </section>

      <section className="hero-mobile" aria-labelledby="mobile-title">
        <div className="mobile-visual">
          <img src={heroImage} alt="未来科技都市中的少年 AI 创造者营地" />
        </div>
        <div className="mobile-copy">
          <div className="hero-kicker">少年 AI 创造者黑客营</div>
          <h2 id="mobile-title">AI的朋友 · 星海计划</h2>
          <p className="hero-subtitle">少年 AI 创造者黑客营</p>
          <p className="hero-description">
            不是学几个 AI 工具，而是进入一座未来创造都市，把商业、代码、创造、表达与个人IP，训练成孩子自己的作品能力。
          </p>
          <div className="hero-actions" aria-label="移动端行动按钮">
            <a className="button button-primary" href="#assessment">
              <CalendarCheck size={18} strokeWidth={1.8} />
              <span>预约 1V1 项目评估</span>
            </a>
            <a className="button button-secondary" href="#abilities">
              <ArrowDown size={18} strokeWidth={1.8} />
              <span>探索五大能力区</span>
            </a>
          </div>
        </div>
        <MobileAbilityCards abilities={abilities} />
      </section>
    </main>
  );
}
