"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { AllPlayersData, PLAYERS } from '../types';
import { supabase } from '../lib/supabase';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface Props {
  allBets: AllPlayersData;
  onBack: () => void;
}

interface PlayerTheme {
  text: string;
  border: string;
  icon: string;
  gradient: string;
  hex: string;
}

const DICE_SRC = '/Kockabezzvijezda.webp';

const PLAYER_THEMES: Record<string, PlayerTheme> = {
  "Vlado":  { text: "text-blue-500",   border: "border-blue-500/30",   icon: "/Avatars/vlado.webp",  gradient: "from-blue-600 to-blue-400",    hex: "#3b82f6" },
  "Fika":   { text: "text-red-500",    border: "border-red-500/30",    icon: "/Avatars/fika.webp",   gradient: "from-red-600 to-red-400",      hex: "#ef4444" },
  "Labud":  { text: "text-green-500",  border: "border-green-500/30",  icon: "/Avatars/labud.webp",  gradient: "from-green-600 to-green-400",  hex: "#22c55e" },
  "Ilija":  { text: "text-purple-500", border: "border-purple-500/30", icon: "/Avatars/ilija.webp",  gradient: "from-purple-600 to-purple-400",hex: "#a855f7" },
  "Dzoni":  { text: "text-yellow-500", border: "border-yellow-500/30", icon: "/Avatars/dzoni.webp",  gradient: "from-yellow-600 to-yellow-400",hex: "#eab308" },
};

// 12 EU stars arranged evenly on a circle (30° intervals)
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  const r = 42;
  return { cx: 50 + r * Math.cos(angle), cy: 50 + r * Math.sin(angle) };
});

const GPU_LAYER: React.CSSProperties = {
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
};

const EU_CARD_STYLE: React.CSSProperties = {
  background: 'rgba(0, 20, 70, 0.48)',
  border: '1px solid rgba(255, 204, 0, 0.16)',
};

