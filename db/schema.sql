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
create table if not exists contest_contents (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references competitions(id) on delete cascade,
  name            text not null,
  name_en         text,
  description     text,
  criteria        jsonb default '[]',
  order_index     integer default 0,
  scoring_method  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
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

-- Đội thi
create table if not exists teams (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  area_id            uuid references areas(id) on delete set null,
  name               text not null,
  student_ids        uuid[] default '{}',
  school_id          uuid references schools(id) on delete set null,
  region             text not null default 'bac' check (region in ('bac', 'trung', 'nam')),
  order_index        integer default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Nhiệm vụ (gắn vào contest_contents)
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  name               text not null,
  name_en            text,
  description        text,
  image_url          text,
  max_score          numeric(10,2) default 0,
  scoring_type       text default 'binary' check (scoring_type in ('binary', 'tier', 'numeric')),
  order_index        integer default 0,
  is_active          boolean default true,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- Bảng điểm
create table if not exists scores (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references teams(id) on delete cascade,
  contest_content_id uuid not null references contest_contents(id) on delete cascade,
  competition_id     uuid references competitions(id) on delete set null,
  referee_id         uuid references users(id) on delete set null,
  score              numeric(10,2) not null default 0,
  time               text,
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
  area.region         as area_region
from scores s
join teams t on t.id = s.team_id
join contest_contents cc on cc.id = s.contest_content_id
join competitions comp on comp.id = coalesce(s.competition_id, cc.competition_id)
left join schools sch on sch.id = t.school_id
left join users u on u.id = s.referee_id
left join areas area on area.id = t.area_id;

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
  sch.level           as school_level
from teams t
join contest_contents cc on cc.id = t.contest_content_id
join areas a on a.id = t.area_id
join users u on u.area_id = a.id and u.role = 'referee'
left join schools sch on sch.id = t.school_id;
