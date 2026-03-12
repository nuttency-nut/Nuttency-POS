import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabaseClient";
import { createGameChannel, createRoomChannel, disposeChannel } from "@/lib/realtime";
import { CardData, formatCard } from "@/components/Card";
import { CardHand } from "@/components/CardHand";
import { GameControls } from "@/components/GameControls";
import { GameTable } from "@/components/GameTable";

interface RoomRow {
  id: string;
  host_id: string | null;
  status: string;
  created_at: string;
}

interface PlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  seat_index: number;
  is_alive: boolean;
  is_host: boolean;
  joined_at: string;
}

interface GameRow {
  id: string;
  room_id: string;
  phase: string;
  current_turn: string | null;
  lead_player: string | null;
  round_number: number;
  show_stage?: string | null;
  winner_player?: string | null;
  turn_deadline?: string | null;
}

interface MoveRow {
  id: string;
  game_id: string;
  player_id: string;
  move_type: "PLAY" | "FOLD" | "SHOW_FIRST" | "SHOW_SECOND";
  card_rank?: string | null;
  card_suit?: string | null;
  round_number: number;
  created_at: string;
}

interface CardRow {
  id: string;
  game_id: string;
  player_id: string;
  card_rank: CardData["rank"];
  card_suit: CardData["suit"];
  is_played: boolean;
  is_folded: boolean;
}

function mapPlayerDisplay(player: PlayerRow, selfId?: string, selfName?: string) {
  if (player.user_id === selfId && selfName) {
    return selfName;
  }
  return `Người chơi ${player.seat_index + 1}`;
}

