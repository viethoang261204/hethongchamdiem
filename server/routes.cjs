// REST API routes — thay thế toàn bộ truy vấn Supabase SDK phía client.
// QUAN TRỌNG: shape JSON trả về phải giống hệt shape của Supabase
// (nested keys: schools, competitions, contest_contents, users) để
// frontend không phải sửa — xem client/src/api.js.
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { query, withTransaction } = require('./db.cjs');
const { requireAuth, requireAdmin } = require('./auth.cjs');

const router = express.Router();

// helper: lọc body chỉ giữ các cột cho phép (chống ghi cột lạ)
function pick(body, fields) {
  const out = {};
  for (const f of fields) {
    if (body[f] !== undefined) out[f] = body[f];
  }
  return out;
}

// helper: build câu UPDATE động từ object đã whitelist
function buildUpdate(table, id, data) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  return {
    text: `update ${table} set ${sets} where id = $${keys.length + 1} returning *`,
    values: [...keys.map((k) => data[k]), id],
  };
}

// helper: wrap async route, trả lỗi JSON thống nhất
const h = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[api] ${req.method} ${req.originalUrl}:`, err.message);
    // Lỗi constraint Postgres → 400 với message gốc (client có logic nhận diện)
    const isPgError = /duplicate key|violates|constraint|invalid input/.test(err.message);
    res.status(isPgError ? 400 : 500).json({ error: err.message });
  });
};

// helper: nhập hàng loạt từ Excel (client đã parse ra JSON) — lặp từng dòng,
// gọi insertOneFn(row); lỗi ở 1 dòng không làm hỏng các dòng khác. insertOneFn
// trả { skipped: true } để đánh dấu bỏ qua (trùng dữ liệu), hoặc
// { generated: {...} } để gom vào danh sách hiển thị riêng (VD: mật khẩu tự sinh).
async function bulkImport(rows, insertOneFn) {
  const result = { added: 0, skipped: 0, errors: [], generated: [] };
  for (const row of rows) {
    try {
      const r = await insertOneFn(row);
      if (r?.skipped) result.skipped++;
      else result.added++;
      if (r?.generated) result.generated.push(r.generated);
    } catch (err) {
      result.errors.push({ row: row.__row ?? '?', message: err.message });
    }
  }
  if (result.generated.length === 0) delete result.generated;
  return result;
}

// SQL fragment: nested schools {name, level}
const SCHOOLS_JSON = `case when sch.id is null then null
  else json_build_object('name', sch.name, 'level', sch.level) end`;

// ============================================================
// Health / diag
// ============================================================
router.get('/health', h(async (_req, res) => {
  const t0 = Date.now();
  const { rows } = await query('select count(*)::int as competitions from competitions');
  res.json({ ok: true, db: 'neon', latencyMs: Date.now() - t0, competitions: rows[0].competitions });
}));

// ============================================================
// Schools
// ============================================================
router.get('/schools', h(async (req, res) => {
  const cond = [];
  const vals = [];
  const add = (sql, v) => { vals.push(v); cond.push(sql.replace('?', `$${vals.length}`)); };
  if (req.query.query) add('name ilike ?', `%${req.query.query}%`);
  if (req.query.level) add('level = ?', req.query.level);
  if (req.query.province) add('province ilike ?', `%${req.query.province}%`);
  if (req.query.district) add('district ilike ?', `%${req.query.district}%`);
  const where = cond.length ? `where ${cond.join(' and ')}` : '';
  const { rows } = await query(`select * from schools ${where} order by name limit 200`, vals);
  res.json(rows);
}));

router.post('/schools', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['name', 'level', 'province', 'district', 'source']);
  const { rows } = await query(
    `insert into schools (name, level, province, district, source)
     values ($1, $2, $3, $4, coalesce($5, 'manual')) returning *`,
    [data.name, data.level, data.province ?? null, data.district ?? null, data.source ?? null]
  );
  res.json(rows[0]);
}));

router.put('/schools/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['name', 'level', 'province', 'district']);
  const q = buildUpdate('schools', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/schools/:id', requireAdmin, h(async (req, res) => {
  await query('delete from schools where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Nhập hàng loạt từ Excel — bỏ qua trùng (name, level) nhờ unique constraint sẵn có
router.post('/schools/import', requireAdmin, h(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  const result = await bulkImport(rows, async (row) => {
    if (!row.name) throw new Error('Thiếu Tên trường.');
    if (!['MN', 'TH', 'THCS', 'THPT'].includes(row.level)) throw new Error('Cấp học phải là MN, TH, THCS hoặc THPT.');
    const { rowCount } = await query(
      `insert into schools (name, level, province, district, source)
       values ($1, $2, $3, $4, 'import')
       on conflict (name, level) do nothing`,
      [row.name, row.level, row.province || null, row.district || null]
    );
    return rowCount === 0 ? { skipped: true } : {};
  });
  res.json(result);
}));

// ============================================================
// Competitions
// ============================================================
router.get('/competitions', h(async (_req, res) => {
  const { rows } = await query('select * from competitions order by created_at desc');
  res.json(rows);
}));

router.post('/competitions', requireAdmin, h(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `insert into competitions (name, description, location, start_date, end_date, is_active)
     values ($1, $2, $3, $4, $5, coalesce($6, true)) returning *`,
    [b.name, b.description ?? null, b.location ?? null, b.start_date ?? null, b.end_date ?? null, b.is_active]
  );
  res.json(rows[0]);
}));

router.put('/competitions/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['name', 'description', 'location', 'start_date', 'end_date', 'is_active']);
  const q = buildUpdate('competitions', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/competitions/:id', requireAdmin, h(async (req, res) => {
  await query('delete from competitions where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Nhập hàng loạt từ Excel — bỏ qua trùng tên (không có unique constraint sẵn
// nên tự SELECT kiểm tra trước, không dùng ON CONFLICT được).
router.post('/competitions/import', requireAdmin, h(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  const result = await bulkImport(rows, async (row) => {
    if (!row.name) throw new Error('Thiếu Tên cuộc thi.');
    if (!row.location) throw new Error('Thiếu Địa điểm.');
    if (!row.start_date) throw new Error('Thiếu Ngày bắt đầu.');
    if (!row.end_date) throw new Error('Thiếu Ngày kết thúc.');
    const { rows: dup } = await query('select 1 from competitions where lower(name) = lower($1) limit 1', [row.name]);
    if (dup[0]) return { skipped: true };
    await query(
      `insert into competitions (name, description, location, start_date, end_date, is_active)
       values ($1, $2, $3, $4, $5, true)`,
      [row.name, row.description || null, row.location, row.start_date, row.end_date]
    );
    return {};
  });
  res.json(result);
}));

// ============================================================
// Contest contents
// ============================================================
router.get('/competitions/:competitionId/contents', h(async (req, res) => {
  const { rows } = await query(
    'select * from contest_contents where competition_id = $1 order by order_index',
    [req.params.competitionId]
  );
  res.json(rows);
}));

router.get('/contents', h(async (_req, res) => {
  const { rows } = await query(
    `select cc.*, json_build_object('name', comp.name) as competitions
     from contest_contents cc
     left join competitions comp on comp.id = cc.competition_id
     order by cc.order_index`
  );
  res.json(rows);
}));

const CONTENT_FIELDS = ['name', 'name_en', 'description', 'criteria', 'order_index', 'scoring_method', 'time_limit_seconds', 'bonus_config', 'content_format'];

router.post('/competitions/:competitionId/contents', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, CONTENT_FIELDS);
  if (b.content_format && !['scoring', 'combat_drone', 'combat_stars'].includes(b.content_format)) {
    return res.status(400).json({ error: 'content_format không hợp lệ.' });
  }
  const { rows } = await query(
    `insert into contest_contents (competition_id, name, name_en, description, criteria, order_index, scoring_method, time_limit_seconds, bonus_config, content_format)
     values ($1, $2, $3, $4, coalesce($5::jsonb, '[]'::jsonb), coalesce($6, 0), $7, $8, $9::jsonb, coalesce($10, 'scoring')) returning *`,
    [req.params.competitionId, b.name, b.name_en ?? null, b.description ?? null,
     b.criteria ? JSON.stringify(b.criteria) : null, b.order_index, b.scoring_method ?? null,
     b.time_limit_seconds ?? null, b.bonus_config ? JSON.stringify(b.bonus_config) : null, b.content_format ?? null]
  );
  res.json(rows[0]);
}));

// Đổi content_format (Chấm điểm / Đối kháng Fly Smart Cup / Đối kháng Battle of
// Stars) bị khóa nếu nội dung đã có đội, phiếu điểm, hoặc trận đối kháng —
// tránh dữ liệu đã nhập không còn khớp với luồng chấm điểm mới chọn.
router.put('/contents/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, CONTENT_FIELDS);
  if (data.content_format !== undefined) {
    if (!['scoring', 'combat_drone', 'combat_stars'].includes(data.content_format)) {
      return res.status(400).json({ error: 'content_format không hợp lệ.' });
    }
    const { rows: cur } = await query('select content_format from contest_contents where id = $1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Không tìm thấy nội dung thi.' });
    if (cur[0].content_format !== data.content_format) {
      const { rows: hasTeams } = await query('select 1 from teams where contest_content_id = $1 limit 1', [req.params.id]);
      const { rows: hasScores } = await query('select 1 from scores where contest_content_id = $1 limit 1', [req.params.id]);
      const { rows: hasCombat } = await query('select 1 from combat_matches where contest_content_id = $1 limit 1', [req.params.id]);
      if (hasTeams[0] || hasScores[0] || hasCombat[0]) {
        return res.status(400).json({ error: 'Không thể đổi định dạng chấm điểm vì nội dung này đã có đội/phiếu điểm/trận đấu.' });
      }
    }
  }
  if (data.criteria !== undefined) data.criteria = JSON.stringify(data.criteria);
  if (data.bonus_config !== undefined) data.bonus_config = data.bonus_config === null ? null : JSON.stringify(data.bonus_config);
  const q = buildUpdate('contest_contents', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/contents/:id', requireAdmin, h(async (req, res) => {
  await query('delete from contest_contents where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// Areas
// ============================================================
router.get('/contents/:contentId/areas', h(async (req, res) => {
  const { rows } = await query(
    'select * from areas where contest_content_id = $1 order by order_index',
    [req.params.contentId]
  );
  res.json(rows);
}));

router.get('/areas', h(async (_req, res) => {
  const { rows } = await query(
    `select a.*,
       json_build_object('name', cc.name, 'competitions',
         json_build_object('id', comp.id, 'name', comp.name)) as contest_contents
     from areas a
     left join contest_contents cc on cc.id = a.contest_content_id
     left join competitions comp on comp.id = cc.competition_id
     order by a.order_index`
  );
  res.json(rows);
}));

router.get('/areas/:id', h(async (req, res) => {
  const { rows } = await query('select * from areas where id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy khu vực.' });
  res.json(rows[0]);
}));

router.post('/contents/:contentId/areas', requireAdmin, h(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `insert into areas (contest_content_id, competition_id, name, region, order_index)
     values ($1, $2, $3, coalesce($4, 'bac'), coalesce($5, 0)) returning *`,
    [req.params.contentId, b.competition_id ?? null, b.name, b.region, b.order_index]
  );
  res.json(rows[0]);
}));

router.put('/areas/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['name', 'region', 'order_index', 'competition_id']);
  const q = buildUpdate('areas', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/areas/:id', requireAdmin, h(async (req, res) => {
  await query('delete from areas where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// Boards — 5 bảng cố định toàn hệ thống (Bảng A-E theo độ tuổi, xem
// db/schema.sql). KHÔNG tạo/sửa/xóa bảng ở đây — nội dung thi chỉ "thêm"
// (content_boards) các bảng có sẵn vào nội dung của mình.
// ============================================================
router.get('/boards', h(async (_req, res) => {
  const { rows } = await query('select * from boards order by order_index, name');
  res.json(rows);
}));

// Các bảng đã được thêm vào 1 nội dung thi cụ thể (kèm ranking_format để FE
// biết bảng nào chấm theo nhiệm vụ, bảng nào là đối kháng)
router.get('/contents/:contentId/boards', h(async (req, res) => {
  const { rows } = await query(
    `select b.*, cb.ranking_format from content_boards cb
     join boards b on b.id = cb.board_id
     where cb.contest_content_id = $1
     order by b.order_index, b.name`,
    [req.params.contentId]
  );
  res.json(rows);
}));

// Thêm 1 bảng (có sẵn) vào nội dung thi
router.post('/contents/:contentId/boards', requireAdmin, h(async (req, res) => {
  const { board_id } = req.body || {};
  if (!board_id) return res.status(400).json({ error: 'Thiếu board_id.' });
  await query(
    `insert into content_boards (contest_content_id, board_id) values ($1, $2)
     on conflict (contest_content_id, board_id) do nothing`,
    [req.params.contentId, board_id]
  );
  const { rows } = await query('select * from boards where id = $1', [board_id]);
  res.json(rows[0]);
}));

// Bỏ 1 bảng khỏi nội dung thi (không xóa bảng gốc)
router.delete('/contents/:contentId/boards/:boardId', requireAdmin, h(async (req, res) => {
  await query(
    'delete from content_boards where contest_content_id = $1 and board_id = $2',
    [req.params.contentId, req.params.boardId]
  );
  res.json({ ok: true });
}));

// Đặt luật xếp hạng (đo lường / đối kháng) cho 1 (nội dung × bảng đấu).
// Khóa lại không cho đổi nếu đã có phiếu điểm hoặc trận đấu cho cặp này.
router.put('/contents/:contentId/boards/:boardId', requireAdmin, h(async (req, res) => {
  const { ranking_format } = req.body || {};
  if (!['measurement', 'combat'].includes(ranking_format)) {
    return res.status(400).json({ error: 'ranking_format phải là "measurement" hoặc "combat".' });
  }
  const { rows: cb } = await query(
    'select ranking_format from content_boards where contest_content_id = $1 and board_id = $2',
    [req.params.contentId, req.params.boardId]
  );
  if (!cb[0]) return res.status(404).json({ error: 'Bảng này chưa được thêm vào nội dung thi.' });
  if (cb[0].ranking_format !== ranking_format) {
    const { rows: hasScores } = await query(
      `select 1 from scores s join teams t on t.id = s.team_id
       where s.contest_content_id = $1 and t.board_id = $2 limit 1`,
      [req.params.contentId, req.params.boardId]
    );
    const { rows: hasMatches } = await query(
      'select 1 from matches where contest_content_id = $1 and board_id = $2 limit 1',
      [req.params.contentId, req.params.boardId]
    );
    if (hasScores[0] || hasMatches[0]) {
      return res.status(400).json({ error: 'Không thể đổi luật xếp hạng vì (nội dung × bảng) này đã có phiếu điểm hoặc trận đấu.' });
    }
  }
  const { rows } = await query(
    `update content_boards set ranking_format = $1
     where contest_content_id = $2 and board_id = $3 returning *`,
    [ranking_format, req.params.contentId, req.params.boardId]
  );
  res.json(rows[0]);
}));

// ============================================================
// Students (cần đăng nhập — chứa thông tin cá nhân)
// ============================================================
router.get('/students', requireAuth, h(async (_req, res) => {
  const { rows } = await query(
    `select st.*, ${SCHOOLS_JSON} as schools
     from students st
     left join schools sch on sch.id = st.school_id
     order by st.created_at desc`
  );
  res.json(rows);
}));

router.post('/students', requireAdmin, h(async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `insert into students (full_name, gender, birth_date, school_id, grade)
     values ($1, $2, $3, $4, $5) returning *`,
    [b.full_name, b.gender ?? null, b.birth_date ?? null, b.school_id ?? null, b.grade ?? null]
  );
  res.json(rows[0]);
}));

router.put('/students/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['full_name', 'gender', 'birth_date', 'school_id', 'grade']);
  const q = buildUpdate('students', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/students/:id', requireAdmin, h(async (req, res) => {
  await query('delete from students where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Nhập hàng loạt từ Excel — cột "Tên trường" resolve theo tên (không phân
// biệt hoa/thường), tự tạo trường mới (level mặc định THPT) nếu chưa có,
// giống pattern quick-add trong AdminTeams.jsx. Bỏ qua nếu đã có học sinh
// trùng (họ tên + trường).
router.post('/students/import', requireAdmin, h(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  const result = await bulkImport(rows, async (row) => {
    if (!row.full_name) throw new Error('Thiếu Họ và tên.');
    let schoolId = null;
    if (row.school_name) {
      const { rows: existing } = await query('select id from schools where lower(name) = lower($1) limit 1', [row.school_name]);
      if (existing[0]) {
        schoolId = existing[0].id;
      } else {
        const { rows: created } = await query(
          "insert into schools (name, level, source) values ($1, 'THPT', 'import') returning id",
          [row.school_name]
        );
        schoolId = created[0].id;
      }
    }
    const { rows: dup } = await query(
      'select 1 from students where lower(full_name) = lower($1) and coalesce(school_id::text,\'\') = coalesce($2::text,\'\') limit 1',
      [row.full_name, schoolId]
    );
    if (dup[0]) return { skipped: true };
    await query(
      'insert into students (full_name, gender, birth_date, school_id, grade) values ($1, $2, $3, $4, $5)',
      [row.full_name, row.gender || null, row.birth_date || null, schoolId, row.grade || null]
    );
    return {};
  });
  res.json(result);
}));

// ============================================================
// Teams
// ============================================================
// SQL fragment: nested boards {id, name, age_group}
const BOARDS_JSON = `case when bd.id is null then null
  else json_build_object('id', bd.id, 'name', bd.name, 'age_group', bd.age_group) end`;
// SQL fragment: nested coaches {id, name, phone}
const COACHES_JSON = `case when co.id is null then null
  else json_build_object('id', co.id, 'name', co.name, 'phone', co.phone) end`;
// SQL fragment: nested fields {id, name}
const FIELDS_JSON = `case when fl.id is null then null
  else json_build_object('id', fl.id, 'name', fl.name) end`;

router.get('/contents/:contentId/teams', h(async (req, res) => {
  // Trọng tài đã được gán bảng đấu cụ thể → chỉ thấy đội thuộc các bảng đó.
  // Chưa được gán bảng nào (mảng rỗng) → coi như chưa giới hạn, thấy tất cả.
  let assignedBoardIds = null;
  if (req.user?.role === 'referee') {
    const { rows: rb } = await query('select board_id from referee_boards where referee_id = $1', [req.user.id]);
    if (rb.length) assignedBoardIds = rb.map((r) => r.board_id);
  }
  const { rows } = await query(
    `select t.*, ${SCHOOLS_JSON} as schools, ${BOARDS_JSON} as boards, ${COACHES_JSON} as coaches, ${FIELDS_JSON} as fields
     from teams t
     left join schools sch on sch.id = t.school_id
     left join boards bd on bd.id = t.board_id
     left join coaches co on co.id = t.coach_id
     left join fields fl on fl.id = t.field_id
     where t.contest_content_id = $1
       ${assignedBoardIds ? 'and t.board_id = any($2::uuid[])' : ''}
     order by t.order_index`,
    assignedBoardIds ? [req.params.contentId, assignedBoardIds] : [req.params.contentId]
  );
  res.json(rows);
}));

router.get('/teams', h(async (_req, res) => {
  const { rows } = await query(
    `select t.*, ${SCHOOLS_JSON} as schools, ${BOARDS_JSON} as boards, ${COACHES_JSON} as coaches, ${FIELDS_JSON} as fields,
       json_build_object('name', cc.name, 'competitions', json_build_object('name', comp.name)) as contest_contents
     from teams t
     left join schools sch on sch.id = t.school_id
     left join boards bd on bd.id = t.board_id
     left join coaches co on co.id = t.coach_id
     left join fields fl on fl.id = t.field_id
     left join contest_contents cc on cc.id = t.contest_content_id
     left join competitions comp on comp.id = cc.competition_id
     order by t.order_index`
  );
  res.json(rows);
}));

const TEAM_FIELDS = ['name', 'student_ids', 'school_id', 'area_id', 'board_id', 'coach_id', 'field_id', 'region', 'order_index'];

router.post('/contents/:contentId/teams', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, TEAM_FIELDS);
  const { rows } = await query(
    `insert into teams (contest_content_id, name, student_ids, school_id, area_id, board_id, coach_id, field_id, region, order_index)
     values ($1, $2, coalesce($3::uuid[], '{}'::uuid[]), $4, $5, $6, $7, $8, coalesce($9, 'bac'), coalesce($10, 0)) returning *`,
    [req.params.contentId, b.name, b.student_ids ?? null, b.school_id ?? null, b.area_id ?? null, b.board_id ?? null, b.coach_id ?? null, b.field_id ?? null, b.region, b.order_index]
  );
  res.json(rows[0]);
}));

router.put('/teams/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, TEAM_FIELDS);
  const q = buildUpdate('teams', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/teams/:id', requireAdmin, h(async (req, res) => {
  await query('delete from teams where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// Scores
// ============================================================

// SQL fragment: 1 dòng scores + teams(*, schools) + users(full_name)
const SCORE_NESTED = `
  select s.*,
    (to_jsonb(t.*) || jsonb_build_object('schools', ${SCHOOLS_JSON.replace(/\n/g, ' ')}, 'coaches', ${COACHES_JSON.replace(/\n/g, ' ')}, 'fields', ${FIELDS_JSON.replace(/\n/g, ' ')})) as teams,
    case when u.id is null then null else json_build_object('full_name', u.full_name) end as users,
    case when cc.id is null then null else json_build_object('name', cc.name) end as contest_contents,
    case when bd.id is null then null else json_build_object('id', bd.id, 'name', bd.name, 'age_group', bd.age_group) end as boards
  from scores s
  left join teams t on t.id = s.team_id
  left join schools sch on sch.id = t.school_id
  left join boards bd on bd.id = t.board_id
  left join coaches co on co.id = t.coach_id
  left join fields fl on fl.id = t.field_id
  left join users u on u.id = s.referee_id
  left join contest_contents cc on cc.id = s.contest_content_id
