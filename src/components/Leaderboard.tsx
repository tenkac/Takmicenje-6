"use client";
import React, { useEffect, useState, useMemo } from 'react';
import { AllPlayersData, PLAYERS } from '../types';

interface Props {
  allBets: AllPlayersData;
  onPlayerClick: (playerName: string) => void;
  isPlaying: boolean;
  onToggleMusic: () => void;
}

interface PlayerTheme {
  text: string;
  border: string;
  icon: string;
  hex: string;
}

interface MatchItem {
  name: string;
  odds: number;
  status: 'win' | 'loss' | 'pending' | string;
}

interface PlayerStat {
  name: string;
  score: number;
  form: MatchItem[];
  pendingCount: number;
}

interface PodiumItemProps {
  rank: number;
  data: PlayerStat;
  theme: PlayerTheme;
  height: string;
  color: string;
  badge: string;
  isWinner?: boolean;
  gapToAbove?: number | null;
  mounted: boolean;
  delay: string;
  onClick: () => void;
}

const DICE_SRC = '/Kockabezzvijezda.webp';

const PLAYER_THEMES: Record<string, PlayerTheme> = {
  "Vlado":  { text: "text-blue-500",   border: "border-blue-500",   icon: "/Avatars/vlado.webp",  hex: "#3b82f6" },
  "Fika":   { text: "text-red-500",    border: "border-red-500",    icon: "/Avatars/fika.webp",   hex: "#ef4444" },
  "Labud":  { text: "text-green-500",  border: "border-green-500",  icon: "/Avatars/labud.webp",  hex: "#22c55e" },
  "Ilija":  { text: "text-purple-500", border: "border-purple-500", icon: "/Avatars/ilija.webp",  hex: "#a855f7" },
  "Dzoni":  { text: "text-yellow-500", border: "border-yellow-500", icon: "/Avatars/dzoni.webp",  hex: "#eab308" },
};

// 12 EU stars arranged evenly on a circle (30° intervals)
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  const r = 42;
  return { cx: 50 + r * Math.cos(angle), cy: 50 + r * Math.sin(angle) };
});

// Own GPU layer so animated/blurred elements don't repaint each other
const GPU_LAYER: React.CSSProperties = {
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
};

// Shared card look, matching the landing page (deep EU blue + gold hairline)
const CARD_STYLE: React.CSSProperties = {
  background: 'rgba(0, 20, 70, 0.45)',
  border: '1px solid rgba(255, 204, 0, 0.14)',
};

function EuStarRing({ className, style, fontSize = 9 }: { className?: string; style?: React.CSSProperties; fontSize?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style}>
      {EU_STARS.map((s, i) => (
        <text key={i} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fill="#ffcc00" fontSize={fontSize}>★</text>
      ))}
    </svg>
  );
}

