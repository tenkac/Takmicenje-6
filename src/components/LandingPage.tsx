"use client";
import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onNavigate: (view: "landing" | "leaderboard" | "tables" | "statistics") => void;
}

const DICE_SRC = '/Kockabezzvijezda.webp';

// 12 EU stars arranged evenly on a circle (30° intervals)
const EU_STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * 30 - 90) * (Math.PI / 180);
  const r = 42; // SVG viewBox radius
  return {
    cx: 50 + r * Math.cos(angle),
    cy: 50 + r * Math.sin(angle),
  };
});

// Promote an element to its own GPU layer so it isn't repainted by animations around it
const GPU_LAYER: React.CSSProperties = {
  willChange: 'transform',
  backfaceVisibility: 'hidden',
  WebkitBackfaceVisibility: 'hidden',
};

export default function LandingPage({ onNavigate }: Props) {
  // Lock page scrolling / rubber-band overscroll while this screen is shown (mobile PWA)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
    };
  }, []);

  // Preload + decode the dice image so it doesn't pop in after first paint
  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.src = DICE_SRC;
    img.decode?.().catch(() => {});
  }, []);

  const handleLogout = async () => {
    if (navigator.vibrate) navigator.vibrate([15, 30]);
    await supabase.auth.signOut();
  };

  return (
    <>
      <style>{`
        @keyframes eu-ring-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes dice-breathe {
          0%, 100% { transform: translateY(0px) scale(1); }
          50%      { transform: translateY(-6px) scale(1.03); }
        }
        .eu-ring-anim {
          animation: eu-ring-spin 70s linear infinite;
        }
        .dice-breathe-anim {
          animation: dice-breathe 5s ease-in-out infinite;
        }
      `}</style>

      <div
        className="fixed inset-0 flex flex-col overflow-hidden font-sans pb-16 touch-none select-none"
        style={{
          background: 'linear-gradient(165deg, #020a24 0%, #01379b 45%, #03091c 100%)',
          paddingTop: 'env(safe-area-inset-top)',
          overscrollBehavior: 'none',
        }}
      >
        {/* ── DIAGONAL TEXTURE ── */}
        <div className="absolute inset-0 wc-jersey-bg pointer-events-none opacity-35" />

        {/* ── BACKGROUND DICE LOGO + ROTATING EU 12-STAR RING (CENTERED) ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
          {/* Dice logo (no CSS filter; own GPU layer) */}
          <div
            className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[540px] md:w-[760px] md:h-[760px] opacity-[0.75]"
            style={{
              ...GPU_LAYER,
              backgroundImage: `url('${DICE_SRC}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              maskImage: 'radial-gradient(circle, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 70%)',
              WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 70%)',
            }}
          />

          {/* Slow-rotating 12-star EU constellation around the dice, same center */}
          <svg
            viewBox="0 0 100 100"
            className="eu-ring-anim absolute top-[44%] left-1/2 w-[580px] h-[580px] md:w-[720px] md:h-[720px] opacity-[0.50]"
            style={GPU_LAYER}
          >
            {EU_STARS.map((star, idx) => (
              <text
                key={idx}
                x={star.cx}
                y={star.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffcc00"
                fontSize="10"
              >
                ★
              </text>
            ))}
          </svg>
        </div>

        {/* ── STADIUM FLOODLIGHTS (EU GOLD + CRIMSON DICE GLOW) ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="wc-beam-l absolute"
            style={{
              ...GPU_LAYER,
              top: 0,
              left: '15%',
              width: '320px',
              height: '75vh',
              background: 'linear-gradient(178deg, rgba(255,204,0,0.22) 0%, transparent 85%)',
              transformOrigin: 'top center',
              filter: 'blur(44px)',
            }}
          />
          <div
            className="wc-beam-r absolute"
            style={{
              ...GPU_LAYER,
              top: 0,
              right: '15%',
              width: '320px',
              height: '75vh',
              background: 'linear-gradient(178deg, rgba(255,204,0,0.22) 0%, transparent 85%)',
              transformOrigin: 'top center',
              filter: 'blur(44px)',
            }}
          />
          {/* Top EU Blue/Gold Aura */}
          <div
            style={{
              position: 'absolute',
              top: '-80px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '800px',
              height: '550px',
              background: 'radial-gradient(ellipse at top, rgba(255,204,0,0.10) 0%, transparent 65%)',
            }}
          />
          {/* Bottom Red Dice Ambient Glow */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90vw',
              height: '40vh',
              background: 'radial-gradient(ellipse at bottom, rgba(239,68,68,0.12) 0%, transparent 70%)',
            }}
          />
        </div>

        {/* ── CONFETTI CASCADE (EU GOLD, BLUE & DICE RED) ── */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none opacity-60">
          <div className="wc-confetti-1  absolute w-2.5 h-4 rounded-sm bg-yellow-400"  style={{ left: '6%',  top: '-12px', rotate: '45deg' }} />
          <div className="wc-confetti-2  absolute w-4 h-2.5 rounded-sm bg-red-500"    style={{ left: '17%', top: '-12px', rotate: '30deg' }} />
          <div className="wc-confetti-3  absolute w-3 h-3 rounded-full bg-blue-500"   style={{ left: '29%', top: '-12px' }} />
          <div className="wc-confetti-4  absolute w-2.5 h-4 rounded-sm bg-yellow-300" style={{ left: '41%', top: '-12px', rotate: '-25deg' }} />
          <div className="wc-confetti-5  absolute w-4 h-2.5 rounded-sm bg-red-400"    style={{ left: '53%', top: '-12px', rotate: '60deg' }} />
          <div className="wc-confetti-6  absolute w-3 h-3 rounded-full bg-yellow-400" style={{ left: '64%', top: '-12px' }} />
          <div className="wc-confetti-7  absolute w-2.5 h-4 rounded-sm bg-white/50"   style={{ left: '75%', top: '-12px', rotate: '-45deg' }} />
          <div className="wc-confetti-8  absolute w-4 h-2 bg-yellow-500 rounded"      style={{ left: '87%', top: '-12px', rotate: '20deg' }} />
          <div className="wc-confetti-9  absolute w-2.5 h-3.5 rounded-sm bg-blue-400" style={{ left: '11%', top: '-12px', rotate: '-30deg' }} />
          <div className="wc-confetti-10 absolute w-3.5 h-2.5 rounded-sm bg-red-500"  style={{ left: '94%', top: '-12px', rotate: '50deg' }} />
        </div>

        {/* ── FLOATING MULTI-SPORT & DICE ICONS ── */}
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <span className="wc-float      absolute text-7xl"     style={{ opacity: 0.06, top: '14%',    left: '5%'  }}>🎲</span>
          <span className="wc-float-med  absolute text-5xl"     style={{ opacity: 0.06, top: '28%',    right: '8%' }}>⚽</span>
          <span className="wc-float      absolute text-6xl"     style={{ opacity: 0.05, bottom: '24%', left: '8%'  }}>🎾</span>
        </div>

        {/* ── HERO CONTENT: TITLE PINNED TOP, STATS PINNED BOTTOM, DICE VISIBLE IN BETWEEN ── */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-start px-5 pt-[7vh] md:pt-[9vh] pb-4 w-full max-w-4xl mx-auto text-center">

          {/* TITLE (top) */}
          <div className="wc-slide-up-1 text-center flex flex-col items-center">
            <h1 className="font-black uppercase leading-none tracking-tight">
              <span className="wc-shine-text block text-8xl sm:text-9xl md:text-[12rem] tracking-tighter drop-shadow-[0_0_45px_rgba(250,204,21,0.45)]">
                KOCKA
              </span>
            </h1>

            {/* TAGLINE under the title: subtle, dice emoji as a standalone symbol beside the text */}
            <div className="wc-slide-up-2 mt-3 flex items-center justify-center gap-2.5">
              <p className="text-yellow-300/50 text-[18px] sm:text-xs font-bold uppercase tracking-[0.4em] pl-[0.4em]">
                je bačena
              </p>
            </div>
          </div>
        </div>

        {/* ── SCOREBOARD TICKER ── */}
        <div
          className="relative z-10 w-full overflow-hidden py-3"
          style={{ borderTop: '1px solid rgba(255,204,0,0.08)', background: 'rgba(0,0,0,0.35)' }}
        >
          <div className="wc-ticker whitespace-nowrap inline-block">
            {[0, 1].map(i => (
              <span key={i} className="text-[10px] font-black uppercase tracking-[0.35em] text-yellow-400/25 px-2">
                🎲 &nbsp;·&nbsp; 🇪🇺 EVROPSKI STANDARDI &nbsp;·&nbsp; EURO MODEL &nbsp;·&nbsp; BRISEL PRATI SVAKI PAD &nbsp;·&nbsp; KOCKA JE BAČENA &nbsp;·&nbsp; SUBVENCIJE ZA PROMAŠAJE NE POSTOJE &nbsp;·&nbsp;
              </span>
            ))}
          </div>
        </div>

        {/* ── SECURE LOGOUT FOOTER ZONE ── */}
        <div className="relative z-10 w-full flex justify-center py-3 pb-8">
          <button
            onClick={handleLogout}
            className="group flex items-center gap-2 px-6 py-3 rounded-full hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-200 shadow-xl active:scale-95"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500/60 group-hover:animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-red-400 transition-colors">
              Odjavi se sa profila
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