`;

router.get('/scoreboard/:contentId', h(async (req, res) => {
  const { rows } = await query(
    `${SCORE_NESTED} where s.contest_content_id = $1 order by s.score desc`,
    [req.params.contentId]
  );
  res.json(rows);
}));

router.get('/teams/:teamId/scores', h(async (req, res) => {
  const { rows } = await query(
    `${SCORE_NESTED} where s.team_id = $1`,
    [req.params.teamId]
  );
  res.json(rows);
}));

router.get('/students/:studentId/scores', requireAuth, h(async (req, res) => {
  const { rows: teams } = await query(
    `select t.id, t.name, json_build_object('name', cc.name) as contest_contents
     from teams t
     left join contest_contents cc on cc.id = t.contest_content_id
     where t.student_ids @> array[$1]::uuid[]`,
    [req.params.studentId]
  );
  if (!teams.length) return res.json([]);
  const { rows: scores } = await query(
    `${SCORE_NESTED} where s.team_id = any($1::uuid[]) order by s.submitted_at desc`,
    [teams.map((t) => t.id)]
  );
  res.json(scores.map((s) => ({ ...s, team: teams.find((t) => t.id === s.team_id) })));
}));

router.get('/scores', h(async (req, res) => {
  const cond = [];
  const vals = [];
  const add = (sql, v) => { vals.push(v); cond.push(sql.replace('?', `$${vals.length}`)); };
  if (req.query.refereeId) add('s.referee_id = ?', req.query.refereeId);
  if (req.query.contestContentId) add('s.contest_content_id = ?', req.query.contestContentId);
  if (req.query.teamId) add('s.team_id = ?', req.query.teamId);
  const where = cond.length ? `where ${cond.join(' and ')}` : '';
  const { rows } = await query(`${SCORE_NESTED} ${where} order by s.submitted_at desc`, vals);
  res.json(rows);
}));

router.get('/scores/:id', h(async (req, res) => {
  const { rows } = await query(`${SCORE_NESTED} where s.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy phiếu chấm.' });
  res.json(rows[0]);
}));

