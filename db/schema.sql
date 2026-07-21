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
  level       text not null check (level in ('TH', 'THCS', 'THPT')),
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
--   tier    = legacy, giữ để tương thích
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

alter table tasks add column if not exists image_data bytea;
alter table tasks add column if not exists image_mime text;
alter table tasks add column if not exists max_count integer;
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

-- Mỗi đội 1 phiếu duy nhất / nội dung
create unique index if not exists uq_scores_team_content
  on scores(team_id, contest_content_id);


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
