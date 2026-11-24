"use client";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { AllPlayersData, Match, BettingRow, EMPTY_MATCH, PLAYERS } from "../types";
import LandingPage from "../components/LandingPage";
import Leaderboard from "../components/Leaderboard";
import PlayerTable from "../components/PlayerTable";
import Login from "../components/Login";
import PullToRefresh from "../components/PullToRefresh";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabase";

const Statistics = dynamic(() => import("../components/Statistics"), { ssr: false });

type AppView = "landing" | "leaderboard" | "tables" | "statistics";

const LEADER_SONGS: Record<string, { song: string; icon: string }> = {
  "Vlado": { song: "/Music/vlado.mp3", icon: "/Avatars/vlado.webp" },
  "Fika":  { song: "/Music/fika.mp3",  icon: "/Avatars/fika.webp" },
  "Labud": { song: "/Music/labud.mp3", icon: "/Avatars/labud.webp" },
  "Ilija": { song: "/Music/ilija.mp3", icon: "/Avatars/ilija.webp" },
  "Dzoni": { song: "/Music/dzoni.mp3", icon: "/Avatars/dzoni.webp" },
};

// 12 EU stars arranged evenly on a circle (30° intervals)
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  const r = 42;
  return { cx: 50 + r * Math.cos(angle), cy: 50 + r * Math.sin(angle) };
});

function EuStarRing({ className, fontSize = 9 }: { className?: string; fontSize?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className}>
      {EU_STARS.map((s, i) => (
        <text key={i} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fill="#ffcc00" fontSize={fontSize}>★</text>
      ))}
    </svg>
  );
}