function EuStarRing({ className, style, fontSize = 8 }: { className?: string; style?: React.CSSProperties; fontSize?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style}>
      {EU_STARS.map((s, i) => (
        <text key={i} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fill="#ffcc00" fontSize={fontSize}>★</text>
      ))}
    </svg>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => b.value - a.value);

    return (
      <div
        className="p-3 rounded-2xl shadow-2xl backdrop-blur-xl w-52 z-[100]"
        style={{ background: 'rgba(2, 10, 36, 0.96)', border: '1px solid rgba(255, 204, 0, 0.25)' }}
      >
        <p className="text-yellow-300 font-black text-[10px] uppercase tracking-[0.2em] mb-2 border-b border-yellow-400/15 pb-1">
          Datum: {label}
        </p>
        <div className="space-y-2.5">
          {sortedPayload.map((entry: any) => {
            const player = entry.dataKey;
            const color = entry.color;
            const dailyData = entry.payload[`${player}_daily`];

            return (
              <div key={player} className="flex flex-col gap-0.5">
                <div className="flex justify-between items-center">
                  <span className="font-black text-[10px] uppercase tracking-wider" style={{ color }}>{player}</span>
                  <div className="flex items-center gap-1.5">
                    {dailyData.added > 0 && (
                      <span className="text-[8px] font-black text-green-400 bg-green-500/10 px-1 rounded">
                        +{dailyData.added.toFixed(2)}
                      </span>
                    )}
                    {dailyData.busted && (
                      <span className="text-[7px] font-black text-red-400 bg-red-500/10 px-1 rounded uppercase">
                        0 pts
                      </span>
                    )}
                    <span className="font-black text-[10px] text-white bg-white/10 px-1.5 rounded tabular-nums">
                      {entry.value.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col mt-0.5 border-l-[1.5px] pl-1.5" style={{ borderColor: `${color}55` }}>
                  {dailyData.details.map((detail: string, i: number) => (
                    <span key={i} className="text-[7.5px] leading-tight text-gray-300/80 font-bold truncate uppercase tracking-wide">
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export default function Statistics({ allBets, onBack }: Props) {
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [reactionStats, setReactionStats] = useState({
    mostLiked: "Učitavanje...",
    mostDisliked: "Učitavanje...",
    maxLikes: 0,
    maxDislikes: 0
  });

  useEffect(() => { setMounted(true); }, []);

  // Preload + decode dice watermark
  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.src = DICE_SRC;
    img.decode?.().catch(() => {});
  }, []);

  // Fetch reaction leaders from DB
  useEffect(() => {
    async function fetchReactionLeaderboards() {
      const { data, error } = await supabase
        .from('pick_reactions')
        .select('target_player, reaction_type');

      if (error || !data) {
        console.error("Error fetching reaction stats:", error);
        setReactionStats({ mostLiked: "---", mostDisliked: "---", maxLikes: 0, maxDislikes: 0 });
        return;
      }

      const playerStats: Record<string, { likes: number; dislikes: number }> = {};

      data.forEach((row) => {
        if (!playerStats[row.target_player]) {
          playerStats[row.target_player] = { likes: 0, dislikes: 0 };
        }
        if (row.reaction_type === 'like') {
          playerStats[row.target_player].likes++;
        } else if (row.reaction_type === 'dislike') {
          playerStats[row.target_player].dislikes++;
        }
      });

      let mostLiked = "Niko još";
      let mostDisliked = "Niko još";
      let maxLikes = 0;
      let maxDislikes = 0;

      Object.entries(playerStats).forEach(([player, counts]) => {
        if (counts.likes > maxLikes) {
          maxLikes = counts.likes;
          mostLiked = player;
        }
        if (counts.dislikes > maxDislikes) {
          maxDislikes = counts.dislikes;
          mostDisliked = player;
        }
      });

      setReactionStats({ mostLiked, mostDisliked, maxLikes, maxDislikes });
    }

    fetchReactionLeaderboards();
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isFullscreen]);

  // ── DOUBLE/TRIPLE-PICK PARLAY STATS & HISTORICAL STREAKS (BEST 2 OF 3 WON ODDS) ──
  const playerStats = useMemo(() => {
    const stats = PLAYERS.map(player => {
      const rows = allBets[player] || [];

      // Individual pick counters
      let totalResolvedPicks = 0;
      let wonPicks = 0;
      let minSingleOdd = Infinity;
      let minSingleMatch = "";

      // Daily ticket counters
      let totalScore = 0;
      let perfectDays = 0;       // Winning tickets (>= 2 won legs, top 2 multiplied)
      let oneOffDays = 0;        // Resolved tickets with only 1 win
      let resolvedTickets = 0;   // Tickets where all active legs are resolved
      let totalTicketOddsPlayed = 0;
      let playedTicketsCount = 0;
      let totalWonTicketOdds = 0;

      // Loss streak (individual picks)
      let maxLossStreak = 0;
      let currentLossCount = 0;

      rows.forEach((row: any) => {
        const m1 = row.match1;
        const m2 = row.match2;
        const m3 = row.match3;
        if (!m1 || !m2) return;

        const hasJoker = Boolean(row.hasJoker || (m3 && m3.status !== 'empty'));
        const candidateSlots = hasJoker ? [m1, m2, m3 ?? { status: 'empty', odds: 0 }] : [m1, m2];
        const filledSlots = candidateSlots.filter((m: any) => m && m.status !== 'empty');
        const expectedSlots = hasJoker ? 3 : 2;

        if (filledSlots.length === expectedSlots) {
          const aliveSorted = [...filledSlots]
            .filter((m: any) => m.status === 'win' || m.status === 'pending')
            .sort((a: any, b: any) => b.odds - a.odds);

          if (aliveSorted.length >= 2) {
            totalTicketOddsPlayed += aliveSorted[0].odds * aliveSorted[1].odds;
            playedTicketsCount++;
          }
        }

        const isAllResolved =
          filledSlots.length === expectedSlots &&
          filledSlots.every((m: any) => m.status === 'win' || m.status === 'loss');

        if (isAllResolved) {
          resolvedTickets++;
        }

        const wonSorted = [...filledSlots]
          .filter((m: any) => m.status === 'win')
          .sort((a: any, b: any) => b.odds - a.odds);

        if (wonSorted.length >= 2) {
          const comboOdds = parseFloat((wonSorted[0].odds * wonSorted[1].odds).toFixed(2));
          totalScore += comboOdds;
          totalWonTicketOdds += comboOdds;
          perfectDays++;
        } else if (isAllResolved && wonSorted.length === 1) {
          oneOffDays++;
        }
      });

      const allMatches = rows
        .flatMap((r: any) => [r.match1, r.match2, r.match3])
        .filter((m: any) => m && m.status !== 'empty');

      allMatches.forEach((m: any) => {
        if (m.odds < minSingleOdd) {
          minSingleOdd = m.odds;
          minSingleMatch = m.name;
        }
        if (m.status === 'win' || m.status === 'loss') {
          totalResolvedPicks++;
          if (m.status === 'win') wonPicks++;
        }
      });

      const chronologicalMatches = allMatches.filter((m: any) => m.status === 'win' || m.status === 'loss');

      chronologicalMatches.forEach((m: any) => {
        if (m.status === 'loss') {
          currentLossCount++;
          if (currentLossCount > maxLossStreak) maxLossStreak = currentLossCount;
        } else {
          currentLossCount = 0;
        }
      });

      let activeCount = 0;
      let activeType: 'win' | 'loss' | null = null;
      const reversedMatches = [...chronologicalMatches].reverse();
      for (const m of reversedMatches) {
        if (activeType === null) { activeType = m.status as 'win' | 'loss'; activeCount = 1; }
        else if (m.status === activeType) activeCount++;
        else break;
      }

      return {
        player,
        pickHitRate:     totalResolvedPicks > 0 ? parseFloat(((wonPicks / totalResolvedPicks) * 100).toFixed(1)) : 0,
        ticketHitRate:   resolvedTickets > 0    ? parseFloat(((perfectDays / resolvedTickets) * 100).toFixed(1)) : 0,
        avgTicketPlayed: playedTicketsCount > 0 ? parseFloat((totalTicketOddsPlayed / playedTicketsCount).toFixed(2)) : 0,
        avgTicketWon:    perfectDays > 0        ? parseFloat((totalWonTicketOdds / perfectDays).toFixed(2)) : 0,
        wonPicks,
        totalResolvedPicks,
        perfectDays,
        resolvedTickets,
        oneOffDays,
        totalScore:      parseFloat(totalScore.toFixed(2)),
        minSingleOdd,
        minSingleMatch,
        maxLossStreak,
        activeCount,
        activeType,
      };
    }).sort((a, b) => b.totalScore - a.totalScore || b.ticketHitRate - a.ticketHitRate);

    const singleOddsArr = stats.map(s => s.minSingleOdd).filter(v => v < Infinity);
    const allTimeLowestSingle = singleOddsArr.length > 0 ? Math.min(...singleOddsArr) : Infinity;

    const historicalLossStreaks = stats.map(s => s.maxLossStreak);
    const allTimeHighLoss = historicalLossStreaks.length > 0 ? Math.max(...historicalLossStreaks) : -1;

    const avgWonArr = stats.map(s => s.avgTicketWon).filter(v => v > 0);
    const maxAvgWon = avgWonArr.length > 0 ? Math.max(...avgWonArr) : -1;

    const perfectDaysArr = stats.map(s => s.perfectDays);
    const maxPerfectDays = perfectDaysArr.length > 0 ? Math.max(...perfectDaysArr) : -1;

    const oneOffDaysArr = stats.map(s => s.oneOffDays);
    const maxOneOffDays = oneOffDaysArr.length > 0 ? Math.max(...oneOffDaysArr) : -1;

    return stats.map(s => ({
      ...s,
      isKamikaze:   s.avgTicketWon === maxAvgWon && maxAvgWon > 0,
      isRetard:     s.minSingleOdd === allTimeLowestSingle && allTimeLowestSingle < Infinity,
      isJadnik:     s.maxLossStreak === allTimeHighLoss && allTimeHighLoss > 1,
      isBoomMaster: s.perfectDays === maxPerfectDays && maxPerfectDays > 0,
      isTragicar:   s.oneOffDays === maxOneOffDays && maxOneOffDays > 0,
    }));
  }, [allBets]);

  const retardi     = playerStats.filter(s => s.isRetard);
  const jadnici     = playerStats.filter(s => s.isJadnik);
  const boomMasters = playerStats.filter(s => s.isBoomMaster);
  const tragicari   = playerStats.filter(s => s.isTragicar);

  // ── TIMELINE DATA (BEST-2-OF-3 WON ODDS MULTIPLIED) ──
  const timelineData = useMemo(() => {
    const allDates = [...new Set(PLAYERS.flatMap(p => (allBets[p] || []).map(r => r.date)))].sort();
    const running: Record<string, number> = {};
    PLAYERS.forEach(p => running[p] = 0);

    return allDates.map(date => {
      const point: any = { date: date.slice(5) };

      PLAYERS.forEach(player => {
        const row: any = allBets[player]?.find(r => r.date === date);
        let dailyAdded = 0;
        let busted = false;
        const dailyDetails: string[] = [];

        if (row) {
          const legs = [row.match1, row.match2, row.match3].filter((m: any) => m && m.status !== 'empty');
          const wonSorted = [...legs]
            .filter((m: any) => m.status === 'win')
            .sort((a: any, b: any) => b.odds - a.odds);

          if (wonSorted.length >= 2) {
            const combo = parseFloat((wonSorted[0].odds * wonSorted[1].odds).toFixed(2));
            running[player] += combo;
            dailyAdded = combo;
          } else if (legs.some((m: any) => m.status === 'loss') && wonSorted.length < 2) {
            busted = true;
          }

          legs.forEach((m: any) => {
            if (m.status === 'win') {
              dailyDetails.push(`✅ ${m.name} (${m.odds.toFixed(2)})`);
            } else if (m.status === 'loss') {
              dailyDetails.push(`❌ ${m.name} (${m.odds.toFixed(2)})`);
            } else if (m.status === 'pending') {
              dailyDetails.push(`⏳ ${m.name} (${m.odds.toFixed(2)})`);
            }
          });
        }

        point[player] = parseFloat(running[player].toFixed(2));
        point[`${player}_daily`] = {
          added: dailyAdded,
          busted,
          details: dailyDetails.length > 0 ? dailyDetails : ['Nema upisanih parova']
        };
      });
      return point;
    });
  }, [allBets]);

  // ── WALL OF SHAME: TOP 5 SMALLEST ACCUMULATED DAILY TICKETS ──
  const smallestTickets = useMemo(() => {
    const tickets: {
      player: string;
      combinedOdd: number;
    }[] = [];

    PLAYERS.forEach(player => {
      (allBets[player] || []).forEach((row: any) => {
        const legs = [row.match1, row.match2, row.match3].filter((m: any) => m && m.status !== 'empty');
        const hasJoker = Boolean(row.hasJoker || (row.match3 && row.match3.status !== 'empty'));
        const expectedCount = hasJoker ? 3 : 2;

        if (legs.length === expectedCount) {
          const sortedOdds = [...legs].map((m: any) => m.odds).sort((a: number, b: number) => b - a);
          const pairProduct = parseFloat((sortedOdds[0] * sortedOdds[1]).toFixed(2));
          tickets.push({
            player,
            combinedOdd: pairProduct,
          });
        }
      });
    });

    return tickets.sort((a, b) => a.combinedOdd - b.combinedOdd).slice(0, 5);
  }, [allBets]);

  const streakLabel = (s: typeof playerStats[0]) => {
    if (!s.activeType || s.activeCount === 0) return <span className="text-white/30 text-[10px] font-bold">–</span>;
    const isWin = s.activeType === 'win';
    return (
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
        isWin
          ? 'text-green-300 bg-green-500/15 border-green-500/30'
          : 'text-red-300 bg-red-500/15 border-red-500/30'
      }`}>
        {isWin ? '🔥' : '❄️'} {s.activeCount}{isWin ? 'W' : 'L'}
      </span>
    );
  };

  const renderRaceChart = (chartHeight: number) => (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <AreaChart data={timelineData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
        <defs>
          {PLAYERS.map(p => (
            <linearGradient key={p} id={`color_${p}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PLAYER_THEMES[p].hex} stopOpacity={0.42} />
              <stop offset="95%" stopColor={PLAYER_THEMES[p].hex} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <XAxis
          dataKey="date"
          stroke="rgba(255,204,0,0.15)"
          tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)', fontWeight: 'bold' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="rgba(255,204,0,0.15)"
          tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.45)', fontWeight: 'bold' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: 'rgba(255,204,0,0.28)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
        />
        <Legend
          wrapperStyle={{ fontSize: '9px', fontWeight: 'black', textTransform: 'uppercase', letterSpacing: '0.08em', paddingTop: '10px' }}
          iconType="circle"
        />

        {PLAYERS.map(p => (
          <Area
            key={p}
            type="monotone"
            dataKey={p}
            stroke={PLAYER_THEMES[p].hex}
            strokeWidth={2.5}
            fill={`url(#color_${p})`}
            activeDot={{ r: 5, strokeWidth: 2, stroke: '#020a24', fill: PLAYER_THEMES[p].hex }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <style>{`
        @keyframes eu-ring-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .eu-ring-anim { animation: eu-ring-spin 70s linear infinite; }
      `}</style>

      <div
        className="min-h-screen flex flex-col font-sans text-white relative overflow-x-hidden"
        style={{ background: 'linear-gradient(165deg, #020a24 0%, #01379b 45%, #03091c 100%)' }}
      >
        {/* ── TEXTURE ── */}
        <div className="fixed inset-0 wc-jersey-bg pointer-events-none opacity-35" />

        {/* ── DICE WATERMARK + SLOW EU STAR RING ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden select-none">
          <div
            className="absolute top-[34%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] md:w-[640px] md:h-[640px] opacity-[0.24]"
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
            className="eu-ring-anim absolute top-[34%] left-1/2 w-[500px] h-[500px] md:w-[680px] md:h-[680px] opacity-[0.16]"
            style={GPU_LAYER}
            fontSize={8}
          />
        </div>

        {/* ── FLOODLIGHTS ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="wc-beam-l absolute" style={{ ...GPU_LAYER, top: 0, left: '15%', width: '280px', height: '70vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 85%)', transformOrigin: 'top center', filter: 'blur(44px)' }} />
          <div className="wc-beam-r absolute" style={{ ...GPU_LAYER, top: 0, right: '15%', width: '280px', height: '70vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 85%)', transformOrigin: 'top center', filter: 'blur(44px)' }} />
          <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '500px', background: 'radial-gradient(ellipse at top, rgba(255,204,0,0.10) 0%, transparent 65%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '90vw', height: '32vh', background: 'radial-gradient(ellipse at bottom, rgba(239,68,68,0.10) 0%, transparent 70%)' }} />
        </div>

        {/* ── FLOATING DICE ── */}
        <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
          <span className="wc-float      absolute text-6xl" style={{ opacity: 0.05, top: '16%',    left: '3%'  }}>🎲</span>
          <span className="wc-float-slow absolute text-8xl" style={{ opacity: 0.04, bottom: '16%', right: '2%' }}>🎲</span>
          <span className="wc-float-med  absolute text-4xl" style={{ opacity: 0.06, top: '52%',    right: '5%' }}>🎲</span>
        </div>

        {/* ── MAIN PADDED CONTENT ── */}
        <div className="flex-1 w-full p-3 md:p-6 pb-8 relative z-10">
          {/* ── HEADER ── */}
          <div className="flex justify-center items-center mb-6 pt-2 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-1">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-yellow-400/50" />
                <h2 className="text-[11px] font-black text-yellow-300/80 uppercase tracking-[0.4em] pl-[0.4em]">🇪🇺 Euro Model</h2>
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-yellow-400/50" />
              </div>
              <h1 className="wc-shine-text text-3xl md:text-5xl font-black uppercase tracking-tighter drop-shadow-[0_0_30px_rgba(250,204,21,0.35)]">
                Statistika
              </h1>
            </div>
          </div>

          <div className="max-w-6xl mx-auto space-y-5">

            {/* ── 1. PLAYER PERFORMANCE CARDS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {playerStats.map((stat, idx) => {
                const p = PLAYER_THEMES[stat.player];
                return (
                  <div
                    key={stat.player}
                    className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl flex flex-col"
                    style={{
                      background: 'linear-gradient(155deg, rgba(0, 24, 82, 0.62) 0%, rgba(1, 10, 34, 0.78) 100%)',
                      border: idx === 0 ? '1px solid rgba(255, 204, 0, 0.45)' : `1px solid ${p.hex}40`,
                      boxShadow: idx === 0 ? '0 0 30px rgba(255, 204, 0, 0.12)' : undefined,
                    }}
                  >
                    {idx === 0 && <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-yellow-500 via-yellow-300 to-yellow-500" />}

                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-2 border-white/20 overflow-hidden bg-gray-900 shadow-md shrink-0">
                          <img src={p.icon} alt={stat.player} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col justify-center">
                          <h2 className={`text-lg font-black uppercase tracking-widest ${p.text} leading-none mb-1.5`}>{stat.player}</h2>
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-[8px] font-black text-yellow-300/80 uppercase tracking-widest bg-yellow-400/10 px-1.5 py-0.5 rounded border border-yellow-400/20">
                              #{idx + 1}
                            </span>
                            {stat.isKamikaze && (
                              <span className="text-[8px] font-black text-amber-300 uppercase tracking-widest bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                                💥 Kamikaza
                              </span>
                            )}
                            {stat.isBoomMaster && (
                              <span className="text-[8px] font-black text-yellow-300 uppercase tracking-widest bg-yellow-500/15 px-1.5 py-0.5 rounded border border-yellow-500/30">
                                🚀 Maher
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right pt-1">{streakLabel(stat)}</div>
                    </div>

                    <div
                      className="space-y-2 p-3 rounded-2xl mt-auto"
                      style={{ background: 'rgba(0, 8, 28, 0.55)', border: '1px solid rgba(255, 204, 0, 0.10)' }}
                    >
                      <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                        <span className="text-[9px] text-gray-300/70 uppercase font-bold tracking-widest">Tiket Dobitni %</span>
                        <span className={`font-black text-xs tabular-nums ${stat.ticketHitRate >= 35 ? 'text-green-400' : 'text-yellow-300'}`}>
                          {stat.ticketHitRate}% <span className="text-[8px] text-gray-400">({stat.perfectDays}/{stat.resolvedTickets})</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                        <span className="text-[9px] text-gray-300/70 uppercase font-bold tracking-widest">Pojedinačni Tip %</span>
                        <span className={`font-black text-xs tabular-nums ${stat.pickHitRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                          {stat.pickHitRate}% <span className="text-[8px] text-gray-400">({stat.wonPicks}/{stat.totalResolvedPicks})</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                        <span className="text-[9px] text-gray-300/70 uppercase font-bold tracking-widest">Pros. Kvota Tiketa</span>
                        <span className="font-black text-xs text-white tabular-nums">{stat.avgTicketPlayed.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                        <span className="text-[9px] text-gray-300/70 uppercase font-bold tracking-widest">Pros. Pogođeni Tiket</span>
                        <span className="font-black text-xs text-cyan-300 tabular-nums">{stat.avgTicketWon > 0 ? stat.avgTicketWon.toFixed(2) : '–'}</span>
                      </div>
                      <div className="flex justify-between items-center pt-0.5">
                        <span className="text-[9px] text-yellow-300/80 uppercase font-black tracking-widest">Total Score</span>
                        <span className={`font-black text-sm tabular-nums ${idx === 0 ? 'text-yellow-300 drop-shadow-[0_0_8px_rgba(255,204,0,0.45)]' : 'text-white'}`}>
                          {stat.totalScore.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── 2. POPULARITY REACTION LEADERBOARDS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
                style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">❤️</div>
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                  <span className="text-2xl drop-shadow-lg">❤️</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-red-300 italic">Miljenik Grupe</h3>
                    <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najviše lajkova na parovima</p>
                  </div>
                </div>
                <div className="relative z-10">
                  {reactionStats.maxLikes === 0 ? (
                    <div className="text-center py-2 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema lajkova</div>
                  ) : (
                    <div className="flex items-center gap-3 bg-black/40 border border-red-500/25 p-2.5 rounded-2xl">
                      {PLAYER_THEMES[reactionStats.mostLiked] && (
                        <img src={PLAYER_THEMES[reactionStats.mostLiked].icon} alt={reactionStats.mostLiked} className="w-9 h-9 rounded-full border border-red-400/50 shrink-0 object-cover" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-white uppercase leading-none">{reactionStats.mostLiked}</span>
                        <span className="text-[10px] font-black text-red-300 mt-1">🔥 {reactionStats.maxLikes} lajkova</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(168,85,247,0.25)' }}
              >
                <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">💔</div>
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                  <span className="text-2xl drop-shadow-lg">💔</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-purple-300 italic">Dežurni Degenerik</h3>
                    <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najviše dislajkovani tiketi</p>
                  </div>
                </div>
                <div className="relative z-10">
                  {reactionStats.maxDislikes === 0 ? (
                    <div className="text-center py-2 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema dislajkova</div>
                  ) : (
                    <div className="flex items-center gap-3 bg-black/40 border border-purple-500/25 p-2.5 rounded-2xl">
                      {PLAYER_THEMES[reactionStats.mostDisliked] && (
                        <img src={PLAYER_THEMES[reactionStats.mostDisliked].icon} alt={reactionStats.mostDisliked} className="w-9 h-9 rounded-full border border-purple-400/50 shrink-0 object-cover" />
                      )}
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-white uppercase leading-none">{reactionStats.mostDisliked}</span>
                        <span className="text-[10px] font-black text-purple-300 mt-1">🤡 {reactionStats.maxDislikes} dislajkova</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 3. TITLE RACE CHART ── */}
            {mounted && timelineData.length > 0 && (
              <div className="p-4 rounded-3xl backdrop-blur-md shadow-xl" style={EU_CARD_STYLE}>
                <div className="mb-4 flex justify-between items-center">
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300/70">🎲 Kumulativni Bodovi</h3>
                    <p className="text-lg font-black uppercase italic tracking-tighter leading-none mt-0.5">Trka za titulu</p>
                  </div>
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all text-yellow-300 cursor-pointer"
                    style={{ background: 'rgba(255, 204, 0, 0.12)', border: '1px solid rgba(255, 204, 0, 0.25)' }}
                    title="Fullscreen Mode"
                  >
                    ⛶ Fullscreen
                  </button>
                </div>

                <div className="w-full -ml-2 pr-2">
                  {renderRaceChart(260)}
                </div>
              </div>
            )}

            {/* ── 4. HISTORICAL ALL-TIME AWARDS ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div
                className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
                style={{ background: 'linear-gradient(135deg, rgba(255,204,0,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(255,204,0,0.28)' }}
              >
                <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">🚀</div>
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                  <span className="text-2xl drop-shadow-lg">🚀</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-yellow-300 italic">Maher</h3>
                    <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najviše dobitnih tiketa</p>
                  </div>
                </div>
                <div className="relative z-10">
                  {boomMasters.length === 0 ? (
                    <div className="text-center py-2 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema dobijenih dnevnih tiketa</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {boomMasters.map(b => (
                        <div key={b.player} className="flex items-center gap-2.5 bg-black/40 border border-yellow-400/25 p-2 rounded-2xl flex-1 min-w-[130px]">
                          <img src={PLAYER_THEMES[b.player].icon} alt={b.player} className="w-8 h-8 rounded-full border border-yellow-400/50 shrink-0 object-cover" />
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white uppercase leading-none">{b.player}</span>
                            <span className="text-[10px] font-black text-yellow-300 mt-1">💥 {b.perfectDays} tiketa</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
                style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(249,115,22,0.28)' }}
              >
                <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">🧨</div>
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                  <span className="text-2xl drop-shadow-lg">🧨</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-orange-300 italic">Baksuz</h3>
                    <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najviše puta 1 pogođen par (Pad)</p>
                  </div>
                </div>
                <div className="relative z-10">
                  {tragicari.length === 0 ? (
                    <div className="text-center py-2 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema padova</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tragicari.map(t => (
                        <div key={t.player} className="flex items-center gap-2.5 bg-black/40 border border-orange-400/25 p-2 rounded-2xl flex-1 min-w-[130px]">
                          <img src={PLAYER_THEMES[t.player].icon} alt={t.player} className="w-8 h-8 rounded-full border border-orange-400/50 shrink-0 object-cover" />
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white uppercase leading-none">{t.player}</span>
                            <span className="text-[10px] font-black text-orange-300 mt-1">💀 {t.oneOffDays} puta</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
                style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">🍀</div>
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                  <span className="text-2xl drop-shadow-lg">🍀</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-green-300 italic">Retard</h3>
                    <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najmanja pojedinačna odigrana kvota</p>
                  </div>
                </div>
                <div className="relative z-10">
                  {retardi.length === 0 ? (
                    <div className="text-center py-2 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema odigranih parova</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {retardi.map(r => (
                        <div key={r.player} className="flex items-center gap-2.5 bg-black/40 border border-green-400/25 p-2 rounded-2xl flex-1 min-w-[140px]">
                          <img src={PLAYER_THEMES[r.player].icon} alt={r.player} className="w-8 h-8 rounded-full border border-green-400/50 shrink-0 object-cover" />
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-white uppercase leading-none">{r.player}</span>
                              <span className="text-[10px] font-black text-green-300 tabular-nums">({r.minSingleOdd.toFixed(2)})</span>
                            </div>
                            <span className="text-[9px] font-bold text-gray-300/70 uppercase truncate mt-1">{r.minSingleMatch}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
                style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(168,85,247,0.25)' }}
              >
                <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">😭</div>
                <div className="flex items-center gap-2.5 mb-3 relative z-10">
                  <span className="text-2xl drop-shadow-lg">😭</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-purple-300 italic">Najveći Jadnik</h3>
                    <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najviše promašenih zaredom</p>
                  </div>
                </div>
                <div className="relative z-10">
                  {jadnici.length === 0 ? (
                    <div className="text-center py-2 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema loših streakova</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {jadnici.map(j => (
                        <div key={j.player} className="flex items-center gap-2.5 bg-black/40 border border-purple-400/25 p-2 rounded-2xl flex-1 min-w-[130px]">
                          <img src={PLAYER_THEMES[j.player].icon} alt={j.player} className="w-8 h-8 rounded-full border border-purple-400/50 grayscale shrink-0 object-cover" />
                          <div className="flex flex-col">
                            <span className="text-xs font-black text-white uppercase leading-none">{j.player}</span>
                            <span className="text-[10px] font-black text-purple-300 mt-1">❌ {j.maxLossStreak} tipova</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* ── 5. WALL OF SHAME ── */}
            <div
              className="p-4 rounded-3xl backdrop-blur-md relative overflow-hidden shadow-xl"
              style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.16) 0%, rgba(0,12,46,0.65) 100%)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <div className="absolute top-0 right-0 p-3 opacity-[0.07] text-6xl rotate-12 select-none">🤡</div>
              <div className="flex items-center gap-2.5 mb-4 relative z-10">
                <span className="text-2xl drop-shadow-lg">🤡</span>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-red-400 italic">Zid Srama</h3>
                  <p className="text-[9px] font-bold text-gray-300/60 uppercase tracking-widest">Najmanja muda (najmanja ukupna kvota dnevnog tiketa)</p>
                </div>
              </div>
              <div className="space-y-2 relative z-10">
                {smallestTickets.length === 0 ? (
                  <div className="text-center py-4 text-[9px] uppercase font-black tracking-widest text-gray-400/60">Nema još kompletnih dnevnih tiketa</div>
                ) : (
                  smallestTickets.map((ticket, idx) => {
                    const pt = PLAYER_THEMES[ticket.player];
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-4 py-3 rounded-2xl transition-colors"
                        style={{ background: 'rgba(0, 8, 28, 0.55)', border: '1px solid rgba(239, 68, 68, 0.16)' }}
                      >
                        <span className={`text-xs font-black uppercase tracking-widest ${pt.text}`}>
                          {ticket.player}
                        </span>
                        <span className="text-base font-black text-red-400 tabular-nums drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]">
                          {ticket.combinedOdd.toFixed(2)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ── 6. FULLSCREEN LANDSCAPE MODAL ── */}
        {isFullscreen && (
          <div
            className="fixed inset-0 z-[9999] flex flex-col justify-center items-center p-4"
            style={{ background: 'linear-gradient(165deg, #020a24 0%, #01379b 50%, #03091c 100%)' }}
          >
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 z-[10000] bg-red-500/20 text-red-300 border border-red-500/40 px-3.5 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all cursor-pointer"
            >
              ✕ Close
            </button>

            <div className="w-full h-full max-h-[85vh] flex flex-col justify-center mt-6 pr-4 pl-2">
              {renderRaceChart(window.innerHeight * 0.7)}
            </div>
          </div>
        )}

        {/* ── FULL-BLEED BOTTOM TICKER ── */}
        <div
          className="relative z-10 w-full mt-auto overflow-hidden py-2.5 backdrop-blur-md"
          style={{ borderTop: '1px solid rgba(255, 204, 0, 0.12)', background: 'rgba(1, 8, 28, 0.7)' }}
        >
          <div className="wc-ticker whitespace-nowrap inline-block">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="text-[10px] font-black uppercase tracking-[0.35em] text-yellow-400/35 px-2">
                🎲 &nbsp;·&nbsp; 🇪🇺 EURO MODEL &nbsp;·&nbsp; STATISTIKA &nbsp;·&nbsp; DOBITNI TIKETI &nbsp;·&nbsp; KOCKA JE BAČENA &nbsp;·&nbsp; TRKA ZA TITULU &nbsp;·&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}