export default function Leaderboard({ allBets, onPlayerClick, isPlaying, onToggleMusic }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Preload + decode the dice image so it doesn't pop in
  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.src = DICE_SRC;
    img.decode?.().catch(() => {});
  }, []);

  const { playerStats, biggestOdd, mostWins } = useMemo(() => {
    let biggestOdd = { player: "---", odds: 0, match: "No Wins Yet" };
    let mostWins   = { player: "---", count: 0 };

    const playerStats: PlayerStat[] = PLAYERS.map(player => {
      const rows = allBets[player] || [];
      let totalScore = 0, winCount = 0, pendingCount = 0;

      // Double-pick scoring & Sniper: both picks on a given day must win to multiply their odds
      rows.forEach(r => {
        if (r.match1?.status === 'win' && r.match2?.status === 'win') {
          const combinedOdds = parseFloat((r.match1.odds * r.match2.odds).toFixed(2));
          totalScore += combinedOdds;

          if (combinedOdds > biggestOdd.odds) {
            biggestOdd = {
              player,
              odds: combinedOdds,
              match: `${r.match1.name} + ${r.match2.name}`
            };
          }
        }
      });

      const allMatches: MatchItem[] = rows.flatMap(r => [r.match1, r.match2]);

      allMatches.forEach(m => {
        if (m.status === 'win') winCount++;
        if (m.status === 'pending') pendingCount++;
      });

      if (winCount > mostWins.count) mostWins = { player, count: winCount };

      const recentForm = allMatches
        .filter(m => m.status === 'win' || m.status === 'loss')
        .slice(-5).reverse();

      return {
        name: player,
        score: parseFloat(totalScore.toFixed(2)),
        form: recentForm,
        pendingCount
      };
    }).sort((a, b) => b.score - a.score);

    return { playerStats, biggestOdd, mostWins };
  }, [allBets]);

  const [first, second, third, ...chasers] = playerStats;

  const gapTo = (
    target:    PlayerStat | undefined,
    reference: PlayerStat | undefined,
  ) => {
    if (!target || !reference) return null;
    const diff = parseFloat((reference.score - target.score).toFixed(2));
    return diff > 0 ? diff : null;
  };

  return (
    <>
      <style>{`
        @keyframes podium-rise {
          from { transform: translateY(60px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes avatar-drop {
          0%   { transform: translateY(-40px) scale(0.8); opacity: 0; }
          70%  { transform: translateY(4px) scale(1.05);  opacity: 1; }
          100% { transform: translateY(0) scale(1);        opacity: 1; }
        }
        @keyframes crown-pulse {
          0%, 100% { transform: scale(1) rotate(-5deg);  filter: drop-shadow(0 0 4px rgba(250,204,21,0.4)); }
          50%       { transform: scale(1.25) rotate(5deg); filter: drop-shadow(0 0 12px rgba(250,204,21,0.9)); }
        }
        @keyframes eu-ring-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .crown-anim { animation: crown-pulse 2s ease-in-out infinite; display: inline-block; }
        .eu-ring-anim { animation: eu-ring-spin 70s linear infinite; }
        .eu-ring-anim-fast { animation: eu-ring-spin 40s linear infinite; }
      `}</style>

      <div
        className="min-h-screen flex flex-col font-sans text-white relative overflow-x-hidden"
        style={{ background: 'linear-gradient(165deg, #020a24 0%, #01379b 45%, #03091c 100%)' }}
      >
        {/* ── TEXTURE ── */}
        <div className="fixed inset-0 wc-jersey-bg pointer-events-none opacity-35" />

        {/* ── DICE WATERMARK + SLOW EU STAR RING (behind the podium) ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden select-none">
          <div
            className="absolute top-[34%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] md:w-[640px] md:h-[640px] opacity-[0.28]"
            style={{
              ...GPU_LAYER,
              backgroundImage: `url('${DICE_SRC}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 70%)',
              WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 70%)',
            }}
          />
          <EuStarRing
            className="eu-ring-anim absolute top-[34%] left-1/2 w-[500px] h-[500px] md:w-[680px] md:h-[680px] opacity-[0.18]"
            style={GPU_LAYER}
            fontSize={8}
          />
        </div>

        {/* ── FLOODLIGHTS ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="wc-beam-l absolute" style={{ ...GPU_LAYER, top: 0, left: '15%', width: '300px', height: '70vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 85%)', transformOrigin: 'top center', filter: 'blur(44px)' }} />
          <div className="wc-beam-r absolute" style={{ ...GPU_LAYER, top: 0, right: '15%', width: '300px', height: '70vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 85%)', transformOrigin: 'top center', filter: 'blur(44px)' }} />
          <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '500px', background: 'radial-gradient(ellipse at top, rgba(255,204,0,0.10) 0%, transparent 65%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '90vw', height: '32vh', background: 'radial-gradient(ellipse at bottom, rgba(239,68,68,0.10) 0%, transparent 70%)' }} />
        </div>

        {/* ── FLOATING DICE ── */}
        <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
          <span className="wc-float      absolute text-6xl" style={{ opacity: 0.05, top: '18%',    left: '3%'  }}>🎲</span>
          <span className="wc-float-slow absolute text-8xl" style={{ opacity: 0.04, bottom: '15%', right: '2%' }}>🎲</span>
          <span className="wc-float-med  absolute text-4xl" style={{ opacity: 0.06, top: '52%',    right: '5%' }}>🎲</span>
        </div>

        {/* ── MAIN PADDED CONTENT ── */}
        <div className="flex-1 w-full p-4 md:p-8">
          {/* ── HEADER ── */}
          <div className="relative z-10 flex justify-center items-center mb-8 pt-2">
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-1">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-yellow-400/50" />
                <h2 className="text-[11px] font-black text-yellow-300/80 uppercase tracking-[0.4em] pl-[0.4em]">🇪🇺 Euro Model</h2>
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-yellow-400/50" />
              </div>
              <h1
                className="wc-shine-text text-4xl md:text-6xl font-black uppercase tracking-tighter drop-shadow-[0_0_30px_rgba(250,204,21,0.35)]"
              >
                Podijum
              </h1>

              {/* ── LEADER ANTHEM CONTROL PILL (SYNCED WITH page.tsx) ── */}
              {first && first.score > 0 && (
                <button
                  onClick={onToggleMusic}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:brightness-110 active:scale-95 cursor-pointer"
                  style={{
                    background: isPlaying
                      ? 'linear-gradient(135deg, rgba(255,204,0,0.28) 0%, rgba(1,55,155,0.65) 100%)'
                      : 'rgba(0, 10, 36, 0.72)',
                    border: isPlaying
                      ? '1px solid rgba(255, 204, 0, 0.55)'
                      : '1px solid rgba(255, 204, 0, 0.25)',
                    boxShadow: isPlaying ? '0 0 22px rgba(255, 204, 0, 0.28)' : 'none',
                  }}
                >
                  <span className={isPlaying ? 'animate-bounce' : ''}>{isPlaying ? '🔊' : '🎵'}</span>
                  <span className="text-yellow-300">
                    {isPlaying ? `Himna Lidera · ${first.name}` : `Pusti Himnu (${first.name})`}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="max-w-4xl mx-auto relative z-10">
            {/* ── PODIUM ── */}
            <div className="flex justify-center items-end gap-2 md:gap-6 min-h-[350px]">
              {second && (
                <PodiumItem rank={2} data={second} theme={PLAYER_THEMES[second.name]}
                  height="h-48 md:h-64" color="border-gray-300" badge="🥈"
                  gapToAbove={gapTo(second, first)} mounted={mounted} delay="0.15s"
                  onClick={() => onPlayerClick(second.name)} />
              )}
              {first && (
                <PodiumItem rank={1} data={first} theme={PLAYER_THEMES[first.name]}
                  height="h-60 md:h-80" color="border-yellow-400" badge="👑" isWinner
                  mounted={mounted} delay="0s" onClick={() => onPlayerClick(first.name)} />
              )}
              {third && (
                <PodiumItem rank={3} data={third} theme={PLAYER_THEMES[third.name]}
                  height="h-40 md:h-52" color="border-orange-600" badge="🥉"
                  gapToAbove={gapTo(third, second)} mounted={mounted} delay="0.25s"
                  onClick={() => onPlayerClick(third.name)} />
              )}
            </div>

            {/* Stage floor line under the podium */}
            <div className="h-px w-full mb-8 bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent shadow-[0_0_14px_rgba(255,204,0,0.45)]" />

            {/* ── ACHIEVEMENTS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="flex items-center gap-4 p-4 rounded-2xl relative overflow-hidden backdrop-blur-sm"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(0,10,40,0.6) 100%)', border: '1px solid rgba(168,85,247,0.3)' }}>
                <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl rotate-12 select-none">🎯</div>
                <div className="w-12 h-12 rounded-full border-2 border-purple-500 overflow-hidden shrink-0 z-10 bg-gray-900">
                  {biggestOdd.player !== "---" && <img src={PLAYER_THEMES[biggestOdd.player].icon} className="w-full h-full object-cover" alt="" />}
                </div>
                <div className="z-10 min-w-0">
                  <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Sniper Sezone</div>
                  <div className="text-xl font-black uppercase italic">{biggestOdd.player}</div>
                  <div className="text-xs text-gray-300/70 truncate max-w-[200px]">{biggestOdd.match}</div>
                </div>
                <div className="ml-auto text-right z-10 shrink-0">
                  <div className="text-3xl font-black text-purple-300 tabular-nums">{biggestOdd.odds.toFixed(2)}</div>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl relative overflow-hidden backdrop-blur-sm"
                style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.18) 0%, rgba(0,10,40,0.6) 100%)', border: '1px solid rgba(34,197,94,0.3)' }}>
                <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl rotate-12 select-none">🔥</div>
                <div className="w-12 h-12 rounded-full border-2 border-green-500 overflow-hidden shrink-0 z-10 bg-gray-900">
                  {mostWins.player !== "---" && <img src={PLAYER_THEMES[mostWins.player].icon} className="w-full h-full object-cover" alt="" />}
                </div>
                <div className="z-10 min-w-0">
                  <div className="text-[10px] font-bold text-green-300 uppercase tracking-widest">Hasler</div>
                  <div className="text-xl font-black uppercase italic">{mostWins.player}</div>
                  <div className="text-xs text-gray-300/70">Ubodeni singlovi</div>
                </div>
                <div className="ml-auto text-right z-10 shrink-0">
                  <div className="text-3xl font-black text-green-300 tabular-nums">{mostWins.count}</div>
                  <div className="text-[8px] uppercase font-bold tracking-widest text-green-500">Ubodenih</div>
                </div>
              </div>
            </div>

            {/* ── CHASERS ── */}
            {chasers.length > 0 && (
              <div className="flex flex-col gap-3 pb-4">
                <div className="text-xs font-black text-yellow-300/60 uppercase tracking-[0.3em] mb-2 pl-2">Jahači</div>
                {chasers.map((rank, index) => {
                  const pt  = PLAYER_THEMES[rank.name];
                  const gap = gapTo(rank, playerStats[index + 2]);
                  return (
                    <div
                      key={rank.name}
                      onClick={() => onPlayerClick(rank.name)}
                      className="flex items-center p-4 rounded-2xl hover:scale-[1.01] hover:brightness-110 cursor-pointer transition-all backdrop-blur-sm"
                      style={CARD_STYLE}
                    >
                      <div className="w-8 text-xl font-black text-yellow-300/40 italic">#{index + 4}</div>
                      <div className={`w-12 h-12 rounded-full border-2 ${pt.border} overflow-hidden mx-4 bg-gray-900 shrink-0`}>
                        <img src={pt.icon} alt={rank.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className={`text-lg font-black uppercase tracking-tight ${pt.text}`}>{rank.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex gap-1">
                            {rank.form.map((p, i) => (
                              <div key={i} className={`w-1.5 h-1.5 rounded-full ${p.status === 'win' ? 'bg-green-500' : 'bg-red-500'}`} />
                            ))}
                          </div>
                          {gap !== null && (
                            <span className="text-[9px] font-bold text-gray-400/70 uppercase tracking-wider">-{gap} pts</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1 shrink-0">
                        <span className="block text-2xl font-black text-white tabular-nums">{rank.score.toFixed(2)}</span>
                        {rank.pendingCount > 0 && (
                          <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">{rank.pendingCount} pending</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── FULL-BLEED BOTTOM TICKER ── */}
        <div
          className="relative z-10 w-full mt-auto overflow-hidden py-2.5 backdrop-blur-md"
          style={{ borderTop: '1px solid rgba(255,204,0,0.12)', background: 'rgba(1, 8, 28, 0.7)' }}
        >
          <div className="wc-ticker whitespace-nowrap inline-block">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="text-[10px] font-black uppercase tracking-[0.35em] text-yellow-400/35 px-2">
                🎲 &nbsp;·&nbsp; 🇪🇺 EURO MODEL &nbsp;·&nbsp; PODIJUM &nbsp;·&nbsp; KO JE ŠAMPION &nbsp;·&nbsp; KOCKA JE BAČENA &nbsp;·&nbsp; RANG LISTA &nbsp;·&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function PodiumItem({ rank, data, theme, height, color, badge, isWinner = false, gapToAbove, mounted, delay, onClick }: PodiumItemProps) {
  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center group w-1/3 max-w-[140px] md:max-w-none cursor-pointer"
      style={{ animation: mounted ? `podium-rise 0.6s cubic-bezier(0.22,1,0.36,1) ${delay} both` : 'none', opacity: mounted ? undefined : 0 }}
    >
      <div
        className={`flex flex-col items-center mb-8 md:mb-14 ${isWinner ? 'scale-110 md:scale-125' : 'scale-90 md:scale-100'}`}
        style={{ animation: mounted ? `avatar-drop 0.55s cubic-bezier(0.22,1,0.36,1) calc(${delay} + 0.2s) both` : 'none', opacity: mounted ? undefined : 0 }}
      >
        <div className={`text-2xl md:text-4xl mb-[-10px] z-20 drop-shadow-lg ${isWinner ? 'crown-anim' : ''}`}>{badge}</div>

        <div className="relative">
          {/* Winner gets its own little ring of 12 EU stars orbiting the avatar */}
          {isWinner && (
            <EuStarRing
              className="eu-ring-anim-fast absolute top-1/2 left-1/2 w-[160%] h-[160%] opacity-70 pointer-events-none z-0"
              style={GPU_LAYER}
              fontSize={7}
            />
          )}
          <div className={`w-16 h-16 md:w-24 md:h-24 rounded-full border-4 ${color} shadow-2xl overflow-hidden relative z-10 bg-gray-900`}>
            <img src={theme.icon} alt={data.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
          </div>
        </div>

        <div
          className={`mt-3 text-sm md:text-xl font-black uppercase tracking-widest ${theme.text} px-3 py-1 rounded-lg border shadow-lg`}
          style={{ background: 'rgba(0,10,40,0.75)', borderColor: isWinner ? 'rgba(255,204,0,0.45)' : 'rgba(255,255,255,0.12)' }}
        >
          {data.name}
        </div>
      </div>

      <div
        className={`w-full ${height} rounded-t-2xl border-x border-t relative flex flex-col justify-start items-center pt-4 hover:scale-[1.02] transition-transform`}
        style={isWinner ? {
          background: 'linear-gradient(to top, rgba(161,120,6,0.40), rgba(255,204,0,0.12))',
          borderColor: 'rgba(255,204,0,0.65)',
          boxShadow: 'inset 0 2px 0 rgba(255,204,0,0.55), 0 0 40px rgba(255,204,0,0.20)',
        } : {
          background: `linear-gradient(to top, ${theme.hex}2a, rgba(0,20,70,0.35))`,
          borderColor: `${theme.hex}55`,
          boxShadow: `inset 0 2px 0 ${theme.hex}66, 0 0 25px ${theme.hex}20`,
        }}
      >
        <AnimatedScore target={data.score} isWinner={isWinner} mounted={mounted} delay={delay} />
        <span className="text-[10px] md:text-xs font-bold text-white/40 uppercase tracking-[0.2em] mb-2">Poena</span>

        {gapToAbove !== null && gapToAbove !== undefined && (
          <div className="mb-2 px-2 py-0.5 bg-black/40 border border-white/10 rounded-full z-10">
            <span className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest">-{gapToAbove} pts</span>
          </div>
        )}

        <div className="flex gap-1.5 p-2 bg-black/40 rounded-full border border-white/5 mt-auto mb-4 z-10">
          {data.form.map((p, i) => (
            <div key={i} className={`w-2 h-2 md:w-3 md:h-3 rounded-full shadow-lg ${p.status === 'win' ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-500'}`} />
          ))}
          {data.form.length === 0 && <span className="text-[8px] text-gray-500 px-1">–</span>}
        </div>

        <div className="absolute inset-0 flex items-center justify-center text-7xl md:text-9xl font-black select-none pointer-events-none"
          style={{ opacity: 0.10, color: isWinner ? '#ffcc00' : theme.hex }}>
          {rank}
        </div>
      </div>
    </div>
  );
}

function AnimatedScore({ target, isWinner, mounted, delay }: { target: number, isWinner: boolean, mounted: boolean, delay: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!mounted) { setDisplay(0); return; }
    const delayMs = parseFloat(delay) * 1000 + 300;
    const timer = setTimeout(() => {
      const steps = 40, interval = 900 / steps;
      let step = 0;
      const id = setInterval(() => {
        step++;
        const eased = 1 - Math.pow(1 - step / steps, 3);
        setDisplay(parseFloat((target * eased).toFixed(2)));
        if (step >= steps) { setDisplay(target); clearInterval(id); }
      }, interval);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [target, mounted, delay]);

  return (
    <span className={`text-3xl md:text-5xl font-black tracking-tighter tabular-nums ${isWinner ? 'text-yellow-300 drop-shadow-[0_0_12px_rgba(255,204,0,0.6)]' : 'text-white'}`}>
      {display.toFixed(2)}
    </span>
  );
}