-- ============================================================
-- SEED DATA cho NEON - ENJOY AI ASIA OPEN - Hệ thống Chấm điểm
-- ============================================================
-- Chạy SAU db/schema.sql (hoặc: cd server && npm run db:setup -- --seed)
-- Idempotent: chạy nhiều lần không lỗi
-- User nằm thẳng trong bảng users, password hash bcrypt bằng pgcrypto.
-- Backend verify đăng nhập bằng:
--   select * from users where email = $1
--     and password = crypt($2, password);
-- (hoặc dùng bcryptjs phía Node — hash $2a$ tương thích)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. USERS (3 user mẫu với UUID cố định để dễ tham chiếu)
-- ============================================================

-- ADMIN: admin@enjoyai.vn / Admin@123
insert into users (id, email, username, password, full_name, role, area_id)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'admin@enjoyai.vn',
  'admin',
  crypt('Admin@123', gen_salt('bf')),
  'Quản trị viên',
  'admin',
  null
) on conflict (id) do nothing;

-- TRỌNG TÀI BẮC: bac@enjoyai.vn / Ref@123 (area_id update sau khi có areas)
insert into users (id, email, username, password, full_name, role, area_id)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'bac@enjoyai.vn',
  'trongtai_bac',
  crypt('Ref@123', gen_salt('bf')),
  'Trọng tài Miền Bắc',
  'referee',
  null
) on conflict (id) do nothing;

-- TRỌNG TÀI NAM: nam@enjoyai.vn / Ref@123
insert into users (id, email, username, password, full_name, role, area_id)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'nam@enjoyai.vn',
  'trongtai_nam',
  crypt('Ref@123', gen_salt('bf')),
  'Trọng tài Miền Nam',
  'referee',
  null
) on conflict (id) do nothing;

-- ============================================================
-- 2. COMPETITION (cuộc thi mẫu)
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
-- 3. CONTEST CONTENTS (nội dung thi)
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

-- Nội dung mẫu theo phiếu chấm thực tế: Ancient Civilizations
-- time_limit 150s, điểm thưởng "Vận hành mượt mà" = 40 − 10 × số lần chạy lại
insert into contest_contents (id, competition_id, name, name_en, description, order_index, scoring_method, time_limit_seconds, bonus_config)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'Hành trình Văn minh Cổ đại',
  'Ancient Civilizations',
  'Robot thu thập mảnh ghép văn minh và quay về khu xuất phát',
  3,
  'tasks',
  150,
  '{"label": "Điểm thưởng vận hành mượt mà (Smooth Operator Bonus)", "base": 40, "per_retry": 10}'::jsonb
) on conflict (id) do nothing;

-- ============================================================
-- 4. AREAS (3 khu vực Bắc/Trung/Nam cho mỗi content)
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
update users set area_id = 'a1111111-1111-1111-1111-111111111111'
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

update users set area_id = 'a3333333-3333-3333-3333-333333333333'
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ============================================================
-- 5. SCHOOLS (3 trường mẫu)
-- ============================================================

insert into schools (id, name, level, province, district, source)
values
  ('c1111111-1111-1111-1111-111111111111', 'THCS Nguyễn Du', 'THCS', 'Hà Nội', 'Hoàn Kiếm', 'seed'),
  ('c2222222-2222-2222-2222-222222222222', 'THPT Chuyên Hà Nội - Amsterdam', 'THPT', 'Hà Nội', 'Cầu Giấy', 'seed'),
  ('c3333333-3333-3333-3333-333333333333', 'THPT Lê Hồng Phong', 'THPT', 'TP Hồ Chí Minh', 'Quận 5', 'seed')
on conflict (id) do nothing;

-- ============================================================
-- 6. TASKS (nhiệm vụ mẫu cho 2 nội dung thi)
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
-- 7. TEAMS (6 đội mẫu: 2 đội/khu vực cho content Robot)
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
-- 8. BOARDS (bảng đấu theo độ tuổi) + tasks Ancient Civilizations
-- ============================================================

insert into areas (id, contest_content_id, competition_id, name, region, order_index)
values
  ('a7777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Khu vực Bắc - Ancient', 'bac', 1)
on conflict (id) do nothing;

insert into boards (id, contest_content_id, name, age_group, order_index)
values
  -- Bảng đấu cho Ancient Civilizations
  ('b1111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 'Bảng A', 'Tiểu học (7-11 tuổi)', 1),
  ('b2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Bảng B', 'THCS (12-14 tuổi)', 2),
  -- Bảng đấu cho Sáng tạo Robot THCS
  ('b3333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Bảng A', 'THCS (12-14 tuổi)', 1)
on conflict (id) do nothing;

-- Gán bảng đấu cho các đội Robot có sẵn
update teams set board_id = 'b3333333-3333-3333-3333-333333333333'
where contest_content_id = '22222222-2222-2222-2222-222222222222' and board_id is null;

-- Nhiệm vụ Ancient Civilizations — đúng theo phiếu chấm giấy
insert into tasks (id, contest_content_id, name, name_en, description, max_score, max_count, scoring_type, order_index, is_active)
values
  ('d6666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444',
   'Xuất phát', 'Departure',
   'Robot hoàn toàn rời khỏi khu vực xuất phát', 20, null, 'binary', 1, true),
  ('d7777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444',
   'Thu thập Mảnh Ghép Văn Minh – Khối', 'Collecting Civilization Fragments – Blocks',
   'Hình chiếu khối nằm một phần hoặc toàn bộ trong khu vực tương ứng. 20 điểm mỗi khối.', 20, 10, 'count', 2, true),
  ('d8888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444',
   'Quay về', 'Return',
   'Robot quay về khu vực xuất phát bằng chế độ tự động hoặc điều khiển từ xa', 20, null, 'binary', 3, true)
on conflict (id) do nothing;

-- 2 đội mẫu cho Ancient Civilizations
insert into teams (id, contest_content_id, area_id, board_id, name, school_id, region, order_index)
values
  ('e7777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', 'a7777777-7777-7777-7777-777777777777', 'b1111111-1111-1111-1111-111111111111', 'Đội Văn Minh 01', 'c1111111-1111-1111-1111-111111111111', 'bac', 1),
  ('e8888888-8888-8888-8888-888888888888', '44444444-4444-4444-4444-444444444444', 'a7777777-7777-7777-7777-777777777777', 'b2222222-2222-2222-2222-222222222222', 'Đội Văn Minh 02', 'c2222222-2222-2222-2222-222222222222', 'bac', 2)
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
  select count(*) into v_users from users;
  select count(*) into v_competitions from competitions;
  select count(*) into v_contents from contest_contents;
  select count(*) into v_areas from areas;
  select count(*) into v_schools from schools;
  select count(*) into v_teams from teams;
  select count(*) into v_tasks from tasks;

  raise notice '✅ Seed hoàn tất:';
  raise notice '   - Users:        %', v_users;
  raise notice '   - Competitions: %', v_competitions;
  raise notice '   - Contents:     %', v_contents;
  raise notice '   - Areas:        %', v_areas;
  raise notice '   - Schools:      %', v_schools;
  raise notice '   - Teams:        %', v_teams;
  raise notice '   - Tasks:        %', v_tasks;
end $$;
