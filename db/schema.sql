-- ============================================================
-- ENJOY AI ASIA OPEN - Hệ thống Chấm điểm Cuộc thi
-- SQL Schema cho NEON (PostgreSQL 15+, đã test tư duy trên PG 18)
-- ============================================================
-- Đặc điểm:
--   - Dùng gen_random_uuid() (built-in PG13+)
--   - KHÔNG có RLS — phân quyền do backend API (server/) đảm nhiệm
--   - users tự quản lý password (bcrypt, hash bằng pgcrypto)
--   - Ảnh phiếu chấm lưu bytea trong bảng score_images
-- Cách chạy (chọn 1):
--   a) cd server && npm run db:setup           (chỉ schema)
--      cd server && npm run db:setup -- --seed (schema + dữ liệu mẫu)
--   b) Dán toàn bộ file vào Neon Dashboard → SQL Editor → Run
-- ============================================================

-- pgcrypto: cần cho crypt()/gen_salt() (hash password trong seed & backend)
create extension if not exists pgcrypto;


-- ============================================================
-- 1. TABLES (theo thứ tự phụ thuộc: bảng không phụ thuộc trước)
-- ============================================================

-- Trường học
create table if not exists schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  level       text not null check (level in ('TH', 'THCS', 'THPT')), -- xem migration bên dưới: thêm 'MN'
  province    text,
  district    text,
  source      text default 'manual',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (name, level)
);

-- Cuộc thi
create table if not exists competitions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  location    text,
  start_date  date,
  end_date    date,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Người dùng (tự quản lý auth: password là bcrypt hash, backend verify)
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  email       text unique,
  username    text unique not null,
  password    text,
  full_name   text,
  role        text not null default 'referee' check (role in ('admin', 'referee')),
  area_id     uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Nội dung thi
