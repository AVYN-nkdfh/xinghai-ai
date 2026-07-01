import { motion } from "framer-motion";
import { abilities } from "../data/abilities.js";

const accentClass = {
  cyan: "from-cyan-300/24 via-cyan-300/6 to-transparent text-cyan-100",
  blue: "from-blue-300/24 via-blue-300/6 to-transparent text-blue-100",
  violet: "from-violet-300/24 via-violet-300/6 to-transparent text-violet-100",
  amber: "from-amber-200/24 via-amber-200/6 to-transparent text-amber-100",
};

export function AbilityBento() {
  return (
    <section
      id="abilities-b"
      className="relative overflow-hidden bg-[#07111f] px-5 py-20 text-white sm:px-8 lg:px-12 lg:py-28"
    >
      <div className="abilities-ambient" />
      <div className="abilities-top-line" />
      <div className="relative mx-auto max-w-[1240px]">
        <motion.div
          className="max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-sm font-semibold text-cyan-200/80">Five Creation Zones</p>
          <h2 className="mt-4 text-balance text-[clamp(2.3rem,4.8vw,4.7rem)] font-semibold leading-tight tracking-normal">
            五大能力区，构成孩子的 AI 创造者系统
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300/80">
            B 版用更克制的 Bento 结构呈现能力，不靠大面积色块，而是用层级、光感、材质和轻交互建立高级感。
          </p>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12 lg:auto-rows-[230px]">
          {abilities.map((ability, index) => (
            <AbilityCard ability={ability} index={index} key={ability.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function AbilityCard({ ability, index }) {
  const Icon = ability.icon;
  const FigureIcon = ability.figureIcon;

  return (
    <motion.article
      className={`ability-card group relative min-h-[260px] overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-xinghai-card backdrop-blur-xl ${ability.className}`}
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, rotateX: 1.3, rotateY: -1.1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ delay: index * 0.05, duration: 0.62, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accentClass[ability.accent]} opacity-80 transition duration-500 group-hover:opacity-100`} />
      <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl transition duration-500 group-hover:bg-cyan-200/18" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/24 to-transparent" />
      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/18 px-3 py-1.5 text-xs font-semibold text-white/68">
              <Icon size={14} strokeWidth={1.8} />
              {ability.eyebrow}
            </div>
            <h3 className="mt-5 max-w-[16em] text-2xl font-semibold leading-snug tracking-normal text-white">
              {ability.name}
            </h3>
          </div>
          <div className="text-5xl font-semibold leading-none text-white/[0.08]">
            {ability.metric}
          </div>
        </div>

        <p className="mt-4 max-w-[34rem] text-pretty text-lg font-semibold leading-snug text-white/92">
          {ability.title}
        </p>
        <p className="mt-3 max-w-[35rem] text-sm leading-7 text-slate-200/70">
          {ability.summary}
        </p>

        <div className="mt-auto flex flex-wrap gap-2 pt-7">
          {ability.outputs.map((output) => (
            <span
              className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-semibold text-slate-100/76"
              key={output}
            >
              {output}
            </span>
          ))}
        </div>

        <div className="ability-orbit" aria-hidden="true">
          <FigureIcon size={28} strokeWidth={1.45} />
        </div>
      </div>
    </motion.article>
  );
}
