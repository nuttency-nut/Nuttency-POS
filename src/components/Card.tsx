import { motion } from "framer-motion";
import clsx from "clsx";

export type CardSuit = "S" | "C" | "D" | "H";
export type CardRank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface CardData {
  rank: CardRank;
  suit: CardSuit;
}

const suitSymbols: Record<CardSuit, string> = {
  S: "♠",
  C: "♣",
  D: "♦",
  H: "♥",
};

const suitColor: Record<CardSuit, string> = {
  S: "text-slate-900",
  C: "text-slate-900",
  D: "text-rose-600",
  H: "text-rose-600",
};

const sizeStyles = {
  sm: "w-10 h-14 text-xs",
  md: "w-14 h-20 text-sm",
  lg: "w-20 h-28 text-base",
};

export function Card({
  card,
  faceDown = false,
  selected,
  disabled,
  highlight,
  size = "md",
  onClick,
}: {
  card?: CardData | null;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  highlight?: boolean;
  size?: keyof typeof sizeStyles;
  onClick?: () => void;
}) {
  const showFront = !faceDown && card;

  return (
    <motion.button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -6 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={clsx(
        "relative rounded-xl transition-all",
        sizeStyles[size],
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        selected && "ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.5)]",
        highlight && "ring-2 ring-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.45)]"
      )}
      style={{ perspective: 1000 }}
    >
      <motion.div
        className="relative h-full w-full"
        animate={{ rotateY: faceDown ? 180 : 0 }}
        transition={{ duration: 0.4 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div
          className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 shadow-lg border border-amber-200 flex flex-col justify-between p-2"
          style={{ backfaceVisibility: "hidden" }}
        >
          {showFront ? (
            <>
              <div className={clsx("font-semibold", suitColor[card.suit])}>
                {card.rank}
              </div>
              <div className={clsx("text-xl leading-none", suitColor[card.suit])}>
                {suitSymbols[card.suit]}
              </div>
              <div className={clsx("text-right font-semibold", suitColor[card.suit])}>
                {card.rank}
              </div>
            </>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
              ?
            </div>
          )}
        </div>
        <div
          className="absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_top,#8b5e1a,#4a2d0f)] border border-amber-700 shadow-lg"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div className="h-full w-full rounded-lg border border-amber-300/40 m-1 bg-[linear-gradient(135deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:10px_10px]" />
        </div>
      </motion.div>
    </motion.button>
  );
}

export function formatCard(card?: CardData | null) {
  if (!card) return "";
  return `${card.rank}${suitSymbols[card.suit]}`;
}
