import { BettingRow, Match } from "../types";

export interface TicketEvaluation {
  picks: Match[];               // All non-empty picks (up to 3)
  maxSlots: 2 | 3;              // 3 if joker granted or match3 exists, else 2
  isComplete: boolean;          // All available slots filled
  ticketState: "win" | "loss" | "pending" | "incomplete";
  earnedPoints: number;         // Product of top 2 winning odds (0 if < 2 wins)
  potentialOdds: number;        // Product of top 2 alive (win + pending) odds
  winningPairOdds: [number, number] | null; // Which 2 odds were multiplied
}

export function evaluateTicket(row: BettingRow, hasJokerGrant = false): TicketEvaluation {
  const maxSlots: 2 | 3 = hasJokerGrant || row.hasJoker || (row.match3 && row.match3.status !== "empty") ? 3 : 2;
  const rawSlots = maxSlots === 3 ? [row.match1, row.match2, row.match3] : [row.match1, row.match2];
  const picks = rawSlots.filter((m): m is Match => Boolean(m && m.status !== "empty"));

  const isComplete = picks.length === maxSlots;

  const wonPicks = picks.filter(m => m.status === "win").sort((a, b) => b.odds - a.odds);
  const pendingPicks = picks.filter(m => m.status === "pending");
  const alivePicks = [...wonPicks, ...pendingPicks].sort((a, b) => b.odds - a.odds);

  let ticketState: TicketEvaluation["ticketState"] = "incomplete";
  let earnedPoints = 0;
  let winningPairOdds: [number, number] | null = null;

  if (wonPicks.length >= 2) {
    // At least 2 hit! Take the 2 highest winning odds (covers both 2/3 and 3/3)
    ticketState = "win";
    winningPairOdds = [wonPicks[0].odds, wonPicks[1].odds];
    earnedPoints = parseFloat((wonPicks[0].odds * wonPicks[1].odds).toFixed(2));
  } else if (isComplete && alivePicks.length < 2) {
    // Impossible to reach 2 wins anymore (e.g., 2 losses on a 3-pick ticket, or 1 loss on a 2-pick ticket)
    ticketState = "loss";
  } else if (isComplete) {
    ticketState = "pending";
  } else {
    ticketState = "incomplete";
  }

  const potentialOdds =
    alivePicks.length >= 2
      ? parseFloat((alivePicks[0].odds * alivePicks[1].odds).toFixed(2))
      : alivePicks.length === 1
      ? parseFloat(alivePicks[0].odds.toFixed(2))
      : 0;

  return {
    picks,
    maxSlots,
    isComplete,
    ticketState,
    earnedPoints,
    potentialOdds,
    winningPairOdds,
  };
}