router.post('/scores', requireAuth, h(async (req, res) => {
  const b = req.body;
  const round = Number(b.round) === 2 ? 2 : 1;
  // Referee chỉ được chấm dưới tên chính mình; admin được chỉ định referee_id bất kỳ
  const refereeId = req.user.role === 'admin' ? (b.referee_id ?? null) : req.user.id;

  // Nếu referee đã được gán bảng đấu cụ thể, chỉ cho chấm đội thuộc bảng đó
  if (req.user.role !== 'admin') {
    const { rows: assigned } = await query('select board_id from referee_boards where referee_id = $1', [req.user.id]);
    if (assigned.length) {
      const { rows: teamRows } = await query('select board_id from teams where id = $1', [b.team_id]);
      const teamBoardId = teamRows[0]?.board_id;
      const allowed = teamBoardId && assigned.some((a) => a.board_id === teamBoardId);
      if (!allowed) {
        return res.status(403).json({ error: 'Bạn không được phân quyền chấm điểm đội thuộc bảng đấu này.' });
      }
    }
  }

  // Mỗi đội có tối đa 2 phiếu / nội dung (lượt 1 + lượt 2) — nếu lượt này đã
  // có phiếu, trả 409 kèm id (trọng tài không được sửa lại sau khi gửi;
  // chỉ admin mới sửa được).
  const { rows: dup } = await query(
    'select id, referee_id from scores where team_id = $1 and contest_content_id = $2 and round = $3',
    [b.team_id, b.contest_content_id, round]
  );
  if (dup[0]) {
    return res.status(409).json({
      error: `Đội này đã có phiếu điểm lượt ${round} cho nội dung này.`,
      existing_id: dup[0].id,
    });
  }

  const { rows } = await query(
    `insert into scores (team_id, contest_content_id, referee_id, score, time, round, retry_count, bonus_points, criteria_scores, notes, arena_entry_time, head_referee_name, scorekeeper_name, objection)
     values ($1, $2, $3, coalesce($4, 0), $5, $6, coalesce($7, 0), coalesce($8, 0), coalesce($9::jsonb, '{}'::jsonb), $10, $11, $12, $13, $14) returning *`,
    [b.team_id, b.contest_content_id, refereeId, Number(b.score) || 0, b.time ?? null,
     round, b.retry_count ?? null, b.bonus_points ?? null,
     b.criteria_scores ? JSON.stringify(b.criteria_scores) : null, b.notes ?? null,
     b.arena_entry_time ?? null, b.head_referee_name ?? null, b.scorekeeper_name ?? null, b.objection ?? null]
  );
  res.json(rows[0]);
}));

