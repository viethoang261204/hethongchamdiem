# Hệ thống Chấm điểm ENJOY AI ASIA OPEN

Hệ thống quản lý và chấm điểm cuộc thi ENJOY AI ASIA OPEN.

## Setup

```bash
cd client
npm install
npm run dev
```

Cần file `.env` trong thư mục `client/`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Database

Chạy schema và seed trong Supabase SQL Editor:

- `supabase/schema.sql`
- `supabase/seed.sql`
