import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

type RoomPlayer = {
  id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
};

type RoleUser = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: "admin" | "manager" | "staff" | "no_role";
};

const seats = [
  {
    id: "north",
    position: "top-3 left-1/2 -translate-x-1/2",
  },
  {
    id: "east",
    position: "top-1/2 right-3 -translate-y-1/2",
  },
  {
    id: "south",
    position: "bottom-3 left-1/2 -translate-x-1/2",
  },
  {
    id: "west",
    position: "top-1/2 left-3 -translate-y-1/2",
  },
];

const minPlayersToStart = 2;
const maxPlayers = 4;
const roomKey = "main";

const ruleHighlights = [
  "Chơi 4 người, dùng bộ bài Tây 52 lá, mỗi người nhận 6 lá.",
  "Ván đầu: ai vào phòng trước đánh trước. Các ván sau: ai ăn vòng 6 (tới) sẽ đánh trước.",
  "Vòng 1 đến vòng 4: người đi trước đánh 1 lá, người sau phải theo chất nếu có; không có chất thì úp 1 lá bất kỳ.",
  "Trong mỗi vòng, lá cao nhất theo chất của người đi trước sẽ ăn lượt và được quyền đi trước vòng sau.",
  "Sau 4 vòng, ai chưa ăn được lượt nào bị loại khỏi ván (tùng).",
  "Vòng 5 (chưng): người còn lại chọn 1 lá chưng; lá cao nhất làm cái và đánh trước vòng 6.",
  "Vòng 6: người theo chất nếu có; lá cao nhất theo chất ăn. Người ăn vòng 6 được quyền lật lá giữa.",
  "Không áp dụng ăn trắng.",
];

const ruleDetails = [
  "Khi bắt đầu ván, đặt mức cược/điểm cố định. Tất cả người chơi bỏ vào pot bằng nhau.",
  "Khi chia bài, chia thêm 1 lá ở giữa (lá pot).",
  "Người ăn vòng 6 được quyền lật lá giữa. Nếu người đó có lá cùng chất và lớn hơn lá giữa, đồng thời là lá lớn nhất trong 4 người, thì hốt pot.",
  "Nếu không ăn được lá giữa, người ăn vòng 6 chỉ được quyền đánh trước ván sau. Những người còn lại tiếp tục bỏ thêm cùng mức cược vào pot cho tới khi có người vừa ăn vòng 6 vừa ăn lá giữa.",
];

const ruleNotes = ["Điểm/cược sẽ lấy từ database để admin chỉnh trực tiếp."];