// Chỉ admin được sửa phiếu chấm — trọng tài KHÔNG được sửa sau khi đã gửi
// (tránh chỉnh sửa điểm sau khi phiếu đã nộp, cần admin can thiệp nếu chấm nhầm).
// Mỗi lần sửa được ghi lại vào score_edits (ai sửa, lúc nào, trước/sau) trong
// cùng 1 transaction với UPDATE để không bao giờ mất log.
router.put('/scores/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, [
    'team_id', 'contest_content_id', 'referee_id', 'score', 'time', 'round', 'retry_count', 'bonus_points',
    'criteria_scores', 'notes', 'arena_entry_time', 'head_referee_name', 'scorekeeper_name', 'objection',
  ]);
  if (data.criteria_scores !== undefined) data.criteria_scores = JSON.stringify(data.criteria_scores);
  if (data.score !== undefined) data.score = Number(data.score) || 0;
  const keys = Object.keys(data);

  const result = await withTransaction(async (tx) => {
    const { rows: existing } = await tx('select * from scores where id = $1', [req.params.id]);
    if (!existing[0]) return null;
    if (keys.length === 0) return existing[0];
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const { rows: updated } = await tx(
      `update scores set ${sets} where id = $${keys.length + 1} returning *`,
      [...keys.map((k) => data[k]), req.params.id]
    );
    const after = updated[0];
    await tx(
      `insert into score_edits (score_id, round, edited_by, before_data, after_data)
       values ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [after.id, after.round, req.user.id, JSON.stringify(existing[0]), JSON.stringify(after)]
    );
    return after;
  });

  if (!result) return res.status(404).json({ error: 'Không tìm thấy phiếu chấm.' });
  res.json(result);
}));

// Lịch sử sửa điểm của 1 phiếu — ai sửa, lúc nào, trước/sau
router.get('/scores/:id/edits', requireAdmin, h(async (req, res) => {
  const { rows } = await query(
    `select se.*, case when u.id is null then null else json_build_object('full_name', u.full_name) end as users
     from score_edits se
     left join users u on u.id = se.edited_by
     where se.score_id = $1
     order by se.edited_at desc`,
    [req.params.id]
  );
  res.json(rows);
}));

router.delete('/scores/:id', requireAdmin, h(async (req, res) => {
  await query('delete from scores where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// Xếp hạng gộp 2 lượt (đo lường) + Đối kháng (nhánh đấu loại trực tiếp)
// ============================================================

// Bảng đo lường: điểm cao nhất → thời gian ngắn nhất → ít chạy lại hơn →
// điểm 1 lượt cao nhất trong 2 lượt cao hơn. Nếu vẫn hòa hết ở cả 4 tiêu chí
// → needs_playoff = true (cần chạy thử để phân định, hệ thống không tự quyết).
router.get('/contents/:contentId/boards/:boardId/ranking', h(async (req, res) => {
  const { contentId, boardId } = req.params;
  const { rows: cbRows } = await query(
    'select ranking_format from content_boards where contest_content_id = $1 and board_id = $2',
    [contentId, boardId]
  );
  const rankingFormat = cbRows[0]?.ranking_format || 'measurement';

  if (rankingFormat === 'combat') {
    const bracket = await getBracketWithPlacement(contentId, boardId);
    return res.json({ ranking_format: 'combat', ...bracket });
  }

  const { rows: scores } = await query(
    `select s.id, s.team_id, s.round, s.score, s.time, s.retry_count, s.submitted_at, t.name as team_name
     from scores s
     join teams t on t.id = s.team_id
     where s.contest_content_id = $1 and t.board_id = $2`,
    [contentId, boardId]
  );

  const byTeam = new Map();
  for (const s of scores) {
    if (!byTeam.has(s.team_id)) byTeam.set(s.team_id, { team_id: s.team_id, team_name: s.team_name, rounds: {} });
    byTeam.get(s.team_id).rounds[s.round] = s;
  }

  const teams = Array.from(byTeam.values()).map((t) => {
    const present = [t.rounds[1], t.rounds[2]].filter(Boolean);
    const scoreVals = present.map((r) => Number(r.score) || 0);
    const timeVals = present.map((r) => Number(r.time) || 0);
    const retryVals = present.map((r) => Number(r.retry_count) || 0);
    return {
      team_id: t.team_id,
      team_name: t.team_name,
      round1: t.rounds[1] || null,
      round2: t.rounds[2] || null,
      rounds_done: present.length,
      total_score: scoreVals.reduce((a, b) => a + b, 0),
      total_time: timeVals.reduce((a, b) => a + b, 0),
      total_retry: retryVals.reduce((a, b) => a + b, 0),
      best_round_score: scoreVals.length ? Math.max(...scoreVals) : 0,
    };
  });

  teams.sort((a, b) =>
    b.total_score - a.total_score
    || a.total_time - b.total_time
    || a.total_retry - b.total_retry
    || b.best_round_score - a.best_round_score
  );

  // Đánh dấu các đội hòa hoàn toàn ở cả 4 tiêu chí với đội đứng ngay trên/dưới
  for (let i = 1; i < teams.length; i++) {
    const prev = teams[i - 1];
    const cur = teams[i];
    const tied = prev.total_score === cur.total_score
      && prev.total_time === cur.total_time
      && prev.total_retry === cur.total_retry
      && prev.best_round_score === cur.best_round_score;
    if (tied) { prev.needs_playoff = true; cur.needs_playoff = true; }
  }

  res.json({ ranking_format: 'measurement', teams });
}));

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Đọc toàn bộ nhánh đấu + tính thứ hạng (chỉ tính cho đội đã bị loại; đội
// chưa thua thì chưa có hạng — nhánh chưa xong).
async function getBracketWithPlacement(contentId, boardId) {
  const { rows: matches } = await query(
    `select m.*, ta.name as team_a_name, tb.name as team_b_name, tw.name as winner_name
     from matches m
     left join teams ta on ta.id = m.team_a_id
     left join teams tb on tb.id = m.team_b_id
     left join teams tw on tw.id = m.winner_id
     where m.contest_content_id = $1 and m.board_id = $2
     order by m.round_no, m.bracket_slot`,
    [contentId, boardId]
  );
  if (!matches.length) return { matches: [], placements: [], bracket_resolved: false };

  const maxRound = Math.max(...matches.map((m) => m.round_no));
  const bracketSize = matches.filter((m) => m.round_no === 1).length * 2;

  const placements = [];
  for (const m of matches) {
    if (!m.winner_id || m.is_draw) continue;
    const loserId = m.winner_id === m.team_a_id ? m.team_b_id : m.team_a_id;
    if (!loserId) continue; // bye — không có người thua thật
    placements.push({ team_id: loserId, rank: Math.floor(bracketSize / Math.pow(2, m.round_no)) + 1 });
  }
  const finalMatch = matches.find((m) => m.round_no === maxRound);
  const resolved = !!(finalMatch?.winner_id && !finalMatch.is_draw);
  if (resolved) placements.push({ team_id: finalMatch.winner_id, rank: 1 });
  placements.sort((a, b) => a.rank - b.rank);

  return { matches, placements, bracket_resolved: resolved };
}

router.get('/contents/:contentId/boards/:boardId/bracket', h(async (req, res) => {
  res.json(await getBracketWithPlacement(req.params.contentId, req.params.boardId));
}));

// Tạo nhánh đấu loại trực tiếp, bốc thăm ngẫu nhiên. Bye (đội lẻ, không đủ
// cặp) được xử lý ở CẤP CẶP ĐẤU (chọn ngẫu nhiên cặp nào được miễn đấu vòng 1)
// chứ không random ở cấp từng đội — tránh trường hợp 2 đội "bye" vô tình gặp
// nhau. Toàn bộ khung các vòng sau được tạo rỗng sẵn luôn, "tiến vòng" sau
// này chỉ là 1 UPDATE và không cần logic sinh nhánh động lại.
router.post('/contents/:contentId/boards/:boardId/bracket/generate', requireAdmin, h(async (req, res) => {
  const { contentId, boardId } = req.params;
  const { rows: teams } = await query(
    'select id from teams where contest_content_id = $1 and board_id = $2',
    [contentId, boardId]
  );
  if (teams.length < 2) {
    return res.status(400).json({ error: 'Cần ít nhất 2 đội trong bảng này để tạo nhánh đấu.' });
  }
  const { rows: existing } = await query(
    'select 1 from matches where contest_content_id = $1 and board_id = $2 limit 1',
    [contentId, boardId]
  );
  if (existing[0]) {
    return res.status(400).json({ error: 'Nhánh đấu đã tồn tại — xóa nhánh cũ trước khi tạo lại.' });
  }

  const teamIds = teams.map((t) => t.id);
  for (let i = teamIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
  }

  const bracketSize = nextPow2(teamIds.length);
  const pairs = bracketSize / 2;
  const byes = bracketSize - teamIds.length;
  const totalRounds = Math.log2(bracketSize);

  const pairIndexes = Array.from({ length: pairs }, (_, i) => i);
  for (let i = pairIndexes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairIndexes[i], pairIndexes[j]] = [pairIndexes[j], pairIndexes[i]];
  }
  const byePairSet = new Set(pairIndexes.slice(0, byes));

  await withTransaction(async (tx) => {
    let cursor = 0;
    const round1 = [];
    for (let slot = 0; slot < pairs; slot++) {
      if (byePairSet.has(slot)) {
        const teamA = teamIds[cursor++];
        round1.push({ slot, teamA, teamB: null, winner: teamA, bye: true });
      } else {
        const teamA = teamIds[cursor++];
        const teamB = teamIds[cursor++];
        round1.push({ slot, teamA, teamB, winner: null, bye: false });
      }
    }
    for (const m of round1) {
      await tx(
        `insert into matches (contest_content_id, board_id, round_no, bracket_slot, team_a_id, team_b_id, winner_id, played_at, notes)
         values ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
        [contentId, boardId, m.slot, m.teamA, m.teamB, m.winner, m.bye ? new Date() : null, m.bye ? 'bye' : null]
      );
    }
    for (let r = 2; r <= totalRounds; r++) {
      const slotsInRound = bracketSize / Math.pow(2, r);
      for (let slot = 0; slot < slotsInRound; slot++) {
        await tx(
          `insert into matches (contest_content_id, board_id, round_no, bracket_slot)
           values ($1, $2, $3, $4)`,
          [contentId, boardId, r, slot]
        );
      }
    }
    // Đội được bye vòng 1 tự động tiến vào vòng 2 luôn
    for (const m of round1) {
      if (!m.bye) continue;
      const nextSlot = Math.floor(m.slot / 2);
      const col = m.slot % 2 === 0 ? 'team_a_id' : 'team_b_id';
      await tx(
        `update matches set ${col} = $1 where contest_content_id = $2 and board_id = $3 and round_no = 2 and bracket_slot = $4`,
        [m.winner, contentId, boardId, nextSlot]
      );
    }
  });

  res.json(await getBracketWithPlacement(contentId, boardId));
}));

