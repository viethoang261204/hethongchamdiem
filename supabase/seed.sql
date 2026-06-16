-- ============================================================
-- SEED DATA for ENJOY AI ASIA OPEN - Hệ thống Chấm điểm
-- ============================================================
-- Chạy SAU schema.sql (tạo bảng trước, rồi mới seed dữ liệu mẫu)
-- Idempotent: chạy nhiều lần không lỗi
-- ============================================================

-- Cần pgcrypto để hash password bằng bcrypt (giống Supabase Auth)
create extension if not exists pgcrypto;

-- ============================================================
-- 1. AUTH USERS (Supabase Auth)
--    3 user mẫu với UUID cố định để dễ tham chiếu
--    Password hash bằng crypt(..., gen_salt('bf')) = bcrypt
-- ============================================================

-- ADMIN: admin@enjoyai.vn / Admin@123
insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'authenticated', 'authenticated',
  'admin@enjoyai.vn',
  crypt('Admin@123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Quản trị viên"}',
  now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

-- TRỌNG TÀI BẮC: bac@enjoyai.vn / Ref@123
insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'authenticated', 'authenticated',
  'bac@enjoyai.vn',
  crypt('Ref@123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Trọng tài Miền Bắc"}',
  now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

-- TRỌNG TÀI NAM: nam@enjoyai.vn / Ref@123
insert into auth.users (
  instance_id, id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'authenticated', 'authenticated',
  'nam@enjoyai.vn',
  crypt('Ref@123', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Trọng tài Miền Nam"}',
  now(), now(),
  '', '', '', ''
) on conflict (id) do nothing;

-- ============================================================
-- 2. AUTH IDENTITIES (bắt buộc cho Supabase v2 để đăng nhập)
-- ============================================================

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  jsonb_build_object(
    'sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'email', 'admin@enjoyai.vn',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  'admin@enjoyai.vn',
  now(), now(), now()
) on conflict (provider_id, provider) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  jsonb_build_object(
    'sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'email', 'bac@enjoyai.vn',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  'bac@enjoyai.vn',
  now(), now(), now()
) on conflict (provider_id, provider) do nothing;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  jsonb_build_object(
    'sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'email', 'nam@enjoyai.vn',
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  'nam@enjoyai.vn',
  now(), now(), now()
) on conflict (provider_id, provider) do nothing;

-- ============================================================
-- 3. PUBLIC.USERS (bảng user trong app, liên kết auth.users)
--    Insert SAU areas để gán area_id cho trọng tài
-- ============================================================

-- Admin
insert into public.users (id, username, full_name, role, area_id)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'admin',
  'Quản trị viên',
  'admin',
  null
) on conflict (id) do nothing;

-- Trọng tài Bắc (area_id sẽ update sau khi có areas)
insert into public.users (id, username, full_name, role, area_id)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'trongtai_bac',
  'Trọng tài Miền Bắc',
  'referee',
  null
) on conflict (id) do nothing;

-- Trọng tài Nam
insert into public.users (id, username, full_name, role, area_id)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'trongtai_nam',
  'Trọng tài Miền Nam',
  'referee',
  null
) on conflict (id) do nothing;

-- ============================================================
-- 4. COMPETITION (cuộc thi mẫu)
-- ============================================================

insert into competitions (id, name, description, location, start_date, end_date, is_active)
values (
  '11111111-1111-1111-1111-111111111111',
  'ENJOY AI ASIA OPEN 2026',
  'Cuộc thi Robot & AI quốc tế khu vực Châu Á',
  'Hà Nội, Việt Nam',
  '2026-07-15',
  '2026-07-20',
  true
) on conflict (id) do nothing;

-- ============================================================
-- 5. CONTEST CONTENTS (nội dung thi)
-- ============================================================

insert into contest_contents (id, competition_id, name, description, order_index, scoring_method, criteria)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Sáng tạo Robot THCS',
  'Robotics sáng tạo dành cho cấp THCS',
  1,
  'criteria',
  '[
    {"name": "Hoàn thành nhiệm vụ", "max": 40},
    {"name": "Thiết kế cơ khí", "max": 20},
    {"name": "Lập trình", "max": 25},
    {"name": "Thuyết trình", "max": 15}
  ]'::jsonb
) on conflict (id) do nothing;

insert into contest_contents (id, competition_id, name, description, order_index, scoring_method, criteria)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Lập trình AI THPT',
  'Lập trình trí tuệ nhân tạo cấp THPT',
  2,
  'criteria',
  '[
    {"name": "Giải thuật", "max": 35},
    {"name": "Tối ưu code", "max": 25},
    {"name": "Giao diện", "max": 20},
    {"name": "Sáng tạo", "max": 20}
  ]'::jsonb
) on conflict (id) do nothing;

-- ============================================================
-- 6. AREAS (3 khu vực Bắc/Trung/Nam cho mỗi content)
-- ============================================================

