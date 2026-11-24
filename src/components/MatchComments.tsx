"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface CommentsProps {
  bettingRowId: number;
  loggedInPlayer: string;
}

interface Comment {
  id: number;
  player_name: string;
  comment_text: string;
  created_at: string;
}

const COMMENT_PLAYER_COLORS: Record<string, string> = {
  "Vlado":  "text-blue-400",
  "Fika":   "text-red-400",
  "Labud":  "text-green-400",
  "Ilija":  "text-purple-400",
  "Dzoni":  "text-yellow-400",
  "Admin":  "text-red-500 tracking-wider font-extrabold",
};

export default function MatchComments({ bettingRowId, loggedInPlayer }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!bettingRowId) return;
    const { data, error } = await supabase
      .from('pick_comments')
      .select('id, player_name, comment_text, created_at')
      .eq('betting_row_id', bettingRowId)
      .order('created_at', { ascending: true });

    if (data) setComments(data);
    if (error) console.error("Error fetching ticket comments:", error.message);
  }, [bettingRowId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || loading) return;

    setLoading(true);
    const { error } = await supabase
      .from('pick_comments')
      .insert({
        player_name: loggedInPlayer,
        betting_row_id: bettingRowId,
        match_key: "ticket",
        comment_text: newComment.trim(),
      });

    if (!error) {
      setNewComment("");
      await fetchComments();
    } else {
      console.error("Error saving comment:", error.message, error.details, error.hint, error.code);
    }
    setLoading(false);
  };

  return (
    <div className="w-full">
      {/* ── HEADER COUNTER ── */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-black tracking-[0.25em] text-yellow-300/60 uppercase">
            💬 Komentari na tiket
          </span>
          {comments.length > 0 && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-yellow-400/15 border border-yellow-400/30 text-yellow-300 leading-none tabular-nums">
              {comments.length}
            </span>
          )}
        </div>
      </div>

      {/* ── COMMENTS LIST ── */}
      <div
        className="space-y-2 max-h-[155px] overflow-y-auto mb-3 pr-1.5 scroll-smooth transition-all duration-300 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-yellow-400/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-yellow-400/40"
      >
        {comments.length === 0 ? (
          <p className="text-[10px] text-white/35 italic uppercase tracking-wider pl-1 py-1">
            Nema komentara na ovaj tiket, isprozivaj budalu...
          </p>
        ) : (
          comments.map(c => {
            const nameColorClass = COMMENT_PLAYER_COLORS[c.player_name] || "text-gray-300";

            return (
              <div
                key={c.id}
                className="text-xs p-2.5 rounded-xl backdrop-blur-sm"
                style={{ background: 'rgba(0, 8, 28, 0.55)', border: '1px solid rgba(255, 204, 0, 0.10)' }}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`font-black uppercase text-[10px] tracking-wide ${nameColorClass}`}>
                    {c.player_name}
                  </span>
                  <span className="text-[8px] text-white/35 font-mono">
                    {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-gray-200 font-medium text-[11px] leading-snug break-words">
                  {c.comment_text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* ── INPUT FORM ── */}
      <form onSubmit={handleSubmitComment} className="flex gap-2 items-center relative z-20">
        <input
          type="text"
          placeholder="Komentariši tiket..."
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          className="flex-1 rounded-xl px-3.5 py-2 text-xs font-medium text-white outline-none placeholder:text-white/25 transition-colors"
          style={{ background: 'rgba(0, 8, 28, 0.75)', border: '1px solid rgba(255, 204, 0, 0.18)' }}
          onFocus={e => (e.target.style.borderColor = 'rgba(255, 204, 0, 0.5)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(255, 204, 0, 0.18)')}
        />
        <button
          type="submit"
          disabled={loading || !newComment.trim()}
          className="px-3.5 py-2 font-black text-xs uppercase tracking-wider rounded-xl text-[#020a24] hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 disabled:scale-100 cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #ffcc00 0%, #eab308 100%)' }}
        >
          {loading ? "..." : "💬"}
        </button>
      </form>
    </div>
  );
}