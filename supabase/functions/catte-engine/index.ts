const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Suit = "H" | "D" | "C" | "S";
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

type Card = { rank: Rank; suit: Suit };

type PlayerState = {
  id: string;
  seatIndex: number;
  hand: Card[];
  usedCards: Card[];
  foldedTricks: number;
  tricksWon: number;
  eliminated: boolean;
  left: boolean;
};

type TrickPlay = {
  playerId: string;
  type: "ATTACK" | "FOLD";
  card?: Card;
  cardHidden?: Card;
};

type ShowReveal = {
  playerId: string;
  first?: Card;
  second?: Card;
};

type GameState = {
  players: PlayerState[];
  deck: Card[];
  centerCard: Card;
  pot: number;
  baseBet: number;
  phase: "TRICK_1" | "TRICK_2" | "TRICK_3" | "TRICK_4" | "SHOWDOWN" | "ROUND_END";
  trickNumber: number;
  turnPlayerId: string;
  leadSuit?: Suit;
  highestAttack?: Card;
  trickPlays: TrickPlay[];
  show: ShowReveal[];
  showOrder: string[];
  tempWinnerId?: string;
  roundWinnerId?: string;
  nextStarterId?: string;
  shuffleSeed: string;
};

type ActionRequest = {
  action: string;
  payload?: any;
};

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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function buildDeck(): Card[] {
  const suits: Suit[] = ["H", "D", "C", "S"];
  const ranks: Rank[] = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function seedFromString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function shuffleDeck(deck: Card[], seed?: string): { deck: Card[]; seed: string } {
  const seedValue = seed && seed.length > 0 ? seed : randomSeed();
  const rng = mulberry32(seedFromString(seedValue));
  const shuffled = deck.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return { deck: shuffled, seed: seedValue };
}

function dealCards(deck: Card[], playerCount: number) {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let index = 0;
  for (let round = 0; round < 6; round += 1) {
    for (let p = 0; p < playerCount; p += 1) {
      hands[p].push(deck[index]);
      index += 1;
    }
  }
  const centerCard = deck[index];
  const remaining = deck.slice(index + 1);
  return { hands, centerCard, remaining };
}

function orderBySeat(players: PlayerState[]): PlayerState[] {
  return players.slice().sort((a, b) => a.seatIndex - b.seatIndex);
}

function orderFrom(startId: string, players: PlayerState[]): string[] {
  const ordered = orderBySeat(players).map((p) => p.id);
  const idx = ordered.indexOf(startId);
  if (idx < 0) return ordered;
  return ordered.slice(idx).concat(ordered.slice(0, idx));
}

function nextSeat(players: PlayerState[], currentId: string): string {
  const active = players.filter((p) => !p.left && !p.eliminated);
  const ordered = orderBySeat(active);
  const idx = ordered.findIndex((p) => p.id === currentId);
  const next = ordered[(idx + 1) % ordered.length];
  return next?.id ?? currentId;
}

function canAttack(state: GameState, card: Card): boolean {
  if (state.trickPlays.length === 0) return true;
  if (!state.leadSuit || !state.highestAttack) return true;
  if (card.suit !== state.leadSuit) return false;
  return RANK_ORDER[card.rank] > RANK_ORDER[state.highestAttack.rank];
}

function validateMove(state: GameState, playerId: string, move: TrickPlay): string | null {
  if (state.turnPlayerId !== playerId) return "not_your_turn";
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.left || player.eliminated) return "player_inactive";

  if (move.type === "ATTACK") {
    if (!move.card) return "missing_card";
    if (!player.hand.some((c) => c.rank === move.card!.rank && c.suit === move.card!.suit)) {
      return "card_not_in_hand";
    }
    if (!canAttack(state, move.card)) return "invalid_attack";
    return null;
  }

  if (move.type === "FOLD") {
    if (!move.cardHidden) return "missing_hidden_card";
    if (!player.hand.some((c) => c.rank === move.cardHidden!.rank && c.suit === move.cardHidden!.suit)) {
      return "card_not_in_hand";
    }
    if (state.trickPlays.length === 0) {
      return "leader_must_attack";
    }
    return null;
  }

  return "unknown_move";
}

