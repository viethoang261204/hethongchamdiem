// REST API routes — thay thế toàn bộ truy vấn Supabase SDK phía client.
// QUAN TRỌNG: shape JSON trả về phải giống hệt shape của Supabase
// (nested keys: schools, competitions, contest_contents, users) để
// frontend không phải sửa — xem client/src/api.js.
const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { query } = require('./db.cjs');
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

// Import hàng loạt, bỏ qua trùng (name, level)
router.post('/schools/import', requireAdmin, h(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body.items || [];
  let added = 0;
  for (const it of items) {
    if (!it?.name || !it?.level) continue;
    const { rowCount } = await query(
      `insert into schools (name, level, province, district, source)
       values ($1, $2, $3, $4, coalesce($5, 'import'))
       on conflict (name, level) do nothing`,
      [it.name, it.level, it.province ?? null, it.district ?? null, it.source ?? null]
    );
    added += rowCount;
  }
  res.json({ ok: true, added });
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

const CONTENT_FIELDS = ['name', 'name_en', 'description', 'criteria', 'order_index', 'scoring_method'];

router.post('/competitions/:competitionId/contents', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, CONTENT_FIELDS);
  const { rows } = await query(
    `insert into contest_contents (competition_id, name, name_en, description, criteria, order_index, scoring_method)
     values ($1, $2, $3, $4, coalesce($5::jsonb, '[]'::jsonb), coalesce($6, 0), $7) returning *`,
    [req.params.competitionId, b.name, b.name_en ?? null, b.description ?? null,
     b.criteria ? JSON.stringify(b.criteria) : null, b.order_index, b.scoring_method ?? null]
  );
  res.json(rows[0]);
}));

router.put('/contents/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, CONTENT_FIELDS);
  if (data.criteria !== undefined) data.criteria = JSON.stringify(data.criteria);
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

// ============================================================
// Teams
// ============================================================
router.get('/contents/:contentId/teams', h(async (req, res) => {
  const { rows } = await query(
    `select t.*, ${SCHOOLS_JSON} as schools
     from teams t
     left join schools sch on sch.id = t.school_id
     where t.contest_content_id = $1
     order by t.order_index`,
    [req.params.contentId]
  );
  res.json(rows);
}));

router.get('/teams', h(async (_req, res) => {
  const { rows } = await query(
    `select t.*, ${SCHOOLS_JSON} as schools,
       json_build_object('name', cc.name, 'competitions', json_build_object('name', comp.name)) as contest_contents
     from teams t
     left join schools sch on sch.id = t.school_id
     left join contest_contents cc on cc.id = t.contest_content_id
     left join competitions comp on comp.id = cc.competition_id
     order by t.order_index`
  );
  res.json(rows);
}));

const TEAM_FIELDS = ['name', 'student_ids', 'school_id', 'area_id', 'region', 'order_index'];

router.post('/contents/:contentId/teams', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, TEAM_FIELDS);
  const { rows } = await query(
    `insert into teams (contest_content_id, name, student_ids, school_id, area_id, region, order_index)
     values ($1, $2, coalesce($3, '{}'), $4, $5, coalesce($6, 'bac'), coalesce($7, 0)) returning *`,
    [req.params.contentId, b.name, b.student_ids ?? null, b.school_id ?? null, b.area_id ?? null, b.region, b.order_index]
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
    (to_jsonb(t.*) || jsonb_build_object('schools', ${SCHOOLS_JSON.replace(/\n/g, ' ')})) as teams,
    case when u.id is null then null else json_build_object('full_name', u.full_name) end as users,
    case when cc.id is null then null else json_build_object('name', cc.name) end as contest_contents
  from scores s
  left join teams t on t.id = s.team_id
  left join schools sch on sch.id = t.school_id
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
  // Referee chỉ được chấm dưới tên chính mình; admin được chỉ định referee_id bất kỳ
  const refereeId = req.user.role === 'admin' ? (b.referee_id ?? null) : req.user.id;
  const { rows } = await query(
    `insert into scores (team_id, contest_content_id, referee_id, score, time, criteria_scores, notes)
     values ($1, $2, $3, coalesce($4, 0), $5, coalesce($6::jsonb, '{}'::jsonb), $7) returning *`,
    [b.team_id, b.contest_content_id, refereeId, Number(b.score) || 0, b.time ?? null,
     b.criteria_scores ? JSON.stringify(b.criteria_scores) : null, b.notes ?? null]
  );
  res.json(rows[0]);
}));

router.put('/scores/:id', requireAuth, h(async (req, res) => {
  // Chỉ chủ phiếu (referee) hoặc admin được sửa
  const { rows: existing } = await query('select referee_id from scores where id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Không tìm thấy phiếu chấm.' });
  if (req.user.role !== 'admin' && existing[0].referee_id !== req.user.id) {
    return res.status(403).json({ error: 'Bạn chỉ được sửa phiếu chấm của chính mình.' });
  }
  const data = pick(req.body, ['team_id', 'contest_content_id', 'referee_id', 'score', 'time', 'criteria_scores', 'notes']);
  if (req.user.role !== 'admin') delete data.referee_id;
  if (data.criteria_scores !== undefined) data.criteria_scores = JSON.stringify(data.criteria_scores);
  if (data.score !== undefined) data.score = Number(data.score) || 0;
  const q = buildUpdate('scores', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/scores/:id', requireAdmin, h(async (req, res) => {
  await query('delete from scores where id = $1', [req.params.id]);
  res.json({ ok: true });
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

// ============================================================
// Tasks
// ============================================================
router.get('/tasks/all', h(async (_req, res) => {
  const { rows } = await query(
    `select tk.*,
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
  const { rows } = await query(`select * from tasks ${where} order by order_index, created_at`, vals);
  res.json(rows);
}));

router.get('/tasks/:id', h(async (req, res) => {
  const { rows } = await query('select * from tasks where id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Không tìm thấy nhiệm vụ.' });
  res.json(rows[0]);
}));

const TASK_FIELDS = ['contest_content_id', 'name', 'name_en', 'description', 'image_url', 'max_score', 'scoring_type', 'order_index', 'is_active'];

router.post('/tasks', requireAdmin, h(async (req, res) => {
  const b = pick(req.body, TASK_FIELDS);
  const { rows } = await query(
    `insert into tasks (contest_content_id, name, name_en, description, image_url, max_score, scoring_type, order_index, is_active)
     values ($1, $2, $3, $4, $5, coalesce($6, 0), coalesce($7, 'binary'), coalesce($8, 0), coalesce($9, true)) returning *`,
    [b.contest_content_id, b.name, b.name_en ?? null, b.description ?? null, b.image_url ?? null,
     b.max_score, b.scoring_type, b.order_index, b.is_active]
  );
  res.json(rows[0]);
}));

router.put('/tasks/:id', requireAdmin, h(async (req, res) => {
  const data = pick(req.body, TASK_FIELDS);
  const q = buildUpdate('tasks', req.params.id, data);
  if (!q) return res.json({});
  const { rows } = await query(q.text, q.values);
  res.json(rows[0]);
}));

router.delete('/tasks/:id', requireAdmin, h(async (req, res) => {
  await query('delete from tasks where id = $1', [req.params.id]);
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
