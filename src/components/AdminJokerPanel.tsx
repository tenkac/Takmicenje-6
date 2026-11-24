"use client";
import React, { useState } from "react";
import { PLAYERS } from "../types";
import { supabase } from "../lib/supabase";

interface Props {
  grants: { id: number; player_name: string; grant_date: string }[];
  onRefreshGrants: () => Promise<void>;
}

export default function AdminJokerPanel({ grants, onRefreshGrants }: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<string>(PLAYERS[0]);
  const [grantDate, setGrantDate] = useState<string>(new Date().toLocaleDateString("en-CA"));
  const [saving, setSaving] = useState(false);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("joker_grants")
      .upsert({ player_name: selectedPlayer, grant_date: grantDate }, { onConflict: "player_name,grant_date" });

    if (error) {
      alert("Greška: " + error.message);
    } else {
      await onRefreshGrants();
    }
    setSaving(false);
  };

  const handleRevoke = async (id: number) => {
    await supabase.from("joker_grants").delete().eq("id", id);
    await onRefreshGrants();
  };

  return (
    <div className="min-h-screen p-4 md:p-8 text-white max-w-2xl mx-auto space-y-6">
      <div className="text-center pt-2">
        <span className="text-[10px] font-black uppercase tracking-[0.35em] text-yellow-300/70">
          🃏 Admin Kontrola
        </span>
        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-wider mt-1">
          Dodijeli 3. Par (Joker)
        </h1>
      </div>

      <form
        onSubmit={handleGrant}
        className="p-5 rounded-2xl space-y-4 backdrop-blur-md"
        style={{ background: "rgba(0, 24, 82, 0.72)", border: "1px solid rgba(255, 204, 0, 0.25)" }}
      >
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-yellow-300/80 mb-2">
            Igrač
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {PLAYERS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPlayer(p)}
                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                  selectedPlayer === p
                    ? "bg-yellow-400 text-[#020a24] border-yellow-300"
                    : "bg-black/40 text-white/60 border-white/10"
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
            value={grantDate}
            onChange={e => setGrantDate(e.target.value)}
            className="w-full min-w-0 max-w-full box-border appearance-none h-[40px] rounded-xl px-3 text-xs font-bold text-white outline-none block"
            style={{ background: "rgba(0, 8, 28, 0.75)", border: "1px solid rgba(255, 204, 0, 0.2)", colorScheme: "dark" }}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full h-[42px] rounded-xl font-black text-xs uppercase tracking-[0.2em] text-[#020a24] cursor-pointer"
          style={{ background: "linear-gradient(135deg, #ffcc00 0%, #eab308 100%)" }}
        >
          {saving ? "Čuvanje..." : `🃏 ODOBRI 3. PAR ZA ${selectedPlayer.toUpperCase()}`}
        </button>
      </form>

      {/* Active & Past Grants */}
      <div className="space-y-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-300/60 px-1">
          Dodijeljeni Jokeri
        </h3>
        {grants.length === 0 ? (
          <div className="p-6 text-center text-xs text-white/35 rounded-2xl bg-black/30 border border-white/5">
            Nema dodijeljenih jokera.
          </div>
        ) : (
          grants.map(g => (
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
                onClick={() => handleRevoke(g.id)}
                className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-400/30 text-red-300 text-[9px] font-black uppercase tracking-wider cursor-pointer"
              >
                Ukloni
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}