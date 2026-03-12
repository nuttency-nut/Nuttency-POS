export type Suit = "S" | "C" | "D" | "H";
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
export type GamePhase =
  | "WAITING"
  | "DEALING"
  | "ROUND_1"
  | "ROUND_2"
  | "ROUND_3"
  | "ROUND_4"
  | "SHOWDOWN"
  | "FINISHED";

export type MoveType = "PLAY" | "FOLD" | "SHOW_FIRST" | "SHOW_SECOND";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface PlayerState {
  id: string;
  hand: Card[];
  isAlive: boolean;
  foldCount: number;
}

export interface TrickPlay {
  playerId: string;
  card: Card | null;
  moveType: "PLAY" | "FOLD";
}

export interface TrickState {
  leadSuit: Suit | null;
  plays: TrickPlay[];
}

export interface ShowdownState {
  showPlayerId: string;
  cupPlayerId?: string | null;
  firstReveals: Record<string, Card>;
  secondReveals: Record<string, Card>;
}

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  currentTurn: string | null;
  leadPlayerId: string | null;
  players: PlayerState[];
  trick: TrickState;
  showdown?: ShowdownState;
}

const RANK_ORDER: Record<Rank, number> = {
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

const SUIT_ORDER: Record<Suit, number> = {
  S: 1,
  C: 2,
  D: 3,
  H: 4,
};

export function compareCards(a: Card, b: Card) {
  if (RANK_ORDER[a.rank] !== RANK_ORDER[b.rank]) {
    return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  }
  return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeck(seed?: string) {
  const ranks: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const suits: Suit[] = ["S", "C", "D", "H"];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  const rng =
    seed !== undefined
      ? mulberry32(hashSeed(seed))
      : () => {
          if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
            const buf = new Uint32Array(1);
            crypto.getRandomValues(buf);
            return buf[0] / 4294967296;
          }
          return Math.random();
        };

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export function dealCards(deck: Card[], playerCount: number, cardsEach = 6) {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const totalNeeded = playerCount * cardsEach;

  if (deck.length < totalNeeded) {
    throw new Error("Not enough cards to deal.");
  }

  let index = 0;
  for (let round = 0; round < cardsEach; round += 1) {
    for (let player = 0; player < playerCount; player += 1) {
      hands[player].push(deck[index]);
      index += 1;
    }
  }

  return hands;
}

export function determineTrickWinner(trick: TrickState) {
  if (!trick.leadSuit) return null;
  const plays = trick.plays.filter((play) => play.moveType === "PLAY" && play.card);
  const leadPlays = plays.filter((play) => play.card?.suit === trick.leadSuit);

  if (leadPlays.length === 0) return null;

  return leadPlays.reduce((winner, current) => {
    if (!winner.card || !current.card) return winner;
    return compareCards(current.card, winner.card) > 0 ? current : winner;
  }).playerId;
}

export function validateMove(state: GameState, playerId: string, moveType: MoveType, card: Card) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.isAlive) return { valid: false, reason: "Player not active." };
  if (state.currentTurn && state.currentTurn !== playerId) {
    return { valid: false, reason: "Not your turn." };
  }

  const hasCard = player.hand.some((c) => c.rank === card.rank && c.suit === card.suit);
  if (!hasCard) return { valid: false, reason: "Card not in hand." };

  if (state.phase.startsWith("ROUND")) {
    if (moveType === "FOLD") {
      if (!state.trick.leadSuit) {
        return { valid: false, reason: "Lead cannot fold." };
      }

      const leadPlays = state.trick.plays.filter((p) => p.moveType === "PLAY" && p.card);
      const highestLead = leadPlays
        .filter((p) => p.card?.suit === state.trick.leadSuit)
        .reduce<Card | null>((acc, play) => {
          if (!play.card) return acc;
          if (!acc) return play.card;
          return compareCards(play.card, acc) > 0 ? play.card : acc;
        }, null);

      const canBeat =
        highestLead &&
        player.hand.some(
          (c) => c.suit === state.trick.leadSuit && compareCards(c, highestLead) > 0
        );

      if (canBeat) {
        return { valid: false, reason: "Must play a beating card." };
      }

      return { valid: true };
    }

    if (moveType === "PLAY" && state.trick.leadSuit) {
      const hasLeadSuit = player.hand.some((c) => c.suit === state.trick.leadSuit);
      if (hasLeadSuit && card.suit !== state.trick.leadSuit) {
        return { valid: false, reason: "Must follow suit." };
      }
    }
  }

  if (state.phase === "SHOWDOWN") {
    const showdown = state.showdown;
    if (!showdown) return { valid: false, reason: "Missing showdown state." };
    if (moveType === "SHOW_FIRST" && showdown.firstReveals[playerId]) {
      return { valid: false, reason: "Already revealed first card." };
    }
    if (moveType === "SHOW_SECOND" && showdown.secondReveals[playerId]) {
      return { valid: false, reason: "Already revealed second card." };
    }
  }

  return { valid: true };
}

export function advanceRound(state: GameState, trickWinnerId: string | null) {
  if (!trickWinnerId) return state;
  if (state.roundNumber < 4) {
    const nextRound = state.roundNumber + 1;
    return {
      ...state,
      roundNumber: nextRound,
      phase: `ROUND_${nextRound}` as GamePhase,
      leadPlayerId: trickWinnerId,
      currentTurn: trickWinnerId,
      trick: { leadSuit: null, plays: [] },
    };
  }

  return {
    ...state,
    phase: "SHOWDOWN",
    roundNumber: 5,
    leadPlayerId: trickWinnerId,
    currentTurn: trickWinnerId,
    showdown: {
      showPlayerId: trickWinnerId,
      cupPlayerId: null,
      firstReveals: {},
      secondReveals: {},
    },
  };
}

export function handleShowdown(state: GameState) {
  if (state.phase !== "SHOWDOWN" || !state.showdown) return { winnerId: null, nextState: state };

  const { secondReveals } = state.showdown;
  const entries = Object.entries(secondReveals);
  if (entries.length === 0) return { winnerId: null, nextState: state };

  const [winnerId] = entries.reduce<[string, Card]>((best, current) => {
    const [bestId, bestCard] = best;
    const [currentId, currentCard] = current;
    return compareCards(currentCard, bestCard) > 0 ? [currentId, currentCard] : [bestId, bestCard];
  });

  return {
    winnerId,
    nextState: {
      ...state,
      phase: "FINISHED",
      currentTurn: null,
    },
  };
}

export function determineGameWinner(state: GameState) {
  if (state.phase === "FINISHED" && state.showdown) {
    return handleShowdown(state).winnerId;
  }

  const alivePlayers = state.players.filter((p) => p.isAlive);
  return alivePlayers.length === 1 ? alivePlayers[0].id : null;
}
