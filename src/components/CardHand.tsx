import { motion } from "framer-motion";
import clsx from "clsx";
import { Card, CardData } from "@/components/Card";

export function CardHand({
  cards,
  selected,
  disabled,
  onSelect,
  highlightPlayable,
}: {
  cards: CardData[];
  selected?: CardData | null;
  disabled?: boolean;
  highlightPlayable?: (card: CardData) => boolean;
  onSelect?: (card: CardData) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {cards.map((card, index) => {
        const isSelected =
          selected?.rank === card.rank && selected?.suit === card.suit;
        const highlight = highlightPlayable ? highlightPlayable(card) : false;
        return (
          <motion.div
            key={`${card.rank}-${card.suit}-${index}`}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: index * 0.03 }}
            className={clsx(disabled && "opacity-70")}
          >
            <Card
              card={card}
              size="lg"
              selected={isSelected}
              highlight={highlight}
              disabled={disabled}
              onClick={() => onSelect?.(card)}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
