import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowDown, Play, ScanLine } from "lucide-react";
import { abilityNodes, taskNodes } from "../data/system.js";

gsap.registerPlugin(ScrollTrigger);

export function CreatorSystemStory() {
  const rootRef = useRef(null);
  const unlockRef = useRef(null);
  const pathRef = useRef(null);
  const [activeAbility, setActiveAbility] = useState(abilityNodes[0]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const ctx = gsap.context(() => {
      const abilityTl = gsap.timeline({
        scrollTrigger: {
          trigger: unlockRef.current,
          start: "top top",
          end: "+=185%",
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      abilityTl
        .fromTo(".unlock-core", { scale: 0.74 }, { scale: 1.08, duration: 0.32, ease: "none" })
        .fromTo(".ability-orbit-ring", { scale: 0.72, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28 }, 0.05)
        .fromTo(".ability-line", { strokeDashoffset: 520, opacity: 0 }, { strokeDashoffset: 0, opacity: 0.86, stagger: 0.035, duration: 0.42 }, 0.16)
        .fromTo(".ability-node", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, stagger: 0.075, duration: 0.44 }, 0.22)
        .fromTo(".unlock-caption", { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28 }, 0.5);

      const pathTl = gsap.timeline({
        scrollTrigger: {
          trigger: pathRef.current,
          start: "top top",
          end: "+=170%",
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      pathTl
        .to(".path-intro-core", { scale: 0.82, opacity: 0.35, duration: 0.18 })
        .fromTo(".path-beam", { strokeDashoffset: 900, opacity: 0 }, { strokeDashoffset: 0, opacity: 0.94, duration: 0.58 }, 0.08)
        .fromTo(".task-node", { opacity: 0.18, scale: 0.74, y: 18 }, { opacity: 1, scale: 1, y: 0, stagger: 0.11, duration: 0.58 }, 0.18)
        .fromTo(".task-label", { opacity: 0, y: 12 }, { opacity: 1, y: 0, stagger: 0.11, duration: 0.48 }, 0.24)
        .fromTo(".path-caption", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.35 }, 0.72);
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <main ref={rootRef} className="system-story bg-[#050b14] text-slate-50">
      <AmbientField />
      <section className="screen screen-start">
        <div className="system-grid" />
        <motion.div
          className="start-core"
          initial={{ opacity: 0, scale: 0.84, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="core-shell">
            <div className="core-aura" />
            <div className="core-ring ring-a" />
            <div className="core-ring ring-b" />
            <div className="core-disc">
              <span>AI Creator Core</span>
              <strong>星海核心</strong>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="start-copy"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="system-kicker">XINGHAI CREATOR SYSTEM</p>
          <h1>
            <span className="brand-line">AI的朋友 · 星海计划</span>
            <span className="system-line">启动少年 AI 创造者系统</span>
          </h1>
          <p className="start-subtitle">
            让孩子完成一次从想法、代码、创作、表达，到作品发布的真实创造挑战。
          </p>
          <div className="start-actions">
            <motion.a whileHover={{ y: -3 }} className="system-button primary" href="#unlock">
              <Play size={17} strokeWidth={1.8} />
              启动项目评估
            </motion.a>
            <motion.a whileHover={{ y: -3 }} className="system-button secondary" href="#path">
              <ArrowDown size={17} strokeWidth={1.8} />
              查看训练路径
            </motion.a>
          </div>
        </motion.div>
      </section>

      <section id="unlock" ref={unlockRef} className="screen screen-unlock">
        <div className="section-topline">
          <ScanLine size={17} strokeWidth={1.6} />
          五大能力区解锁
        </div>
        <div className="unlock-stage">
          <svg className="ability-map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {abilityNodes.map((node) => (
              <line
                className="ability-line"
                key={node.id}
                x1="50"
                y1="50"
                x2={node.x}
                y2={node.y}
                pathLength="520"
              />
            ))}
          </svg>
          <div className="unlock-core">
            <div className="ability-orbit-ring" />
            <div className="core-disc compact">
              <span>Creator</span>
              <strong>CORE</strong>
            </div>
          </div>

          {abilityNodes.map((node) => (
            <motion.button
              type="button"
              className="ability-node"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              key={node.id}
              onMouseEnter={() => setActiveAbility(node)}
              onFocus={() => setActiveAbility(node)}
              whileHover={{ scale: 1.08 }}
            >
              <span className="node-dot" />
              <span className="node-name">{node.name}</span>
              <span className="node-short">{node.short}</span>
            </motion.button>
          ))}

          <motion.aside
            className="ability-panel"
            key={activeAbility.id}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
          >
            <span>ACTIVE MODULE</span>
            <h2>{activeAbility.name}</h2>
            <p>{activeAbility.description}</p>
          </motion.aside>
        </div>
        <div className="unlock-caption">
          <p>核心不是一门课，而是一套能力系统。</p>
          <span>滚动时，五个训练区依次接入星海核心，形成孩子自己的 AI 创造者回路。</span>
        </div>
      </section>

      <section id="path" ref={pathRef} className="screen screen-path">
        <div className="section-topline">
          <ScanLine size={17} strokeWidth={1.6} />
          三天任务路径
        </div>
        <div className="path-stage">
          <div className="path-intro-core">
            <div className="core-disc compact">
              <span>System</span>
              <strong>RUN</strong>
            </div>
          </div>
          <svg className="task-map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="path-ghost" d="M 10 58 C 22 32, 38 40, 52 54 S 76 30, 90 52" />
            <path className="path-beam" d="M 10 58 C 22 32, 38 40, 52 54 S 76 30, 90 52" pathLength="900" />
          </svg>
          {taskNodes.map((node, index) => (
            <motion.div
              className="task-node"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              key={node.id}
              whileHover={{ y: -6 }}
            >
              <div className="task-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="task-label">
                <strong>{node.label}</strong>
                <span>{node.detail}</span>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="path-caption">
          <h2>从兴趣进入任务，从任务走向作品。</h2>
          <p>路径不是普通时间线，而是一次被系统推进的创造挑战。</p>
        </div>
      </section>
    </main>
  );
}

function AmbientField() {
  return (
    <div className="ambient-field" aria-hidden="true">
      <div className="ambient-grid" />
      <div className="ambient-scan" />
      <div className="ambient-orb orb-one" />
      <div className="ambient-orb orb-two" />
    </div>
  );
}
