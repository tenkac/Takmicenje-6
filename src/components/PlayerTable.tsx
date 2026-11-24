"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AllPlayersData, PLAYERS, MatchStatus } from '../types';
import { betSchema } from '../utils/validation';
import { AnimatePresence, motion, useMotionValue, animate } from 'framer-motion';
import { supabase } from '../lib/supabase';
import MatchComments from './MatchComments';
import ReactionButtons from './ReactionButtons';

interface Props {
  allBets: AllPlayersData;
  activePlayer: string;
  setActivePlayer: (player: string) => void;
  onAddPick: (date: string, sport: string, matchName: string, tip: string, odds: number) => void;
  onToggleStatus: (date: string, matchKey: "match1" | "match2") => void;
  userEmail?: string;
  onDeletePick?: (date: string, playerName: string, matchKey: "match1" | "match2") => void;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
}

const DICE_SRC = '/Kockabezzvijezda.webp';

const PLAYER_THEMES: Record<string, { text: string; border: string; icon: string; hex: string }> = {
  "Vlado":  { text: "text-blue-400",   border: "border-blue-500/50",   icon: "/Avatars/vlado.webp",  hex: "#3b82f6" },
  "Fika":   { text: "text-red-400",    border: "border-red-500/50",    icon: "/Avatars/fika.webp",   hex: "#ef4444" },
  "Labud":  { text: "text-green-400",  border: "border-green-500/50",  icon: "/Avatars/labud.webp",  hex: "#22c55e" },
  "Ilija":  { text: "text-purple-400", border: "border-purple-500/50", icon: "/Avatars/ilija.webp",  hex: "#a855f7" },
  "Dzoni":  { text: "text-yellow-400", border: "border-yellow-500/50", icon: "/Avatars/dzoni.webp",  hex: "#eab308" },
};

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

function EuStarRing({ className, style, fontSize = 8 }: { className?: string; style?: React.CSSProperties; fontSize?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style}>
      {EU_STARS.map((s, i) => (
        <text key={i} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fill="#ffcc00" fontSize={fontSize}>★</text>
      ))}
    </svg>
  );
}

function getTicketSummary(m1: any, m2: any) {
  const hasM1 = m1 && m1.status !== 'empty';
  const hasM2 = m2 && m2.status !== 'empty';
  const hasAnyPick = hasM1 || hasM2;
  const isComplete = hasM1 && hasM2;

  const combinedOdds = isComplete
    ? parseFloat((m1.odds * m2.odds).toFixed(2))
    : hasM1
    ? parseFloat(m1.odds.toFixed(2))
    : hasM2
    ? parseFloat(m2.odds.toFixed(2))
    : 0;

  let ticketState: 'win' | 'loss' | 'pending' | 'incomplete' = 'incomplete';
  if (isComplete) {
    if (m1.status === 'win' && m2.status === 'win') ticketState = 'win';
    else if (m1.status === 'loss' || m2.status === 'loss') ticketState = 'loss';
    else ticketState = 'pending';
  } else if (hasAnyPick) {
    if (m1?.status === 'loss' || m2?.status === 'loss') ticketState = 'loss';
    else ticketState = 'incomplete';
  }

  const earnedPoints = ticketState === 'win' ? combinedOdds : 0;
  const fakeTax = parseFloat((combinedOdds * 0.21).toFixed(2));

  return { hasAnyPick, isComplete, combinedOdds, ticketState, earnedPoints, fakeTax };
}

