# TÀI LIỆU YÊU CẦU CHỨC NĂNG & PHÂN TÍCH NGHIỆP VỤ

**Dự án:** ENJOY AI ASIA OPEN — Hệ thống Chấm điểm Cuộc thi
**Phiên bản:** 1.0
**Ngày lập:** 18/03/2026
**Loại tài liệu:** Business Requirements Document (BRD) + Functional Requirements Specification (FRS)

---

## MỤC LỤC

1. [Tổng quan dự án](#1-tổng-quan-dự-án)
2. [Bối cảnh & Mục tiêu nghiệp vụ](#2-bối-cảnh--mục-tiêu-nghiệp-vụ)
3. [Các bên liên quan (Stakeholders)](#3-các-bên-liên-quan-stakeholders)
4. [Phân tích nghiệp vụ theo Actor](#4-phân-tích-nghiệp-vụ-theo-actor)
5. [Đặc tả yêu cầu chức năng](#5-đặc-tả-yêu-cầu-chức-năng)
6. [Mô hình dữ liệu nghiệp vụ](#6-mô-hình-dữ-liệu-nghiệp-vụ)
7. [Quy tắc nghiệp vụ & Ràng buộc](#7-quy-tắc-nghiệp-vụ--ràng-buộc)
8. [Luồng nghiệp vụ chính (Business Flows)](#8-luồng-nghiệp-vụ-chính-business-flows)
9. [Yêu cầu phi chức năng](#9-yêu-cầu-phi-chức-năng)
10. [Rủi ro & Hạn chế hiện tại](#10-rủi-ro--hạn-chế-hiện-tại)
11. [Kiến nghị cải tiến](#11-kiến-nghị-cải-tiến)

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Giới thiệu

**ENJOY AI ASIA OPEN Scoring System** là một ứng dụng web được xây dựng để hỗ trợ tổ chức, quản lý và vận hành cuộc thi AI cấp quốc tế (châu Á) dành cho học sinh. Hệ thống giải quyết bài toán chấm điểm nhiều vòng, nhiều nội dung thi, với nhiều ban giám khảo hoạt động đồng thời tại nhiều khu vực địa lý khác nhau.

### 1.2 Phạm vi hệ thống

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| Quản lý cấu hình cuộc thi | Hệ thống đăng ký tham dự online |
| Quản lý đội thi & học sinh | Thanh toán / phí tham gia |
| Chấm điểm trực tuyến real-time | Livestream / broadcasting |
| Bảng xếp hạng công khai | Cấp phát chứng chỉ / giấy khen |
| Quản lý tài khoản trọng tài | Thông báo email / SMS |
| Xuất báo cáo điểm | Tích hợp hệ thống bên ngoài |

### 1.3 Công nghệ sử dụng

- **Frontend:** React 18 + Vite + React Router v6
- **Backend:** Node.js + Express.js
- **Lưu trữ dữ liệu:** JSON file (flat-file database)
- **Font chữ:** Be Vietnam Pro
- **Triển khai:** Single server, static build served from Express

---

## 2. BỐI CẢNH & MỤC TIÊU NGHIỆP VỤ

### 2.1 Bối cảnh

Cuộc thi ENJOY AI ASIA OPEN là sự kiện cấp châu Á với quy mô nhiều đội thi đến từ nhiều tỉnh thành. Cuộc thi có nhiều **nội dung thi** (contest content) khác nhau, mỗi nội dung có bộ tiêu chí chấm điểm riêng. Các đội thi được phân theo **3 khu vực địa lý** (Bắc – Trung – Nam). Mỗi khu vực có các trọng tài chịu trách nhiệm chấm điểm độc lập.

Trước khi có hệ thống này, việc chấm điểm được thực hiện thủ công trên giấy tờ hoặc bảng tính Excel, dẫn đến:
- Sai sót trong nhập liệu
- Chậm trễ trong tổng hợp kết quả
- Khó khăn trong việc tra cứu và kiểm tra lại điểm số
- Thiếu minh bạch với công chúng

### 2.2 Mục tiêu nghiệp vụ

| Mã | Mục tiêu | Chỉ số đo lường |
|---|---|---|
| BG-01 | Số hóa hoàn toàn quy trình chấm điểm | 100% điểm được nhập qua hệ thống |
| BG-02 | Cập nhật bảng xếp hạng real-time | Bảng XH cập nhật ngay sau khi trọng tài nộp điểm |
| BG-03 | Tăng tính minh bạch kết quả | Công khai TOP 20 trên trang chủ |
| BG-04 | Giảm thiểu sai sót nhập liệu | Có validation ràng buộc tại form |
| BG-05 | Kiểm soát quyền truy cập | Phân quyền rõ ràng Admin / Trọng tài / Công chúng |
| BG-06 | Truy vết lịch sử chấm điểm | Lưu đầy đủ thông tin người chấm, thời gian, chữ ký |

---

## 3. CÁC BÊN LIÊN QUAN (STAKEHOLDERS)

### 3.1 Người dùng hệ thống (Actors)

```
┌─────────────────────────────────────────────────────────────┐
│                    HỆ THỐNG ENJOY AI                        │
│                                                             │
│  [ADMIN]          [TRỌNG TÀI]          [CÔNG CHÚNG]        │
│  Quản trị viên    Ban giám khảo        Khán giả / Phụ huynh │
│  hệ thống         chấm điểm            theo dõi             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Mô tả Actor

#### ACTOR 1: Admin (Quản trị viên)
- **Mô tả:** Người phụ trách kỹ thuật và vận hành của ban tổ chức
- **Đặc điểm:** Có toàn quyền trên hệ thống, 1 tài khoản duy nhất với vai trò `admin`
- **Thiết bị sử dụng:** Máy tính / laptop
- **Trách nhiệm:** Cấu hình cuộc thi, quản lý dữ liệu, tạo tài khoản trọng tài, giám sát điểm

#### ACTOR 2: Trọng tài (Referee)
- **Mô tả:** Giám khảo được phân công chấm điểm tại một khu vực cụ thể
- **Đặc điểm:** Được cấp tài khoản bởi Admin, mỗi trọng tài chấm tại 1 khu vực
- **Thiết bị sử dụng:** Máy tính bảng hoặc laptop tại địa điểm thi
- **Trách nhiệm:** Chọn cuộc thi → nội dung → khu vực → chấm điểm từng đội

#### ACTOR 3: Công chúng (Public)
- **Mô tả:** Người xem bảng xếp hạng (khán giả, phụ huynh, thí sinh)
- **Đặc điểm:** Không cần đăng nhập, chỉ xem
- **Thiết bị sử dụng:** Mọi thiết bị có trình duyệt
- **Trách nhiệm:** Theo dõi kết quả

### 3.3 Stakeholders gián tiếp

| Bên liên quan | Mối quan tâm chính |
|---|---|
| Ban tổ chức cuộc thi | Kết quả chính xác, vận hành trơn tru |
| Học sinh / Đội thi | Điểm số công khai, minh bạch |
| Phụ huynh | Tra cứu kết quả con em |
| Nhà tài trợ | Uy tín sự kiện |

---

## 4. PHÂN TÍCH NGHIỆP VỤ THEO ACTOR

### 4.1 Use Case Diagram (Text)

```
╔═══════════════════════════════════════════════════════════════════╗
║                        HỆ THỐNG ENJOY AI                         ║
║                                                                   ║
║  ADMIN ──────────────────────────────────────────────────────     ║
║    │── UC-A01: Đăng nhập hệ thống                                 ║
║    │── UC-A02: Quản lý cuộc thi (CRUD)                            ║
║    │── UC-A03: Quản lý nội dung thi (CRUD)                        ║
║    │── UC-A04: Quản lý khu vực (CRUD)                             ║
║    │── UC-A05: Quản lý học sinh (CRUD)                            ║
║    │── UC-A06: Quản lý đội thi (CRUD)                             ║
║    │── UC-A07: Quản lý tài khoản trọng tài (CRUD)                 ║
║    │── UC-A08: Xem & quản lý điểm số                              ║
║    │── UC-A09: Xem bảng xếp hạng chi tiết                         ║
║    └── UC-A10: Quản lý trường học (CRUD + Import)                 ║
║                                                                   ║
║  TRỌNG TÀI ─────────────────────────────────────────────────     ║
║    │── UC-R01: Đăng nhập hệ thống                                 ║
║    │── UC-R02: Chọn cuộc thi / nội dung / khu vực                 ║
║    │── UC-R03: Xem danh sách đội thi                              ║
║    │── UC-R04: Nhập điểm cho đội thi                              ║
║    │── UC-R05: Xem lịch sử chấm điểm                              ║
║    └── UC-R06: Xem chi tiết phiếu điểm                           ║
║                                                                   ║
║  CÔNG CHÚNG ────────────────────────────────────────────────     ║
║    │── UC-P01: Xem trang chủ                                      ║
║    │── UC-P02: Xem danh sách cuộc thi                             ║
║    └── UC-P03: Xem bảng xếp hạng TOP 20                          ║
╚═══════════════════════════════════════════════════════════════════╝
```

---

## 5. ĐẶC TẢ YÊU CẦU CHỨC NĂNG

### MODULE 1: XÁC THỰC & PHÂN QUYỀN

---

#### FR-AUTH-01: Đăng nhập hệ thống

| Thuộc tính | Nội dung |
|---|---|
| **Mã yêu cầu** | FR-AUTH-01 |
| **Tên chức năng** | Đăng nhập hệ thống |
| **Actor** | Admin, Trọng tài |
| **Mức độ ưu tiên** | Cao |
| **Mô tả** | Người dùng nhập tên đăng nhập và mật khẩu để truy cập hệ thống |

**Luồng chính:**
1. Người dùng truy cập `/admin` hoặc `/referee`
2. Hệ thống hiển thị form đăng nhập tương ứng
3. Người dùng nhập `username` và `password`
4. Hệ thống xác thực thông tin với dữ liệu trong `users.json`
5. Nếu đúng: lưu thông tin user vào localStorage → chuyển hướng đến trang chính
6. Nếu sai: hiển thị thông báo lỗi

**Luồng thay thế:**
- **3a.** Để trống username/password → thông báo "Vui lòng nhập đầy đủ thông tin"
- **4a.** Sai thông tin → thông báo "Tên đăng nhập hoặc mật khẩu không đúng"
- **4b.** Đúng username nhưng sai role (admin login vào referee portal) → từ chối

**Tiêu chí chấp nhận:**
- Admin chỉ đăng nhập được tại `/admin`
- Referee chỉ đăng nhập được tại `/referee`
- Token phiên được lưu trong localStorage key `enjoy-ai-user`
- Sau khi refresh trang, phiên đăng nhập vẫn được duy trì

---

#### FR-AUTH-02: Đăng xuất hệ thống

| Thuộc tính | Nội dung |
|---|---|
| **Mã yêu cầu** | FR-AUTH-02 |
| **Tên chức năng** | Đăng xuất |
| **Actor** | Admin, Trọng tài |
| **Mức độ ưu tiên** | Cao |

**Luồng chính:**
1. Người dùng nhấn nút "Đăng xuất" trên thanh sidebar
2. Hệ thống xóa dữ liệu phiên trong localStorage
3. Chuyển hướng về trang đăng nhập tương ứng

---

### MODULE 2: QUẢN LÝ CUỘC THI

---

#### FR-COMP-01: Xem danh sách cuộc thi

| Thuộc tính | Nội dung |
|---|---|
| **Mã yêu cầu** | FR-COMP-01 |
| **Actor** | Admin |
| **Endpoint** | `GET /api/competitions` |

**Dữ liệu hiển thị:**
- Tên cuộc thi, mô tả, địa điểm
- Ngày bắt đầu / kết thúc
- Trạng thái: Đang diễn ra / Đã kết thúc
- Số lượng nội dung thi liên kết

**Tính năng bộ lọc / tìm kiếm:** Tìm theo tên

---

#### FR-COMP-02: Tạo cuộc thi mới

| Thuộc tính | Nội dung |
|---|---|
| **Mã yêu cầu** | FR-COMP-02 |
| **Actor** | Admin |
| **Endpoint** | `POST /api/competitions` |

**Dữ liệu đầu vào:**

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `name` | String | Có | Tên cuộc thi |
| `description` | String | Không | Mô tả ngắn |
| `location` | String | Không | Địa điểm tổ chức |
| `startDate` | Date | Không | Ngày bắt đầu (YYYY-MM-DD) |
| `endDate` | Date | Không | Ngày kết thúc (YYYY-MM-DD) |
| `isActive` | Boolean | Có | Trạng thái hoạt động |

**Quy tắc nghiệp vụ:**
- `name` không được để trống
- `endDate` phải >= `startDate` nếu cả hai đều có
- `isActive = true`: cuộc thi sẽ hiển thị để trọng tài chọn và hiện trên trang chủ

---

#### FR-COMP-03: Cập nhật cuộc thi

**Tương tự FR-COMP-02.** Cho phép chỉnh sửa tất cả các trường. Endpoint: `PUT /api/competitions/:id`

---

#### FR-COMP-04: Xóa cuộc thi

| Thuộc tính | Nội dung |
|---|---|
| **Mã yêu cầu** | FR-COMP-04 |
| **Actor** | Admin |
| **Endpoint** | `DELETE /api/competitions/:id` |

**Ràng buộc xóa:**
- Không được xóa cuộc thi nếu còn **nội dung thi** liên kết → báo lỗi "Cuộc thi còn nội dung thi liên kết"
- Yêu cầu nhập **mã bảo mật** `26122004` trước khi xóa

---

### MODULE 3: QUẢN LÝ NỘI DUNG THI

---

#### FR-CONT-01 đến FR-CONT-04: CRUD Nội dung thi

**Mô tả:** Mỗi cuộc thi có nhiều nội dung thi (ví dụ: "Lập trình AI", "Nhận diện hình ảnh"). Mỗi nội dung có bộ tiêu chí chấm điểm riêng.

**Dữ liệu nội dung thi:**

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `competitionId` | String | Có | FK → Cuộc thi |
| `name` | String | Có | Tên nội dung thi |
| `description` | String | Không | Mô tả |
| `order` | Number | Không | Thứ tự hiển thị |
| `scoreSheetTemplate` | Object | Có | Mẫu phiếu điểm |

**Cấu trúc `scoreSheetTemplate`:**
```json
{
  "fields": [
    { "id": "thoi_gian", "label": "Thời gian", "type": "time", "required": true },
    { "id": "diem",      "label": "Điểm",      "type": "number", "required": true },
    { "id": "custom_1",  "label": "Ghi chú",   "type": "text",   "required": false }
  ]
}
```

**Các loại field hỗ trợ:** `time` (HH:MM:SS), `number`, `text`, `boolean`

**Ràng buộc xóa nội dung thi:**
- Không xóa nếu còn **đội thi** liên kết
- Không xóa nếu còn **khu vực** liên kết
- Yêu cầu mã bảo mật `26122004`

---

### MODULE 4: QUẢN LÝ KHU VỰC

---

#### FR-AREA-01: Quản lý khu vực chấm điểm

**Mô tả:** Mỗi nội dung thi được chia thành các khu vực địa lý. Hệ thống hiện hỗ trợ 3 khu vực mặc định:

| Giá trị | Hiển thị |
|---|---|
| `bac` | Miền Bắc |
| `trung` | Miền Trung |
| `nam` | Miền Nam |

**Các khu vực tùy chỉnh** có thể được tạo thêm qua module AdminAreas với trường `name` và `order`.

---

### MODULE 5: QUẢN LÝ HỌC SINH

---

#### FR-STU-01 đến FR-STU-04: CRUD Học sinh

**Dữ liệu học sinh:**

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `fullName` | String | Có | Họ và tên đầy đủ |
| `class` | String | Không | Lớp học |
| `school` | String | Không | Tên trường (free-text hoặc từ danh mục) |
| `grade` | String | Không | Khối lớp (VD: "7", "8", "9") |
| `dateOfBirth` | Date | Không | Ngày sinh (YYYY-MM-DD) |

**Tính năng tìm kiếm:** Theo tên, lọc theo khối lớp

**Ràng buộc xóa:**
- Không xóa học sinh nếu học sinh đang là thành viên của một **đội thi** nào đó
- Yêu cầu mã bảo mật

---

### MODULE 6: QUẢN LÝ ĐỘI THI

---

#### FR-TEAM-01 đến FR-TEAM-04: CRUD Đội thi

**Dữ liệu đội thi:**

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `name` | String | Có | Tên đội |
| `competitionId` | String | Có | FK → Cuộc thi |
| `contestContentId` | String | Có | FK → Nội dung thi |
| `studentIds` | Array | Không | Danh sách ID học sinh |
| `region` | Enum | Có | `bac` / `trung` / `nam` |
| `order` | Number | Không | Thứ tự |

**Tính năng đặc biệt:**
- Tạo học sinh mới inline ngay trong form tạo đội (không cần sang trang riêng)
- Tạo trường mới inline nếu chưa có trong danh mục
- Gán nhiều học sinh vào một đội

**Ràng buộc xóa:**
- **Không xóa đội nếu đội đã có phiếu điểm** → báo lỗi "Đội thi đã có điểm số, không thể xóa"
- Yêu cầu mã bảo mật

---

### MODULE 7: QUẢN LÝ TÀI KHOẢN TRỌNG TÀI

---

#### FR-REF-01 đến FR-REF-04: CRUD Tài khoản trọng tài

**Dữ liệu tài khoản:**

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `username` | String | Có | Tên đăng nhập (duy nhất) |
| `password` | String | Có | Mật khẩu (mặc định: `referee123`) |
| `fullName` | String | Không | Tên hiển thị |
| `role` | Enum | Cố định | Luôn là `referee` |

**Quy tắc:**
- `username` phải là duy nhất trong hệ thống
- Không được xóa tài khoản `admin`
- Khi tạo mới, mật khẩu mặc định là `referee123`
- Không được xóa tài khoản trọng tài nếu họ **đã nộp điểm** trong hệ thống

---

### MODULE 8: CHẤM ĐIỂM (TRỌNG TÀI)

---

#### FR-SCORE-01: Chọn phiên chấm điểm

**Luồng chọn 3 bước:**

```
Bước 1: Chọn cuộc thi
  └─ Chỉ hiển thị các cuộc thi có isActive = true

Bước 2: Chọn nội dung thi
  └─ Lọc theo cuộc thi đã chọn ở Bước 1

Bước 3: Chọn khu vực
  └─ Hiển thị 3 khu vực: Bắc / Trung / Nam
```

---

#### FR-SCORE-02: Xem danh sách đội thi để chấm

Sau khi hoàn thành 3 bước chọn:
- Hiển thị danh sách đội thuộc nội dung thi + khu vực đã chọn
- Mỗi đội hiển thị: tên đội, danh sách thành viên
- Nhấn vào đội → mở form nhập điểm

---

#### FR-SCORE-03: Nhập điểm cho đội thi

**Giao diện form động:** Các trường hiển thị dựa trên `scoreSheetTemplate` của nội dung thi

**Các trường bắt buộc trong mọi phiếu điểm:**

| Trường | Kiểu | Validation |
|---|---|---|
| `time` | Time | Định dạng `HH:MM:SS`, bắt buộc |
| `score` | Number | Số, bắt buộc |
| `studentSignature` | String | Tên học sinh ký xác nhận |
| `refereeSignature` | String | Tên trọng tài (tự điền từ tài khoản đăng nhập) |

**Luồng nộp điểm:**
1. Trọng tài điền đầy đủ form
2. Nhấn "Nộp điểm"
3. Hệ thống lưu với `refereeId` = ID tài khoản đang đăng nhập
4. Hiển thị thông báo thành công
5. Tự động redirect về danh sách đội sau 2 giây

**Hỗ trợ nhiều lần chấm:** Một đội có thể có nhiều phiếu điểm (nhiều round). Lịch sử các lần chấm được hiển thị trong cùng trang.

---

#### FR-SCORE-04: Xem lịch sử chấm điểm

- Trọng tài xem lại tất cả phiếu điểm **mình đã nộp**
- Hiển thị: thời gian nộp, cuộc thi, nội dung, đội, điểm số
- Nhấn vào từng hàng → xem chi tiết phiếu

---

#### FR-SCORE-05: Quản lý điểm (Admin)

Admin có thể:
- Lọc phiếu điểm theo cuộc thi + nội dung thi
- Xem toàn bộ phiếu điểm của tất cả trọng tài
- Xóa phiếu điểm (yêu cầu mã bảo mật)

---

### MODULE 9: BẢNG XẾP HẠNG

---

#### FR-RANK-01: Bảng xếp hạng Admin

- Admin chọn cuộc thi → chọn nội dung thi
- Hệ thống hiển thị toàn bộ đội thi, sắp xếp theo điểm giảm dần
- Hiển thị: xếp hạng, tên đội, thành viên, thời gian, điểm, ngày nộp

---

#### FR-RANK-02: Bảng xếp hạng công khai (Trang chủ)

- Không cần đăng nhập
- Hiển thị TOP 20 đội theo từng nội dung thi
- Huy hiệu vàng/bạc/đồng cho Top 3
- Cập nhật tự động khi load lại trang

---

### MODULE 10: QUẢN LÝ TRƯỜNG HỌC

---

#### FR-SCH-01 đến FR-SCH-03: CRUD Trường học

**Dữ liệu trường học:**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `name` | String | Tên trường |
| `level` | Enum | TH / THCS / THPT |
| `province` | String | Tỉnh/thành phố |
| `district` | String | Quận/huyện |
| `source` | Enum | `manual` hoặc `import` |

**Tính năng import hàng loạt:** Cho phép import tối đa 5000 trường từ dữ liệu Overpass API (OpenStreetMap)

---

## 6. MÔ HÌNH DỮ LIỆU NGHIỆP VỤ

### 6.1 Entity Relationship Diagram (ERD - Text)

```
COMPETITION (Cuộc thi)
│  id, name, description, location, startDate, endDate, isActive
│
├──< CONTEST_CONTENT (Nội dung thi)  [1 cuộc thi : N nội dung]
│    id, competitionId*, name, description, order, scoreSheetTemplate
│    │
│    ├──< AREA (Khu vực)             [1 nội dung : N khu vực]
│    │    id, contestContentId*, competitionId*, name, order
│    │
│    └──< TEAM (Đội thi)             [1 nội dung : N đội]
│         id, contestContentId*, competitionId*, name, region, order
│         │
│         ├──>< STUDENT (Học sinh)   [N đội : M học sinh]
│         │    id, fullName, class, school, grade, dateOfBirth
│         │    (thông qua studentIds[] trong TEAM)
│         │
│         └──< SCORE (Phiếu điểm)   [1 đội : N phiếu]
│              id, teamId*, contestContentId*, refereeId*
│              time, score, extraFields, studentSignature
│              refereeSignature, round, submittedAt
│
USER (Tài khoản)
│  id, username, password, fullName, role (admin|referee)
│
└── SCORE.refereeId* → USER.id      [1 user : N phiếu điểm]

SCHOOL (Trường học)
     id, name, level, province, district, source
     (danh mục độc lập, dùng để gợi ý khi tạo học sinh)
```

### 6.2 Bảng mô tả thực thể

| Thực thể | Số lượng dự kiến | Ghi chú |
|---|---|---|
| Competition | 1–5 | Ít, được tạo thủ công |
| ContestContent | 5–20 | Vài nội dung / cuộc thi |
| Area | 3–10 / nội dung | Mặc định 3 khu vực |
| Team | 50–500 | Tùy quy mô cuộc thi |
| Student | 100–2000 | Nhiều học sinh / đội |
| Score | 500–5000 | Nhiều lần chấm |
| User | 5–50 | Admin + các trọng tài |
| School | 500–5000 | Có thể import hàng loạt |

---

## 7. QUY TẮC NGHIỆP VỤ & RÀNG BUỘC

### 7.1 Ma trận ràng buộc xóa (Cascade Delete Rules)

```
┌─────────────────┬──────────────────────────────────────────────────────┐
│ Đối tượng xóa   │ Điều kiện chặn xóa                                   │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Competition     │ Còn ContestContent liên kết                          │
├─────────────────┼──────────────────────────────────────────────────────┤
│ ContestContent  │ Còn Team liên kết HOẶC còn Area liên kết             │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Team            │ Còn Score liên kết (đội đã được chấm điểm)           │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Student         │ Còn là thành viên của Team nào đó                    │
├─────────────────┼──────────────────────────────────────────────────────┤
│ User (Referee)  │ Còn Score liên kết (trọng tài đã nộp điểm)          │
│                 │ HOẶC là tài khoản admin duy nhất                     │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Score           │ Không có ràng buộc (có thể xóa tự do, cần mã BM)    │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Area            │ Không có ràng buộc được check (cần bổ sung)          │
├─────────────────┼──────────────────────────────────────────────────────┤
│ School          │ Không có ràng buộc (dữ liệu tham chiếu)             │
└─────────────────┴──────────────────────────────────────────────────────┘
```

### 7.2 Quy tắc bảo mật xóa

**BR-SEC-01:** Tất cả hành động xóa yêu cầu nhập mã bảo mật `26122004`
**BR-SEC-02:** Tài khoản `admin` không thể bị xóa khỏi hệ thống
**BR-SEC-03:** Trọng tài chỉ xem được điểm của chính họ, không xem được điểm của trọng tài khác

### 7.3 Quy tắc tính điểm & xếp hạng

**BR-RANK-01:** Bảng xếp hạng sắp xếp theo `score` giảm dần
**BR-RANK-02:** Nếu cùng điểm → ưu tiên `time` nhỏ hơn (thời gian hoàn thành nhanh hơn)
**BR-RANK-03:** Mỗi đội có thể có nhiều phiếu điểm (nhiều vòng thi)
**BR-RANK-04:** Trang chủ chỉ hiển thị TOP 20 mỗi nội dung thi

### 7.4 Quy tắc trọng tài

**BR-REF-01:** Trọng tài chỉ chấm được cuộc thi đang `isActive = true`
**BR-REF-02:** Mỗi phiếu điểm lưu `refereeId` để truy vết người chấm
**BR-REF-03:** Trọng tài không được sửa điểm sau khi đã nộp (chỉ Admin mới xóa được)

---

## 8. LUỒNG NGHIỆP VỤ CHÍNH (BUSINESS FLOWS)

### 8.1 Luồng chuẩn bị cuộc thi (Admin)

```
[Admin đăng nhập]
       │
       ▼
[Tạo cuộc thi mới]
  → Nhập: tên, địa điểm, ngày, isActive=true
       │
       ▼
[Tạo các nội dung thi]
  → Thiết kế scoreSheetTemplate cho từng nội dung
       │
       ▼
[Tạo các khu vực] (nếu cần tùy chỉnh ngoài Bắc/Trung/Nam)
       │
       ▼
[Nhập danh sách học sinh]
  → Tạo mới hoặc tìm kiếm học sinh đã có
       │
       ▼
[Tạo các đội thi]
  → Gán học sinh vào đội, phân khu vực, chọn nội dung
       │
       ▼
[Tạo tài khoản trọng tài]
  → Gửi username/password cho trọng tài
       │
       ▼
[Sẵn sàng thi đấu] ✓
```

### 8.2 Luồng chấm điểm (Trọng tài)

```
[Trọng tài đăng nhập]
       │
       ▼
[Chọn Cuộc thi] → [Chọn Nội dung thi] → [Chọn Khu vực]
       │
       ▼
[Xem danh sách đội tại khu vực đó]
       │
       ▼
[Chọn đội cần chấm]
       │
       ▼
[Điền phiếu điểm]
  → Thời gian: HH:MM:SS
  → Điểm số: (number)
  → Các trường tùy chỉnh theo nội dung thi
  → Chữ ký học sinh
  → Chữ ký trọng tài (tự điền)
       │
       ▼
[Nộp điểm] → Hệ thống lưu phiếu điểm
       │
       ▼
[Tự động về danh sách đội] → Tiếp tục chấm đội khác
```

### 8.3 Luồng theo dõi kết quả (Công chúng)

```
[Truy cập trang chủ /]
       │
       ▼
[Xem danh sách cuộc thi đang diễn ra]
       │
       ▼
[Scroll xuống xem bảng xếp hạng]
  → Mỗi nội dung thi hiển thị TOP 20
  → Huy hiệu vàng/bạc/đồng cho Top 3
       │
       ▼
[Refresh trang để cập nhật kết quả mới nhất]
```

---

## 9. YÊU CẦU PHI CHỨC NĂNG

### 9.1 Hiệu năng

| Yêu cầu | Chỉ tiêu |
|---|---|
| Thời gian load trang chủ | < 2 giây |
| Thời gian submit điểm | < 1 giây |
| Hỗ trợ đồng thời | Tối thiểu 20 trọng tài chấm cùng lúc |
| Kích thước dữ liệu | Hỗ trợ đến 5000 đội, 10000 phiếu điểm |

### 9.2 Bảo mật

| Yêu cầu | Mô tả |
|---|---|
| Phân quyền | Admin / Referee / Public hoàn toàn độc lập |
| Bảo vệ xóa | Mã bảo mật cho tất cả hành động xóa |
| Session | Lưu trong localStorage (cần nâng cấp lên JWT) |
| Mật khẩu | Hiện lưu plaintext (cần hash bằng bcrypt) |

### 9.3 Khả dụng (Availability)

| Yêu cầu | Chỉ tiêu |
|---|---|
| Uptime trong giờ thi | 99.9% |
| Xử lý mất kết nối | Thông báo lỗi rõ ràng |
| Responsive | Hỗ trợ tablet (trọng tài dùng tablet chấm điểm) |

### 9.4 Tương thích

- Trình duyệt: Chrome, Firefox, Edge (phiên bản mới nhất)
- Thiết bị: Desktop, Tablet (màn hình ≥ 768px)
- Ngôn ngữ giao diện: Tiếng Việt

---

## 10. RỦI RO & HẠN CHẾ HIỆN TẠI

### 10.1 Rủi ro kỹ thuật

| Mã | Rủi ro | Mức độ | Tác động |
|---|---|---|---|
| RISK-01 | Lưu trữ JSON file không an toàn khi nhiều request đồng thời (race condition) | Cao | Mất dữ liệu điểm |
| RISK-02 | Mật khẩu lưu plaintext trong users.json | Cao | Lộ thông tin đăng nhập |
| RISK-03 | Session localStorage dễ bị XSS tấn công | Trung bình | Chiếm phiên đăng nhập |
| RISK-04 | Không có backup tự động cho dữ liệu JSON | Cao | Mất toàn bộ dữ liệu |
| RISK-05 | Không có rate limiting trên API | Trung bình | Tấn công brute-force |
| RISK-06 | Không có HTTPS (nếu deploy không đúng cách) | Cao | Nghe lén dữ liệu |

### 10.2 Hạn chế chức năng

| Mã | Hạn chế | Cần cải thiện |
|---|---|---|
| LIM-01 | Không thể sửa điểm sau khi nộp (chỉ xóa rồi nhập lại) | Thêm tính năng edit score |
| LIM-02 | Không có thông báo real-time (cần refresh thủ công) | Thêm WebSocket hoặc polling |
| LIM-03 | Không xuất báo cáo Excel/PDF | Thêm tính năng export |
| LIM-04 | Không có phân công khu vực theo tài khoản trọng tài | Ràng buộc referee với region |
| LIM-05 | Không có audit log chi tiết | Ghi lại mọi thao tác |
| LIM-06 | Không hỗ trợ import đội thi / học sinh hàng loạt | Thêm import CSV |

---

## 11. KIẾN NGHỊ CẢI TIẾN

### Ưu tiên Cao (Cần làm trước khi go-live)

| # | Cải tiến | Lý do |
|---|---|---|
| 1 | **Hash mật khẩu bằng bcrypt** | Bảo mật cơ bản |
| 2 | **Chuyển từ JSON file sang SQLite hoặc PostgreSQL** | Tránh race condition, hỗ trợ transaction |
| 3 | **Triển khai JWT thay vì localStorage** | Tăng bảo mật session |
| 4 | **Cơ chế backup tự động** | Tránh mất dữ liệu |

### Ưu tiên Trung bình (Nên làm trong phiên bản tiếp theo)

| # | Cải tiến | Lý do |
|---|---|---|
| 5 | **Cho phép sửa điểm** | Trọng tài nhập nhầm cần sửa lại |
| 6 | **Export Excel / PDF** | Ban tổ chức cần báo cáo chính thức |
| 7 | **Import học sinh / đội thi từ CSV** | Khi có hàng trăm đội, nhập tay rất mất thời gian |
| 8 | **Phân công khu vực cho trọng tài** | Tránh trọng tài chấm nhầm khu vực |
| 9 | **Real-time updates (WebSocket)** | Bảng xếp hạng cập nhật tức thì |

### Ưu tiên Thấp (Roadmap tương lai)

| # | Cải tiến | Lý do |
|---|---|---|
| 10 | Đăng ký tham dự online | Giảm thủ tục giấy tờ |
| 11 | Cổng thông tin thí sinh | Học sinh tự tra cứu kết quả |
| 12 | Hệ thống thông báo email/SMS | Tự động gửi kết quả |
| 13 | Dashboard thống kê nâng cao | Phân tích dữ liệu cuộc thi |
| 14 | Đa ngôn ngữ (EN/VI) | Mở rộng châu Á |

---

## PHỤ LỤC

### A. Danh sách API Endpoints

| Method | Endpoint | Chức năng | Role |
|---|---|---|---|
| POST | `/api/auth/login` | Đăng nhập | Public |
| GET | `/api/competitions` | Danh sách cuộc thi | All |
| POST | `/api/competitions` | Tạo cuộc thi | Admin |
| PUT | `/api/competitions/:id` | Sửa cuộc thi | Admin |
| DELETE | `/api/competitions/:id` | Xóa cuộc thi | Admin |
| GET | `/api/competitions/:id/contents` | Nội dung thi | All |
| POST | `/api/competitions/:id/contents` | Tạo nội dung | Admin |
| GET | `/api/contents` | Tất cả nội dung | Admin |
| PUT | `/api/contents/:id` | Sửa nội dung | Admin |
| DELETE | `/api/contents/:id` | Xóa nội dung | Admin |
| GET | `/api/contents/:id/areas` | Khu vực | All |
| POST | `/api/contents/:id/areas` | Tạo khu vực | Admin |
| GET | `/api/students` | Danh sách học sinh | Admin |
| POST | `/api/students` | Tạo học sinh | Admin |
| PUT | `/api/students/:id` | Sửa học sinh | Admin |
| DELETE | `/api/students/:id` | Xóa học sinh | Admin |
| GET | `/api/teams` | Tất cả đội thi | Admin |
| GET | `/api/contents/:id/teams` | Đội theo nội dung | All |
| POST | `/api/contents/:id/teams` | Tạo đội | Admin |
| PUT | `/api/teams/:id` | Sửa đội | Admin |
| DELETE | `/api/teams/:id` | Xóa đội | Admin |
| GET | `/api/scores` | Danh sách điểm | Admin/Referee |
| POST | `/api/scores` | Nộp điểm | Referee |
| GET | `/api/scores/:id` | Chi tiết phiếu | Admin/Referee |
| PUT | `/api/scores/:id` | Sửa điểm | Admin |
| DELETE | `/api/scores/:id` | Xóa điểm | Admin |
| GET | `/api/contents/:id/scoreboard` | Bảng xếp hạng | All |
| GET | `/api/users` | Danh sách user | Admin |
| POST | `/api/users` | Tạo user | Admin |
| PUT | `/api/users/:id` | Sửa user | Admin |
| DELETE | `/api/users/:id` | Xóa user | Admin |
| GET | `/api/schools` | Danh sách trường | Admin |
| POST | `/api/schools` | Tạo trường | Admin |
| POST | `/api/schools/import` | Import trường | Admin |

### B. Thuật ngữ (Glossary)

| Thuật ngữ | Giải thích |
|---|---|
| Competition | Cuộc thi (ví dụ: ENJOY AI ASIA OPEN 2026) |
| Contest Content | Nội dung thi / hạng mục thi trong một cuộc thi |
| Area | Khu vực địa lý (Bắc / Trung / Nam) |
| Team | Đội thi tham gia một nội dung cụ thể |
| Student | Học sinh là thành viên của đội |
| Score | Phiếu điểm được trọng tài nộp cho một đội |
| Referee | Trọng tài / giám khảo |
| Admin | Quản trị viên hệ thống |
| scoreSheetTemplate | Mẫu phiếu điểm tùy chỉnh cho từng nội dung thi |
| isActive | Trạng thái cuộc thi đang hoạt động |
| Region | Tương đương Area, giá trị: bac / trung / nam |
| Round | Vòng thi (một đội có thể thi nhiều vòng) |

---

*Tài liệu này được tạo tự động dựa trên phân tích mã nguồn dự án ENJOY AI ASIA OPEN Scoring System.*
*Phiên bản: 1.0 | Ngày: 18/03/2026*