router.delete('/contents/:contentId/boards/:boardId/bracket', requireAdmin, h(async (req, res) => {
  const { contentId, boardId } = req.params;
  if (req.query.force !== '1') {
    const { rows: played } = await query(
      'select 1 from matches where contest_content_id = $1 and board_id = $2 and played_at is not null limit 1',
      [contentId, boardId]
    );
    if (played[0]) {
      return res.status(400).json({ error: 'Nhánh đấu đã có trận diễn ra — thêm ?force=1 nếu chắc chắn muốn xóa hết và tạo lại.' });
    }
  }
  await query('delete from matches where contest_content_id = $1 and board_id = $2', [contentId, boardId]);
  res.json({ ok: true });
}));

// Xóa (set null) kết quả các trận vòng sau đã được "tiến" từ 1 trận bị sửa
// lại kết quả — đệ quy tiếp nếu trận vòng sau đó cũng đã có kết quả.
async function clearDownstream(tx, contentId, boardId, match) {
  const { rows: totalRows } = await tx(
    'select max(round_no) as max_round from matches where contest_content_id = $1 and board_id = $2',
    [contentId, boardId]
  );
  const maxRound = totalRows[0]?.max_round || match.round_no;
  if (match.round_no >= maxRound) return;
  const nextSlot = Math.floor(match.bracket_slot / 2);
  const col = match.bracket_slot % 2 === 0 ? 'team_a_id' : 'team_b_id';
  const { rows: nextRows } = await tx(
    'select * from matches where contest_content_id = $1 and board_id = $2 and round_no = $3 and bracket_slot = $4',
    [contentId, boardId, match.round_no + 1, nextSlot]
  );
  const nextMatch = nextRows[0];
  if (!nextMatch) return;
  if (nextMatch.winner_id) await clearDownstream(tx, contentId, boardId, nextMatch);
  await tx(
    `update matches set ${col} = null, winner_id = null, is_draw = false, played_at = null where id = $1`,
    [nextMatch.id]
  );
}