export default function PlayerTable({
  allBets,
  activePlayer,
  setActivePlayer,
  onAddPick,
  onToggleStatus,
  userEmail,
  onDeletePick,
  selectedDate,
  setSelectedDate,
}: Props) {
  const realTodayStr = new Date().toLocaleDateString('en-CA');
  const activeDateStr = (selectedDate ?? new Date()).toLocaleDateString('en-CA');

  const [form, setForm] = useState({ date: activeDateStr, sport: "⚽", matchName: "", tip: "", odds: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [flashMap, setFlashMap] = useState<Record<string, 'win' | 'loss' | null>>({});
  const [springMap, setSpringMap] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);
  const [subTab, setSubTab] = useState<"individual" | "matchday">("individual");

  const [editingCardKey, setEditingCardKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", tip: "", odds: "" });

  // ── HORIZONTAL CAROUSEL RUBBER-BAND PHYSICS ──
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const rubberX = useMotionValue(0);

  const handleCarouselTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleCarouselTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation(); // keeps PullToRefresh from firing while swiping players horizontally
    const el = carouselRef.current;
    if (!el) return;

    const currentX = e.touches[0].clientX;
    const atStart = el.scrollLeft <= 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    const deltaX = currentX - touchStartX.current;

    if ((atStart && deltaX > 0) || (atEnd && deltaX < 0)) {
      const damped = Math.sign(deltaX) * Math.min(Math.abs(deltaX) * 0.28, 72);
      rubberX.set(damped);
    } else {
      touchStartX.current = currentX;
      if (rubberX.get() !== 0) rubberX.set(0);
    }
  };

  const handleCarouselTouchEnd = () => {
    if (rubberX.get() !== 0) {
      animate(rubberX, 0, { type: "spring", stiffness: 420, damping: 28 });
    }
  };

  // ── VERTICAL PAGE RUBBER-BAND PHYSICS (TOP PRE-REFRESH & BOTTOM BOUNCE) ──
  const touchStartY = useRef(0);
  const touchStartScrollY = useRef(0);
  const isHorizontalSwipe = useRef(false);
  const rubberY = useMotionValue(0);

  const handleVerticalTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartScrollY.current = window.scrollY;
    isHorizontalSwipe.current = false;
  };

  const handleVerticalTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const dx = Math.abs(currentX - touchStartX.current);
    const dy = currentY - touchStartY.current;

    if (dx > Math.abs(dy) && dx > 8) {
      isHorizontalSwipe.current = true;
    }
    if (isHorizontalSwipe.current) return;

    const scrollTop = window.scrollY;
    const atTop = scrollTop <= 0;
    const atBottom = window.innerHeight + scrollTop >= document.documentElement.scrollHeight - 2;

    if (atTop && dy > 0) {
      const dampedTop = Math.min(dy * 0.26, 46);
      rubberY.set(dampedTop);
    } else if (atBottom && dy < 0) {
      const dampedBottom = -Math.min(Math.abs(dy) * 0.28, 72);
      rubberY.set(dampedBottom);
    } else {
      touchStartY.current = currentY;
      if (rubberY.get() !== 0) rubberY.set(0);
    }
  };

  const handleVerticalTouchEnd = () => {
    isHorizontalSwipe.current = false;
    if (rubberY.get() !== 0) {
      animate(rubberY, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  };

  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.src = DICE_SRC;
    img.decode?.().catch(() => {});
  }, []);

  useEffect(() => {
    const rows = allBets[activePlayer];
    let targetDate = new Date().toLocaleDateString('en-CA');

    if (rows && rows.length > 0) {
      const sortedRows = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const lastRow = sortedRows[sortedRows.length - 1];

      if (lastRow.match1.status === "empty" || lastRow.match2.status === "empty") {
        targetDate = lastRow.date;
      } else {
        const [year, month, day] = lastRow.date.split('-').map(Number);
        const nextDayObj = new Date(year, month - 1, day, 12, 0, 0);
        nextDayObj.setDate(nextDayObj.getDate() + 1);

        const nextYear = nextDayObj.getFullYear();
        const nextMonth = String(nextDayObj.getMonth() + 1).padStart(2, '0');
        const nextDay = String(nextDayObj.getDate()).padStart(2, '0');

        targetDate = `${nextYear}-${nextMonth}-${nextDay}`;
      }
    }

    setForm(prev => ({ ...prev, date: targetDate }));
  }, [allBets, activePlayer]);

  useEffect(() => {
    setMounted(false);
    setFlashMap({});
    setSpringMap({});
    setEditingCardKey(null);
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, [activePlayer, subTab]);

  const ADMIN_EMAIL = "vladoadmin@takmicenje.com";
  const isAdmin = userEmail === ADMIN_EMAIL;

  const loggedInPlayerName = React.useMemo(() => {
    if (!userEmail) return "";
    if (userEmail === ADMIN_EMAIL) return "Admin";
    return PLAYERS.find(p => p.toLowerCase() === userEmail.split('@')[0].toLowerCase()) || "";
  }, [userEmail]);

  const isOwner =
    userEmail === ADMIN_EMAIL ||
    (userEmail && userEmail.split('@')[0].toLowerCase() === activePlayer.toLowerCase());

  const hasUserUnlockedDate = useCallback((targetDate: string) => {
    if (userEmail === ADMIN_EMAIL) return true;
    if (!loggedInPlayerName) return false;

    const userRowForDate = allBets[loggedInPlayerName]?.find(r => r.date === targetDate);
    if (!userRowForDate) return false;

    return userRowForDate.match1.status !== 'empty' && userRowForDate.match2.status !== 'empty';
  }, [allBets, loggedInPlayerName, userEmail]);

  const handleAdd = async () => {
    if (isSubmitting) return;
    const result = betSchema.safeParse(form);
    if (!result.success) { alert(result.error.issues[0].message); return; }
    setIsSubmitting(true);
    try {
      onAddPick(result.data.date, result.data.sport, result.data.matchName, result.data.tip, result.data.odds);
      setForm({ ...form, matchName: "", tip: "", odds: "" });
    } catch (e) { console.error(e); }
    finally { setTimeout(() => setIsSubmitting(false), 1000); }
  };

  const handleToggle = useCallback((date: string, playerKey: string, matchKey: "match1" | "match2") => {
    if (editingCardKey) return;

    const cardKey = `${date}-${playerKey}-${matchKey}`;
    const row = allBets[playerKey]?.find(r => r.date === date);
    const match = row?.[matchKey];
    if (!match || match.status === 'empty') return;

    const next = match.status === 'pending' ? 'win' : match.status === 'win' ? 'loss' : 'pending';

    if (navigator.vibrate) {
      if (next === 'win')       navigator.vibrate([25, 15, 55]);
      else if (next === 'loss') navigator.vibrate(70);
      else                      navigator.vibrate(12);
    }

    setSpringMap(prev => ({ ...prev, [cardKey]: true }));
    setTimeout(() => setSpringMap(prev => ({ ...prev, [cardKey]: false })), 380);

    if (next !== 'pending') {
      setFlashMap(prev => ({ ...prev, [cardKey]: next }));
      setTimeout(() => setFlashMap(prev => ({ ...prev, [cardKey]: null })), 520);
    }

    onToggleStatus(date, matchKey);
  }, [allBets, onToggleStatus, editingCardKey]);

  const executeDirectDbUpdate = async (date: string, matchKey: "match1" | "match2", customValueObj: any) => {
    const cleanPlayerName = activePlayer.trim();
    try {
      const { data, error: fetchErr } = await supabase
        .from('player_bets')
        .select('bets')
        .ilike('player_name', cleanPlayerName)
        .maybeSingle();

      if (fetchErr || !data) throw new Error(`Korisnik "${cleanPlayerName}" nije pronađen u bazi podataka.`);

      const currentBetsArray = Array.isArray(data.bets) ? data.bets : [];
      const updatedBetsArray = currentBetsArray.map((ticket: any) => {
        if (ticket.date === date) {
          return { ...ticket, [matchKey]: { ...ticket[matchKey], ...customValueObj } };
        }
        return ticket;
      });

      const { data: updateCheck, error: updateErr } = await supabase
        .from('player_bets')
        .update({ bets: updatedBetsArray })
        .ilike('player_name', cleanPlayerName)
        .select();

      if (updateErr) throw updateErr;
      if (!updateCheck || updateCheck.length === 0) {
        alert("⚠️ Greška: Supabase nije uspeo da izvrši izmenu! Osveži stranicu pa pokušaj ponovo.");
        return;
      }
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert("Greška pri sinhronizaciji baze: " + err.message);
    }
  };

  const handleDeleteClick = async (e: React.MouseEvent, date: string, matchKey: "match1" | "match2") => {
    e.stopPropagation();
    const confirmed = window.confirm(`Da li sigurno želiš da obrišeš ovaj par (${activePlayer} - ${date})?`);
    if (!confirmed) return;

    if (onDeletePick) {
      onDeletePick(date, activePlayer, matchKey);
    } else {
      const emptyPayload = { name: "", tip: "", odds: 0, status: "empty", sport: "⚽" };
      await executeDirectDbUpdate(date, matchKey, emptyPayload);
    }
  };

  const handleEditClick = (e: React.MouseEvent, date: string, matchKey: "match1" | "match2", matchObject: any) => {
    e.stopPropagation();
    setEditingCardKey(`${date}-${matchKey}`);
    setEditForm({ name: matchObject.name, tip: matchObject.tip, odds: matchObject.odds.toString() });
  };

  const handleSaveEdit = async (e: React.FormEvent, date: string, matchKey: "match1" | "match2") => {
    e.stopPropagation();
    const parsedOdds = parseFloat(editForm.odds);
    if (isNaN(parsedOdds) || parsedOdds <= 0) return alert("Unesite ispravnu kvotu!");

    const editPayload = { name: editForm.name, tip: editForm.tip, odds: parsedOdds };
    await executeDirectDbUpdate(date, matchKey, editPayload);
    setEditingCardKey(null);
  };

  const getLegStatusStyle = (s: MatchStatus) => {
    if (s === "win")   return "bg-green-500/12 border-green-400/35";
    if (s === "loss")  return "bg-red-500/12 border-red-400/35";
    if (s === "empty") return "bg-black/25 border-white/10 border-dashed";
    return "bg-blue-950/50 border-yellow-400/15";
  };

  const getOddsRiskStyle = (odds: number) => {
    if (odds < 1.50) return "text-gray-300 border-white/15 bg-white/5";
    if (odds <= 2.50) return "text-cyan-300 border-cyan-400/30 bg-cyan-500/10";
    return "text-yellow-300 border-yellow-400/40 bg-yellow-400/15 shadow-[0_0_10px_rgba(255,204,0,0.12)]";
  };

  const groupedMatchdayPicks = React.useMemo(() => {
    const groups: Record<string, { rowId: number; match1: any; match2: any; picks: any[] }> = {};
    let totalCount = 0;

    PLAYERS.forEach(player => {
      const todayRow = allBets[player]?.find(r => r.date === realTodayStr);
      if (todayRow) {
        const picks: any[] = [];
        if (todayRow.match1.status !== 'empty') picks.push({ match: todayRow.match1, matchKey: 'match1', rowId: todayRow.id });
        if (todayRow.match2.status !== 'empty') picks.push({ match: todayRow.match2, matchKey: 'match2', rowId: todayRow.id });

        if (picks.length > 0) {
          groups[player] = {
            rowId: todayRow.id,
            match1: todayRow.match1,
            match2: todayRow.match2,
            picks,
          };
          totalCount += picks.length;
        }
      }
    });
    return { groups, totalCount };
  }, [allBets, realTodayStr]);

  // Compact betting slip leg inside the daily ticket
  const renderTicketLeg = ({
    date,
    playerKey,
    match,
    matchKey,
    legIndex,
    canToggle,
    canAdminEdit,
  }: {
    date: string;
    playerKey: string;
    match: any;
    matchKey: "match1" | "match2";
    legIndex: number;
    canToggle: boolean;
    canAdminEdit: boolean;
  }) => {
    const currentCardId = `${date}-${matchKey}`;
    const isCurrentCardEditing = editingCardKey === currentCardId && playerKey === activePlayer;
    const isEmpty = !match || match.status === 'empty';

    return (
      <div
        key={matchKey}
        onClick={() => canToggle && !isEmpty && handleToggle(date, playerKey, matchKey)}
        className={`p-2.5 rounded-xl border flex flex-col justify-between min-h-[72px] relative overflow-hidden transition-all ${getLegStatusStyle(match?.status || 'empty')} ${
          canToggle && !isEmpty ? 'cursor-pointer hover:brightness-110 active:scale-[0.99]' : 'cursor-default'
        } ${match?.status === 'pending' ? 'pending-glow' : ''} ${
          springMap[`${date}-${playerKey}-${matchKey}`] ? 'spring-anim' : ''
        }`}
      >
        {flashMap[`${date}-${playerKey}-${matchKey}`] && (
          <div
            className="absolute inset-0 pointer-events-none z-20"
            style={{
              background: flashMap[`${date}-${playerKey}-${matchKey}`] === 'win' ? '#22c55e' : '#ef4444',
              animation: 'flash-overlay 0.5s ease-out both',
            }}
          />
        )}

        {isCurrentCardEditing ? (
          <div className="flex flex-col gap-1 w-full z-40 relative bg-[#020a24]/95 p-1.5 rounded-lg border border-yellow-400/30" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })}
              className="bg-white/10 text-[10px] px-2 py-1 rounded text-white outline-none w-full uppercase font-bold"
              placeholder="Naziv Meča"
            />
            <div className="grid grid-cols-2 gap-1">
              <input
                type="text"
                value={editForm.tip}
                onChange={e => setEditForm({ ...editForm, tip: e.target.value })}
                className="bg-white/10 text-[10px] px-2 py-1 rounded text-white outline-none text-center font-black"
                placeholder="Tip"
              />
              <input
                type="number"
                step="0.01"
                value={editForm.odds}
                onChange={e => setEditForm({ ...editForm, odds: e.target.value })}
                className="bg-white/10 text-[10px] px-2 py-1 rounded text-white outline-none text-center font-black"
                placeholder="Kvota"
              />
            </div>
            <div className="flex gap-1.5 mt-0.5">
              <button onClick={() => setEditingCardKey(null)} className="w-1/2 py-1 bg-white/10 text-[9px] font-black uppercase rounded text-gray-300 cursor-pointer">
                Poništi
              </button>
              <button onClick={e => handleSaveEdit(e, date, matchKey)} className="w-1/2 py-1 bg-yellow-400 text-[9px] font-black uppercase rounded text-[#020a24] shadow-md cursor-pointer">
                Sačuvaj
              </button>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full py-2 text-center opacity-50">
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-yellow-200/60">
              PAR {legIndex + 1} · PRAZAN SLOT
            </span>
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/30 mt-0.5">
              Čeka se unos meča
            </span>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center gap-1.5 mb-1 relative z-10">
              <span className="text-[8px] font-black text-yellow-300/75 uppercase tracking-wider flex items-center gap-1">
                <span>{match.sport || "⚽"}</span>
                <span>PAR {legIndex + 1}</span>
              </span>

              <div className="flex items-center gap-1 relative z-30 shrink-0">
                <span className={`font-black text-[11px] px-1.5 py-0.5 border rounded-md tabular-nums leading-none ${getOddsRiskStyle(match.odds)}`}>
                  {match.odds.toFixed(2)}
                </span>
                {canAdminEdit && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={e => handleEditClick(e, date, matchKey, match)}
                      className="p-0.5 rounded bg-blue-500/15 border border-blue-400/35 text-blue-300 hover:bg-blue-500 hover:text-white transition-all text-[9px] cursor-pointer leading-none"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={e => handleDeleteClick(e, date, matchKey)}
                      className="p-0.5 rounded bg-red-500/15 border border-red-400/35 text-red-300 hover:bg-red-500 hover:text-white transition-all text-[9px] cursor-pointer leading-none"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="my-0.5 text-xs font-black uppercase text-white tracking-wide leading-tight truncate">
              {match.name}
            </div>

            <div className="flex items-center justify-between mt-1 pt-1 border-t border-white/10">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/50">
                TIP: <span className="text-yellow-300 font-black ml-0.5">{match.tip}</span>
              </div>
              <span className="text-[8px] font-black uppercase tracking-wider">
                {match.status === 'win' && <span className="text-green-400">✅ POGOĐEN</span>}
                {match.status === 'loss' && <span className="text-red-400">❌ PROMAŠEN</span>}
                {match.status === 'pending' && <span className="text-blue-300/75">⏳ U TOKU</span>}
              </span>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @keyframes stagger-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes card-spring { 0% { transform: scale(1); } 28% { transform: scale(0.96); } 65% { transform: scale(1.02); } 100% { transform: scale(1); } }
        @keyframes flash-overlay { 0% { opacity: 0; } 25% { opacity: 0.3 } 100% { opacity: 0; } }
        @keyframes pending-glow { 0%, 100% { box-shadow: 0 0 0 rgba(255, 204, 0, 0.12); } 50% { box-shadow: 0 0 12px rgba(255, 204, 0, 0.20); } }
        @keyframes eu-ring-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .eu-ring-anim { animation: eu-ring-spin 70s linear infinite; }
        .spring-anim { animation: card-spring 0.35s cubic-bezier(0.36,0.07,0.19,0.97) both !important; }
        .pending-glow { animation: pending-glow 2.4s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div
        onTouchStart={handleVerticalTouchStart}
        onTouchMove={handleVerticalTouchMove}
        onTouchEnd={handleVerticalTouchEnd}
        onTouchCancel={handleVerticalTouchEnd}
        className="min-h-screen flex flex-col text-white font-sans relative overflow-x-hidden"
        style={{ background: 'linear-gradient(165deg, #020a24 0%, #01379b 45%, #03091c 100%)' }}
      >
        {/* ── TEXTURE ── */}
        <div className="fixed inset-0 wc-jersey-bg pointer-events-none opacity-35" />

        {/* ── DICE WATERMARK + SLOW EU STAR RING ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden select-none">
          <div
            className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] md:w-[640px] md:h-[640px] opacity-[0.22]"
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
            className="eu-ring-anim absolute top-[38%] left-1/2 w-[500px] h-[500px] md:w-[680px] md:h-[680px] opacity-[0.14]"
            style={GPU_LAYER}
            fontSize={8}
          />
        </div>

        {/* ── FLOODLIGHTS ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="wc-beam-l absolute" style={{ ...GPU_LAYER, top: 0, left: '20%', width: '260px', height: '65vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.16) 0%, transparent 80%)', filter: 'blur(48px)' }} />
          <div className="wc-beam-r absolute" style={{ ...GPU_LAYER, top: 0, right: '20%', width: '260px', height: '65vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.16) 0%, transparent 80%)', filter: 'blur(48px)' }} />
        </div>

        {/* ── STICKY SUB-TABS & TOP RUBBER-BAND PLAYER CAROUSEL ── */}
        <div
          className="sticky top-0 z-50 backdrop-blur-xl px-3 md:px-6 py-3 flex flex-col gap-2.5"
          style={{
            background: 'rgba(2, 10, 36, 0.90)',
            borderBottom: '1px solid rgba(255, 204, 0, 0.16)',
          }}
        >
          <div
            className="max-w-7xl w-full mx-auto grid grid-cols-2 p-1 rounded-2xl"
            style={{ background: 'rgba(0, 8, 28, 0.75)', border: '1px solid rgba(255, 204, 0, 0.18)' }}
          >
            <button
              onClick={() => setSubTab("individual")}
              className={`py-3 text-xs font-black uppercase tracking-[0.2em] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 ${
                subTab === "individual"
                  ? "text-yellow-300 shadow-lg"
                  : "text-white/45 hover:text-white"
              }`}
              style={
                subTab === "individual"
                  ? { background: 'linear-gradient(135deg, rgba(255,204,0,0.20) 0%, rgba(1,55,155,0.45) 100%)', border: '1px solid rgba(255,204,0,0.35)' }
                  : undefined
              }
            >
              <span className="text-sm">👤</span>
              <span>PO PROFILIMA</span>
            </button>
            <button
              onClick={() => setSubTab("matchday")}
              className={`py-3 text-xs font-black uppercase tracking-[0.2em] rounded-xl transition-all relative cursor-pointer flex items-center justify-center gap-2 ${
                subTab === "matchday"
                  ? "text-yellow-300 shadow-lg"
                  : "text-white/45 hover:text-white"
              }`}
              style={
                subTab === "matchday"
                  ? { background: 'linear-gradient(135deg, rgba(255,204,0,0.20) 0%, rgba(1,55,155,0.45) 100%)', border: '1px solid rgba(255,204,0,0.35)' }
                  : undefined
              }
            >
              <span className="text-sm">⚡</span>
              <span>SVI DANAS</span>
              {groupedMatchdayPicks.totalCount > 0 && (
                <span className="bg-yellow-400 text-[#020a24] font-black font-sans text-[10px] px-2 py-0.5 rounded-full leading-none shadow-sm">
                  {groupedMatchdayPicks.totalCount}
                </span>
              )}
            </button>
          </div>

          {subTab === "individual" && (
            <div
              ref={carouselRef}
              onTouchStart={handleCarouselTouchStart}
              onTouchMove={handleCarouselTouchMove}
              onTouchEnd={handleCarouselTouchEnd}
              className="max-w-7xl w-full mx-auto overflow-x-auto no-scrollbar py-0.5 px-3 -mx-3 overscroll-x-auto touch-pan-x snap-x animate-[stagger-in_0.2s_ease-out]"
            >
              <motion.div
                style={{ x: rubberX }}
                className="flex md:justify-center gap-2 w-max md:w-full"
              >
                {PLAYERS.map(p => {
                  const isActive = activePlayer === p;
                  const theme = PLAYER_THEMES[p];
                  return (
                    <button
                      key={p}
                      onClick={() => setActivePlayer(p)}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all duration-300 relative shrink-0 snap-center cursor-pointer ${
                        isActive
                          ? `${theme.border} shadow-[0_0_16px_rgba(255,204,0,0.16)] scale-100`
                          : 'border-white/10 opacity-55 hover:opacity-100 active:scale-95'
                      }`}
                      style={{
                        background: isActive ? 'rgba(0, 24, 82, 0.88)' : 'rgba(0, 10, 36, 0.6)',
                      }}
                    >
                      <div className="w-6 h-6 rounded-full overflow-hidden border border-white/25 relative pointer-events-none">
                        <img src={theme.icon} className="w-full h-full object-cover" alt={p} />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest pointer-events-none">{p}</span>
                      {isActive && <span className="w-1.5 h-1.5 rounded-full absolute -top-0.5 -right-0.5 animate-pulse" style={{ backgroundColor: theme.hex }} />}
                    </button>
                  );
                })}
              </motion.div>
            </div>
          )}
        </div>

        {/* ── ELASTIC VERTICAL WORKSPACE ── */}
        <motion.div
          style={{ y: rubberY }}
          className="flex-1 w-full max-w-7xl mx-auto p-3 md:p-6 relative z-10"
        >
          <AnimatePresence mode="wait">
            {subTab === "individual" ? (
              <div
                key="individual"
                className={isOwner ? "grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5" : "max-w-4xl mx-auto"}
              >
                {/* LEFT COLUMN: ADD PICK FORM (ONLY SHOWN FOR OWNER/ADMIN) */}
                {isOwner && (
                  <div className="flex flex-col gap-4 lg:sticky lg:top-[136px] lg:self-start">
                    <div
                      className="p-4 rounded-2xl shadow-xl flex flex-col gap-2.5 backdrop-blur-md"
                      style={{
                        background: 'linear-gradient(155deg, rgba(0, 26, 88, 0.72) 0%, rgba(1, 10, 34, 0.88) 100%)',
                        border: '1px solid rgba(255, 204, 0, 0.25)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-[9px] font-black uppercase tracking-[0.25em] text-yellow-300 flex items-center gap-1.5">
                          🎲 UNESI PAR NA TIKET
                        </h3>
                        {isAdmin && (
                          <span className="bg-red-500/20 text-red-300 border border-red-500/40 text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full tracking-widest">
                            Admin
                          </span>
                        )}
                      </div>

                      <input
                        type="date"
                        value={form.date}
                        onChange={e => {
                          setForm({ ...form, date: e.target.value });
                          setSelectedDate(new Date(e.target.value));
                        }}
                        className="w-full h-[38px] rounded-xl px-3 text-xs font-bold text-white outline-none"
                        style={{ background: 'rgba(0, 8, 28, 0.75)', border: '1px solid rgba(255, 204, 0, 0.18)' }}
                      />

                      <input
                        placeholder="Naziv meča (npr. Real - Bayern)"
                        value={form.matchName}
                        onChange={e => setForm({ ...form, matchName: e.target.value })}
                        className="w-full h-[38px] rounded-xl px-3 text-xs font-bold text-white placeholder-white/25 outline-none"
                        style={{ background: 'rgba(0, 8, 28, 0.75)', border: '1px solid rgba(255, 204, 0, 0.18)' }}
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Tip (Npr. GG)"
                          value={form.tip}
                          onChange={e => setForm({ ...form, tip: e.target.value })}
                          className="w-full h-[38px] rounded-xl px-2.5 text-xs font-black text-center text-white placeholder-white/25 outline-none"
                          style={{ background: 'rgba(0, 8, 28, 0.75)', border: '1px solid rgba(255, 204, 0, 0.18)' }}
                        />
                        <input
                          type="number"
                          placeholder="Kvota"
                          value={form.odds}
                          onChange={e => setForm({ ...form, odds: e.target.value })}
                          className="w-full h-[38px] rounded-xl px-2.5 text-xs text-center font-black text-white placeholder-white/25 outline-none tabular-nums"
                          style={{ background: 'rgba(0, 8, 28, 0.75)', border: '1px solid rgba(255, 204, 0, 0.18)' }}
                        />
                      </div>

                      <button
                        onClick={handleAdd}
                        disabled={isSubmitting}
                        className="w-full h-[40px] font-black text-[11px] uppercase tracking-[0.2em] rounded-xl text-[#020a24] transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer mt-0.5"
                        style={{
                          background: 'linear-gradient(135deg, #ffcc00 0%, #eab308 100%)',
                          boxShadow: '0 6px 20px rgba(255, 204, 0, 0.22)',
                        }}
                      >
                        {isSubmitting ? "Slanje..." : "DODAJ NA TIKET"}
                      </button>
                    </div>
                  </div>
                )}

                {/* RIGHT / MAIN COLUMN: COMPACT DAILY BETTING SLIP TICKETS */}
                <div className="space-y-3.5">
                  {(!allBets[activePlayer] || allBets[activePlayer].length === 0) ? (
                    <div
                      className="p-10 text-center text-xs font-black uppercase tracking-widest text-yellow-200/40 rounded-2xl backdrop-blur-md"
                      style={{ background: 'rgba(0, 20, 70, 0.45)', border: '1px solid rgba(255, 204, 0, 0.16)' }}
                    >
                      {activePlayer} trenutno nema unesenih tiketa.
                    </div>
                  ) : (
                    [...allBets[activePlayer]]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .reverse()
                      .map((row, rowIdx) => {
                        const isToday = row.date === realTodayStr;
                        const isFuture = row.date > realTodayStr;
                        const isRowHidden = !isOwner && !hasUserUnlockedDate(row.date);
                        const { hasAnyPick, isComplete, combinedOdds, ticketState, earnedPoints, fakeTax } = getTicketSummary(row.match1, row.match2);

                        const ticketBorder =
                          ticketState === 'win'
                            ? 'rgba(34, 197, 94, 0.45)'
                            : ticketState === 'loss'
                            ? 'rgba(239, 68, 68, 0.35)'
                            : isToday
                            ? 'rgba(255, 204, 0, 0.45)'
                            : 'rgba(255, 204, 0, 0.18)';

                        return (
                          <div
                            key={row.date}
                            className="rounded-2xl backdrop-blur-md relative overflow-hidden shadow-xl"
                            style={{
                              background: 'linear-gradient(160deg, rgba(0, 24, 82, 0.72) 0%, rgba(1, 10, 34, 0.88) 100%)',
                              border: `1px solid ${ticketBorder}`,
                              boxShadow: ticketState === 'win' ? '0 0 24px rgba(34, 197, 94, 0.12)' : undefined,
                              animation: mounted ? `stagger-in 0.25s ease-out ${Math.min(rowIdx * 0.03, 0.35)}s both` : 'none',
                            }}
                          >
                            {/* ── COMPACT TICKET TOP STUB HEADER ── */}
                            <div
                              className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
                              style={{
                                background: 'rgba(0, 8, 28, 0.55)',
                                borderBottom: '1px dashed rgba(255, 204, 0, 0.22)',
                              }}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="text-xs">🎟️</span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-xs font-black text-white tracking-wider tabular-nums">
                                    {row.date.split('-').reverse().join('.')}
                                  </span>
                                </div>

                                {isToday && (
                                  <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-yellow-400/15 text-yellow-300 rounded-full border border-yellow-400/35 leading-none">
                                    Danas
                                  </span>
                                )}
                                {isFuture && (
                                  <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded-full border border-blue-400/30 leading-none">
                                    Uskoro
                                  </span>
                                )}
                              </div>

                              {/* Ticket Status + Ticket-Level Likes/Dislikes */}
                              {!isRowHidden && (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {hasAnyPick && (
                                    <ReactionButtons
                                      targetPlayer={activePlayer}
                                      bettingRowId={row.id}
                                      matchKey={"ticket" as any}
                                      loggedInPlayer={loggedInPlayerName || "Admin"}
                                    />
                                  )}

                                  {ticketState === 'win' && (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-400/40">
                                      ✅ DOBITAN (2/2)
                                    </span>
                                  )}
                                  {ticketState === 'loss' && (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-400/40">
                                      ❌ PAO TIKET
                                    </span>
                                  )}
                                  {ticketState === 'pending' && (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30">
                                      ⏳ AKTIVAN (2/2)
                                    </span>
                                  )}
                                  {ticketState === 'incomplete' && (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-300/80 border border-yellow-400/25">
                                      ⚠️ NEPOTPUN (1/2)
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* ── COMPACT TICKET BODY (2 LEGS) ── */}
                            <div className="p-3 md:p-3.5">
                              {isRowHidden ? (
                                <div className="flex items-center justify-center p-5 bg-black/40 border border-yellow-400/15 rounded-xl border-dashed">
                                  <span className="text-[9px] font-black text-yellow-200/55 uppercase tracking-[0.2em] flex items-center gap-2 text-center">
                                    🔒 Zaključano dok ne popuniš oba para na svom tiketu za ovaj datum
                                  </span>
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                  {[row.match1, row.match2].map((m, idx) =>
                                    renderTicketLeg({
                                      date: row.date,
                                      playerKey: activePlayer,
                                      match: m,
                                      matchKey: idx === 0 ? "match1" : "match2",
                                      legIndex: idx,
                                      canToggle: Boolean(isOwner),
                                      canAdminEdit: isAdmin,
                                    })
                                  )}
                                </div>
                              )}
                            </div>

                            {/* ── PERFORATED TEAR-OFF FOOTER ── */}
                            {!isRowHidden && (
                              <div className="relative">
                                <div
                                  className="w-3.5 h-3.5 rounded-full absolute -left-1.5 -top-1.5 z-20"
                                  style={{ background: '#020a24', borderRight: `1px solid ${ticketBorder}` }}
                                />
                                <div
                                  className="w-3.5 h-3.5 rounded-full absolute -right-1.5 -top-1.5 z-20"
                                  style={{ background: '#020a24', borderLeft: `1px solid ${ticketBorder}` }}
                                />

                                <div
                                  className="px-4 py-2 flex flex-wrap items-center justify-between gap-2"
                                  style={{
                                    background: 'rgba(0, 6, 22, 0.72)',
                                    borderTop: '1px dashed rgba(255, 204, 0, 0.24)',
                                  }}
                                >
                                  <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/50">
                                    <span>Kvota:</span>
                                    <span className="text-xs font-black text-yellow-300 tabular-nums">
                                      {isComplete
                                        ? `${row.match1.odds.toFixed(2)} × ${row.match2.odds.toFixed(2)} = ${combinedOdds.toFixed(2)}`
                                        : `${combinedOdds.toFixed(2)} (čeka 2. par)`}
                                    </span>
                                  </div>

                                  <div className="flex flex-col items-end">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[8px] font-black uppercase tracking-widest text-white/40">
                                        Dobitak:
                                      </span>
                                      {ticketState === 'win' ? (
                                        <span className="text-xs font-black text-green-400 tabular-nums drop-shadow-[0_0_8px_rgba(74,222,128,0.4)]">
                                          +{earnedPoints.toFixed(2)} pts
                                        </span>
                                      ) : ticketState === 'loss' ? (
                                        <span className="text-xs font-black text-red-400 tabular-nums">
                                          0.00 pts
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-black text-yellow-200/70 tabular-nums">
                                          Potencijalno {combinedOdds.toFixed(2)} pts
                                        </span>
                                      )}
                                    </div>
                                    {combinedOdds > 0 && (
                                      <span className="text-[8px] font-bold uppercase tracking-wider text-white/30 tabular-nums mt-0.5">
                                        Porez (21%): -{fakeTax.toFixed(2)} pts
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* ── TICKET-LEVEL COMMENTS SECTION ── */}
                                {hasAnyPick && (
                                  <div
                                    className="px-4 py-2.5"
                                    style={{
                                      background: 'rgba(0, 4, 16, 0.82)',
                                      borderTop: '1px solid rgba(255, 204, 0, 0.10)',
                                    }}
                                  >
                                    <MatchComments
                                      bettingRowId={row.id}
                                      loggedInPlayer={loggedInPlayerName || "Admin"}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            ) : (
              /* ─────────────── TAB 2: COMPACT LIVE MATCHDAY TICKETS ─────────────── */
              <div key="matchday" className="max-w-4xl mx-auto space-y-4 animate-[stagger-in_0.25s_ease-out]">
                {!hasUserUnlockedDate(realTodayStr) ? (
                  <div
                    className="p-10 text-center rounded-2xl flex flex-col items-center justify-center py-14 gap-2.5 border-dashed backdrop-blur-md"
                    style={{ background: 'rgba(0, 14, 48, 0.65)', border: '1px dashed rgba(255, 204, 0, 0.25)' }}
                  >
                    <span className="text-2xl">🔒</span>
                    <h3 className="text-xs font-black text-yellow-300 uppercase tracking-wider">Pregled je zaključan!</h3>
                    <p className="text-[10px] font-black text-white/55 uppercase tracking-widest leading-relaxed max-w-sm mx-auto">
                      Moraš unijeti oba svoja para za danas prije nego što dobiješ dozvolu da vidiš tikete ostatka grupe.
                    </p>
                  </div>
                ) : Object.keys(groupedMatchdayPicks.groups).length === 0 ? (
                  <div
                    className="p-12 text-center text-xs font-black uppercase tracking-widest text-yellow-200/45 rounded-2xl backdrop-blur-md"
                    style={{ background: 'rgba(0, 20, 70, 0.45)', border: '1px solid rgba(255, 204, 0, 0.16)' }}
                  >
                    Niko još nije unio parove za danas.
                  </div>
                ) : (
                  Object.entries(groupedMatchdayPicks.groups).map(([player, group]) => {
                    const userTheme = PLAYER_THEMES[player];
                    const { isComplete, combinedOdds, ticketState, earnedPoints, fakeTax } = getTicketSummary(group.match1, group.match2);

                    return (
                      <div
                        key={player}
                        className="rounded-2xl backdrop-blur-md relative overflow-hidden shadow-xl"
                        style={{
                          background: 'linear-gradient(160deg, rgba(0, 24, 82, 0.72) 0%, rgba(1, 10, 34, 0.88) 100%)',
                          border: '1px solid rgba(255, 204, 0, 0.22)',
                        }}
                      >
                        {/* Ticket Player Header */}
                        <div
                          className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
                          style={{
                            background: 'rgba(0, 8, 28, 0.55)',
                            borderBottom: '1px dashed rgba(255, 204, 0, 0.22)',
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-full border-2 ${userTheme.border} overflow-hidden shrink-0 shadow-sm`}>
                              <img src={userTheme.icon} className="w-full h-full object-cover" alt={player} />
                            </div>
                            <div>
                              <h3 className={`text-xs font-black uppercase tracking-wider leading-none ${userTheme.text}`}>{player}</h3>
                              <span className="text-[8px] font-bold text-yellow-300/60 uppercase tracking-[0.2em] block mt-0.5">
                                🎟️ Današnji Tiket · {group.picks.length}/2
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5">
                            <ReactionButtons
                              targetPlayer={player}
                              bettingRowId={group.rowId}
                              matchKey={"ticket" as any}
                              loggedInPlayer={loggedInPlayerName || "Admin"}
                            />

                            <div className="text-right">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/40 block leading-none">
                                Kvota
                              </span>
                              <span className="text-xs font-black text-yellow-300 tabular-nums">
                                {combinedOdds.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Ticket Legs */}
                        <div className="p-3 md:p-3.5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {[group.match1, group.match2].map((m, idx) =>
                            renderTicketLeg({
                              date: realTodayStr,
                              playerKey: player,
                              match: m,
                              matchKey: idx === 0 ? "match1" : "match2",
                              legIndex: idx,
                              canToggle: false,
                              canAdminEdit: false,
                            })
                          )}
                        </div>

                        {/* Tear-off Footer + Comments */}
                        <div className="relative">
                          <div
                            className="w-3.5 h-3.5 rounded-full absolute -left-1.5 -top-1.5 z-20"
                            style={{ background: '#020a24', borderRight: '1px solid rgba(255, 204, 0, 0.22)' }}
                          />
                          <div
                            className="w-3.5 h-3.5 rounded-full absolute -right-1.5 -top-1.5 z-20"
                            style={{ background: '#020a24', borderLeft: '1px solid rgba(255, 204, 0, 0.22)' }}
                          />
                          <div
                            className="px-4 py-2 flex items-center justify-between text-[9px] font-black uppercase tracking-widest"
                            style={{
                              background: 'rgba(0, 6, 22, 0.72)',
                              borderTop: '1px dashed rgba(255, 204, 0, 0.24)',
                            }}
                          >
                            <span className="text-white/45">
                              {isComplete ? `${group.match1.odds.toFixed(2)} × ${group.match2.odds.toFixed(2)}` : 'Čeka drugi par'}
                            </span>
                            <div className="flex flex-col items-end">
                              {ticketState === 'win' ? (
                                <span className="text-green-400">✅ +{earnedPoints.toFixed(2)} pts</span>
                              ) : ticketState === 'loss' ? (
                                <span className="text-red-400">❌ 0.00 pts</span>
                              ) : (
                                <span className="text-yellow-200/70">Potencijalno {combinedOdds.toFixed(2)} pts</span>
                              )}
                              {combinedOdds > 0 && (
                                <span className="text-[8px] font-bold text-white/30 tabular-nums mt-0.5">
                                  Porez (21%): -{fakeTax.toFixed(2)} pts
                                </span>
                              )}
                            </div>
                          </div>

                          <div
                            className="px-4 py-2.5"
                            style={{
                              background: 'rgba(0, 4, 16, 0.82)',
                              borderTop: '1px solid rgba(255, 204, 0, 0.10)',
                            }}
                          >
                            <MatchComments
                              bettingRowId={group.rowId}
                              loggedInPlayer={loggedInPlayerName || "Admin"}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── FULL-BLEED BOTTOM TICKER ── */}
        <div
          className="relative z-10 w-full mt-auto overflow-hidden py-2 backdrop-blur-md"
          style={{ borderTop: '1px solid rgba(255, 204, 0, 0.12)', background: 'rgba(1, 8, 28, 0.7)' }}
        >
          <div className="wc-ticker whitespace-nowrap inline-block">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="text-[10px] font-black uppercase tracking-[0.35em] text-yellow-400/35 px-2">
                🎲 &nbsp;·&nbsp; 🇪🇺 EURO MODEL &nbsp;·&nbsp; DNEVNI TIKETI &nbsp;·&nbsp; 2/2 MULTIPLIKATOR &nbsp;·&nbsp; KOCKA JE BAČENA &nbsp;·&nbsp;
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}