-- time_limit_seconds: thời gian trận đấu (mỗi nội dung khác nhau), null = không giới hạn
-- bonus_config: cấu hình điểm thưởng, vd {"label":"Vận hành mượt mà","base":40,"per_retry":10}
--               (điểm thưởng = base − per_retry × số lần chạy lại, tối thiểu 0); null = không có
create table if not exists contest_contents (
  id                 uuid primary key default gen_random_uuid(),
  competition_id     uuid not null references competitions(id) on delete cascade,
  name               text not null,
  name_en            text,
  description        text,
  criteria           jsonb default '[]',
  order_index        integer default 0,
  scoring_method     text,
  time_limit_seconds integer,
  bonus_config       jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Khu vực thi (Bắc / Trung / Nam)
create table if not exists areas (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  competition_id     uuid references competitions(id) on delete cascade,
  name               text not null,
  region             text not null default 'bac' check (region in ('bac', 'trung', 'nam')),
  order_index        integer default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Thêm foreign key cho users.area_id sau khi areas tồn tại
alter table users drop constraint if exists users_area_id_fkey;
alter table users add constraint users_area_id_fkey
  foreign key (area_id) references areas(id) on delete set null;

-- Học sinh
create table if not exists students (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  gender      text,
  birth_date  date,
  school_id   uuid references schools(id) on delete set null,
  grade       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Bảng đấu (theo độ tuổi) — định nghĩa gốc (lịch sử); cấu trúc thật sự hiện tại
-- (5 bảng cố định toàn hệ thống + content_boards) nằm ở migration bên dưới.
create table if not exists boards (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  name               text not null,
  age_group          text,
  order_index        integer default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Đội thi (1 đội chỉ thuộc 1 nội dung thi của cuộc thi, thuộc 1 bảng đấu)
create table if not exists teams (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  area_id            uuid references areas(id) on delete set null,
  board_id           uuid references boards(id) on delete set null,
  name               text not null,
  student_ids        uuid[] default '{}',
  school_id          uuid references schools(id) on delete set null,
  region             text not null default 'bac' check (region in ('bac', 'trung', 'nam')),
  order_index        integer default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Nhiệm vụ (gắn vào contest_contents)
-- scoring_type:
--   binary  = tick đạt/không đạt → được max_score
--   count   = đếm số lượng → điểm = số lượng × max_score (max_score là điểm MỖI đơn vị,
--             max_count = số lượng tối đa, null = không giới hạn)
--   numeric = trọng tài nhập điểm tay (0..max_score)
--   tier    = 1 nhiệm vụ có NHIỀU mức đạt loại trừ nhau, mỗi mức 1 điểm số riêng
--             (vd: chạm khối = 20đ / tác động cần gạt = 30đ / đặt hoàn toàn = 50đ) —
--             trọng tài chọn ĐÚNG 1 mức đã đạt được. Định nghĩa các mức lưu ở
--             tier_options (jsonb: [{label, points}, ...], thứ tự = thứ tự hiện);
--             max_score tự động = điểm mức cao nhất, không nhập tay.
-- Ảnh nhiệm vụ lưu bytea (image_data + image_mime), serve GET /api/tasks/:id/image/raw
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  name               text not null,
  name_en            text,
  description        text,
  image_url          text,
  image_data         bytea,
  image_mime         text,
  max_score          numeric(10,2) default 0,
  max_count          integer,
  scoring_type       text default 'binary' check (scoring_type in ('binary', 'tier', 'numeric', 'count')),
  tier_options       jsonb,
  order_index        integer default 0,
  is_active          boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Bảng điểm — mỗi đội chỉ có 1 phiếu duy nhất cho nội dung nó thi
-- (chấm lại = UPDATE phiếu cũ; unique index bên dưới đảm bảo)
-- criteria_scores lưu chi tiết từng nhiệm vụ: { taskScores: {taskId: {qty, points}}, ... }
create table if not exists scores (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references teams(id) on delete cascade,
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  competition_id     uuid references competitions(id) on delete set null,
  referee_id         uuid references users(id) on delete set null,
  score              numeric(10,2) not null default 0,
  time               text,
  round              integer default 1,
  retry_count        integer default 0,
  bonus_points       numeric(10,2) default 0,
  criteria_scores    jsonb default '{}',
  notes              text,
  signature_data     text,
  submitted_at       timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Hình ảnh đính kèm phiếu chấm — bytes lưu thẳng trong image_data (bytea),
-- backend serve qua GET /api/score-images/:id/raw
create table if not exists score_images (
  id           uuid primary key default gen_random_uuid(),
  score_id     uuid not null references scores(id) on delete cascade,
  storage_path text not null,
  public_url   text not null,
  file_name    text,
  file_size    integer,
  mime_type    text,
  image_data   bytea,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz default now()
);

-- Nếu bảng đã tồn tại từ trước khi có cột image_data
alter table score_images add column if not exists image_data bytea;


-- ============================================================
-- 1b. MIGRATIONS — nâng cấp DB đã tồn tại (idempotent, chạy lại vô hại)
-- ============================================================
alter table contest_contents add column if not exists time_limit_seconds integer;
alter table contest_contents add column if not exists bonus_config jsonb;

alter table teams add column if not exists board_id uuid references boards(id) on delete set null;

-- Thêm bậc Mầm non (MN) — trước chỉ có TH/THCS/THPT
alter table schools drop constraint if exists schools_level_check;
alter table schools add constraint schools_level_check
  check (level in ('MN', 'TH', 'THCS', 'THPT'));

alter table tasks add column if not exists image_data bytea;
alter table tasks add column if not exists image_mime text;
alter table tasks add column if not exists max_count integer;
alter table tasks add column if not exists tier_options jsonb;
alter table tasks drop constraint if exists tasks_scoring_type_check;
alter table tasks add constraint tasks_scoring_type_check
  check (scoring_type in ('binary', 'tier', 'numeric', 'count'));

alter table scores add column if not exists round integer default 1;
alter table scores add column if not exists retry_count integer default 0;
alter table scores add column if not exists bonus_points numeric(10,2) default 0;

-- Bảng đấu (boards) đổi từ "mỗi bảng thuộc riêng 1 nội dung thi" sang
-- "5 bảng cố định theo độ tuổi, dùng chung cho toàn bộ hệ thống, không đổi".
-- Nội dung thi nào cần bảng nào thì "thêm" bảng đó vào qua content_boards —
-- không tự tạo bảng mới tùy ý theo từng nội dung nữa.
alter table boards drop column if exists contest_content_id;
alter table boards drop constraint if exists boards_name_key;
alter table boards add constraint boards_name_key unique (name);

insert into boards (name, age_group, order_index) values
  ('Bảng A', 'Mầm non và Tiền tiểu học (4-6 tuổi)', 1),
  ('Bảng B', 'Lớp 1 đến lớp 3', 2),
  ('Bảng C', 'Lớp 4 đến lớp 6', 3),
  ('Bảng D', 'Lớp 7 đến lớp 9', 4),
  ('Bảng E', 'Lớp 10 đến lớp 12', 5)
on conflict (name) do nothing;

-- Bảng đấu nào được áp dụng cho nội dung thi nào
create table if not exists content_boards (
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  board_id           uuid not null references boards(id) on delete cascade,
  order_index        integer default 0,
  created_at         timestamptz default now(),
  primary key (contest_content_id, board_id)
);
create index if not exists idx_content_boards_content on content_boards(contest_content_id);
create index if not exists idx_content_boards_board    on content_boards(board_id);

-- Phân quyền trọng tài theo bảng đấu — trọng tài chỉ thấy/chấm được đội thuộc
-- bảng đã được gán (rỗng = chưa giới hạn, thấy tất cả — tương thích ngược cho
-- các tài khoản tạo trước khi có tính năng này)
create table if not exists referee_boards (
  referee_id  uuid not null references users(id) on delete cascade,
  board_id    uuid not null references boards(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (referee_id, board_id)
);
create index if not exists idx_referee_boards_board on referee_boards(board_id);

-- Phân quyền xem Bảng xếp hạng cho trọng tài — mặc định trọng tài chỉ chấm
-- điểm (false); admin bật cờ này cho từng tài khoản để họ thấy thêm mục
-- "Bảng xếp hạng" (toàn giải, không giới hạn theo referee_boards) trong menu
-- trọng tài. Không phải cột bảo mật dữ liệu (bảng xếp hạng vốn đã public qua
-- trang chủ) — chỉ là bật/tắt tính năng hiển thị trong khu vực trọng tài.
alter table users add column if not exists can_view_scoreboard boolean not null default false;

-- Mỗi đội thi 2 lượt độc lập / nội dung (lượt 1 + lượt 2), có thể chấm ở 2
-- thời điểm khác nhau — thay cho "mỗi đội 1 phiếu duy nhất" trước đây.
drop index if exists uq_scores_team_content;
alter table scores drop constraint if exists scores_round_check;
alter table scores add constraint scores_round_check check (round in (1, 2));
create unique index if not exists uq_scores_team_content_round
  on scores(team_id, contest_content_id, round);

-- Trường mới theo mẫu phiếu điểm giấy (Bảng điểm Thành phố Công nghệ)
alter table scores add column if not exists arena_entry_time text;   -- "Thời gian bắt đầu vào sân"
alter table scores add column if not exists head_referee_name text;  -- "Trưởng ban trọng tài"
alter table scores add column if not exists scorekeeper_name text;   -- "Người ghi điểm"
alter table scores add column if not exists objection text;          -- "Kiến nghị"

-- Lịch sử sửa điểm — admin sửa phiếu sau khi đã chấm phải lưu lại ai sửa,
-- lúc nào, lượt nào, trước/sau (snapshot toàn bộ dòng dạng jsonb cho đơn giản
-- và đầy đủ, khỏi phải liệt kê từng cột riêng lẻ).
create table if not exists score_edits (
  id          uuid primary key default gen_random_uuid(),
  score_id    uuid not null references scores(id) on delete cascade,
  round       integer,
  edited_by   uuid references users(id) on delete set null,
  edited_at   timestamptz default now(),
  before_data jsonb,
  after_data  jsonb,
  note        text
);

-- Huấn luyện viên (HLV) — danh mục riêng, gán theo đội
create table if not exists coaches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create or replace trigger trg_coaches_updated
  before update on coaches for each row execute function set_updated_at();
alter table teams add column if not exists coach_id uuid references coaches(id) on delete set null;

-- Luật xếp hạng riêng theo từng (nội dung thi × bảng đấu):
--   measurement = đo lường (điểm/thời gian, mặc định) · combat = đối kháng (thắng/thua/hòa)
alter table content_boards add column if not exists ranking_format text;
update content_boards set ranking_format = 'measurement' where ranking_format is null;
alter table content_boards alter column ranking_format set default 'measurement';
alter table content_boards alter column ranking_format set not null;
alter table content_boards drop constraint if exists content_boards_ranking_format_check;
alter table content_boards add constraint content_boards_ranking_format_check
  check (ranking_format in ('measurement', 'combat'));

-- Đối kháng: nhánh đấu loại trực tiếp (bốc thăm ngẫu nhiên), theo từng
-- (nội dung thi × bảng đấu) có ranking_format = 'combat'. round_no tăng dần
-- theo từng vòng đấu (1 = vòng đầu); bracket_slot = vị trí cặp đấu trong vòng
-- đó, dùng để tính cặp đấu ở vòng kế tiếp (bracket_slot / 2).
create table if not exists matches (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  board_id           uuid not null references boards(id) on delete cascade,
  round_no           integer not null default 1,
  bracket_slot       integer not null default 0,
  team_a_id          uuid references teams(id) on delete set null,
  team_b_id          uuid references teams(id) on delete set null,
  winner_id          uuid references teams(id) on delete set null,
  is_draw            boolean default false,
  played_at          timestamptz,
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (contest_content_id, board_id, round_no, bracket_slot)
);
create or replace trigger trg_matches_updated
  before update on matches for each row execute function set_updated_at();

-- Khu vực/trạm thi đấu vật lý (Field) — danh mục riêng, gán theo đội
-- (mẫu phiếu điểm giấy có ô "Field: / No.:")
create table if not exists fields (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create or replace trigger trg_fields_updated
  before update on fields for each row execute function set_updated_at();
alter table teams add column if not exists field_id uuid references fields(id) on delete set null;

-- Phân loại phương thức chấm ở cấp NỘI DUNG (khác content_boards.ranking_format
-- vốn ở cấp content×board, dùng cho nhánh loại trực tiếp generic) —
-- 'scoring' = chấm điểm bình thường (mặc định) · 'combat_drone' = Fly Smart Cup
-- (mẫu Scoring Sheet of Drone Cup) · 'combat_stars' = Battle of Stars.
alter table contest_contents add column if not exists content_format text;
update contest_contents set content_format = 'scoring' where content_format is null;
alter table contest_contents alter column content_format set default 'scoring';
alter table contest_contents alter column content_format set not null;
alter table contest_contents drop constraint if exists contest_contents_content_format_check;
alter table contest_contents add constraint contest_contents_content_format_check
  check (content_format in ('scoring', 'combat_drone', 'combat_stars'));

-- Trận đối kháng cho 2 nội dung content_format = 'combat_drone'/'combat_stars'.
-- KHÔNG dùng chung bảng `matches` (đó là nhánh loại trực tiếp generic theo
-- board, chưa nội dung nào dùng thật, giữ nguyên để không rủi ro) — mỗi trận
-- ở đây do admin tự tạo thủ công (không bốc thăm tự động, vì vòng bảng round-
-- robin không khớp thuật toán nhánh lũy thừa 2 hiện có), chi tiết theo từng
-- mẫu phiếu giấy lưu tự do trong `details` (giống cách `scores.criteria_scores`
-- đang lưu dữ liệu linh hoạt theo từng loại chấm).
create table if not exists combat_matches (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  board_id           uuid references boards(id) on delete set null,
  stage              text,        -- nhãn vòng đấu tự do: "Preliminary 1", "Chung kết"...
  group_label        text,        -- nhãn bảng vòng tròn (Appendix II) — null nếu là trận loại trực tiếp
  match_no           text,        -- "___VS___" trên phiếu Drone Cup
  team_a_id          uuid references teams(id) on delete set null,  -- Đội Đỏ / Red
  team_b_id          uuid references teams(id) on delete set null,  -- Đội Xanh / Blue
  team_a_no          text,        -- "Red No."
  team_b_no          text,        -- "Blue No."
  winner_id          uuid references teams(id) on delete set null,
  is_draw            boolean default false,
  played_at          timestamptz,
  details            jsonb default '{}',
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create or replace trigger trg_combat_matches_updated
  before update on combat_matches for each row execute function set_updated_at();

-- Khiếu nại bảng điểm — trọng tài gửi yêu cầu khiếu nại về 1 phiếu điểm cụ
-- thể (đo lường HOẶC đối kháng, không cả hai — ép bằng constraint bên dưới),
-- admin xem/xử lý. Đây là 1 luồng RIÊNG có trạng thái, khác với field text
-- tự do `objection`/"Kiến nghị" đã có sẵn trên scores/combat_matches (field
-- đó chỉ là ghi chú tại thời điểm chấm, không có quy trình xử lý).
create table if not exists complaints (
  id               uuid primary key default gen_random_uuid(),
  score_id         uuid references scores(id) on delete cascade,
  combat_match_id  uuid references combat_matches(id) on delete cascade,
  referee_id       uuid references users(id) on delete set null,
  message          text not null,
  status           text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  resolution_note  text,
  resolved_by      uuid references users(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  constraint complaints_one_target check (
    (score_id is not null and combat_match_id is null) or
    (score_id is null and combat_match_id is not null)
  )
);
create or replace trigger trg_complaints_updated
  before update on complaints for each row execute function set_updated_at();

-- Khi admin xử lý 1 khiếu nại về phiếu điểm, có thể sửa trực tiếp điểm ngay
-- tại đó (thay vì phải qua trang Sửa phiếu riêng) — vẫn ghi vào score_edits
-- như bình thường, chỉ thêm: link ngược về khiếu nại nào gây ra lần sửa này,
-- và chữ ký người duyệt (Trưởng ban trọng tài) để có bằng chứng xác nhận.
alter table score_edits add column if not exists complaint_id uuid references complaints(id) on delete set null;
alter table score_edits add column if not exists reviewer_name text;
alter table score_edits add column if not exists reviewer_signature text;
create index if not exists idx_score_edits_complaint on score_edits(complaint_id);

-- Thời điểm trọng tài bấm "Bắt đầu" để vào chấm 1 lượt — hệ thống tự ghi nhận
-- (khác arena_entry_time là ô nhập tay tự do theo mẫu phiếu giấy cũ).
alter table scores add column if not exists started_at timestamptz;

-- Group/Bảng đấu vòng tròn của Battle of Stars (content_format='combat_stars') —
-- KHÁC board_id (Division theo độ tuổi, 5 bảng cố định A-E). Một content Battle
-- có thể chia đội thành nhiều group (vd "Bảng A"/"Bảng B") để tạo lịch vòng
-- tròn riêng từng group, không liên quan gì đến board_id.
alter table teams add column if not exists combat_group text;
create index if not exists idx_teams_combat_group on teams(contest_content_id, combat_group);

-- Sân thi đấu (Field) cho từng trận đối kháng — dùng để rải trận đều theo sân
-- khi sinh lịch vòng tròn tự động. Tái dùng bảng fields đã có (hiện chỉ gán
-- theo teams.field_id), KHÔNG tạo danh mục sân riêng.
alter table combat_matches add column if not exists field_id uuid references fields(id) on delete set null;
create index if not exists idx_combat_matches_field on combat_matches(field_id);

-- Phân quyền trọng tài theo (Nội dung thi × Field/sân thi đấu) — THAY THẾ
-- hoàn toàn cơ chế referee_boards cũ (bảng referee_boards vẫn giữ nguyên
-- trong DB để không mất dữ liệu lịch sử, nhưng KHÔNG còn route nào đọc/ghi
-- nó nữa — xem server/routes.cjs). Trọng tài chỉ thấy/chấm được đội (qua
-- teams.field_id) và trận đối kháng (qua combat_matches.field_id) thuộc
-- field đã gán, trong ĐÚNG nội dung thi đã gán. Rỗng cho 1 nội dung = chưa
-- giới hạn field nào trong nội dung đó (thấy tất cả field của nội dung đó).
create table if not exists referee_content_fields (
  referee_id          uuid not null references users(id) on delete cascade,
  contest_content_id  uuid not null references contest_contents(id) on delete cascade,
  field_id            uuid not null references fields(id) on delete cascade,
  created_at          timestamptz default now(),
  primary key (referee_id, contest_content_id, field_id)
);
create index if not exists idx_referee_content_fields_content on referee_content_fields(contest_content_id);
create index if not exists idx_referee_content_fields_field on referee_content_fields(field_id);


-- ============================================================
-- 2. INDEXES
-- ============================================================
create index if not exists idx_schools_level        on schools(level);
create index if not exists idx_schools_province     on schools(province);
create index if not exists idx_users_role           on users(role);
create index if not exists idx_users_area           on users(area_id);
create index if not exists idx_competitions_active  on competitions(is_active);
create index if not exists idx_contents_competition on contest_contents(competition_id);
create index if not exists idx_areas_content        on areas(contest_content_id);
create index if not exists idx_areas_region         on areas(region);
create index if not exists idx_students_school      on students(school_id);
create index if not exists idx_teams_content        on teams(contest_content_id);
create index if not exists idx_teams_area           on teams(area_id);
create index if not exists idx_teams_board          on teams(board_id);
create index if not exists idx_teams_region         on teams(region);
create index if not exists idx_tasks_content        on tasks(contest_content_id);
create index if not exists idx_tasks_active         on tasks(is_active);
create index if not exists idx_scores_team          on scores(team_id);
create index if not exists idx_scores_content       on scores(contest_content_id);
create index if not exists idx_scores_competition   on scores(competition_id);
create index if not exists idx_scores_referee       on scores(referee_id);
create index if not exists idx_scores_submitted     on scores(submitted_at);
create index if not exists idx_score_images_score   on score_images(score_id);
create index if not exists idx_score_edits_score    on score_edits(score_id);
create index if not exists idx_teams_coach          on teams(coach_id);
create index if not exists idx_matches_content_board on matches(contest_content_id, board_id);
create index if not exists idx_teams_field          on teams(field_id);
create index if not exists idx_combat_matches_content on combat_matches(contest_content_id);
create index if not exists idx_combat_matches_board   on combat_matches(board_id);
create index if not exists idx_combat_matches_group   on combat_matches(contest_content_id, group_label);
create index if not exists idx_complaints_status      on complaints(status);
create index if not exists idx_complaints_referee     on complaints(referee_id);


-- ============================================================
-- 3. FUNCTIONS
-- ============================================================

-- Trigger tự động cập nhật updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cập nhật competition_id trên scores khi insert
create or replace function sync_score_competition_id()
returns trigger language plpgsql as $$
begin
  if new.competition_id is null then
    select cc.competition_id into new.competition_id
    from contest_contents cc
    where cc.id = new.contest_content_id;
  end if;
  return new;
end;
$$;

-- NOTE: KHÔNG có is_admin()/is_referee() như bản Supabase —
-- các hàm đó dựa vào auth.uid() (chỉ tồn tại trên Supabase).
-- Trên Neon, backend API chịu trách nhiệm kiểm tra role trước khi query.


-- ============================================================
-- 4. TRIGGERS
-- ============================================================
create or replace trigger trg_schools_updated
  before update on schools for each row execute function set_updated_at();
create or replace trigger trg_users_updated
  before update on users for each row execute function set_updated_at();
create or replace trigger trg_competitions_updated
  before update on competitions for each row execute function set_updated_at();
create or replace trigger trg_contents_updated
  before update on contest_contents for each row execute function set_updated_at();
create or replace trigger trg_areas_updated
  before update on areas for each row execute function set_updated_at();
create or replace trigger trg_students_updated
  before update on students for each row execute function set_updated_at();
create or replace trigger trg_boards_updated
  before update on boards for each row execute function set_updated_at();
create or replace trigger trg_teams_updated
  before update on teams for each row execute function set_updated_at();
create or replace trigger trg_tasks_updated
  before update on tasks for each row execute function set_updated_at();
create or replace trigger trg_scores_updated
  before update on scores for each row execute function set_updated_at();

-- Tự động fill competition_id khi insert scores
create or replace trigger trg_scores_competition_sync
  before insert on scores for each row execute function sync_score_competition_id();


-- ============================================================
-- 5. VIEWS
-- ============================================================

-- Bảng xếp hạng tổng hợp
create or replace view v_scoreboard as
select
  s.id                as score_id,
  s.score,
  s.time,
  s.submitted_at,
  s.contest_content_id,
  s.competition_id,
  s.referee_id,
  t.id                as team_id,
  t.name              as team_name,
  t.region,
  t.student_ids,
  sch.id              as school_id,
  sch.name            as school_name,
  sch.level           as school_level,
  cc.name             as content_name,
  cc.criteria,
  comp.name           as competition_name,
  u.full_name         as referee_name,
  area.name           as area_name,
  area.region         as area_region,
  b.id                as board_id,
  b.name              as board_name,
  b.age_group         as board_age_group
from scores s
join teams t on t.id = s.team_id
join contest_contents cc on cc.id = s.contest_content_id
join competitions comp on comp.id = coalesce(s.competition_id, cc.competition_id)
left join schools sch on sch.id = t.school_id
left join users u on u.id = s.referee_id
left join areas area on area.id = t.area_id
left join boards b on b.id = t.board_id;

-- Đội được phân cho từng referee.
-- Khác bản Supabase: không filter auth.uid() (Neon không có),
-- thay vào đó expose cột referee_id — backend query:
--   select * from v_referee_teams where referee_id = $1
create or replace view v_referee_teams as
select
  u.id                as referee_id,
  t.id,
  t.contest_content_id,
  t.area_id,
  t.name              as team_name,
  t.student_ids,
  t.school_id,
  t.region            as team_region,
  t.order_index,
  t.created_at,
  t.updated_at,
  cc.name             as content_name,
  cc.competition_id,
  a.name              as area_name,
  a.region            as area_region,
  sch.name            as school_name,
  sch.level           as school_level,
  b.id                as board_id,
  b.name              as board_name
from teams t
join contest_contents cc on cc.id = t.contest_content_id
join areas a on a.id = t.area_id
join users u on u.area_id = a.id and u.role = 'referee'
left join schools sch on sch.id = t.school_id
left join boards b on b.id = t.board_id;
