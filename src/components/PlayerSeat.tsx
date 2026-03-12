import clsx from "clsx";
import { motion } from "framer-motion";
import { Card, CardData } from "@/components/Card";

export interface PlayerSeatData {
  id: string;
  userId: string;
  seatIndex: number;
  isHost: boolean;
  isAlive: boolean;
  displayName: string;
}

export interface PlayerMoveSnapshot {
  moveType: "PLAY" | "FOLD" | "SHOW_FIRST" | "SHOW_SECOND";
  card?: CardData | null;
}

export function PlayerSeat({
  player,
  isCurrentTurn,
  isSelf,
  cardCount,
  move,
  foldCount,
  isWinner,
}: {
  player?: PlayerSeatData | null;
  isCurrentTurn?: boolean;
  isSelf?: boolean;
  cardCount?: number;
  move?: PlayerMoveSnapshot | null;
  foldCount?: number;
  isWinner?: boolean;
}) {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-2 text-xs text-emerald-100/60">
        <div className="h-12 w-12 rounded-full border border-emerald-200/30 bg-emerald-900/30" />
        <span>Ghế trống</span>
      </div>
    );
  }

  const initials = player.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <motion.div
      className={clsx(
        "flex flex-col items-center gap-2 rounded-2xl px-3 py-2 text-emerald-50",
        isCurrentTurn && "ring-2 ring-emerald-300/80 shadow-[0_0_18px_rgba(52,211,153,0.6)]",
        isWinner && "ring-2 ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.6)]"
      )}
      animate={isCurrentTurn ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ duration: 1.2, repeat: isCurrentTurn ? Infinity : 0 }}
    >
      <div className="relative">
        <div
          className={clsx(
            "h-12 w-12 rounded-full border border-amber-300/60 bg-gradient-to-br from-amber-300/40 to-amber-700/50 flex items-center justify-center font-semibold",
            !player.isAlive && "opacity-50 grayscale"
          )}
        >
          {initials || "?"}
        </div>
        {player.isHost && (
          <span className="absolute -top-2 -right-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            Host
          </span>
        )}
        {isSelf && (
          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-semibold text-emerald-950">
            Bạn
          </span>
        )}
      </div>
      <div className="text-xs font-semibold">{player.displayName}</div>
      <div className="text-[11px] text-emerald-100/80">Bài: {cardCount ?? 0}</div>
      {typeof foldCount === "number" && foldCount > 0 && (
        <div className="text-[11px] text-amber-200">Úp: {foldCount}/4</div>
      )}
      {move && (
        <div className="mt-1">
          <Card
            card={move.card ?? undefined}
            faceDown={move.moveType === "FOLD"}
            size="sm"
          />
        </div>
      )}
    </motion.div>
  );
}