const CatTe = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [baseStakeInput, setBaseStakeInput] = useState("100");
  const [currencyInput, setCurrencyInput] = useState("điểm");
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [roomLoading, setRoomLoading] = useState(true);
  const [playerPoints, setPlayerPoints] = useState<Record<string, number>>({});
  const [players, setPlayers] = useState<RoleUser[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const baseStakeValue = useMemo(() => {
    const parsed = Number(baseStakeInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [baseStakeInput]);

  const currencyLabel = currencyInput.trim() || "điểm";
  const playerCount = roomPlayers.length;
  const potValue = baseStakeValue * playerCount;
  const currentUserPoints = user?.id ? playerPoints[user.id] ?? 0 : 0;
  const sortedPlayers = useMemo(() => {
    const list = [...roomPlayers];
    list.sort(
      (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );
    if (!user?.id) return list;
    const idx = list.findIndex((p) => p.user_id === user.id);
    if (idx > 0) {
      const [current] = list.splice(idx, 1);
      list.unshift(current);
    }
    return list;
  }, [roomPlayers, user?.id]);
  const firstPlayerId = sortedPlayers[0]?.user_id;
  const isFirstPlayer = !!user?.id && firstPlayerId === user.id;
  const canStart = !roomLoading && playerCount >= minPlayersToStart && isFirstPlayer;

  const seatAssignments = useMemo(() => {
    const seatOrder = ["south", "west", "north", "east"];
    return seatOrder.map((seatId, index) => {
      const seat = seats.find((s) => s.id === seatId);
      return {
        ...seat,
        player: sortedPlayers[index] ?? null,
      };
    });
  }, [sortedPlayers]);

  useEffect(() => {
    const loadSettings = async () => {
      setSettingsLoading(true);
      const { data, error } = await supabase
        .from("catte_settings")
        .select("id, base_stake, currency, singleton")
        .eq("singleton", true)
        .maybeSingle();

      if (error) {
        toast.error(error.message || "Không tải được cấu hình cược");
      } else if (data) {
        setSettingsId(data.id);
        setBaseStakeInput(String(data.base_stake ?? 100));
        setCurrencyInput(data.currency ?? "điểm");
      }
      setSettingsLoading(false);
    };

    void loadSettings();
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const loadMyPoints = async () => {
      const { data } = await supabase
        .from("catte_player_points")
        .select("points")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.points !== undefined) {
        setPlayerPoints((prev) => ({ ...prev, [user.id]: data.points ?? 0 }));
      }
    };

    void loadMyPoints();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    let mounted = true;
    const displayName =
      (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
      user.email ||
      "Người chơi";

    const loadRoomPlayers = async () => {
      setRoomLoading(true);
      const { data, error } = await supabase
        .from("catte_room_players")
        .select("id, user_id, display_name, joined_at")
        .eq("room_key", roomKey)
        .order("joined_at", { ascending: true });

      if (!mounted) return;

      if (error) {
        toast.error(error.message || "Không tải được danh sách người chơi");
        setRoomLoading(false);
        return;
      }

      setRoomPlayers(data ?? []);
      setRoomLoading(false);

      const alreadyInRoom = (data ?? []).some((p) => p.user_id === user.id);
      if (!alreadyInRoom && (data?.length ?? 0) >= maxPlayers) {
        toast.error("Bàn đã đủ 4 người");
        return;
      }

      if (!alreadyInRoom) {
        const { error: joinError } = await supabase
          .from("catte_room_players")
          .insert({ room_key: roomKey, user_id: user.id, display_name: displayName });

        if (joinError) {
          toast.error(joinError.message || "Không thể vào bàn");
          return;
        }
      } else {
        await supabase
          .from("catte_room_players")
          .update({ display_name: displayName })
          .eq("room_key", roomKey)
          .eq("user_id", user.id);
      }
    };

    void loadRoomPlayers();

    const channel = supabase
      .channel("catte_room_players")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "catte_room_players", filter: `room_key=eq.${roomKey}` },
        (payload) => {
          setRoomPlayers((prev) => {
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as RoomPlayer | undefined;
              return oldRow ? prev.filter((p) => p.id !== oldRow.id) : prev;
            }

            const newRow = payload.new as RoomPlayer | undefined;
            if (!newRow) return prev;
            const next = prev.filter((p) => p.id !== newRow.id);
            next.push(newRow);
            next.sort(
              (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
            );
            return next;
          });
        }
      )
      .subscribe();

    const leaveRoom = () => {
      if (!user?.id) return;
      supabase
        .from("catte_room_players")
        .delete()
        .eq("room_key", roomKey)
        .eq("user_id", user.id);
    };

    window.addEventListener("pagehide", leaveRoom);
    window.addEventListener("beforeunload", leaveRoom);

    return () => {
      mounted = false;
      window.removeEventListener("pagehide", leaveRoom);
      window.removeEventListener("beforeunload", leaveRoom);
      leaveRoom();
      supabase.removeChannel(channel);
    };
  }, [user?.email, user?.id, user?.user_metadata?.full_name]);

  useEffect(() => {
    if (!isAdmin) return;

    const loadPlayers = async () => {
      setPlayersLoading(true);
      try {
        const rpcRes = await supabase.rpc("list_users_for_role_management");
        const nextPlayers = Array.isArray(rpcRes.data)
          ? (rpcRes.data as RoleUser[])
          : [];

        const ids = nextPlayers.map((p) => p.user_id);
        if (ids.length > 0) {
          const { data: pointsData } = await supabase
            .from("catte_player_points")
            .select("user_id, points")
            .in("user_id", ids);

          const nextPoints: Record<string, number> = {};
          (pointsData ?? []).forEach((row) => {
            nextPoints[row.user_id] = row.points ?? 0;
          });

          setPlayerPoints((prev) => ({ ...prev, ...nextPoints }));
        }

        setPlayers(nextPlayers);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Không tải được danh sách người chơi";
        toast.error(message);
      } finally {
        setPlayersLoading(false);
      }
    };

    void loadPlayers();
  }, [isAdmin]);

  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    if (baseStakeValue <= 0) {
      toast.error("Mức cược không hợp lệ");
      return;
    }

    setSettingsSaving(true);
    const payload = {
      id: settingsId ?? undefined,
      singleton: true,
      base_stake: baseStakeValue,
      currency: currencyLabel,
    };

    const { data, error } = await supabase
      .from("catte_settings")
      .upsert(payload, { onConflict: "singleton" })
      .select("id")
      .maybeSingle();

    if (error) {
      toast.error(error.message || "Không lưu được cấu hình cược");
    } else {
      setSettingsId(data?.id ?? settingsId);
      toast.success("Đã lưu cấu hình cược");
    }
    setSettingsSaving(false);
  };

  const handleSavePoints = async (targetUserId: string, points: number) => {
    if (!isAdmin) return;
    if (points < 0 || !Number.isFinite(points)) {
      toast.error("Điểm không hợp lệ");
      return;
    }

    setSavingUserId(targetUserId);
    const { error } = await supabase
      .from("catte_player_points")
      .upsert({ user_id: targetUserId, points });

    if (error) {
      toast.error(error.message || "Không lưu được điểm");
    } else {
      toast.success("Đã cập nhật điểm");
      setPlayerPoints((prev) => ({ ...prev, [targetUserId]: points }));
    }
    setSavingUserId(null);
  };

  const handleStartHand = () => {
    if (!canStart) return;
    toast.success("Đã bắt đầu ván (demo)");
  };

  return (
    <div
      className="min-h-screen bg-[#0b0f0c] text-[#f7f1e4]"
      style={{ fontFamily: '"Be Vietnam Pro", sans-serif' }}
    >
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 opacity-60">
          <div className="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-[80px]" />
          <div className="absolute bottom-0 left-16 h-48 w-48 rounded-full bg-amber-400/20 blur-[70px]" />
          <div className="absolute right-10 top-24 h-64 w-64 rounded-full bg-rose-500/10 blur-[90px]" />
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:px-10">
          <div className="flex flex-col gap-3">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-900/30 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-emerald-100/70">
              Bàn Cát Tê Miền Nam
            </div>
            <h1
              className="text-3xl font-semibold text-[#f8e7c2] md:text-4xl"
              style={{ fontFamily: '"Libre Caslon Text", serif' }}
            >
              Sòng bài Cát Tê - {playerCount}/{maxPlayers} người vào bàn
            </h1>
            <p className="max-w-2xl text-sm text-emerald-100/70">
              Giao diện sòng bài cho 4 người đăng nhập. Luật đã bám theo mô tả bạn gửi và sẽ cắm logic chia bài +
              tính pot theo DB.
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="relative">
              <div className="relative mx-auto aspect-[4/3] w-full max-w-3xl">
                <div className="absolute inset-0 rounded-[48px] border border-emerald-200/20 bg-gradient-to-br from-emerald-900 via-emerald-950 to-[#0a1110] shadow-[0_0_70px_-20px_rgba(16,185,129,0.6)]" />
                <div className="absolute inset-6 rounded-[42px] border border-emerald-200/10 bg-[radial-gradient(circle_at_top,rgba(110,231,183,0.25),transparent_60%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.18),transparent_55%)]" />
                <div className="absolute inset-10 rounded-[999px] border border-emerald-100/10 bg-[linear-gradient(160deg,rgba(16,185,129,0.35),rgba(15,23,22,0.9))] shadow-[inset_0_0_40px_rgba(0,0,0,0.45)]" />

                {seatAssignments.map((seat) => {
                  const player = seat.player;
                  const isCurrentUser = player?.user_id === user?.id;
                  const seatLabel = player
                    ? isCurrentUser
                      ? "Bạn"
                      : player.display_name
                    : "Chỗ trống";
                  const statusLabel = player ? (isCurrentUser ? "Bạn" : "Đang ngồi") : "Chờ người chơi";

                  return (
                  <div
                    key={seat.id}
                    className={`absolute flex flex-col items-center gap-2 ${seat.position}`}
                  >
                    <div className="flex items-center gap-2 rounded-full border border-emerald-200/20 bg-black/40 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-100/70">
                      {statusLabel}
                    </div>
                    <div className="rounded-xl border border-emerald-200/20 bg-[#141a17]/90 px-4 py-2 text-sm text-emerald-100/90 shadow-lg">
                      {seatLabel}
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={`${seat.id}-card-${index}`}
                          className={`h-9 w-6 rounded-md border border-emerald-100/30 shadow-[0_6px_10px_rgba(0,0,0,0.35)] ${
                            player
                              ? "bg-gradient-to-br from-[#f6e7c2] via-[#f3d9a4] to-[#cfa15e]"
                              : "bg-emerald-200/10"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                );
                })}

                <div className="absolute bottom-10 right-12 flex flex-col items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-emerald-100/60">Bộ bài</span>
                  <div className="relative h-16 w-12">
                    <div className="absolute inset-0 translate-x-2 rounded-lg border border-emerald-100/20 bg-gradient-to-br from-[#0f766e] to-[#164e63]" />
                    <div className="absolute inset-0 rounded-lg border border-emerald-100/30 bg-gradient-to-br from-[#f2e2b0] to-[#cda25e]" />
                  </div>
                </div>

                <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
                  <div className="rounded-2xl border border-emerald-200/20 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-emerald-100/60">
                    Lá giữa
                  </div>
                  <div className="h-24 w-16 rounded-xl border border-emerald-100/30 bg-gradient-to-br from-[#f9edd2] via-[#f3d9a4] to-[#cfa15e] shadow-[0_10px_18px_rgba(0,0,0,0.45)]" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-2xl border border-emerald-200/20 bg-black/50 p-6 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]">
                <h2 className="text-lg font-semibold text-[#f8e7c2]">Luật Cát Tê (bản nháp)</h2>
                <p className="mt-2 text-sm text-emerald-100/70">
                  Đây là bản tóm tắt theo cách chơi phổ biến miền Nam, dùng để đối chiếu trước khi mình code luật chính thức.
                </p>
                <ul className="mt-4 list-disc space-y-2 pl-4 text-sm text-emerald-100/80">
                  {ruleHighlights.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
                <div className="mt-5 border-t border-emerald-200/10 pt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
                    Mô tả pot & lá giữa
                  </h3>
                  <ul className="mt-3 list-disc space-y-2 pl-4 text-sm text-emerald-100/80">
                    {ruleDetails.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200/10 bg-emerald-950/40 p-5 text-sm text-emerald-100/70">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
                  Ghi chú
                </h3>
                <ul className="mt-3 list-disc space-y-2 pl-4">
                  {ruleNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-emerald-200/20 bg-black/60 p-5 text-sm text-emerald-100/70">
                <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
                  Trạng thái bàn
                </h3>
                <div className="mt-3 grid gap-3 text-xs">
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Người chơi đang ngồi</span>
                    <span className="text-[#f8e7c2]">
                      {roomLoading ? "Đang tải..." : `${playerCount}/${maxPlayers}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Vòng hiện tại</span>
                    <span className="text-[#f8e7c2]">Chờ chia bài</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Cái</span>
                    <span className="text-[#f8e7c2]">Chưa xác định</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Mức cược</span>
                    <span className="text-[#f8e7c2]">
                      {settingsLoading ? "Đang tải..." : `${baseStakeValue} ${currencyLabel}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Pot hiện tại</span>
                    <span className="text-[#f8e7c2]">
                      {settingsLoading ? "Đang tải..." : `${potValue} ${currencyLabel}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Điểm của bạn</span>
                    <span className="text-[#f8e7c2]">{currentUserPoints} {currencyLabel}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleStartHand}
                    disabled={!canStart}
                    className={`w-full rounded-xl px-4 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition-all ${
                      canStart
                        ? "bg-[#f8e7c2] text-[#1a1208] shadow-[0_10px_30px_-20px_rgba(248,231,194,0.9)] hover:-translate-y-0.5"
                        : "bg-emerald-200/10 text-emerald-100/40 cursor-not-allowed"
                    }`}
                  >
                    Bắt đầu ván
                  </button>
                  <p className="text-[11px] text-emerald-100/60">
                    {roomLoading
                      ? "Đang tải danh sách người chơi..."
                      : playerCount < minPlayersToStart
                        ? `Cần tối thiểu ${minPlayersToStart} người để bắt đầu.`
                        : !isFirstPlayer
                          ? "Chỉ người vào bàn trước mới được bắt đầu."
                          : "Bạn có thể bắt đầu ván."}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="rounded-2xl border border-emerald-200/20 bg-black/60 p-5 text-sm text-emerald-100/70">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100/70">
                    Quản trị điểm & cược
                  </h3>
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2">
                      <label className="text-xs uppercase tracking-[0.2em] text-emerald-100/60">
                        Mức cược mặc định
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          value={baseStakeInput}
                          onChange={(e) => setBaseStakeInput(e.target.value)}
                          className="h-9 w-28 rounded-lg border border-emerald-200/20 bg-emerald-950/50 px-3 text-sm text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                          inputMode="numeric"
                        />
                        <input
                          value={currencyInput}
                          onChange={(e) => setCurrencyInput(e.target.value)}
                          className="h-9 flex-1 rounded-lg border border-emerald-200/20 bg-emerald-950/50 px-3 text-sm text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveSettings()}
                          disabled={settingsSaving}
                          className="h-9 rounded-lg border border-emerald-200/20 bg-emerald-500/20 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100 transition-all hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {settingsSaving ? "Đang lưu..." : "Lưu"}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-emerald-200/10 pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs uppercase tracking-[0.2em] text-emerald-100/60">
                          Điểm người chơi
                        </span>
                        {playersLoading && (
                          <span className="text-[11px] text-emerald-100/50">Đang tải...</span>
                        )}
                      </div>
                      <div className="mt-2 space-y-2">
                        {players.map((p) => {
                          const rawPoints = playerPoints[p.user_id] ?? 0;
                          const pointsValue = Number.isFinite(rawPoints) ? rawPoints : 0;
                          return (
                            <div
                              key={p.user_id}
                              className="flex items-center gap-2 rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2"
                            >
                              <div className="flex-1">
                                <p className="text-xs font-semibold text-emerald-100/90">
                                  {p.full_name?.trim() || p.email || p.user_id}
                                </p>
                                <p className="text-[11px] text-emerald-100/50">{p.role}</p>
                              </div>
                              <input
                                value={String(pointsValue)}
                                onChange={(e) =>
                                  setPlayerPoints((prev) => {
                                    const nextValue = Number(e.target.value || 0);
                                    return {
                                      ...prev,
                                      [p.user_id]: Number.isFinite(nextValue) ? nextValue : 0,
                                    };
                                  })
                                }
                                className="h-8 w-24 rounded-lg border border-emerald-200/20 bg-emerald-950/50 px-2 text-xs text-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                                inputMode="numeric"
                              />
                              <button
                                type="button"
                                onClick={() => void handleSavePoints(p.user_id, pointsValue)}
                                disabled={savingUserId === p.user_id}
                                className="h-8 rounded-lg border border-emerald-200/20 bg-emerald-500/10 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100 transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingUserId === p.user_id ? "..." : "Lưu"}
                              </button>
                            </div>
                          );
                        })}
                        {players.length === 0 && !playersLoading && (
                          <p className="text-[11px] text-emerald-100/50">
                            Chưa có danh sách người chơi để chỉnh điểm.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatTe;