// Ghi kết quả 1 trận (admin, hoặc trọng tài được phân quyền bảng đó qua
// referee_boards). Sửa lại kết quả 1 trận đã từng tiến vòng sẽ cascade xóa
// các trận vòng sau bị ảnh hưởng để tránh dữ liệu nhánh sai lệch.
router.put('/matches/:id/result', requireAuth, h(async (req, res) => {
  const { rows: mRows } = await query('select * from matches where id = $1', [req.params.id]);
  const match = mRows[0];
  if (!match) return res.status(404).json({ error: 'Không tìm thấy trận đấu.' });
  if (!match.team_a_id || !match.team_b_id) {
    return res.status(400).json({ error: 'Trận này chưa đủ 2 đội, không thể nhập kết quả.' });
  }

  if (req.user.role !== 'admin') {
    const { rows: assigned } = await query('select board_id from referee_boards where referee_id = $1', [req.user.id]);
    if (assigned.length && !assigned.some((a) => a.board_id === match.board_id)) {
      return res.status(403).json({ error: 'Bạn không được phân quyền ghi kết quả bảng đấu này.' });
    }
  }

  const { winner_id, is_draw } = req.body || {};
  if (!is_draw && winner_id !== match.team_a_id && winner_id !== match.team_b_id) {
    return res.status(400).json({ error: 'winner_id phải là 1 trong 2 đội của trận.' });
  }

  await withTransaction(async (tx) => {
    if (match.winner_id) await clearDownstream(tx, match.contest_content_id, match.board_id, match);
    await tx(
      'update matches set winner_id = $1, is_draw = $2, played_at = now() where id = $3',
      [is_draw ? null : winner_id, !!is_draw, match.id]
    );
    if (!is_draw) {
      const { rows: totalRows } = await tx(
        'select max(round_no) as max_round from matches where contest_content_id = $1 and board_id = $2',
        [match.contest_content_id, match.board_id]
      );
      const maxRound = totalRows[0]?.max_round || match.round_no;
      if (match.round_no < maxRound) {
        const nextSlot = Math.floor(match.bracket_slot / 2);
        const col = match.bracket_slot % 2 === 0 ? 'team_a_id' : 'team_b_id';
        await tx(
          `update matches set ${col} = $1 where contest_content_id = $2 and board_id = $3 and round_no = $4 and bracket_slot = $5`,
          [winner_id, match.contest_content_id, match.board_id, match.round_no + 1, nextSlot]
        );
      }
    }
  });

  const { rows: updated } = await query('select * from matches where id = $1', [req.params.id]);
  res.json(updated[0]);
}));

// ============================================================
// Trận đối kháng (combat_matches) — riêng cho content_format =
// 'combat_drone' (Fly Smart Cup) / 'combat_stars' (Battle of Stars).
// Admin tự tạo từng trận thủ công (không bốc thăm tự động) — xem
// db/schema.sql để biết vì sao (vòng bảng round-robin không khớp thuật
// toán nhánh lũy thừa 2 của `matches`).
// ============================================================
const COMBAT_MATCH_NESTED = `
  select cm.*,
    case when ta.id is null then null else json_build_object('id', ta.id, 'name', ta.name) end as team_a,
    case when tb.id is null then null else json_build_object('id', tb.id, 'name', tb.name) end as team_b,
    case when bd.id is null then null else json_build_object('id', bd.id, 'name', bd.name) end as boards
  from combat_matches cm
  left join teams ta on ta.id = cm.team_a_id
  left join teams tb on tb.id = cm.team_b_id
  left join boards bd on bd.id = cm.board_id
`;

router.get('/contents/:contentId/combat-matches', h(async (req, res) => {
  let assignedBoardIds = null;
  if (req.user?.role === 'referee') {
    const { rows: rb } = await query('select board_id from referee_boards where referee_id = $1', [req.user.id]);
    if (rb.length) assignedBoardIds = rb.map((r) => r.board_id);
  }
  const { rows } = await query(
    `${COMBAT_MATCH_NESTED}
     where cm.contest_content_id = $1
       ${assignedBoardIds ? 'and cm.board_id = any($2::uuid[])' : ''}
     order by cm.created_at`,
    assignedBoardIds ? [req.params.contentId, assignedBoardIds] : [req.params.contentId]
  );
  res.json(rows);
}));

const COMBAT_MATCH_FIELDS = [
  'board_id', 'stage', 'group_label', 'match_no',
  'team_a_id', 'team_b_id', 'team_a_no', 'team_b_no',
  'winner_id', 'is_draw', 'details', 'notes',
];

router.post('/contents/:contentId/combat-matches', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, COMBAT_MATCH_FIELDS);
  const { rows } = await query(
    `insert into combat_matches (contest_content_id, board_id, stage, group_label, match_no, team_a_id, team_b_id, team_a_no, team_b_no, details)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::jsonb, '{}'::jsonb)) returning *`,
    [req.params.contentId, b.board_id ?? null, b.stage ?? null, b.group_label ?? null, b.match_no ?? null,
     b.team_a_id ?? null, b.team_b_id ?? null, b.team_a_no ?? null, b.team_b_no ?? null,
     b.details ? JSON.stringify(b.details) : null]
  );
  res.json(rows[0]);
}));

// Sửa chi tiết trận (admin, hoặc trọng tài được phân quyền board đó qua
// referee_boards) — nhập điểm/hiệp/luân lưu (drone) hoặc điểm task 2 đội
// (stars), ghi thắng/thua/hòa.
router.put('/combat-matches/:id', requireAuth, h(async (req, res) => {
  const { rows: mRows } = await query('select * from combat_matches where id = $1', [req.params.id]);
  const match = mRows[0];
  if (!match) return res.status(404).json({ error: 'Không tìm thấy trận đấu.' });

  if (req.user.role !== 'admin') {
    const { rows: assigned } = await query('select board_id from referee_boards where referee_id = $1', [req.user.id]);
    if (assigned.length && !assigned.some((a) => a.board_id === match.board_id)) {
      return res.status(403).json({ error: 'Bạn không được phân quyền ghi kết quả bảng đấu này.' });
    }
  }

  const data = pick(req.body, COMBAT_MATCH_FIELDS);
  if (data.details !== undefined) data.details = JSON.stringify(data.details ?? {});
  if (data.winner_id !== undefined || data.is_draw !== undefined) data.played_at = new Date();
  const q = buildUpdate('combat_matches', req.params.id, data);
  if (!q) return res.json(match);
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/contents/:contentId/combat-matches/:id', requireAdmin, h(async (req, res) => {
  await query('delete from combat_matches where id = $1 and contest_content_id = $2', [req.params.id, req.params.contentId]);
  res.json({ ok: true });
}));