insert into areas (id, contest_content_id, competition_id, name, region, order_index)
values
  ('a1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Khu vực Bắc - Robot', 'bac', 1),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Khu vực Trung - Robot', 'trung', 2),
  ('a3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Khu vực Nam - Robot', 'nam', 3),
  ('a4444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Khu vực Bắc - AI', 'bac', 1),
  ('a5555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Khu vực Trung - AI', 'trung', 2),
  ('a6666666-6666-6666-6666-666666666666', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Khu vực Nam - AI', 'nam', 3)
on conflict (id) do nothing;

-- Gán area cho 2 trọng tài (Bắc & Nam, content Robot)
update public.users set area_id = 'a1111111-1111-1111-1111-111111111111'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

update public.users set area_id = 'a3333333-3333-3333-3333-333333333333'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ============================================================
-- 7. SCHOOLS (3 trường mẫu)
-- ============================================================

insert into schools (id, name, level, province, district, source)
values
  ('c1111111-1111-1111-1111-111111111111', 'THCS Nguyễn Du', 'THCS', 'Hà Nội', 'Hoàn Kiếm', 'seed'),
  ('c2222222-2222-2222-2222-222222222222', 'THPT Chuyên Hà Nội - Amsterdam', 'THPT', 'Hà Nội', 'Cầu Giấy', 'seed'),
  ('c3333333-3333-3333-3333-333333333333', 'THPT Lê Hồng Phong', 'THPT', 'TP Hồ Chí Minh', 'Quận 5', 'seed')
on conflict (id) do nothing;

-- ============================================================
-- 8. TASKS (nhiệm vụ mẫu cho 2 nội dung thi)
-- ============================================================

insert into tasks (id, contest_content_id, name, name_en, description, max_score, scoring_type, order_index, is_active)
values
  -- Robot THCS
  ('d1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Di chuyển theo line', 'Line Following', 'Robot di chuyển theo vạch đen trong thời gian nhanh nhất', 20, 'binary', 1, true),
  ('d2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Nâng vật cản', 'Obstacle Lifting', 'Robot tự động phát hiện và nâng vật cản', 25, 'tier', 2, true),
  ('d3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Quay về đích', 'Return to Base', 'Robot quay về vị trí xuất phát', 15, 'binary', 3, true),
  -- AI THPT
  ('d4444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Nhận diện khuôn mặt', 'Face Recognition', 'Phát hiện và nhận diện khuôn mặt từ camera', 30, 'numeric', 1, true),
  ('d5555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'Phân loại ảnh', 'Image Classification', 'Phân loại ảnh thành 5 nhãn cho trước', 35, 'tier', 2, true)
on conflict (id) do nothing;

-- ============================================================
-- 9. TEAMS (6 đội mẫu: 2 đội/khu vực cho content Robot)
-- ============================================================

insert into teams (id, contest_content_id, area_id, name, school_id, region, order_index)
values
  -- Khu vực Bắc (Robot)
  ('e1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Đội Robot HN-01', 'c1111111-1111-1111-1111-111111111111', 'bac', 1),
  ('e2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Đội Robot HN-02', 'c2222222-2222-2222-2222-222222222222', 'bac', 2),
  -- Khu vực Trung (Robot)
  ('e3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Đội Robot ĐN-01', 'c1111111-1111-1111-1111-111111111111', 'trung', 3),
  ('e4444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'Đội Robot Huế-01', 'c2222222-2222-2222-2222-222222222222', 'trung', 4),
  -- Khu vực Nam (Robot)
  ('e5555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'Đội Robot HCM-01', 'c3333333-3333-3333-3333-333333333333', 'nam', 5),
  ('e6666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'a3333333-3333-3333-3333-333333333333', 'Đội Robot HCM-02', 'c3333333-3333-3333-3333-333333333333', 'nam', 6)
on conflict (id) do nothing;

-- ============================================================
-- Tổng kết
-- ============================================================
do $$
declare
  v_users int;
  v_competitions int;
  v_contents int;
  v_areas int;
  v_schools int;
  v_teams int;
  v_tasks int;
begin
  select count(*) into v_users from public.users;
  select count(*) into v_competitions from competitions;
  select count(*) into v_contents from contest_contents;
  select count(*) into v_areas from areas;
  select count(*) into v_schools from schools;
  select count(*) into v_teams from teams;
  select count(*) into v_tasks from tasks;

  raise notice '✅ Seed hoàn tất:';
  raise notice '   - Users:     %', v_users;
  raise notice '   - Competitions: %', v_competitions;
  raise notice '   - Contents:  %', v_contents;
  raise notice '   - Areas:     %', v_areas;
  raise notice '   - Schools:   %', v_schools;
  raise notice '   - Teams:     %', v_teams;
  raise notice '   - Tasks:     %', v_tasks;
end $$;
