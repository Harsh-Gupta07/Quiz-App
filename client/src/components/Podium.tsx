import { motion } from 'motion/react';
import { Medal, Trophy } from 'lucide-react';
import type { StandingEntry } from '@shared/protocol';
import { CountUp } from './ui';

const PLACES = [
  { place: 1, label: '1st', color: '#D4A72C', light: '#FBF1D3', height: 1, delay: 1.2, emoji: '🥇' },
  { place: 2, label: '2nd', color: '#98A2B3', light: '#EEF1F5', height: 0.72, delay: 0.6, emoji: '🥈' },
  { place: 3, label: '3rd', color: '#B8784A', light: '#F5E8DD', height: 0.55, delay: 0.2, emoji: '🥉' },
];

/** Classic 2-1-3 podium. `scale` lets the same component work on phones and the 1080p stage. */
export function Podium({ entries, scale = 1 }: { entries: StandingEntry[]; scale?: number }) {
  const order = [1, 0, 2]; // 2nd, 1st, 3rd
  const maxHeight = 330 * scale;
  return (
    <div className="flex items-end justify-center" style={{ gap: 24 * scale }}>
      {order.map((idx) => {
        const entry = entries[idx];
        const meta = PLACES[idx];
        const width = 300 * scale;
        return (
          <div key={meta.place} className="flex flex-col items-center" style={{ width }}>
            {entry ? (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: meta.delay + 0.5, type: 'spring', stiffness: 200, damping: 18 }}
                className="mb-3 flex w-full flex-col items-center text-center"
              >
                <div
                  className="flex items-center justify-center rounded-full shadow-lift"
                  style={{ width: 92 * scale, height: 92 * scale, background: meta.light, border: `${4 * scale}px solid ${meta.color}` }}
                >
                  {meta.place === 1 ? (
                    <Trophy style={{ width: 46 * scale, height: 46 * scale, color: meta.color }} />
                  ) : (
                    <Medal style={{ width: 42 * scale, height: 42 * scale, color: meta.color }} />
                  )}
                </div>
                <div className="mt-3 w-full truncate font-extrabold" style={{ fontSize: (meta.place === 1 ? 38 : 30) * scale }}>
                  {entry.name}
                </div>
                <div className="font-extrabold tabular-nums text-orange" style={{ fontSize: 30 * scale }}>
                  <CountUp value={entry.totalPoints} duration={1600} /> <span style={{ fontSize: 18 * scale }}>pts</span>
                </div>
                <div className="font-semibold text-navy/55" style={{ fontSize: 17 * scale }}>
                  {entry.accuracy}% accuracy · {entry.correctCount} correct
                </div>
              </motion.div>
            ) : (
              <div style={{ height: 60 * scale }} />
            )}
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: maxHeight * meta.height }}
              transition={{ delay: meta.delay, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex w-full items-start justify-center overflow-hidden rounded-t-3xl shadow-lift"
              style={{ background: `linear-gradient(180deg, ${meta.color}, ${meta.color}dd)` }}
            >
              <span className="font-extrabold text-white/95" style={{ fontSize: 64 * scale, marginTop: 16 * scale }}>
                {meta.label}
              </span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
