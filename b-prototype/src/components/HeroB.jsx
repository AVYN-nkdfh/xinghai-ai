import { motion } from "framer-motion";
import { ArrowDown, CalendarCheck, ChevronRight } from "lucide-react";
import { heroHotspots } from "../data/abilities.js";
import { Spotlight } from "./Spotlight.jsx";

const heroImage = "/assets/hero-xinghai.png";

export function HeroB() {
  return (
    <section className="relative isolate min-h-svh overflow-hidden bg-xinghai-navy text-ink">
      <img className="hero-bg-image" src={heroImage} alt="" />
      <Spotlight />
      <div className="hero-image-overlay" />
      <div className="hero-ambient" />

      <div className="hero-layout mx-auto grid min-h-svh w-full max-w-[1500px] grid-cols-1 px-5 py-6 sm:px-8 lg:px-12">
        <motion.div
          className="flex min-h-[72svh] max-w-[620px] flex-col justify-center pt-16 lg:min-h-svh lg:pt-0"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="hero-kicker w-fit rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-cyan-100/90 backdrop-blur-md">
            少年 AI 创造者黑客营
          </div>
          <h1 className="hero-title mt-6 max-w-[9.5em] text-balance font-semibold leading-[0.98] tracking-normal text-white">
            <span className="block whitespace-nowrap">AI的朋友 ·</span>
            <span className="block whitespace-nowrap">星海计划</span>
          </h1>
          <p className="mt-6 max-w-[31rem] text-pretty text-[clamp(1.08rem,1.5vw,1.45rem)] font-semibold leading-snug text-cyan-100">
            让 7-14 岁孩子进入一座未来创造都市，
            把想法、代码、表达和作品力变成自己的创造者底盘。
          </p>
          <p className="mt-5 max-w-[34rem] text-base leading-8 text-slate-100/76 sm:text-lg">
            不是低幼编程课，也不是工具速成课。孩子会在五个能力区完成真实作品，从构想到发布，经历一次少年 AI 创造者黑客营。
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a className="hero-primary-button group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-cyan-100/70 px-5 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5" href="#abilities-b">
              <CalendarCheck size={18} strokeWidth={1.8} />
              预约项目评估
              <ChevronRight className="transition group-hover:translate-x-0.5" size={17} />
            </a>
            <a className="hero-secondary-button inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/16 bg-white/[0.07] px-5 text-sm font-bold text-white/90 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-cyan-100/32 hover:bg-white/[0.11]" href="#abilities-b">
              <ArrowDown size={18} strokeWidth={1.8} />
              探索五大能力区
            </a>
          </div>
        </motion.div>

        <motion.div
          className="pointer-events-none relative hidden lg:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.9 }}
          aria-label="五大能力热点"
        >
          {heroHotspots.map((hotspot, index) => (
            <motion.div
              className="hotspot-chip pointer-events-auto"
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%` }}
              key={hotspot.id}
              initial={{ opacity: 0, scale: 0.86, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.52 + index * 0.08, duration: 0.55 }}
            >
              <span className="hotspot-pulse" />
              <span className="hotspot-label">{hotspot.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="mx-auto -mt-28 flex w-full max-w-[1500px] gap-2 overflow-x-auto px-5 pb-7 sm:px-8 lg:hidden">
        {heroHotspots.map((hotspot) => (
          <span
            className="shrink-0 rounded-full border border-white/14 bg-slate-950/35 px-4 py-2 text-sm font-semibold text-cyan-50/86 backdrop-blur-md"
            key={hotspot.id}
          >
            {hotspot.label}
          </span>
        ))}
      </div>
    </section>
  );
}
