# Hệ thống Chấm điểm ENJOY AI ASIA OPEN

Hệ thống quản lý và chấm điểm cuộc thi ENJOY AI ASIA OPEN.

**Kiến trúc:** React (Vite) + Express + PostgreSQL (Neon). Một service Node duy nhất phục vụ cả API (`/api`) lẫn frontend build.

## Cấu trúc

```
client/   # Frontend React + Vite
server/   # Backend Express (auth JWT, REST API)
db/       # schema.sql + seed.sql cho PostgreSQL
```

## Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env   # rồi điền DATABASE_URL (Neon) và JWT_SECRET
npm run db:setup       # import db/schema.sql + db/seed.sql vào Neon
node index.cjs         # chạy server tại http://localhost:3000
```

### 2. Frontend (dev)

```bash
cd client
npm install
npm run dev            # Vite proxy /api → localhost:3000
```

Không cần `.env` cho client khi dev (đã có proxy) lẫn production (cùng origin với server).

## Deploy (Render)

Cấu hình trong `render.yaml` — Render tự build client + server và chạy `node server/index.cjs`. Cần khai báo biến môi trường trên Render:

- `DATABASE_URL` — connection string Neon (dạng pooler)
- `JWT_SECRET` — secret ký JWT

GitHub Actions (`.github/workflows/deploy.yml`) build kiểm tra rồi kích hoạt deploy, cần:

- Variable `RENDER_SERVICE_ID`
- Secret `RENDER_API_KEY`

## Database

Schema và seed nằm trong `db/`:

- `db/schema.sql` — bảng `users`, `teams`, `students`, `tasks`, `scores`, `score_images`, …
- `db/seed.sql` — dữ liệu mẫu + tài khoản admin mặc định

Import bằng `npm run db:setup` (trong `server/`) hoặc chạy tay qua `psql`.