// ============================================================
// Huấn luyện viên (HLV)
// ============================================================
router.get('/coaches', h(async (_req, res) => {
  const { rows } = await query('select * from coaches order by name');
  res.json(rows);
}));

router.post('/coaches', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, ['name', 'phone', 'email', 'notes']);
  const { rows } = await query(
    'insert into coaches (name, phone, email, notes) values ($1, $2, $3, $4) returning *',
    [b.name, b.phone ?? null, b.email ?? null, b.notes ?? null]
  );
  res.json(rows[0]);
}));

router.put('/coaches/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['name', 'phone', 'email', 'notes']);
  const q = buildUpdate('coaches', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/coaches/:id', requireAdmin, h(async (req, res) => {
  await query('delete from coaches where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Nhập hàng loạt từ Excel — bỏ qua trùng (tên + SĐT), không có unique
// constraint sẵn nên tự SELECT kiểm tra trước.
router.post('/coaches/import', requireAdmin, h(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  const result = await bulkImport(rows, async (row) => {
    if (!row.name) throw new Error('Thiếu Tên HLV.');
    const { rows: dup } = await query(
      'select 1 from coaches where lower(name) = lower($1) and coalesce(phone,\'\') = coalesce($2,\'\') limit 1',
      [row.name, row.phone || null]
    );
    if (dup[0]) return { skipped: true };
    await query(
      'insert into coaches (name, phone, email, notes) values ($1, $2, $3, $4)',
      [row.name, row.phone || null, row.email || null, row.notes || null]
    );
    return {};
  });
  res.json(result);
}));

// ============================================================
// Field (khu vực/trạm thi đấu vật lý) — gán theo đội
// ============================================================
router.get('/fields', h(async (_req, res) => {
  const { rows } = await query('select * from fields order by name');
  res.json(rows);
}));

router.post('/fields', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, ['name', 'notes']);
  const { rows } = await query(
    'insert into fields (name, notes) values ($1, $2) returning *',
    [b.name, b.notes ?? null]
  );
  res.json(rows[0]);
}));