function applyMove(state: GameState, move: TrickPlay): GameState {
  const error = validateMove(state, move.playerId, move);
  if (error) {
    throw new Error(error);
  }

  const s = clone(state);
  const player = s.players.find((p) => p.id === move.playerId)!;

  if (move.type === "ATTACK") {
    player.hand = player.hand.filter((c) => !(c.rank === move.card!.rank && c.suit === move.card!.suit));
    player.usedCards.push(move.card!);
    s.trickPlays.push(move);
    if (!s.leadSuit) s.leadSuit = move.card!.suit;
    if (!s.highestAttack && s.leadSuit === move.card!.suit) {
      s.highestAttack = move.card!;
    } else if (s.highestAttack && move.card!.suit === s.leadSuit) {
      if (RANK_ORDER[move.card!.rank] > RANK_ORDER[s.highestAttack.rank]) {
        s.highestAttack = move.card!;
      }
    }
  } else {
    player.hand = player.hand.filter((c) => !(c.rank === move.cardHidden!.rank && c.suit === move.cardHidden!.suit));
    player.usedCards.push(move.cardHidden!);
    player.foldedTricks += 1;
    s.trickPlays.push(move);
  }

  s.turnPlayerId = nextSeat(s.players, move.playerId);
  return s;
}

function resolveTrick(state: GameState): GameState {
  const s = clone(state);
  if (!s.leadSuit) throw new Error("missing_lead_suit");
  const attacks = s.trickPlays.filter((p) => p.type === "ATTACK" && p.card) as TrickPlay[];
  if (attacks.length === 0) throw new Error("no_attack_in_trick");

  const leadSuit = s.leadSuit;
  const winnerPlay = attacks
    .filter((p) => p.card!.suit === leadSuit)
    .sort((a, b) => RANK_ORDER[b.card!.rank] - RANK_ORDER[a.card!.rank])[0];

  const winner = s.players.find((p) => p.id === winnerPlay.playerId)!;
  winner.tricksWon += 1;

  if (s.trickNumber < 4) {
    s.trickNumber += 1;
    s.phase = (`TRICK_${s.trickNumber}` as GameState["phase"]);
  } else {
    s.phase = "SHOWDOWN";
  }

  s.turnPlayerId = winner.id;
  s.trickPlays = [];
  s.leadSuit = undefined;
  s.highestAttack = undefined;

  if (s.trickNumber === 4) {
    for (const p of s.players) {
      if (!p.left && p.foldedTricks >= 4) p.eliminated = true;
    }
  }

  return s;
}

function checkImmediateWin(state: GameState): string | null {
  const winner = state.players.find((p) => p.tricksWon === 4);
  if (!winner) return null;
  const othersFoldAll = state.players.every((p) => p.id === winner.id || p.foldedTricks >= 4);
  return othersFoldAll ? winner.id : null;
}

function startShowdown(state: GameState, starterId: string): GameState {
  const s = clone(state);
  const remaining = s.players.filter((p) => !p.left && !p.eliminated);
  s.phase = "SHOWDOWN";
  s.show = remaining.map((p) => ({ playerId: p.id }));
  s.showOrder = orderFrom(starterId, remaining);
  s.tempWinnerId = undefined;
  return s;
}

function revealFirst(state: GameState, playerId: string, card: Card): GameState {
  const s = clone(state);
  const player = s.players.find((p) => p.id === playerId);
  if (!player || player.left || player.eliminated) throw new Error("player_inactive");
  if (!player.hand.some((c) => c.rank === card.rank && c.suit === card.suit)) {
    throw new Error("card_not_in_hand");
  }
  const slot = s.show.find((r) => r.playerId === playerId);
  if (!slot) throw new Error("player_not_in_showdown");
  if (slot.first) throw new Error("first_already_revealed");

  player.hand = player.hand.filter((c) => !(c.rank === card.rank && c.suit === card.suit));
  player.usedCards.push(card);
  slot.first = card;
  return s;
}

