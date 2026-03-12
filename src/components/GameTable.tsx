import { motion } from "framer-motion";
import { Card, CardData } from "@/components/Card";
import { PlayerSeat, PlayerSeatData, PlayerMoveSnapshot } from "@/components/PlayerSeat";

export interface GameSnapshot {
  id: string;
  phase: string;
  round_number: number;
  current_turn: string | null;
  lead_player: string | null;
  show_stage?: string | null;
  winner_player?: string | null;
}

export interface MoveSnapshot {
  id: string;
  player_id: string;
  move_type: "PLAY" | "FOLD" | "SHOW_FIRST" | "SHOW_SECOND";
  card_rank?: string | null;
  card_suit?: string | null;
  round_number: number;
  created_at: string;
}

const seatPositions = [
  { top: "78%", left: "50%" },
  { top: "68%", left: "18%" },
  { top: "25%", left: "15%" },
  { top: "10%", left: "50%" },
  { top: "25%", left: "85%" },
  { top: "68%", left: "82%" },
];

function moveToCard(move?: MoveSnapshot | null): CardData | null {
  if (!move?.card_rank || !move?.card_suit) return null;
  return { rank: move.card_rank as CardData["rank"], suit: move.card_suit as CardData["suit"] };
}

export function GameTable({
  players,
  game,
  moves,
  currentPlayerId,
}: {
  players: PlayerSeatData[];
  game?: GameSnapshot | null;
  moves: MoveSnapshot[];
  currentPlayerId?: string | null;
}) {
  const currentRound = game?.round_number ?? 0;

  const roundMoves = moves.filter(
    (move) =>
      move.round_number === currentRound &&
      (move.move_type === "PLAY" || move.move_type === "FOLD")
  );

  const showdownMoves = moves.filter(
    (move) =>
      move.round_number === 5 &&
      (move.move_type === "SHOW_FIRST" || move.move_type === "SHOW_SECOND")
  );

  const displayedMoves = game?.phase === "SHOWDOWN" ? showdownMoves : roundMoves;

  const centerCards = displayedMoves.map((move) => ({
    id: move.id,
    move,
    card: moveToCard(move),
  }));

  const winningMoveId = (() => {
    if (!game) return null;
    if (game.phase.startsWith("ROUND")) {
      const firstPlay = roundMoves.find((m) => m.move_type === "PLAY" && m.card_suit);
      if (!firstPlay?.card_suit) return null;
      const leadSuit = firstPlay.card_suit;
      const playable = roundMoves.filter(
        (m) => m.move_type === "PLAY" && m.card_suit === leadSuit && m.card_rank
      );
      if (playable.length === 0) return null;
      return playable.sort((a, b) => {
        const rankOrder: Record<string, number> = {
          "2": 2,
          "3": 3,
          "4": 4,
          "5": 5,
          "6": 6,
          "7": 7,
          "8": 8,
          "9": 9,
          "10": 10,
          J: 11,
          Q: 12,
          K: 13,
          A: 14,
        };
        const suitOrder: Record<string, number> = { S: 1, C: 2, D: 3, H: 4 };
        const rankDiff =
          rankOrder[b.card_rank ?? "2"] - rankOrder[a.card_rank ?? "2"];
        if (rankDiff !== 0) return rankDiff;
        return suitOrder[b.card_suit ?? "S"] - suitOrder[a.card_suit ?? "S"];
      })[0].id;
    }

    if (game.phase === "FINISHED") {
      const winnerMove = showdownMoves
        .filter((m) => m.move_type === "SHOW_SECOND")
        .find((m) => m.player_id === game.winner_player);
      return winnerMove?.id ?? null;
    }

    return null;
  })();

  return (
    <div className="relative w-full max-w-5xl mx-auto aspect-[4/3]">
      <div className="absolute inset-0 rounded-[999px] bg-[radial-gradient(circle_at_top,#1d6b45,#0b2b1d_55%,#081a13_100%)] border-[10px] border-amber-900/60 shadow-[0_30px_60px_rgba(0,0,0,0.5)]" />
      <div className="absolute inset-8 rounded-[999px] border border-emerald-300/10" />

      {seatPositions.map((pos, index) => {
        const seatPlayers = players.filter((p) => p.seatIndex === index);
        const player = seatPlayers.find((p) => p.isAlive) ?? seatPlayers[0];
        const move =
          player &&
          displayedMoves
            .filter((m) => m.player_id === player.id)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .slice(-1)[0];
        const foldCount = player
          ? moves.filter((m) => m.player_id === player.id && m.move_type === "FOLD").length
          : 0;

        const moveSnapshot: PlayerMoveSnapshot | null = move
          ? { moveType: move.move_type, card: moveToCard(move) }
          : null;

        return (
          <div
            key={`seat-${index}`}
            className="absolute"
            style={{ top: pos.top, left: pos.left, transform: "translate(-50%, -50%)" }}
          >
            <PlayerSeat
              player={player ?? null}
              isCurrentTurn={player ? game?.current_turn === player.id : false}
              isSelf={player ? currentPlayerId === player.id : false}
              cardCount={
                player
                  ? Math.max(
                      0,
                      6 -
                        moves.filter(
                          (m) =>
                            m.player_id === player.id &&
                            ["PLAY", "FOLD", "SHOW_FIRST", "SHOW_SECOND"].includes(m.move_type)
                        ).length
                    )
                  : 0
              }
              foldCount={foldCount}
              move={moveSnapshot}
              isWinner={player ? game?.winner_player === player.id : false}
            />
          </div>
        );
      })}

      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="flex gap-3 rounded-2xl bg-black/25 px-4 py-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {centerCards.length === 0 ? (
            <div className="text-xs text-emerald-100/70">Bàn đang chờ nước đi...</div>
          ) : (
            centerCards.map((entry) => (
              <Card
                key={entry.id}
                card={entry.card ?? undefined}
                faceDown={entry.move.move_type === "FOLD"}
                size="md"
                highlight={winningMoveId === entry.id}
              />
            ))
          )}
        </motion.div>
      </div>
    </div>
  );
}