export default function BettingApp() {
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const [activePlayer, setActivePlayer] = useState<string>("Vlado");
  const [allBets, setAllBets] = useState<AllPlayersData>({
    Vlado: [], Fika: [], Labud: [], Ilija: [], Dzoni: [],
  });
  const [session, setSession] = useState<any>(null);
  const [appLoading, setAppLoading] = useState(true);

  // 👇 1. LIFTED STATE: The main app now controls the calendar date
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // 🎵 LIFTED LEADER AUDIO STATE (iOS PWA gesture-safe)
  const leaderAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isLeaderMusicPlaying, setIsLeaderMusicPlaying] = useState(false);

  const viewHistory = useRef<AppView[]>(["landing"]);

  // Compute current #1 leader using the 2/2 multiplied odds rule
  const currentLeader = useMemo(() => {
    let topPlayer = "";
    let topScore = 0;

    PLAYERS.forEach(player => {
      const rows = allBets[player] || [];
      let score = 0;
      rows.forEach(r => {
        if (r.match1?.status === "win" && r.match2?.status === "win") {
          score += r.match1.odds * r.match2.odds;
        }
      });
      const rounded = parseFloat(score.toFixed(2));
      if (rounded > topScore) {
        topScore = rounded;
        topPlayer = player;
      }
    });

    return topScore > 0 ? { name: topPlayer, score: topScore } : null;
  }, [allBets]);

  const stopLeaderMusic = () => {
    if (leaderAudioRef.current) {
      leaderAudioRef.current.pause();
      leaderAudioRef.current.currentTime = 0;
    }
    setIsLeaderMusicPlaying(false);
  };

  const playLeaderMusic = (leaderName?: string) => {
    const target = leaderName || currentLeader?.name;
    if (!target) return;
    const meta = LEADER_SONGS[target];
    if (!meta?.song) return;

    if (!leaderAudioRef.current) {
      leaderAudioRef.current = new Audio(meta.song);
      leaderAudioRef.current.loop = true;
      leaderAudioRef.current.volume = 0.7;
      leaderAudioRef.current.onended = () => setIsLeaderMusicPlaying(false);
    } else if (!leaderAudioRef.current.src.endsWith(meta.song)) {
      leaderAudioRef.current.src = meta.song;
    }

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Himna Lidera · ${target}`,
        artist: "Euro Model · Podijum",
        artwork: [{ src: meta.icon, sizes: "256x256", type: "image/webp" }],
      });
    }

    // Must be called synchronously inside the user's tap handler for iOS PWA
    leaderAudioRef.current
      .play()
      .then(() => setIsLeaderMusicPlaying(true))
      .catch(() => setIsLeaderMusicPlaying(false));
  };

  const toggleLeaderMusic = () => {
    if (isLeaderMusicPlaying) {
      leaderAudioRef.current?.pause();
      setIsLeaderMusicPlaying(false);
    } else {
      playLeaderMusic();
    }
  };

  const navigateToView = (nextView: AppView) => {
    if (nextView === "leaderboard") {
      // Trigger playback right inside the click event (e.g. if navigated from LandingPage)
      playLeaderMusic();
    } else {
      stopLeaderMusic();
    }

    if (currentView !== nextView) {
      viewHistory.current.push(currentView);
      setCurrentView(nextView);
    }
  };

  const navigateBack = () => {
    if (viewHistory.current.length > 0) {
      const prev = viewHistory.current.pop();
      if (prev) {
        if (prev === "leaderboard") playLeaderMusic();
        else stopLeaderMusic();
        setCurrentView(prev);
      }
    } else {
      stopLeaderMusic();
      setCurrentView("landing");
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (leaderAudioRef.current) {
        leaderAudioRef.current.pause();
        leaderAudioRef.current = null;
      }
    };
  }, []);

  const fetchBetsData = async () => {
    const { data: betsData } = await supabase
      .from('player_bets')
      .select('player_name, bets');

    if (betsData) {
      const next: AllPlayersData = { Vlado: [], Fika: [], Labud: [], Ilija: [], Dzoni: [] };
      betsData.forEach((row: any) => {
        if (next[row.player_name] !== undefined) next[row.player_name] = row.bets || [];
      });
      setAllBets(next);
    }
  };

  useEffect(() => {
    const init = async () => {
      setAppLoading(true);
      const { data: { session: existing } } = await supabase.auth.getSession();
      setSession(existing);
      await fetchBetsData();
      setAppLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // 👇 2. THE SMART CALENDAR LOGIC
  useEffect(() => {
    if (!allBets[activePlayer]) return;

    const playerRows = allBets[activePlayer];
    const today = new Date();
    
    const tournamentStart = new Date('2026-06-11T00:00:00');
    const tournamentEnd = new Date('2026-07-19T00:00:00');

    const loopLimit = today < tournamentStart ? tournamentEnd : today;
    let checkDate = new Date(tournamentStart);
    let targetDate = today < tournamentStart ? tournamentStart : today;

    while (checkDate <= loopLimit) {
      const year = checkDate.getFullYear();
      const month = String(checkDate.getMonth() + 1).padStart(2, '0');
      const day = String(checkDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const rowForDay = playerRows.find(r => r.date === dateString);

      if (!rowForDay || rowForDay.match1.status === "empty" || rowForDay.match2.status === "empty") {
        targetDate = new Date(checkDate);
        break;
      }

      checkDate.setDate(checkDate.getDate() + 1);
    }

    setSelectedDate(targetDate);
  }, [activePlayer, allBets]);

  const handleRefresh = async () => {
    if (navigator.vibrate) navigator.vibrate(50);
    await fetchBetsData();
  };

  const savePlayerToDb = async (playerName: string, rows: BettingRow[]) => {
    const { error } = await supabase
      .from('player_bets')
      .update({ bets: rows })
      .eq('player_name', playerName);
    if (error) console.error("Error saving:", error);
  };

  const addPick = (date: string, sport: string, matchName: string, tip: string, odds: number) => {
    const newMatch: Match = { sport, name: matchName, tip, odds, status: "pending" };
    setAllBets(prev => {
      const rows = prev[activePlayer] ? [...prev[activePlayer]] : [];
      const idx = rows.findIndex(r => r.date === date);
      if (idx !== -1) {
        const row = { ...rows[idx] };
        if (row.match1.status === "empty") row.match1 = newMatch;
        else if (row.match2.status === "empty") row.match2 = newMatch;
        else { alert("Maximum 2 picks per day allowed!"); return prev; }
        rows[idx] = row;
      } else {
        rows.push({ id: Date.now(), date, match1: newMatch, match2: { ...EMPTY_MATCH } });
        rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      savePlayerToDb(activePlayer, rows);
      return { ...prev, [activePlayer]: rows };
    });
  };

  const toggleStatus = (date: string, matchKey: "match1" | "match2") => {
    setAllBets(prev => {
      const rows = prev[activePlayer].map(row => {
        if (row.date === date && row[matchKey].status !== "empty") {
          const s = row[matchKey].status;
          const next = s === "pending" ? "win" : s === "win" ? "loss" : "pending";
          return { ...row, [matchKey]: { ...row[matchKey], status: next } };
        }
        return row;
      });
      savePlayerToDb(activePlayer, rows);
      return { ...prev, [activePlayer]: rows };
    });
  };

  const getLoggedInPlayerName = () => {
    if (!session?.user?.email) return "Vlado";
    const emailPrefix = session.user.email.split('@')[0].toLowerCase();
    if (emailPrefix === "vladoadmin") return "Vlado";
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).toLowerCase();
  };

  const handleMyPicksTabClick = async () => {
    const myName = getLoggedInPlayerName();
    setActivePlayer(myName);
    await fetchBetsData();
    navigateToView("tables");
  };

  const handleLeaderboardTabClick = async () => {
    // 🎵 Start playback synchronously BEFORE awaiting fetchBetsData so iOS keeps the user-gesture token!
    playLeaderMusic();
    await fetchBetsData();
    if (currentView !== "leaderboard") {
      viewHistory.current.push(currentView);
      setCurrentView("leaderboard");
    }
  };

  if (appLoading) return (
    <div
      className="h-screen flex flex-col items-center justify-center text-white font-sans p-6 text-center relative overflow-hidden"
      style={{ background: 'linear-gradient(165deg, #020a24 0%, #01379b 45%, #03091c 100%)' }}
    >
      <div className="fixed inset-0 wc-jersey-bg pointer-events-none opacity-35" />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="wc-beam-l absolute" style={{ top: 0, left: '22%', width: '240px', height: '70vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 80%)', filter: 'blur(38px)' }} />
        <div className="wc-beam-r absolute" style={{ top: 0, right: '22%', width: '240px', height: '70vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 80%)', filter: 'blur(38px)' }} />
      </div>
      <div className="relative z-10 text-center">
        <div className="wc-gold-pulse text-7xl mb-6 select-none">🎲</div>
        <h1 className="text-4xl md:text-7xl font-black uppercase tracking-tighter leading-none mb-2">
          KOCKA <span className="wc-shine-text">2026</span>
        </h1>
        <p className="text-yellow-300/40 text-xs font-black uppercase tracking-[0.4em] mb-6">🇪🇺 EURO MODEL</p>
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: '#ffcc00' }} />
          <div className="w-2 h-2 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: '#ffcc00' }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#ffcc00' }} />
        </div>
      </div>
    </div>
  );

  if (!session) return <Login onLogin={() => { }} />;

  const renderTabShell = () => {
    switch (currentView) {
      case "landing": return <LandingPage onNavigate={navigateToView} />;
      case "leaderboard":
        return (
          <Leaderboard
            allBets={allBets}
            isPlaying={isLeaderMusicPlaying}
            onToggleMusic={toggleLeaderMusic}
            onPlayerClick={name => {
              setActivePlayer(name);
              navigateToView("tables");
            }}
          />
        );
      case "statistics": return <Statistics allBets={allBets} onBack={navigateBack} />;
      case "tables":
      default:
        return (
          <PlayerTable
            allBets={allBets}
            activePlayer={activePlayer}
            setActivePlayer={setActivePlayer}
            onAddPick={addPick}
            onToggleStatus={toggleStatus}
            userEmail={session.user.email}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
          />
        );
    }
  };

  const navItems: { id: AppView; label: string; icon: string; onClick: () => void }[] = [
    { id: "tables",      label: "Tabele",     icon: "📝", onClick: handleMyPicksTabClick },
    { id: "landing",     label: "Meni",       icon: "🏠", onClick: () => navigateToView("landing") },
    { id: "leaderboard", label: "Podijum",    icon: "🏆", onClick: handleLeaderboardTabClick },
    { id: "statistics",  label: "Statistika", icon: "📊", onClick: () => navigateToView("statistics") },
  ];

  return (
    <div className="min-h-screen bg-[#020a24] text-white pb-20 md:pb-0 md:pl-60 relative overflow-x-hidden">
      <style>{`
        @keyframes nav-star-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        .nav-star-ring { animation: nav-star-spin 45s linear infinite; }
      `}</style>

      <PullToRefresh onRefresh={handleRefresh}>
        <div className="w-full h-full">{renderTabShell()}</div>
      </PullToRefresh>

      {/* ── EURO MODEL NAVIGATION BAR (Bottom on Mobile / Left Sidebar on Desktop) ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 pt-2 pb-[calc(env(safe-area-inset-bottom)+18px)] backdrop-blur-2xl flex justify-around items-center z-[999] px-2 w-full max-w-full overflow-hidden touch-none md:top-0 md:bottom-0 md:left-0 md:right-auto md:w-60 md:h-screen md:flex-col md:justify-start md:items-stretch md:pt-8 md:px-4 md:gap-2 md:pb-8"
        style={{
          background: 'linear-gradient(180deg, rgba(1, 14, 48, 0.94) 0%, rgba(2, 10, 36, 0.97) 100%)',
          borderTop: '1px solid rgba(255, 204, 0, 0.18)',
          boxShadow: '0 -12px 40px rgba(0, 4, 18, 0.85)',
        }}
      >
        <div
          className="hidden md:block absolute top-0 right-0 bottom-0 w-px pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(255,204,0,0.28) 0%, rgba(255,204,0,0.10) 50%, rgba(255,204,0,0.22) 100%)' }}
        />

        <div
          className="hidden md:block absolute -top-12 left-1/2 -translate-x-1/2 w-56 h-56 pointer-events-none rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(255,204,0,0.09) 0%, transparent 70%)' }}
        />

        <div
          className="hidden md:flex flex-col items-center mb-6 px-2 text-center pb-6 relative"
          style={{ borderBottom: '1px solid rgba(255, 204, 0, 0.14)' }}
        >
          <div className="relative flex items-center justify-center w-16 h-16 mb-2.5 select-none">
            <EuStarRing
              className="nav-star-ring absolute top-1/2 left-1/2 w-full h-full opacity-75 pointer-events-none"
              fontSize={8}
            />
            <span className="text-3xl drop-shadow-[0_0_12px_rgba(255,204,0,0.5)]">🎲</span>
          </div>

          <div className="flex items-center justify-center gap-2 mb-0.5">
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-300/80">
              🇪🇺 Euro Model
            </span>
          </div>
          <h2 className="wc-shine-text text-lg font-black uppercase tracking-tighter">
            Takmičenje
          </h2>
          <span className="text-[9px] text-yellow-200/35 font-bold uppercase tracking-[0.25em] mt-0.5">
            Kocka je bačena
          </span>
        </div>

        {navItems.map(item => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`relative flex flex-col items-center justify-center flex-1 min-w-0 h-12 rounded-xl transition-all active:scale-90 cursor-pointer md:flex-row md:justify-start md:flex-initial md:h-12 md:px-4 md:active:scale-95 ${
                isActive
                  ? "text-yellow-300 font-black scale-105 md:scale-100"
                  : "text-white/45 font-bold hover:text-white/85 md:text-white/60 md:hover:bg-white/[0.04] md:hover:text-white"
              }`}
              style={
                isActive
                  ? {
                      background: 'linear-gradient(135deg, rgba(255, 204, 0, 0.16) 0%, rgba(1, 55, 155, 0.28) 100%)',
                      border: '1px solid rgba(255, 204, 0, 0.32)',
                      boxShadow: 'inset 0 1px 0 rgba(255, 204, 0, 0.25), 0 0 20px rgba(255, 204, 0, 0.12)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {isActive && (
                <>
                  <span
                    className="md:hidden absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] rounded-full"
                    style={{ background: '#ffcc00', boxShadow: '0 0 8px #ffcc00' }}
                  />
                  <span
                    className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                    style={{ background: '#ffcc00', boxShadow: '0 0 10px #ffcc00' }}
                  />
                </>
              )}

              <span className={`text-xl mb-0.5 shrink-0 md:mb-0 md:text-lg ${isActive ? 'drop-shadow-[0_0_8px_rgba(255,204,0,0.45)]' : ''}`}>
                {item.icon}
              </span>
              <span className="text-[9px] uppercase tracking-wider truncate w-full text-center px-1 md:text-xs md:font-black md:tracking-[0.2em] md:text-left md:px-0 md:ml-3.5">
                {item.label}
              </span>
            </button>
          );
        })}

        <div
          className="hidden md:flex flex-col items-center mt-auto pt-4 text-center"
          style={{ borderTop: '1px solid rgba(255, 204, 0, 0.10)' }}
        >
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-yellow-400/30">
            🎲 · 🇪🇺 · 🏆
          </span>
        </div>
      </nav>
    </div>
  );
}