router.put('/fields/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['name', 'notes']);
  const q = buildUpdate('fields', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/fields/:id', requireAdmin, h(async (req, res) => {
  await query('delete from fields where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Nhập hàng loạt từ Excel — bỏ qua trùng tên
router.post('/fields/import', requireAdmin, h(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  const result = await bulkImport(rows, async (row) => {
    if (!row.name) throw new Error('Thiếu Tên Field.');
    const { rows: dup } = await query('select 1 from fields where lower(name) = lower($1) limit 1', [row.name]);
    if (dup[0]) return { skipped: true };
    await query('insert into fields (name, notes) values ($1, $2)', [row.name, row.notes || null]);
    return {};
  });
  res.json(result);
}));

// ============================================================
// Báo cáo — điểm gộp 2 lượt, nhóm theo trường/HLV do frontend tự xử lý
// ============================================================
router.get('/reports/scores', requireAdmin, h(async (req, res) => {
  const { competitionId, contentId } = req.query;
  const cond = [];
  const vals = [];
  if (contentId) { vals.push(contentId); cond.push(`s.contest_content_id = $${vals.length}`); }
  else if (competitionId) { vals.push(competitionId); cond.push(`cc.competition_id = $${vals.length}`); }
  const where = cond.length ? `where ${cond.join(' and ')}` : '';
  const { rows } = await query(
    `select s.id, s.team_id, s.round, s.score, s.time, s.retry_count, s.contest_content_id,
       t.name as team_name, ${SCHOOLS_JSON} as schools, ${COACHES_JSON} as coaches,
       cc.name as content_name, comp.name as competition_name
     from scores s
     join teams t on t.id = s.team_id
     left join schools sch on sch.id = t.school_id
     left join coaches co on co.id = t.coach_id
     join contest_contents cc on cc.id = s.contest_content_id
     join competitions comp on comp.id = cc.competition_id
     ${where}
     order by t.name, s.round`,
    vals
  );
  res.json(rows);
}));

// ============================================================
// Users (quản lý tài khoản — admin)
// ============================================================
router.get('/users', requireAdmin, h(async (req, res) => {
  const vals = [];
  let where = '';
  if (req.query.role) { vals.push(req.query.role); where = 'where role = $1'; }
  const { rows } = await query(
    `select id, email, username, full_name, role, area_id, created_at from users ${where} order by created_at`,
    vals
  );
  res.json(rows);
}));

// Tạo tài khoản trọng tài (thay thế Supabase Edge Function create-referee-user)
router.post('/users/referee', requireAdmin, h(async (req, res) => {
  const { email, password, username, full_name, area_id } = req.body || {};
  if (!email || !password || !username) {
    return res.status(400).json({ error: 'Thiếu email, password hoặc username' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải ít nhất 6 ký tự.' });
  }
  const { rows } = await query(
    `insert into users (email, username, password, full_name, role, area_id)
     values ($1, $2, crypt($3, gen_salt('bf')), $4, 'referee', $5)
     returning id, email, username, full_name, role, area_id`,
    [String(email).trim(), String(username).trim(), String(password), full_name || username, area_id ?? null]
  );
  res.json({ user: rows[0] });
}));

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

// Nhập hàng loạt tài khoản trọng tài từ Excel — username lấy từ phần trước
// @ của email (giống luồng thêm tay). Nếu không có cột mật khẩu, tự sinh
// mật khẩu ngẫu nhiên 8 ký tự và trả về trong `generated` để FE hiện 1 lần
// duy nhất (DB chỉ lưu bcrypt hash, không có cách nào xem lại sau).
router.post('/users/referee/import', requireAdmin, h(async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body.rows || [];
  const result = await bulkImport(rows, async (row) => {
    const email = (row.email || '').trim();
    if (!email) throw new Error('Thiếu Email.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email không hợp lệ.');
    const username = email.split('@')[0];
    const password = row.password && String(row.password).length >= 6 ? String(row.password) : genPassword();
    const fullName = row.full_name || username;

    const { rows: dup } = await query('select 1 from users where username = $1 or email = $2 limit 1', [username, email]);
    if (dup[0]) return { skipped: true };

    await query(
      `insert into users (email, username, password, full_name, role)
       values ($1, $2, crypt($3, gen_salt('bf')), $4, 'referee')`,
      [email, username, password, fullName]
    );
    return row.password ? {} : { generated: { username, password } };
  });
  res.json(result);
}));

router.put('/users/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, ['full_name', 'area_id', 'role']);
  // Đổi mật khẩu: hash lại bằng bcrypt trong DB
  if (req.body.password) {
    const { rows } = await query(
      'update users set password = crypt($1, gen_salt(\'bf\')) where id = $2 returning id',
      [String(req.body.password), req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy user.' });
  }
  const q = buildUpdate('users', req.params.id, data);
  if (!q) {
    const { rows } = await query('select id, email, username, full_name, role, area_id from users where id = $1', [req.params.id]);
    return res.json(rows[0] || {});
  }
  const { rows } = await query(
    q.text.replace('returning *', 'returning id, email, username, full_name, role, area_id'),
    q.values
  );
  res.json(rows[0]);
}));

router.delete('/users/:id', requireAdmin, h(async (req, res) => {
  await query('delete from users where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Bảng đấu mà TÔI (trọng tài đang đăng nhập) được phân quyền — rỗng = chưa giới hạn
router.get('/me/boards', requireAuth, h(async (req, res) => {
  const { rows } = await query('select board_id from referee_boards where referee_id = $1', [req.user.id]);
  res.json(rows.map((r) => r.board_id));
}));

// Phân quyền trọng tài theo bảng đấu (referee_boards) — rỗng = chưa giới hạn
router.get('/users/:id/boards', requireAdmin, h(async (req, res) => {
  const { rows } = await query('select board_id from referee_boards where referee_id = $1', [req.params.id]);
  res.json(rows.map((r) => r.board_id));
}));

router.put('/users/:id/boards', requireAdmin, h(async (req, res) => {
  const boardIds = Array.isArray(req.body?.board_ids) ? [...new Set(req.body.board_ids)] : [];
  await query('delete from referee_boards where referee_id = $1', [req.params.id]);
  if (boardIds.length) {
    await query(
      'insert into referee_boards (referee_id, board_id) select $1, unnest($2::uuid[])',
      [req.params.id, boardIds]
    );
  }
  res.json({ ok: true, board_ids: boardIds });
}));

// ============================================================
// Tasks
// ============================================================
// Cột tasks KHÔNG kèm bytea image_data (nặng) — thay bằng cờ has_image,
// client tự build URL /api/tasks/:id/image/raw khi has_image = true
const taskCols = (p = '') => `${p}id, ${p}contest_content_id, ${p}name, ${p}name_en, ${p}description, ${p}image_url,
  (${p}image_data is not null) as has_image, ${p}image_mime,
  ${p}max_score, ${p}max_count, ${p}scoring_type, ${p}order_index, ${p}is_active, ${p}created_at, ${p}updated_at`;
const TASK_COLS = taskCols();

router.get('/tasks/all', h(async (_req, res) => {
  const { rows } = await query(
    `select ${taskCols('tk.')},
       json_build_object('name', cc.name, 'competitions', json_build_object('name', comp.name)) as contest_contents
     from tasks tk
     left join contest_contents cc on cc.id = tk.contest_content_id
     left join competitions comp on comp.id = cc.competition_id
     order by tk.order_index`
  );
  res.json(rows);
}));

router.get('/tasks', h(async (req, res) => {
  const cond = [];
  const vals = [];
  if (req.query.contestContentId) { vals.push(req.query.contestContentId); cond.push(`contest_content_id = $${vals.length}`); }
  if (req.query.activeOnly === '1') cond.push('is_active = true');
  const where = cond.length ? `where ${cond.join(' and ')}` : '';
  const { rows } = await query(`select ${TASK_COLS} from tasks ${where} order by order_index, created_at`, vals);
  res.json(rows);
}));

router.get('/tasks/:id', h(async (req, res) => {
  const { rows } = await query(`select ${TASK_COLS} from tasks where id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ.' });
  res.json(rows[0]);
}));

const TASK_FIELDS = ['contest_content_id', 'name', 'name_en', 'description', 'image_url', 'max_score', 'max_count', 'scoring_type', 'order_index', 'is_active'];

router.post('/tasks', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, TASK_FIELDS);
  const { rows } = await query(
    `insert into tasks (contest_content_id, name, name_en, description, image_url, max_score, max_count, scoring_type, order_index, is_active)
     values ($1, $2, $3, $4, $5, coalesce($6, 0), $7, coalesce($8, 'binary'), coalesce($9, 0), coalesce($10, true))
     returning ${TASK_COLS}`,
    [b.contest_content_id, b.name, b.name_en ?? null, b.description ?? null, b.image_url ?? null,
     b.max_score, b.max_count ?? null, b.scoring_type, b.order_index, b.is_active]
  );
  res.json(rows[0]);
}));

router.put('/tasks/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, TASK_FIELDS);
  const q = buildUpdate('tasks', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text.replace('returning *', `returning ${TASK_COLS}`), q.values);
  res.json(rows[0]);
}));

router.delete('/tasks/:id', requireAdmin, h(async (req, res) => {
  await query('delete from tasks where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// Ảnh minh hoạ nhiệm vụ — admin upload (multipart field "file"), public xem
router.post('/tasks/:id/image', requireAdmin, (req, res, next) => uploadImage(req, res, next), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file ảnh.' });
  const { rows } = await query(
    `update tasks set image_data = $1, image_mime = $2 where id = $3 returning ${TASK_COLS}`,
    [req.file.buffer, req.file.mimetype, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ.' });
  res.json(rows[0]);
}));

router.get('/tasks/:id/image/raw', h(async (req, res) => {
  const { rows } = await query('select image_mime, image_data from tasks where id = $1', [req.params.id]);
  if (!rows[0] || !rows[0].image_data) return res.status(404).send('Not found');
  res.set('Content-Type', rows[0].image_mime || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(rows[0].image_data);
}));

router.delete('/tasks/:id/image', requireAdmin, h(async (req, res) => {
  await query('update tasks set image_data = null, image_mime = null where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ============================================================
// Score images — ảnh lưu bytea trong Neon, serve qua endpoint raw
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Chỉ chấp nhận JPG/PNG/WEBP/GIF.'), ok);
  },
});
// Dùng chung cho upload ảnh nhiệm vụ (khai báo phía trên, chạy lúc request nên không TDZ)
const uploadImage = upload.single('file');

// Danh sách ảnh của 1 phiếu (không trả bytea — chỉ metadata + url)
router.get('/scores/:scoreId/images', h(async (req, res) => {
  const { rows } = await query(
    `select id, score_id, storage_path, public_url, file_name, file_size, mime_type, uploaded_by, created_at
     from score_images where score_id = $1 order by created_at`,
    [req.params.scoreId]
  );
  res.json(rows);
}));

// Upload ảnh (multipart field "file") — chủ phiếu hoặc admin
router.post('/scores/:scoreId/images', requireAuth, upload.single('file'), h(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file ảnh.' });
  const { rows: sc } = await query('select referee_id from scores where id = $1', [req.params.scoreId]);
  if (!sc[0]) return res.status(404).json({ error: 'Không tìm thấy phiếu chấm.' });
  if (req.user.role !== 'admin' && sc[0].referee_id !== req.user.id) {
    return res.status(403).json({ error: 'Bạn chỉ được thêm ảnh vào phiếu chấm của chính mình.' });
  }
  const id = crypto.randomUUID();
  const publicUrl = `/api/score-images/${id}/raw`;
  const { rows } = await query(
    `insert into score_images (id, score_id, storage_path, public_url, file_name, file_size, mime_type, uploaded_by, image_data)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning id, score_id, storage_path, public_url, file_name, file_size, mime_type, uploaded_by, created_at`,
    [id, req.params.scoreId, `neon://score_images/${id}`, publicUrl,
     req.file.originalname, req.file.size, req.file.mimetype, req.user.id, req.file.buffer]
  );
  res.json(rows[0]);
}));

// Serve bytes ảnh (public — giống public bucket cũ)
router.get('/score-images/:id/raw', h(async (req, res) => {
  const { rows } = await query('select mime_type, image_data from score_images where id = $1', [req.params.id]);
  if (!rows[0] || !rows[0].image_data) return res.status(404).send('Not found');
  res.set('Content-Type', rows[0].mime_type || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  res.send(rows[0].image_data);
}));

router.delete('/score-images/:id', requireAuth, h(async (req, res) => {
  const { rows } = await query(
    `select si.id, s.referee_id from score_images si
     join scores s on s.id = si.score_id where si.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.json({ ok: true });
  if (req.user.role !== 'admin' && rows[0].referee_id !== req.user.id) {
    return res.status(403).json({ error: 'Bạn chỉ được xóa ảnh của phiếu chấm chính mình.' });
  }
  await query('delete from score_images where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
