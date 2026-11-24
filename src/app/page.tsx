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

type AppView = "landing" | "leaderboard" | "tables" | "statistics" | "admin";

export interface JokerGrant {
  id: number;
  player_name: string;
  grant_date: string;
}

const ADMIN_EMAIL = "vladoadmin@takmicenje.com";

const LEADER_SONGS: Record<string, { song: string; icon: string }> = {
  "Vlado": { song: "/Music/vlado.mp3", icon: "/Avatars/vlado.webp" },
  "Fika":  { song: "/Music/fika1.mp3", icon: "/Avatars/fika.webp" },
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

// Helper: evaluates 2-pick or 3-pick ("best 2 won odds") ticket score
function calculateRowScore(row: BettingRow): number {
  const candidates = [row.match1, row.match2, row.match3].filter(
    (m): m is Match => Boolean(m && m.status === "win")
  );
  if (candidates.length < 2) return 0;

  const sortedByOdds = [...candidates].sort((a, b) => b.odds - a.odds);
  return parseFloat((sortedByOdds[0].odds * sortedByOdds[1].odds).toFixed(2));
}

export default function BettingApp() {
  const [currentView, setCurrentView] = useState<AppView>("landing");
  const [activePlayer, setActivePlayer] = useState<string>("Vlado");
  const [allBets, setAllBets] = useState<AllPlayersData>({
    Vlado: [], Fika: [], Labud: [], Ilija: [], Dzoni: [],
  });
  const [jokerGrants, setJokerGrants] = useState<JokerGrant[]>([]);
  const [session, setSession] = useState<any>(null);
  const [appLoading, setAppLoading] = useState(true);

  // 👇 1. LIFTED STATE: The main app now controls the calendar date
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Admin Joker form state
  const [jokerPlayer, setJokerPlayer] = useState<string>(PLAYERS[0]);
  const [jokerDate, setJokerDate] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [jokerSaving, setJokerSaving] = useState(false);

  // 🎵 LIFTED LEADER AUDIO STATE (iOS PWA gesture-safe)
  const leaderAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isLeaderMusicPlaying, setIsLeaderMusicPlaying] = useState(false);

  const viewHistory = useRef<AppView[]>(["landing"]);

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  const unlockIosMediaChannel = () => {
    try {
      if ("audioSession" in navigator) {
        (navigator as any).audioSession.type = "playback";
      }
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        if (audioCtxRef.current.state === "suspended") {
          audioCtxRef.current.resume();
        }
        const buffer = audioCtxRef.current.createBuffer(1, 1, 22050);
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtxRef.current.destination);
        source.start(0);
      }
    } catch {
      // Ignore if called outside gesture
    }
  };

  // Compute current #1 leader using best-2-of-3 won odds rule
  const currentLeader = useMemo(() => {
    let topPlayer = "";
    let topScore = 0;

    PLAYERS.forEach(player => {
      const rows = allBets[player] || [];
      let score = 0;
      rows.forEach(r => {
        score += calculateRowScore(r);
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

    unlockIosMediaChannel();

    if (!leaderAudioRef.current) {
      leaderAudioRef.current = new Audio(meta.song);
      leaderAudioRef.current.loop = true;
      leaderAudioRef.current.volume = 0.7;
      (leaderAudioRef.current as any).playsInline = true;
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
    if (nextView === "admin" && !isAdmin) return;

    if (nextView === "leaderboard") {
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

  // Pre-cache all leader anthems in Cache Storage
  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;

    const cacheAnthems = async () => {
      try {
        const cache = await caches.open("leader-anthems-v1");
        const urls = Object.values(LEADER_SONGS).map(s => s.song);
        await Promise.all(
          urls.map(async url => {
            const existing = await cache.match(url);
            if (!existing) {
              const res = await fetch(url, { cache: "force-cache" });
              if (res.ok) await cache.put(url, res);
            }
          })
        );
      } catch (err) {
        console.warn("Audio precache skipped:", err);
      }
    };

    cacheAnthems();
  }, []);

  // Cleanup audio & AudioContext on unmount
  useEffect(() => {
    return () => {
      if (leaderAudioRef.current) {
        leaderAudioRef.current.pause();
        leaderAudioRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  const fetchJokerGrants = async () => {
    const { data, error } = await supabase
      .from("joker_grants")
      .select("id, player_name, grant_date")
      .order("grant_date", { ascending: false });

    if (!error && data) {
      setJokerGrants(data);
    }
  };

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
      await Promise.all([fetchBetsData(), fetchJokerGrants()]);
      setAppLoading(false);
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // 👇 2. THE SMART CALENDAR LOGIC (respects 3rd pick when joker is granted)
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
      const hasJoker =
        Boolean(rowForDay?.hasJoker) ||
        jokerGrants.some(g => g.player_name === activePlayer && g.grant_date === dateString);

      const missingRequired =
        !rowForDay ||
        rowForDay.match1?.status === "empty" ||
        rowForDay.match2?.status === "empty" ||
        (hasJoker && (!rowForDay.match3 || rowForDay.match3.status === "empty"));

      if (missingRequired) {
        targetDate = new Date(checkDate);
        break;
      }

      checkDate.setDate(checkDate.getDate() + 1);
    }

    setSelectedDate(targetDate);
  }, [activePlayer, allBets, jokerGrants]);

  const handleRefresh = async () => {
    if (navigator.vibrate) navigator.vibrate(50);
    await Promise.all([fetchBetsData(), fetchJokerGrants()]);
  };

  const savePlayerToDb = async (playerName: string, rows: BettingRow[]) => {
    const { error } = await supabase
      .from('player_bets')
      .update({ bets: rows })
      .eq('player_name', playerName);
    if (error) console.error("Error saving:", error);
  };

  const handleGrantJoker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || jokerSaving) return;

    setJokerSaving(true);
    const { error } = await supabase
      .from("joker_grants")
      .upsert(
        { player_name: jokerPlayer, grant_date: jokerDate },
        { onConflict: "player_name,grant_date" }
      );

    if (error) {
      alert("Greška pri dodjeli jokera: " + error.message);
    } else {
      // Ensure the target player's row has match3 slot initialized if it already exists
      setAllBets(prev => {
        const rows = prev[jokerPlayer] ? [...prev[jokerPlayer]] : [];
        const idx = rows.findIndex(r => r.date === jokerDate);
        if (idx !== -1) {
          const updatedRow: BettingRow = {
            ...rows[idx],
            hasJoker: true,
            match3: rows[idx].match3 ?? { ...EMPTY_MATCH },
          };
          rows[idx] = updatedRow;
          savePlayerToDb(jokerPlayer, rows);
          return { ...prev, [jokerPlayer]: rows };
        }
        return prev;
      });
      await fetchJokerGrants();
    }
    setJokerSaving(false);
  };

  const handleRevokeJoker = async (grant: JokerGrant) => {
    if (!isAdmin) return;
    await supabase.from("joker_grants").delete().eq("id", grant.id);
    await fetchJokerGrants();
  };

  const addPick = (date: string, sport: string, matchName: string, tip: string, odds: number) => {
    const newMatch: Match = { sport, name: matchName, tip, odds, status: "pending" };
    const hasJoker = jokerGrants.some(g => g.player_name === activePlayer && g.grant_date === date);

    setAllBets(prev => {
      const rows = prev[activePlayer] ? [...prev[activePlayer]] : [];
      const idx = rows.findIndex(r => r.date === date);
      if (idx !== -1) {
        const row: BettingRow = {
          ...rows[idx],
          ...(hasJoker ? { hasJoker: true, match3: rows[idx].match3 ?? { ...EMPTY_MATCH } } : {}),
        };
        if (row.match1.status === "empty") {
          row.match1 = newMatch;
        } else if (row.match2.status === "empty") {
          row.match2 = newMatch;
        } else if ((hasJoker || row.hasJoker) && (!row.match3 || row.match3.status === "empty")) {
          row.hasJoker = true;
          row.match3 = newMatch;
        } else {
          alert(hasJoker || row.hasJoker ? "Maksimalno 3 para na Joker tiketu!" : "Maksimalno 2 para dnevno!");
          return prev;
        }
        rows[idx] = row;
      } else {
        rows.push({
          id: Date.now(),
          date,
          match1: newMatch,
          match2: { ...EMPTY_MATCH },
          ...(hasJoker ? { hasJoker: true, match3: { ...EMPTY_MATCH } } : {}),
        });
        rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      savePlayerToDb(activePlayer, rows);
      return { ...prev, [activePlayer]: rows };
    });
  };

  const toggleStatus = (date: string, matchKey: "match1" | "match2" | "match3") => {
    setAllBets(prev => {
      const rows = prev[activePlayer].map(row => {
        const target = row[matchKey];
        if (row.date === date && target && target.status !== "empty") {
          const s = target.status;
          const next = s === "pending" ? "win" : s === "win" ? "loss" : "pending";
          return { ...row, [matchKey]: { ...target, status: next } };
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

  const renderAdminPanel = () => (
    <div className="min-h-screen flex flex-col font-sans text-white p-4 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="text-center pt-2">
        <div className="flex items-center justify-center gap-3 mb-1">
          <div className="h-px w-8 bg-gradient-to-r from-transparent to-yellow-400/50" />
          <span className="text-[10px] font-black text-yellow-300/80 uppercase tracking-[0.35em]">🃏 Admin Kontrola</span>
          <div className="h-px w-8 bg-gradient-to-l from-transparent to-yellow-400/50" />
        </div>
        <h1 className="wc-shine-text text-3xl md:text-4xl font-black uppercase tracking-tight">
          Dodijeli 3. Par
        </h1>
        <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1">
          Računaju se najveće 2 pogođene kvote (2/3 ili 3/3)
        </p>
      </div>

      <form
        onSubmit={handleGrantJoker}
        className="p-5 rounded-2xl space-y-4 backdrop-blur-md shadow-xl"
        style={{
          background: 'linear-gradient(155deg, rgba(0, 24, 82, 0.75) 0%, rgba(1, 10, 34, 0.90) 100%)',
          border: '1px solid rgba(255, 204, 0, 0.25)',
        }}
      >
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-yellow-300/80 mb-2">
            Izaberi igrača
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {PLAYERS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setJokerPlayer(p)}
                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                  jokerPlayer === p
                    ? "bg-yellow-400 text-[#020a24] border-yellow-300 shadow-md"
                    : "bg-black/40 text-white/60 border-white/10 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-yellow-300/80 mb-1.5">
            Datum tiketa
          </label>
          <input
            type="date"
            value={jokerDate}
            onChange={e => setJokerDate(e.target.value)}
            className="w-full min-w-0 max-w-full box-border appearance-none h-[40px] rounded-xl px-3 text-xs font-bold text-white outline-none block"
            style={{ background: "rgba(0, 8, 28, 0.75)", border: "1px solid rgba(255, 204, 0, 0.2)", colorScheme: "dark" }}
          />
        </div>

        <button
          type="submit"
          disabled={jokerSaving}
          className="w-full h-[42px] rounded-xl font-black text-xs uppercase tracking-[0.2em] text-[#020a24] transition-all hover:brightness-110 active:scale-[0.98] cursor-pointer"
          style={{ background: "linear-gradient(135deg, #ffcc00 0%, #eab308 100%)" }}
        >
          {jokerSaving ? "Čuvanje..." : `🃏 ODOBRI 3. PAR ZA ${jokerPlayer.toUpperCase()}`}
        </button>
      </form>

      <div className="space-y-2.5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300/60 px-1">
          Aktivni i raniji jokeri
        </h3>
        {jokerGrants.length === 0 ? (
          <div className="p-6 text-center text-xs text-white/35 rounded-2xl bg-black/30 border border-white/5">
            Još nema dodijeljenih jokera.
          </div>
        ) : (
          jokerGrants.map(g => (
            <div
              key={g.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: "rgba(0, 12, 42, 0.75)", border: "1px solid rgba(255, 204, 0, 0.16)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-base">🃏</span>
                <div>
                  <span className="text-xs font-black uppercase text-white block">{g.player_name}</span>
                  <span className="text-[10px] font-bold text-yellow-300/70 tabular-nums">
                    {g.grant_date.split("-").reverse().join(".")}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleRevokeJoker(g)}
                className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-400/30 text-red-300 text-[9px] font-black uppercase tracking-wider cursor-pointer hover:bg-red-500 hover:text-white transition-all"
              >
                Ukloni
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderTabShell = () => {
    switch (currentView) {
      case "landing":
        return <LandingPage onNavigate={navigateToView} />;
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
      case "statistics":
        return <Statistics allBets={allBets} onBack={navigateBack} />;
      case "admin":
        return isAdmin ? renderAdminPanel() : <LandingPage onNavigate={navigateToView} />;
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
            jokerGrants={jokerGrants}
          />
        );
    }
  };

  const navItems: { id: AppView; label: string; icon: string; onClick: () => void }[] = [
    { id: "tables",      label: "Tabele",     icon: "📝", onClick: handleMyPicksTabClick },
    { id: "landing",     label: "Meni",       icon: "🏠", onClick: () => navigateToView("landing") },
    { id: "leaderboard", label: "Podijum",    icon: "🏆", onClick: handleLeaderboardTabClick },
    { id: "statistics",  label: "Statistika", icon: "📊", onClick: () => navigateToView("statistics") },
    ...(isAdmin ? [{ id: "admin" as AppView, label: "Joker", icon: "🃏", onClick: () => navigateToView("admin") }] : []),
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