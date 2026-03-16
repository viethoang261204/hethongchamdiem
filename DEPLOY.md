# Hướng dẫn Deploy lên Render.com

Dự án gồm 2 phần:
- **Server**: API chạy trên Node.js/Express (port 3001)
- **Client**: Frontend React chạy trên Vite

---

## Bước 1: Chuẩn bị Repository Git

### Nếu chưa có repository:

```bash
# Tạo repository Git mới (chạy trong thư mục gốc dự án)
cd "C:\Users\Admin\Downloads\Project"
git init
git add .
git commit -m "Initial commit"

# Tạo repository trên GitHub, sau đó:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git branch -M main
git push -u origin main
```

---

## Bước 2: Deploy Server (API)

### 1. Tạo Web Service trên Render

1. Đăng nhập [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **Web Service**
3. Kết nối GitHub repository vừa tạo
4. Cấu hình:

| Setting | Giá trị |
|---------|---------|
| **Name** | `enjoy-ai-score-server` |
| **Environment** | `Node` |
| **Build Command** | (để trống - không cần build) |
| **Start Command** | `node index.js` |
| **Instance Type** | Free (hoặc chọn plan tùy nhu cầu) |

### 2. Environment Variables

Trong phần **Environment Variables**, thêm:

```
PORT=3001
```

### 3. Deploy

Click **Create Web Service**. Chờ deploy hoàn tất.

**Lưu lại URL server**, ví dụ: `https://enjoy-ai-score-server.onrender.com`

---

## Bước 3: Deploy Client (Frontend)

### 1. Cập nhật API URL trong Client

Sửa file `client/src/api.js` - thay `http://localhost:3001` thành URL server đã deploy:

```javascript:client/src/api.js
const BASE_URL = 'https://enjoy-ai-score-server.onrender.com'; // Đổi thành URL của bạn
```

### 2. Cấu hình Vite base URL (production)

Tạo file `client/.env.production`:

```env
VITE_API_URL=https://enjoy-ai-score-server.onrender.com
```

Sửa `client/vite.config.js` để dùng biến này:

```javascript:client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

### 3. Deploy lên Render dạng Static

Cách đơn giản nhất: Deploy client cùng server (serve static từ Express).

#### Cách A: Serve static từ Server (Khuyến nghị)

Sửa `server/index.js` để serve static files từ thư mục `client/dist` sau khi build:

```javascript:server/index.js (thêm vào cuối trước app.listen)

// Serve static files từ client build
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, '../client/dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});
```

Sau đó chỉ cần **deploy 1 Web Service** cho cả server + client:

| Setting | Giá trị |
|---------|---------|
| **Build Command** | `cd client && npm install && npm run build` |
| **Start Command** | `node index.js` |

#### Cách B: Deploy riêng Client lên Render (Static Site)

1. Tạo **Web Service** mới trên Render
2. Cấu hình:

| Setting | Giá trị |
|---------|---------|
| **Name** | `enjoy-ai-score-client` |
| **Environment** | `Node` |
| **Build Command** | `cd client && npm install && npm run build` |
| **Publish Directory** | `client/dist` |
| **Instance Type** | Free |

---

## Bước 4: Kiểm tra sau Deploy

1. **Server API**: Truy cập `https://<server-url>/api/competitions`
2. **Client**: Truy cập `https://<client-url>` (nếu deploy riêng)
3. Kiểm tra các chức năng:
   - Đăng nhập Admin
   - Đăng nhập Trọng tài
   - Nhập phiếu điểm

---

## Lưu ý quan trọng

### 1. Dữ liệu (Data)
- Dữ liệu hiện tại lưu trong `data/*.json` trên máy local
- Khi deploy lên Render, **dữ liệu sẽ mất** mỗi khi restart (vì Render Free không có persistent disk)
- **Giải pháp**: Sử dụng database (MongoDB, PostgreSQL) hoặc dùng Render Disk (paid)

### 2. CORS
- Server đã cấu hình CORS cho phép mọi origin:
```javascript:server/index.js
app.use(cors());
```

### 3. Build Client
- Client build ra thư mục `client/dist`
- Server cần được cấu hình để serve thư mục này

---

## Troubleshooting

### Lỗi "404 Not Found" khi refresh trang
- Đảm bảo server có cấu hình SPA fallback (`app.get('*')`)

### Lỗi "Connection refused" từ Client
- Kiểm tra API URL trong `client/src/api.js`
- Đảm bảo server đã deploy thành công

### Không lưu được dữ liệu sau restart
- Render Free tier reset filesystem sau mỗi 15 phút không có request
- Cần nâng cấp plan hoặc dùng database bên ngoài

---

## Cấu trúc thư mục cuối cùng

```
Project/
├── client/                 # React frontend
│   ├── src/
│   ├── dist/               # Build output (sau khi chạy npm run build)
│   ├── package.json
│   └── vite.config.js
├── server/                 # Express API
│   ├── index.js
│   ├── data/               # Dữ liệu JSON (sẽ mất trên Render Free)
│   └── package.json
├── DEPLOY.md               # File hướng dẫn này
└── README.md               # File readme dự án
```
