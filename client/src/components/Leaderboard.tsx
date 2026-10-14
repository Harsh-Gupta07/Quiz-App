import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { ArrowDown, ArrowUp, Crown, Minus } from 'lucide-react';
import type { StandingEntry } from '@shared/protocol';
import { CountUp } from './ui';

const MEDAL = [
  { row: 'bg-gradient-to-r from-[#F7E7B4] to-[#FBF3DA] ring-gold/50', badge: 'bg-gold text-white', label: 'Gold' },
  { row: 'bg-gradient-to-r from-[#E4E8EE] to-[#F3F5F8] ring-silver/50', badge: 'bg-silver text-white', label: 'Silver' },
  { row: 'bg-gradient-to-r from-[#EED9C7] to-[#F8EDE3] ring-bronze/50', badge: 'bg-bronze text-white', label: 'Bronze' },
];

function RankChange({ change, large }: { change: number | null; large: boolean }) {
  const size = large ? 'size-6' : 'size-4';
  if (change === null) return null; // first question / newly ranked: nothing to compare against
  if (change === 0) return <Minus className={`${size} text-navy/30`} aria-label="No change" />;
  return change > 0 ? (
    <span className={`flex items-center font-bold text-green-deep ${large ? 'text-xl' : 'text-sm'}`} aria-label={`Up ${change}`}>
      <ArrowUp className={size} strokeWidth={3} />
      {change}
    </span>
  ) : (
    <span className={`flex items-center font-bold text-danger ${large ? 'text-xl' : 'text-sm'}`} aria-label={`Down ${-change}`}>
      <ArrowDown className={size} strokeWidth={3} />
      {-change}
    </span>
  );
}

/**
 * Top-10 leaderboard. Rows first appear in their PREVIOUS order, then glide to the new ranking,
 * so the class can see who moved up.
 */
export function Leaderboard({
  entries,
  size = 'md',
  highlightId,
  animateFromPrevious = true,
}: {
  entries: StandingEntry[];
  size?: 'md' | 'lg';
  highlightId?: string | null;
  animateFromPrevious?: boolean;
}) {
  const large = size === 'lg';
  const hasMovement = animateFromPrevious && entries.some((e) => e.rankChange);
  const [settled, setSettled] = useState(!hasMovement);

  useEffect(() => {
    if (!hasMovement) return;
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, [hasMovement]);

  const ordered = useMemo(() => {
    if (settled) return entries;
    return [...entries].sort((a, b) => a.rank + (a.rankChange ?? 0) - (b.rank + (b.rankChange ?? 0)) || a.rank - b.rank);
  }, [entries, settled]);

  if (entries.length === 0) {
    return <p className="py-10 text-center text-navy/50">No players yet.</p>;
  }

  return (
    <LayoutGroup>
      <ol className={large ? 'space-y-3' : 'space-y-2'}>
        <AnimatePresence initial>
          {ordered.map((e, i) => {
            const medal = settled && e.rank <= 3 ? MEDAL[e.rank - 1] : null;
            const shownRank = settled ? e.rank : e.rank + (e.rankChange ?? 0);
            const mine = highlightId === e.participantId;
            return (
              <motion.li
                key={e.participantId}
                layout
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ layout: { type: 'spring', stiffness: 260, damping: 30 }, delay: settled ? 0 : i * 0.05 }}
                className={`flex items-center rounded-2xl ring-1 ${medal ? medal.row : 'bg-white ring-navy/6'} ${
                  mine ? 'outline-3 outline-orange outline-offset-2' : ''
                } ${large ? 'gap-6 px-7 py-4 shadow-soft' : 'gap-3 px-4 py-2.5'}`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-full font-extrabold tabular-nums ${
                    medal ? medal.badge : 'bg-ivory-deep text-navy/70'
                  } ${large ? 'size-14 text-2xl' : 'size-9 text-base'}`}
                  aria-label={medal ? `${medal.label}, rank ${shownRank}` : `Rank ${shownRank}`}
                >
                  {settled && e.rank === 1 ? <Crown className={large ? 'size-7' : 'size-5'} /> : shownRank}
                </span>
                <span className={`min-w-0 flex-1 truncate font-bold ${large ? 'text-[34px]' : 'text-base'}`}>
                  {e.name}
                  {mine && <span className="ml-2 text-sm font-semibold text-orange">(you)</span>}
                </span>
                {large && (
                  <span className="w-36 text-right text-xl font-semibold text-navy/55 tabular-nums">
                    {e.correctCount} correct
                  </span>
                )}
                <span className={`flex justify-center ${large ? 'w-20' : 'w-10'}`}>{settled && <RankChange change={e.rankChange} large={large} />}</span>
                <span className={`text-right font-extrabold tabular-nums ${large ? 'w-44 text-[38px]' : 'w-20 text-lg'}`}>
                  <CountUp value={e.totalPoints} />
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </LayoutGroup>
  );
}
