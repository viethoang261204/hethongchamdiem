-- ============================================================
-- ENJOY AI ASIA OPEN - Hệ thống Chấm điểm Cuộc thi
-- SQL Schema tương thích Supabase & Neon (PostgreSQL)
-- ============================================================
-- Cách chạy:
-- 1. Mở SQL Editor (Supabase Dashboard hoặc Neon Dashboard)
-- 2. Dán toàn bộ nội dung file này
-- 3. Nhấn Run
-- ============================================================

-- ============================================================
-- 0. EXTENSIONS (Neon yêu cầu khai báo rõ ràng)
-- ============================================================
create extension if not exists pgcrypto;


-- ============================================================
-- 1. TABLES (theo thứ tự phụ thuộc: bảng không phụ thuộc trước)
-- ============================================================

-- Trường học
create table if not exists schools (
  id          uuid primary key default uuid_generate_v4(),
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
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  location    text,
  start_date  date,
  end_date    date,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Người dùng (Neon: tự quản lý user, không dùng Supabase Auth)
-- Trên Neon, id là uuid_generate_v4() tự tạo. Khi migrate sang Supabase,
-- chỉ cần đổi id về references auth.users(id) on delete cascade
create table if not exists users (
  id          uuid primary key default uuid_generate_v4(),
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
  id              uuid primary key default uuid_generate_v4(),
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
  id                 uuid primary key default uuid_generate_v4(),
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
  id          uuid primary key default uuid_generate_v4(),
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
  id                 uuid primary key default uuid_generate_v4(),
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
  id                 uuid primary key default uuid_generate_v4(),
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
  id                 uuid primary key default uuid_generate_v4(),
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

-- Hình ảnh đính kèm phiếu chấm
create table if not exists score_images (
  id           uuid primary key default uuid_generate_v4(),
  score_id     uuid not null references scores(id) on delete cascade,
  storage_path text not null,
  public_url   text not null,
  file_name    text,
  file_size    integer,
  mime_type    text,
  uploaded_by  uuid references users(id) on delete set null,
  created_at   timestamptz default now()
);


-- ============================================================
-- 2. INDEXES
-- ============================================================
create index if not exists idx_schools_level        on schools(level);
create index if not exists idx_schools_province      on schools(province);
create index if not exists idx_users_role            on users(role);
create index if not exists idx_users_area             on users(area_id);
create index if not exists idx_competitions_active   on competitions(is_active);
create index if not exists idx_contents_competition  on contest_contents(competition_id);
create index if not exists idx_areas_content         on areas(contest_content_id);
create index if not exists idx_areas_region          on areas(region);
create index if not exists idx_students_school       on students(school_id);
create index if not exists idx_teams_content         on teams(contest_content_id);
create index if not exists idx_teams_area            on teams(area_id);
create index if not exists idx_teams_region          on teams(region);
create index if not exists idx_tasks_content         on tasks(contest_content_id);
create index if not exists idx_tasks_active          on tasks(is_active);
create index if not exists idx_scores_team           on scores(team_id);
create index if not exists idx_scores_content        on scores(contest_content_id);
create index if not exists idx_scores_competition    on scores(competition_id);
create index if not exists idx_scores_referee        on scores(referee_id);
create index if not exists idx_scores_submitted      on scores(submitted_at);
create index if not exists idx_score_images_score    on score_images(score_id);


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

-- Kiểm tra user hiện tại có role admin không
-- NOTE: Trả về true nếu chưa có auth context (Neon dev) hoặc là admin
create or replace function is_admin()
returns boolean language plpgsql security definer as $$
begin
  -- Neon: nếu auth.uid() là null (chưa login), coi như admin để dev dễ
  if auth.uid() is null then
    return true;
  end if;
  return exists (
    select 1 from users where id = auth.uid() and role = 'admin'
  );
end;
$$;

-- Kiểm tra user hiện tại có role referee không
create or replace function is_referee()
returns boolean language plpgsql security definer as $$
begin
  if auth.uid() is null then
    return true;
  end if;
  return exists (
    select 1 from users where id = auth.uid() and role = 'referee'
  );
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
create or replace trigger trg_score_images_updated
  before update on score_images for each row execute function set_updated_at();

-- Tự động fill competition_id khi insert scores
create or replace trigger trg_scores_competition_sync
  before insert on scores for each row execute function sync_score_competition_id();


-- ============================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- ============================================================

alter table schools          enable row level security;
alter table users            enable row level security;
alter table competitions    enable row level security;
alter table contest_contents enable row level security;
alter table areas            enable row level security;
alter table students         enable row level security;
alter table teams            enable row level security;
alter table tasks            enable row level security;
alter table scores           enable row level security;
alter table score_images     enable row level security;


-- Schools: public đọc, admin quản lý
drop policy if exists "Public read schools" on schools;
create policy "Public read schools" on schools for select using (true);
drop policy if exists "Admin write schools" on schools;
create policy "Admin write schools" on schools for all using (is_admin());

-- Users: chỉ chính mình đọc, admin quản lý
drop policy if exists "Users read own" on users;
create policy "Users read own" on users for select using (auth.uid() = id);
drop policy if exists "Admin write users" on users;
create policy "Admin write users" on users for all using (is_admin());

-- Competitions: public đọc, admin sửa
drop policy if exists "Public read competitions" on competitions;
create policy "Public read competitions" on competitions for select using (true);
drop policy if exists "Admin write competitions" on competitions;
create policy "Admin write competitions" on competitions for all using (is_admin());

-- Contest contents: public đọc, admin sửa
drop policy if exists "Public read contents" on contest_contents;
create policy "Public read contents" on contest_contents for select using (true);
drop policy if exists "Admin write contents" on contest_contents;
create policy "Admin write contents" on contest_contents for all using (is_admin());

-- Areas: public đọc, admin sửa
drop policy if exists "Public read areas" on areas;
create policy "Public read areas" on areas for select using (true);
drop policy if exists "Admin write areas" on areas;
create policy "Admin write areas" on areas for all using (is_admin());

-- Students: admin quản lý
drop policy if exists "Admin manage students" on students;
create policy "Admin manage students" on students for all using (is_admin());

-- Teams: public đọc, admin sửa
drop policy if exists "Public read teams" on teams;
create policy "Public read teams" on teams for select using (true);
drop policy if exists "Admin write teams" on teams;
create policy "Admin write teams" on teams for all using (is_admin());

-- Tasks: public đọc, admin quản lý
drop policy if exists "Public read tasks" on tasks;
create policy "Public read tasks" on tasks for select using (true);
drop policy if exists "Admin write tasks" on tasks;
create policy "Admin write tasks" on tasks for all using (is_admin());

-- Scores: public đọc, admin quản lý, referee chấm điểm
drop policy if exists "Public read scores" on scores;
create policy "Public read scores" on scores for select using (true);
drop policy if exists "Admin write scores" on scores;
create policy "Admin write scores" on scores for all using (is_admin());
drop policy if exists "Referee insert scores" on scores;
create policy "Referee insert scores" on scores for insert with check (auth.uid() = referee_id);
drop policy if exists "Referee update scores" on scores;
create policy "Referee update scores" on scores for update using (
  auth.uid() = referee_id or is_admin()
);

-- Score images: public đọc, admin quản lý, referee upload ảnh phiếu của mình
drop policy if exists "Public read score_images" on score_images;
create policy "Public read score_images" on score_images for select using (true);
drop policy if exists "Admin write score_images" on score_images;
create policy "Admin write score_images" on score_images for all using (is_admin());
drop policy if exists "Referee write score_images" on score_images;
create policy "Referee write score_images" on score_images for insert with check (
  exists (
    select 1 from scores s
    where s.id = score_images.score_id
      and (s.referee_id = auth.uid() or is_admin())
  )
);
drop policy if exists "Referee delete score_images" on score_images;
create policy "Referee delete score_images" on score_images for delete using (
  exists (
    select 1 from scores s
    where s.id = score_images.score_id
      and (s.referee_id = auth.uid() or is_admin())
  )
);


-- ============================================================
-- 6. VIEWS
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

-- Đội được phân cho referee đang đăng nhập
create or replace view v_referee_teams as
select
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
left join schools sch on sch.id = t.school_id
where auth.uid() = u.id;


-- ============================================================
-- 7. STORAGE (chỉ Supabase — Neon bỏ qua phần này)
-- ============================================================
-- insert into storage.buckets (id, name, public)
-- values ('score-images', 'score-images', true)
-- on conflict (id) do update set public = true;
-- NOTE: Nếu dùng Supabase, bỏ comment 3 dòng trên và chạy riêng trong Storage Dashboard
