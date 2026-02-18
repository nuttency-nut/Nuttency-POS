# apppos-nut

App POS viết bằng React + Vite + TypeScript, dữ liệu chạy trên Supabase.

## 1. Chạy local bằng VS Code

Yêu cầu:
- Node.js 18+ (khuyến nghị 20+)
- npm

Cài và chạy:
```bash
npm install
cp .env.example .env.local
npm run dev
```

Build production:
```bash
npm run build
```

## 2. Biến môi trường

Tạo file `.env.local`:
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_ANON_KEY
```

Lưu ý:
- Chỉ dùng `anon/public key` ở frontend.
- Không đưa `service_role key` vào Vite frontend.

## 3. Setup Supabase từng bước

### Bước 1: Tạo project
1. Vào Supabase Dashboard.
2. Tạo project mới.
3. Lấy `Project URL` và `anon key` trong `Project Settings -> API`.

### Bước 2: Chạy migration database
Trong project này đã có migration ở thư mục `supabase/migrations`.

Cách nhanh (SQL Editor):
1. Mở Supabase `SQL Editor`.
2. Chạy lần lượt các file theo thứ tự tên thời gian:
- `20260207102902_8284125b-c8e7-47f4-992d-0b145f43679d.sql`
- `20260208013511_61186445-d508-4cfe-9a07-f3776521f764.sql`
- `20260209165053_3e0da0a4-001e-47fe-b7cf-f5ad990d2bc3.sql`
- `20260210092706_da9a3c04-937c-4338-9091-1d5803edb586.sql`
- `20260211034227_6c7508c0-e2be-46f8-b2f1-442860b8086f.sql`
- `20260213062813_5ed137ab-e889-4e57-932c-c8937e08dae0.sql`
- `20260213062946_4b002dd2-a221-4e5f-a159-79444f11923a.sql`

Sau khi chạy xong sẽ có:
- Auth role (`admin`, `staff`) + trigger tạo profile/role khi signup.
- Bảng sản phẩm/danh mục/biến thể/phân loại.
- Bảng đơn hàng, chi tiết đơn, khách hàng tích điểm.
- Bucket storage `product-images` + policy.
- RLS policy cho tất cả bảng.

### Bước 3: Cấu hình Authentication
1. Vào `Authentication -> Providers` bật Email provider.
2. Ở `Authentication -> URL Configuration` thêm:
- Site URL: domain app của bạn (local: `http://localhost:8080`)
- Redirect URLs: thêm local và domain production (Vercel).

### Bước 4: Tạo user admin đầu tiên
- User đăng ký đầu tiên sẽ tự nhận role `admin` (theo trigger `handle_new_user`).
- Các user tiếp theo mặc định là `staff`.

### Bước 5: Kiểm tra Storage
Vào `Storage`, xác nhận bucket `product-images` đã tồn tại và public read.

## 4. Deploy lên Vercel

Project đã có `vercel.json` để rewrite SPA route.

### Cách deploy
1. Push code lên GitHub.
2. Import repo vào Vercel.
3. Framework preset: `Vite`.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Thêm biến môi trường trên Vercel:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
7. Deploy.

### Sau deploy
- Vào Supabase `Authentication -> URL Configuration` cập nhật Site URL/Redirect URL bằng domain Vercel thật.

## 5. Các file đã thêm để chạy production

- `.gitignore` (chuẩn tên + ignore env)
- `.env.example`
- `vercel.json` (rewrite cho React Router)
- `manifest.json` (tránh lỗi thiếu manifest)
- `src/test/setup.ts` (khớp `vitest.config.ts`)
- `src/integrations/supabase/client.ts` (guard biến môi trường)
