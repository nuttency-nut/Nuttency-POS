const seats = [
  {
    id: "north",
    label: "Người chơi 2",
    status: "Sẵn sàng",
    position: "top-3 left-1/2 -translate-x-1/2",
  },
  {
    id: "east",
    label: "Người chơi 3",
    status: "Đang chờ",
    position: "top-1/2 right-3 -translate-y-1/2",
  },
  {
    id: "south",
    label: "Bạn",
    status: "Đang vào bàn",
    position: "bottom-3 left-1/2 -translate-x-1/2",
  },
  {
    id: "west",
    label: "Người chơi 4",
    status: "Sẵn sàng",
    position: "top-1/2 left-3 -translate-y-1/2",
  },
];

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
  return (
    <div className="min-h-screen bg-[#0b0f0c] text-[#f7f1e4]" style={{ fontFamily: "var(--font-serif)" }}>
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
            <h1 className="text-3xl font-semibold text-[#f8e7c2] md:text-4xl">
              Sòng bài Cát Tê - 4 người vào bàn
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

                {seats.map((seat) => (
                  <div
                    key={seat.id}
                    className={`absolute flex flex-col items-center gap-2 ${seat.position}`}
                  >
                    <div className="flex items-center gap-2 rounded-full border border-emerald-200/20 bg-black/40 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-100/70">
                      {seat.status}
                    </div>
                    <div className="rounded-xl border border-emerald-200/20 bg-[#141a17]/90 px-4 py-2 text-sm text-emerald-100/90 shadow-lg">
                      {seat.label}
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={`${seat.id}-card-${index}`}
                          className="h-9 w-6 rounded-md border border-emerald-100/30 bg-gradient-to-br from-[#f6e7c2] via-[#f3d9a4] to-[#cfa15e] shadow-[0_6px_10px_rgba(0,0,0,0.35)]"
                        />
                      ))}
                    </div>
                  </div>
                ))}

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
                    <span className="text-[#f8e7c2]">4/4</span>
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
                    <span className="text-[#f8e7c2]">100 điểm (placeholder)</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200/10 bg-emerald-950/40 px-3 py-2">
                    <span>Pot hiện tại</span>
                    <span className="text-[#f8e7c2]">400 điểm (placeholder)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatTe;
