"use client";
import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const DICE_SRC = '/Kockabezzvijezda.webp';

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

function EuStarRing({ className, style, fontSize = 8 }: { className?: string; style?: React.CSSProperties; fontSize?: number }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style}>
      {EU_STARS.map((s, i) => (
        <text key={i} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fill="#ffcc00" fontSize={fontSize}>★</text>
      ))}
    </svg>
  );
}

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // Preload + decode the dice watermark so it doesn't pop in
  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.src = DICE_SRC;
    img.decode?.().catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fakeEmail = `${username.trim().toLowerCase()}@takmicenje.com`;
    const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password });

    if (error) { setError(error.message); setLoading(false); }
    else        { onLogin(); }
  };

  return (
    <>
      <style>{`
        @keyframes eu-ring-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes dice-float-slow {
          0%, 100% { transform: translateY(0px) rotate(-4deg); }
          50%       { transform: translateY(-6px) rotate(4deg); }
        }
        .eu-ring-anim { animation: eu-ring-spin 70s linear infinite; }
        .eu-ring-anim-fast { animation: eu-ring-spin 40s linear infinite; }
        .dice-emblem { animation: dice-float-slow 4s ease-in-out infinite; display: inline-block; }
      `}</style>

      <div
        className="min-h-screen flex flex-col relative overflow-x-hidden font-sans text-white"
        style={{ background: 'linear-gradient(165deg, #020a24 0%, #01379b 45%, #03091c 100%)' }}
      >
        {/* ── TEXTURE ── */}
        <div className="fixed inset-0 wc-jersey-bg pointer-events-none opacity-35" />

        {/* ── DICE WATERMARK + SLOW EU STAR RING ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden select-none">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] md:w-[660px] md:h-[660px] opacity-[0.26]"
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
            className="eu-ring-anim absolute top-1/2 left-1/2 w-[520px] h-[520px] md:w-[700px] md:h-[700px] opacity-[0.18]"
            style={GPU_LAYER}
            fontSize={8}
          />
        </div>

        {/* ── FLOODLIGHTS ── */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="wc-beam-l absolute" style={{ ...GPU_LAYER, top: 0, left: '15%', width: '300px', height: '75vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 85%)', transformOrigin: 'top center', filter: 'blur(44px)' }} />
          <div className="wc-beam-r absolute" style={{ ...GPU_LAYER, top: 0, right: '15%', width: '300px', height: '75vh', background: 'linear-gradient(178deg, rgba(255,204,0,0.20) 0%, transparent 85%)', transformOrigin: 'top center', filter: 'blur(44px)' }} />
          <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '800px', height: '500px', background: 'radial-gradient(ellipse at top, rgba(255,204,0,0.10) 0%, transparent 65%)' }} />
          <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '90vw', height: '32vh', background: 'radial-gradient(ellipse at bottom, rgba(239,68,68,0.10) 0%, transparent 70%)' }} />
        </div>

        {/* ── FLOATING DICE ── */}
        <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
          <span className="wc-float      absolute text-6xl" style={{ opacity: 0.05, top: '12%',    left: '4%'  }}>🎲</span>
          <span className="wc-float-slow absolute text-8xl" style={{ opacity: 0.04, bottom: '14%', right: '3%' }}>🎲</span>
          <span className="wc-float-med  absolute text-4xl" style={{ opacity: 0.06, top: '48%',    right: '6%' }}>🎲</span>
        </div>

        {/* ── CENTERED CONTENT ── */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-8 relative z-10">
          <div className="w-full max-w-sm">

            {/* Header */}
            <div className="text-center mb-8">
              <div className="relative inline-flex items-center justify-center w-20 h-20 mb-3 select-none">
                <EuStarRing
                  className="eu-ring-anim-fast absolute top-1/2 left-1/2 w-full h-full opacity-75 pointer-events-none"
                  style={GPU_LAYER}
                  fontSize={8}
                />
                <span className="dice-emblem text-4xl drop-shadow-[0_0_16px_rgba(255,204,0,0.5)]">🎲</span>
              </div>

              <div className="flex items-center justify-center gap-3 mb-1">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-yellow-400/50" />
                <span className="text-[11px] font-black text-yellow-300/85 uppercase tracking-[0.35em] pl-[0.35em]">
                  🇪🇺 Euro Model
                </span>
                <div className="h-px w-8 bg-gradient-to-l from-transparent to-yellow-400/50" />
              </div>

              <h1 className="wc-shine-text text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none drop-shadow-[0_0_30px_rgba(250,204,21,0.35)]">
                Kocka
              </h1>
            </div>

            {/* Pass card */}
            <form
              onSubmit={handleLogin}
              className="rounded-3xl backdrop-blur-xl p-7"
              style={{
                background: 'linear-gradient(155deg, rgba(0, 26, 88, 0.72) 0%, rgba(1, 10, 34, 0.85) 100%)',
                border: '1px solid rgba(255, 204, 0, 0.22)',
                boxShadow: 'inset 0 1px 0 rgba(255, 204, 0, 0.18), 0 30px 60px rgba(0, 4, 18, 0.75)',
              }}
            >
              {/* Pass strip */}
              <div
                className="flex items-center justify-between mb-6 pb-4"
                style={{ borderBottom: '1px solid rgba(255, 204, 0, 0.14)' }}
              >
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.25em] text-yellow-300/70">6. poglavlje</div>
                  <div className="text-[10px] font-black text-white/35 uppercase tracking-wider mt-0.5">Brisel Sve Prati</div>
                </div>
                <div className="text-xl opacity-60 select-none">🇪🇺</div>
              </div>

              {error && (
                <div
                  className="mb-5 p-3 rounded-xl text-red-300 text-xs font-bold text-center"
                  style={{ background: 'rgba(239, 68, 68, 0.16)', border: '1px solid rgba(239, 68, 68, 0.35)' }}
                >
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-[0.25em] mb-1.5 ml-1 text-yellow-300/65">
                    PLAYER NAME
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full rounded-xl p-4 text-white outline-none transition-all font-bold uppercase text-sm placeholder-white/20"
                    style={{ background: 'rgba(0, 8, 30, 0.65)', border: '1px solid rgba(255, 204, 0, 0.16)' }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(255, 204, 0, 0.55)')}
                    onBlur={e  => (e.target.style.borderColor = 'rgba(255, 204, 0, 0.16)')}
                    placeholder="VLADO"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-[0.25em] mb-1.5 ml-1 text-yellow-300/65">
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full rounded-xl p-4 text-white outline-none transition-all font-bold text-sm placeholder-white/20"
                    style={{ background: 'rgba(0, 8, 30, 0.65)', border: '1px solid rgba(255, 204, 0, 0.16)' }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(255, 204, 0, 0.55)')}
                    onBlur={e  => (e.target.style.borderColor = 'rgba(255, 204, 0, 0.16)')}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full font-black uppercase py-4 rounded-xl transition-all hover:brightness-110 active:scale-[0.97] mt-2 text-sm tracking-[0.18em] disabled:opacity-50 cursor-pointer"
                  style={{
                    background: loading
                      ? 'rgba(255, 204, 0, 0.55)'
                      : 'linear-gradient(135deg, #ffcc00 0%, #eab308 100%)',
                    color: '#020a24',
                    boxShadow: loading ? 'none' : '0 8px 30px rgba(255, 204, 0, 0.30)',
                  }}
                >
                  {loading ? 'Authenticating...' : '🎲 ENTER ARENA'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── FULL-BLEED BOTTOM TICKER ── */}
        <div
          className="relative z-10 w-full mt-auto overflow-hidden py-2.5 backdrop-blur-md"
          style={{ borderTop: '1px solid rgba(255, 204, 0, 0.12)', background: 'rgba(1, 8, 28, 0.7)' }}
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