function determineTemporaryWinner(state: GameState, starterId: string): string {
  const starter = state.show.find((r) => r.playerId === starterId);
  if (!starter?.first) throw new Error("starter_missing_first");
  const leadSuit = starter.first.suit;
  const order = orderFrom(starterId, state.players.filter((p) => !p.left && !p.eliminated));

  let temp = starterId;
  for (const pid of order) {
    const entry = state.show.find((r) => r.playerId === pid);
    if (!entry?.first) continue;
    if (entry.first.suit === leadSuit) {
      const current = state.show.find((r) => r.playerId === temp)!.first!;
      if (RANK_ORDER[entry.first.rank] > RANK_ORDER[current.rank]) {
        temp = pid;
      }
    }
  }
  return temp;
}

function revealSecond(state: GameState, playerId: string, card: Card): GameState {
  const s = clone(state);
  const player = s.players.find((p) => p.id === playerId);
  if (!player || player.left || player.eliminated) throw new Error("player_inactive");
  if (!player.hand.some((c) => c.rank === card.rank && c.suit === card.suit)) {
    throw new Error("card_not_in_hand");
  }
  const slot = s.show.find((r) => r.playerId === playerId);
  if (!slot) throw new Error("player_not_in_showdown");
  if (slot.second) throw new Error("second_already_revealed");

  player.hand = player.hand.filter((c) => !(c.rank === card.rank && c.suit === card.suit));
  player.usedCards.push(card);
  slot.second = card;
  return s;
}

function resolveShowdown(state: GameState, tempWinnerId: string): string {
  const temp = state.show.find((r) => r.playerId === tempWinnerId);
  if (!temp?.second) throw new Error("temp_missing_second");
  const leadSuit = temp.second.suit;

  const challengers = state.show
    .filter((r) => r.playerId !== tempWinnerId && r.second)
    .filter((r) => r.second!.suit === leadSuit && RANK_ORDER[r.second!.rank] > RANK_ORDER[temp.second!.rank]);

  if (challengers.length === 0) return tempWinnerId;

  return challengers.sort((a, b) => RANK_ORDER[b.second!.rank] - RANK_ORDER[a.second!.rank])[0].playerId;
}

function evaluateCenter(state: GameState, roundWinnerId: string) {
  const center = state.centerCard;
  const candidates: { playerId: string; card: Card }[] = [];

  for (const p of state.players) {
    for (const card of p.usedCards) {
      if (card.suit === center.suit) candidates.push({ playerId: p.id, card });
    }
  }

  if (candidates.length === 0) return { finalWinner: false };

  const highest = candidates.sort((a, b) => RANK_ORDER[b.card.rank] - RANK_ORDER[a.card.rank])[0];
  const isHigherThanCenter = RANK_ORDER[highest.card.rank] > RANK_ORDER[center.rank];
  return { finalWinner: isHigherThanCenter && highest.playerId === roundWinnerId };
}

function handleRoundEnd(state: GameState, roundWinnerId: string, finalWinner: boolean): GameState {
  const s = clone(state);
  s.roundWinnerId = roundWinnerId;
  s.nextStarterId = roundWinnerId;
  s.phase = "ROUND_END";

  if (finalWinner) {
    s.pot = 0;
  } else {
    const others = s.players.filter((p) => !p.left && p.id !== roundWinnerId);
    for (const _ of others) {
      s.pot += s.baseBet;
    }
  }

  return s;
}

function resetPotIfAllLeft(state: GameState): GameState {
  const s = clone(state);
  if (s.players.every((p) => p.left)) {
    s.pot = 0;
  }
  return s;
}

