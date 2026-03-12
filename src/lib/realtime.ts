import { supabase } from "@/lib/supabaseClient";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChangeHandler<T> = (payload: RealtimePostgresChangesPayload<T>) => void;

interface RoomSubscriptions {
  roomId: string;
  onRoomChange?: ChangeHandler<Record<string, unknown>>;
  onPlayersChange?: ChangeHandler<Record<string, unknown>>;
}

interface GameSubscriptions {
  gameId: string;
  onGameChange?: ChangeHandler<Record<string, unknown>>;
  onMovesChange?: ChangeHandler<Record<string, unknown>>;
  onCardsChange?: ChangeHandler<Record<string, unknown>>;
}

export function createRoomChannel({ roomId, onRoomChange, onPlayersChange }: RoomSubscriptions) {
  const channel = supabase.channel(`catte-room-${roomId}`);

  if (onRoomChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      onRoomChange
    );
  }

  if (onPlayersChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      onPlayersChange
    );
  }

  channel.subscribe();
  return channel;
}

export function createGameChannel({ gameId, onGameChange, onMovesChange, onCardsChange }: GameSubscriptions) {
  const channel = supabase.channel(`catte-game-${gameId}`);

  if (onGameChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      onGameChange
    );
  }

  if (onMovesChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "moves", filter: `game_id=eq.${gameId}` },
      onMovesChange
    );
  }

  if (onCardsChange) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "player_cards", filter: `game_id=eq.${gameId}` },
      onCardsChange
    );
  }

  channel.subscribe();
  return channel;
}

export function disposeChannel(channel?: RealtimeChannel | null) {
  if (!channel) return;
  supabase.removeChannel(channel);
}
