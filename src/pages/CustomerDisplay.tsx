import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { BadgeCheck, Info, Sparkles } from "lucide-react";

type OrderItem = {
  id: string;
  name: string;
  note?: string;
  qty: number;
  price: number;
  image?: string;
};

const PROMOTIONS = [
  {
    id: "promo-1",
    tag: "Ưu đãi hôm nay",
    title: "Combo giải nhiệt",
    description: "Giảm 20% cho các món nước đá theo mùa.",
    image:
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "promo-2",
    tag: "Khách thân thiết",
    title: "Bánh tươi buổi sáng",
    description: "Tặng thêm 1 điểm cho mỗi sản phẩm bánh.",
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80",
  },
];

const ORDER_ITEMS: OrderItem[] = [
  {
    id: "item-1",
    name: "Cà phê sữa đá",
    note: "Size L • Ít đá",
    qty: 1,
    price: 32000,
    image:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "item-2",
    name: "Bánh croissant hạnh nhân",
    note: "Nướng nóng",
    qty: 2,
    price: 28000,
    image:
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "item-3",
    name: "Sandwich đặc biệt",
    note: "Bánh mì đen",
    qty: 1,
    price: 59000,
    image:
      "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
  },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

export default function CustomerDisplay() {
  const { warehouseCode } = useParams();

  const subtotal = useMemo(
    () => ORDER_ITEMS.reduce((acc, item) => acc + item.price * item.qty, 0),
    []
  );
  const discount = 15000;
  const total = Math.max(subtotal - discount, 0);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 text-slate-900 overflow-hidden">
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full bg-amber-200/50 blur-3xl" />

      <div className="relative h-screen w-full p-4">
        <div className="grid h-full w-full gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1.1fr)]">
          <motion.aside
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="rounded-3xl bg-slate-900 text-white p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-amber-300" />
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-300">Ưu đãi nổi bật</p>
                  <h2 className="text-2xl font-semibold">Featured Offers</h2>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-300">Dành riêng cho khách hàng hôm nay</p>
            </div>

            <div className="flex flex-1 flex-col gap-4">
              {PROMOTIONS.map((promo, index) => (
                <motion.div
                  key={promo.id}
                  className="relative flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-md"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 + index * 0.1 }}
                >
                  <img src={promo.image} alt={promo.title} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white space-y-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs uppercase tracking-[0.2em]">
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-300" />
                      {promo.tag}
                    </span>
                    <p className="text-xl font-semibold">{promo.title}</p>
                    <p className="text-sm text-white/80">{promo.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.aside>

          <motion.main
            className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-5">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Đơn hàng của bạn</h1>
                <p className="text-sm text-slate-500">Mã đơn: #POS-{warehouseCode ?? "0000"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-sky-100 px-4 py-2 text-xs font-semibold text-sky-700 animate-pulse">
                  Đang xử lý...
                </span>
                {warehouseCode && (
                  <span className="rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                    Kho {warehouseCode}
                  </span>
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 no-scrollbar">
              {ORDER_ITEMS.map((item, index) => (
                <motion.div
                  key={item.id}
                  className="flex items-center gap-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + index * 0.1 }}
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-20 w-20 rounded-2xl object-cover shadow"
                  />
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-800">{item.name}</h3>
                    <p className="text-sm text-slate-400">{item.note}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs font-semibold uppercase text-slate-400">Qty</p>
                      <span className="text-xl font-semibold text-slate-800">{item.qty}</span>
                    </div>
                    <div className="w-28 text-right text-xl font-semibold text-slate-800">
                      {formatCurrency(item.price * item.qty)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <footer className="border-t border-slate-100 bg-slate-50 px-6 py-4">
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Info className="h-4 w-4" />
                <p className="text-sm">Vui lòng kiểm tra lại sản phẩm trước khi thanh toán.</p>
              </div>
            </footer>
          </motion.main>

          <motion.aside
            className="flex flex-col gap-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Khách hàng</p>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-2xl font-semibold text-sky-700">
                  KH
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800">Khách lẻ</h3>
                  <p className="text-sm text-slate-500">Thành viên tiêu chuẩn</p>
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Khuyến mãi áp dụng</p>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                <span className="font-mono text-sm font-semibold text-sky-700">SUMMER20</span>
                <span className="rounded-full bg-sky-600 px-2 py-1 text-xs font-semibold text-white">Active</span>
              </div>

              <div className="mt-6 flex-1 space-y-4 border-t border-slate-100 pt-6">
                <div className="flex items-center justify-between text-base">
                  <span className="text-slate-500">Tạm tính</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-base text-red-500">
                  <span>Giảm giá</span>
                  <span className="font-semibold">-{formatCurrency(discount)}</span>
                </div>
                <div className="flex items-center justify-between text-base text-emerald-600">
                  <span>Điểm thưởng</span>
                  <span className="font-semibold">{formatCurrency(0)}</span>
                </div>

                <div className="rounded-2xl border border-dashed border-slate-200 p-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Cần thanh toán</p>
                  <p className="mt-2 text-4xl font-semibold text-slate-900 font-serif">
                    {formatCurrency(total)}
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-3xl bg-slate-900 px-6 py-5 text-center text-white shadow-lg">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sẵn sàng thanh toán</p>
                <p className="mt-2 text-lg font-semibold">Vui lòng làm theo hướng dẫn của nhân viên</p>
              </div>
            </div>
          </motion.aside>
        </div>
      </div>
    </div>
  );
}