function initGame(payload: any): GameState {
  if (!payload?.players || !Array.isArray(payload.players) || payload.players.length < 2 || payload.players.length > 6) {
    throw new Error("invalid_player_count");
  }
  const baseBet = Number(payload.baseBet ?? 0);
  if (!Number.isFinite(baseBet) || baseBet < 0) throw new Error("invalid_base_bet");

  const sorted = payload.players
    .map((p: any) => ({ id: String(p.id), seatIndex: Number(p.seatIndex ?? 0) }))
    .sort((a: any, b: any) => a.seatIndex - b.seatIndex);

  const deck = buildDeck();
  const { deck: shuffled, seed } = shuffleDeck(deck, payload.seed);
  const { hands, centerCard, remaining } = dealCards(shuffled, sorted.length);

  const players: PlayerState[] = sorted.map((p: any, idx: number) => ({
    id: p.id,
    seatIndex: p.seatIndex,
    hand: hands[idx],
    usedCards: [],
    foldedTricks: 0,
    tricksWon: 0,
    eliminated: false,
    left: false,
  }));

  const initialPot = Number(payload.initialPot ?? 0);
  const pot = Number.isFinite(initialPot) ? initialPot + baseBet * players.length : baseBet * players.length;

  return {
    players,
    deck: remaining,
    centerCard,
    pot,
    baseBet,
    phase: "TRICK_1",
    trickNumber: 1,
    turnPlayerId: players[0].id,
    leadSuit: undefined,
    highestAttack: undefined,
    trickPlays: [],
    show: [],
    showOrder: [],
    tempWinnerId: undefined,
    roundWinnerId: undefined,
    nextStarterId: undefined,
    shuffleSeed: seed,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "method_not_allowed" });
  }

  let body: ActionRequest;
  try {
    body = (await req.json()) as ActionRequest;
  } catch {
    return jsonResponse(400, { ok: false, error: "invalid_json" });
  }

  const action = String(body.action || "").trim();
  const payload = body.payload ?? {};

  try {
    switch (action) {
      case "init_game": {
        const state = initGame(payload);
        return jsonResponse(200, { ok: true, result: state });
      }
      case "validate_move": {
        const error = validateMove(payload.state as GameState, payload.playerId, payload.move as TrickPlay);
        return jsonResponse(200, { ok: true, result: { valid: !error, error: error ?? null } });
      }
      case "apply_move": {
        const updated = applyMove(payload.state as GameState, payload.move as TrickPlay);
        return jsonResponse(200, { ok: true, result: updated });
      }
      case "resolve_trick": {
        const updated = resolveTrick(payload.state as GameState);
        return jsonResponse(200, { ok: true, result: updated });
      }
      case "check_immediate_win": {
        const winnerId = checkImmediateWin(payload.state as GameState);
        return jsonResponse(200, { ok: true, result: { winnerId } });
      }
      case "start_showdown": {
        const updated = startShowdown(payload.state as GameState, String(payload.starterId));
        return jsonResponse(200, { ok: true, result: updated });
      }
      case "reveal_first": {
        const updated = revealFirst(payload.state as GameState, String(payload.playerId), payload.card as Card);
        return jsonResponse(200, { ok: true, result: updated });
      }
      case "determine_temp_winner": {
        const tempWinnerId = determineTemporaryWinner(payload.state as GameState, String(payload.starterId));
        return jsonResponse(200, { ok: true, result: { tempWinnerId } });
      }
      case "reveal_second": {
        const updated = revealSecond(payload.state as GameState, String(payload.playerId), payload.card as Card);
        return jsonResponse(200, { ok: true, result: updated });
      }
      case "resolve_showdown": {
        const winnerId = resolveShowdown(payload.state as GameState, String(payload.tempWinnerId));
        return jsonResponse(200, { ok: true, result: { winnerId } });
      }
      case "evaluate_center": {
        const result = evaluateCenter(payload.state as GameState, String(payload.roundWinnerId));
        return jsonResponse(200, { ok: true, result });
      }
      case "handle_round_end": {
        const updated = handleRoundEnd(
          payload.state as GameState,
          String(payload.roundWinnerId),
          Boolean(payload.finalWinner)
        );
        return jsonResponse(200, { ok: true, result: updated });
      }
      case "reset_pot_if_all_left": {
        const updated = resetPotIfAllLeft(payload.state as GameState);
        return jsonResponse(200, { ok: true, result: updated });
      }
      default:
        return jsonResponse(400, { ok: false, error: "unknown_action" });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unexpected_error";
    return jsonResponse(400, { ok: false, error: message });
  }
});