function cardSort(a: CardRow, b: CardRow) {
  const suitOrder: Record<CardData["suit"], number> = { S: 1, C: 2, D: 3, H: 4 };
  const rankOrder: Record<CardData["rank"], number> = {
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
  if (suitOrder[a.card_suit] !== suitOrder[b.card_suit]) {
    return suitOrder[a.card_suit] - suitOrder[b.card_suit];
  }
  return rankOrder[a.card_rank] - rankOrder[b.card_rank];
}

export default function CasinoTable() {
  const { user } = useAuth();
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [game, setGame] = useState<GameRow | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
  const [foldMode, setFoldMode] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const roomChannelRef = useRef<ReturnType<typeof createRoomChannel> | null>(null);
  const gameChannelRef = useRef<ReturnType<typeof createGameChannel> | null>(null);
  const gamesRoomChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const cleanupIntervalRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Bạn";

  const loadRoomData = useCallback(async (activeRoomId: string, currentPlayerId?: string) => {
    const { data: roomRow } = await supabase
      .from("rooms")
      .select("*")
      .eq("id", activeRoomId)
      .maybeSingle();
    if (roomRow) setRoom(roomRow as RoomRow);

    const { data: playerRows } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", activeRoomId)
      .order("seat_index", { ascending: true });
    setPlayers((playerRows as PlayerRow[]) ?? []);

    const { data: gameRows } = await supabase
      .from("games")
      .select("*")
      .eq("room_id", activeRoomId)
      .order("created_at", { ascending: false })
      .limit(1);

    const latestGame = (gameRows as GameRow[])?.[0] ?? null;
    setGame(latestGame);
    if (latestGame?.id) {
      const { data: moveRows } = await supabase
        .from("moves")
        .select("*")
        .eq("game_id", latestGame.id)
        .order("created_at", { ascending: true });
      setMoves((moveRows as MoveRow[]) ?? []);

      if (currentPlayerId) {
        const { data: cardRows } = await supabase
          .from("player_cards")
          .select("*")
          .eq("game_id", latestGame.id)
          .eq("player_id", currentPlayerId);
        setCards((cardRows as CardRow[]) ?? []);
      } else {
        setCards([]);
      }
    } else {
      setMoves([]);
      setCards([]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;

    const setup = async () => {
      setLoading(true);
      setError(null);
      setErrorDetails(null);

      const { data: roomIdValue, error: roomError } = await supabase.rpc(
        "catte_get_or_create_room"
      );
      if (!active) return;
      if (roomError || !roomIdValue) {
        setError(
          "Không thể tạo/phòng game. Hãy chắc chắn đã chạy migration Supabase và bật RPC."
        );
        setErrorDetails(roomError?.message ?? "Unknown RPC error");
        setLoading(false);
        return;
      }
      setRoomId(roomIdValue as string);

      const { data: joinResult, error: joinError } = await supabase.rpc("catte_join_room_v2", {
        p_room_id: roomIdValue,
      });
      if (!active) return;
      if (joinError) {
        setError("Không thể vào bàn chơi. Vui lòng tải lại trang.");
        setErrorDetails(joinError.message);
        setLoading(false);
        return;
      }
      const joinRow = Array.isArray(joinResult) ? joinResult[0] : joinResult;
      const joinedPlayerId = (joinRow as any)?.player_id as string | undefined;
      if (joinedPlayerId) {
        setPlayerId(joinedPlayerId);
      }

      try {
        await loadRoomData(roomIdValue as string, joinedPlayerId);
      } catch (loadError) {
        setError("Không thể tải dữ liệu bàn chơi. Vui lòng thử lại.");
        setErrorDetails(loadError instanceof Error ? loadError.message : "Unknown load error");
      }

      roomChannelRef.current = createRoomChannel({
        roomId: roomIdValue as string,
        onRoomChange: (payload) => {
          if (payload.new) setRoom(payload.new as RoomRow);
        },
        onPlayersChange: (payload) => {
          setPlayers((prev) => {
            const incoming = payload.new as PlayerRow;
            if (payload.eventType === "DELETE") {
              return prev.filter((p) => p.id !== (payload.old as PlayerRow)?.id);
            }
            const existing = prev.find((p) => p.id === incoming.id);
            if (existing) {
              return prev.map((p) => (p.id === incoming.id ? incoming : p));
            }
            return [...prev, incoming].sort((a, b) => a.seat_index - b.seat_index);
          });
        },
      });

      gamesRoomChannelRef.current = supabase
        .channel(`catte-games-${roomIdValue}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "games", filter: `room_id=eq.${roomIdValue}` },
          (payload) => {
            if (payload.eventType === "DELETE") {
              setGame(null);
              setMoves([]);
              setCards([]);
              return;
            }
            if (payload.new) {
              setGame(payload.new as GameRow);
            }
          }
        )
        .subscribe();

      setLoading(false);
    };

    setup();

    return () => {
      active = false;
      disposeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
      if (gamesRoomChannelRef.current) {
        supabase.removeChannel(gamesRoomChannelRef.current);
        gamesRoomChannelRef.current = null;
      }
    };
  }, [loadRoomData, retryToken, user]);

  useEffect(() => {
    if (!roomId) return;

    cleanupIntervalRef.current = window.setInterval(() => {
      void supabase.rpc("catte_ping", { p_room_id: roomId });
      void supabase.rpc("catte_cleanup_inactive", { p_room_id: roomId });
    }, 5000);

    tickRef.current = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    const handleUnload = () => {
      if (roomId) {
        void supabase.rpc("catte_leave_room", { p_room_id: roomId });
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      if (cleanupIntervalRef.current) {
        window.clearInterval(cleanupIntervalRef.current);
      }
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
      }
      window.removeEventListener("beforeunload", handleUnload);
      if (roomId) {
        void supabase.rpc("catte_leave_room", { p_room_id: roomId });
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !game?.id) return;
    disposeChannel(gameChannelRef.current);

    gameChannelRef.current = createGameChannel({
      gameId: game.id,
      onGameChange: (payload) => {
        if (payload.new) setGame(payload.new as GameRow);
      },
      onMovesChange: (payload) => {
        setMoves((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((m) => m.id !== (payload.old as MoveRow)?.id);
          }
          const incoming = payload.new as MoveRow;
          const existing = prev.find((m) => m.id === incoming.id);
          if (existing) {
            return prev.map((m) => (m.id === incoming.id ? incoming : m));
          }
          return [...prev, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      },
      onCardsChange: (payload) => {
        setCards((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((c) => c.id !== (payload.old as CardRow)?.id);
          }
          const incoming = payload.new as CardRow;
          const existing = prev.find((c) => c.id === incoming.id);
          if (existing) {
            return prev.map((c) => (c.id === incoming.id ? incoming : c));
          }
          return [...prev, incoming];
        });
      },
    });

    const hydrateGameData = async () => {
      const { data: moveRows } = await supabase
        .from("moves")
        .select("*")
        .eq("game_id", game.id)
        .order("created_at", { ascending: true });
      setMoves((moveRows as MoveRow[]) ?? []);

      if (playerId) {
        const { data: cardRows } = await supabase
          .from("player_cards")
          .select("*")
          .eq("game_id", game.id)
          .eq("player_id", playerId);
        setCards((cardRows as CardRow[]) ?? []);
      } else {
        setCards([]);
      }
    };

    void hydrateGameData();

    return () => {
      disposeChannel(gameChannelRef.current);
      gameChannelRef.current = null;
    };
  }, [game?.id, playerId, roomId]);

  useEffect(() => {
    setSelectedCard(null);
    setFoldMode(false);
  }, [game?.id, game?.phase]);

  const myPlayer = players.find((p) => p.user_id === user?.id && p.is_alive);
  const isHost = Boolean(myPlayer?.is_host);
  const isMyTurn = game?.current_turn === myPlayer?.id;
  const canStart = Boolean(room?.status === "WAITING" && players.filter((p) => p.is_alive).length >= 2);
  const canRestart = Boolean(game?.phase === "FINISHED");

  const remainingSeconds = useMemo(() => {
    if (!game?.turn_deadline) return null;
    const diff = new Date(game.turn_deadline).getTime() - now;
    return Math.max(0, Math.ceil(diff / 1000));
  }, [game?.turn_deadline, now]);

  const availableCards = useMemo(
    () => cards.filter((card) => !card.is_played && !card.is_folded).sort(cardSort),
    [cards]
  );

  useEffect(() => {
    if (!selectedCard) return;
    const stillAvailable = availableCards.some(
      (card) => card.card_rank === selectedCard.rank && card.card_suit === selectedCard.suit
    );
    if (!stillAvailable) {
      setSelectedCard(null);
      setFoldMode(false);
    }
  }, [availableCards, selectedCard]);

  useEffect(() => {
    if (!roomId || !game || !isMyTurn || !availableCards.length) return;
    if (remainingSeconds !== 0) return;

    const lowest = availableCards[0];
    const autoMoveType =
      game.phase === "SHOWDOWN" && (game.show_stage === "ALL_SECOND" || game.show_stage === "CUP_SECOND")
        ? "SHOW_SECOND"
        : game.phase === "SHOWDOWN"
          ? "SHOW_FIRST"
          : "FOLD";

    void supabase.rpc("catte_play_move", {
      p_room_id: roomId,
      p_move_type: autoMoveType,
      p_rank: lowest.card_rank,
      p_suit: lowest.card_suit,
    });
  }, [availableCards, game, isMyTurn, remainingSeconds, roomId]);

  const phaseLabel = useMemo(() => {
    if (!game) return "Đang chờ bàn...";
    switch (game.phase) {
      case "ROUND_1":
      case "ROUND_2":
      case "ROUND_3":
      case "ROUND_4":
        return `Ván ${game.round_number} - Lượt đánh`;
      case "SHOWDOWN":
        return "Showdown";
      case "FINISHED":
        return "Ván kết thúc";
      default:
        return "Đang chuẩn bị";
    }
  }, [game]);

  const handleStart = useCallback(async () => {
    if (!roomId) return;
    await supabase.rpc("catte_start_game", { p_room_id: roomId });
  }, [roomId]);

  const handleRestart = useCallback(async () => {
    if (!roomId) return;
    await supabase.rpc("catte_restart_game", { p_room_id: roomId });
    setMoves([]);
    setCards([]);
  }, [roomId]);

  const handlePlay = useCallback(async () => {
    if (!roomId || !selectedCard) return;
    if (!game) return;

    const moveType: "PLAY" | "FOLD" | "SHOW_FIRST" | "SHOW_SECOND" =
      game.phase === "SHOWDOWN"
        ? game.show_stage === "ALL_SECOND" || game.show_stage === "CUP_SECOND"
          ? "SHOW_SECOND"
          : "SHOW_FIRST"
        : foldMode
          ? "FOLD"
          : "PLAY";

    await supabase.rpc("catte_play_move", {
      p_room_id: roomId,
      p_move_type: moveType,
      p_rank: selectedCard.rank,
      p_suit: selectedCard.suit,
    });

    setSelectedCard(null);
    setFoldMode(false);
  }, [foldMode, game, roomId, selectedCard]);

  const playerSeats = useMemo(
    () =>
      players.map((player) => ({
        id: player.id,
        userId: player.user_id,
        seatIndex: player.seat_index,
        isHost: player.is_host,
        isAlive: player.is_alive,
        displayName: mapPlayerDisplay(player, user?.id, displayName),
      })),
    [displayName, players, user?.id]
  );

  const primaryActionLabel = useMemo(() => {
    if (!game) return "Chờ ván mới";
    if (game.phase === "SHOWDOWN") {
      if (game.show_stage === "ALL_SECOND" || game.show_stage === "CUP_SECOND") {
        return "Lật bài 2";
      }
      return "Lật bài 1";
    }
    return foldMode ? "Úp bài" : "Đánh bài";
  }, [foldMode, game]);

  return (
    <div className="min-h-screen bg-[#07140f] text-white px-4 py-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        {error && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-100 text-sm flex flex-col gap-2">
            <div>{error}</div>
            {errorDetails && (
              <div className="text-xs text-rose-200/80">
                Chi tiết: <span className="font-mono">{errorDetails}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setRetryToken((v) => v + 1)}
              className="self-start rounded-lg bg-rose-400/20 px-3 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-400/30"
            >
              Thử lại
            </button>
          </div>
        )}
        {loading && !error && (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-900/40 px-4 py-3 text-emerald-100 text-sm">
            Đang kết nối bàn chơi...
          </div>
        )}
        <GameControls
          isHost={isHost}
          canStart={canStart}
          canRestart={canRestart}
          onStart={handleStart}
          onRestart={handleRestart}
          foldMode={foldMode}
          onToggleFold={game?.phase?.startsWith("ROUND") ? () => setFoldMode((v) => !v) : undefined}
          phaseLabel={phaseLabel}
          timerLabel={remainingSeconds !== null ? `Còn ${remainingSeconds}s` : undefined}
          primaryAction={{
            label: primaryActionLabel,
            onClick: handlePlay,
            disabled: !isMyTurn || !selectedCard || game?.phase === "FINISHED",
          }}
        />

        {game?.phase === "FINISHED" && game.winner_player && (
          <motion.div
            className="rounded-2xl border border-amber-300/40 bg-amber-200/10 px-4 py-3 text-amber-100"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Người thắng:{" "}
            <span className="font-semibold">
              {players.find((p) => p.id === game.winner_player)?.user_id === user?.id
                ? displayName
                : "Đối thủ"}
            </span>
          </motion.div>
        )}

        <GameTable players={playerSeats} game={game ?? undefined} moves={moves} currentPlayerId={playerId} />

        <div className="rounded-2xl bg-emerald-950/70 border border-emerald-400/20 px-4 py-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Bài trên tay</h2>
              <p className="text-xs text-emerald-100/70">
                {isMyTurn ? "Tới lượt của bạn" : "Chờ đối thủ"}
              </p>
            </div>
            <div className="text-xs text-emerald-100/70">
              {selectedCard ? formatCard(selectedCard) : "Chọn một lá"}
            </div>
          </div>
          <CardHand
            cards={availableCards.map((card) => ({ rank: card.card_rank, suit: card.card_suit }))}
            selected={selectedCard}
            disabled={!isMyTurn || game?.phase === "FINISHED"}
            onSelect={setSelectedCard}
          />
        </div>
      </div>
    </div>
  );
}
