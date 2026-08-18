import { request } from './lib/http';

// API layer — gọi backend Express (server/) kết nối Neon PostgreSQL.
// Tên hàm + chữ ký + shape dữ liệu trả về GIỮ NGUYÊN như bản Supabase cũ
// (nested keys: schools, competitions, contest_contents, users) nên các
// trang admin/referee không cần sửa.

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry wrapper — chỉ retry lỗi mạng/máy chủ, không retry lỗi logic
async function withRetry(fn, label = 'query') {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err?.message || '';
      const isFatal = [
        'đăng nhập',
        'quyền',
        'Không tìm thấy',
        'duplicate key',
        'unique constraint',
        'foreign key constraint',
        'violates check',
        'Sai email',
        'Thiếu',
      ].some((fatal) => msg.toLowerCase().includes(fatal.toLowerCase()));

      if (isFatal || attempt >= MAX_RETRIES) break;
      console.warn(`[api] ${label} attempt ${attempt + 1} failed (${msg}), retrying...`);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

// URL ảnh minh hoạ nhiệm vụ — ưu tiên ảnh upload trong DB, fallback image_url
export function taskImageUrl(task) {
  if (!task) return null;
  if (task.has_image) return `/api/tasks/${task.id}/image/raw?v=${Date.parse(task.updated_at) || ''}`;
  return task.image_url || null;
}


// Gắn alias `team` (số ít) từ nested key `teams` — các trang cũ đọc `score.team`
// theo alias Supabase `team:teams(...)`. Không ghi đè nếu server đã trả `team`.
function aliasTeams(data) {
  const one = (s) => (s && s.team === undefined && s.teams !== undefined ? { ...s, team: s.teams } : s);
  return Array.isArray(data) ? data.map(one) : one(data);
}

export const api = {
  // ============================================================
  // Schools
  // ============================================================
  getSchools: async (params = {}) => {
    const qs = new URLSearchParams();
    if (params.query) qs.set('query', params.query);
    if (params.level) qs.set('level', params.level);
    if (params.province) qs.set('province', params.province);
    if (params.district) qs.set('district', params.district);
    const q = qs.toString();
    return withRetry(() => request(`/schools${q ? `?${q}` : ''}`), 'getSchools');
  },

  postSchool: (body) => withRetry(() => request('/schools', { method: 'POST', body }), 'postSchool'),

  putSchool: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.level !== undefined) update.level = body.level;
    if (body.province !== undefined) update.province = body.province;
    if (body.district !== undefined) update.district = body.district;
    return withRetry(() => request(`/schools/${id}`, { method: 'PUT', body: update }), 'putSchool');
  },

  deleteSchool: (id) => withRetry(() => request(`/schools/${id}`, { method: 'DELETE' }), 'deleteSchool'),

  importSchools: (rows) => withRetry(() => request('/schools/import', { method: 'POST', body: rows }), 'importSchools'),

  // ============================================================
  // Competitions
  // ============================================================
  getCompetitions: () => withRetry(() => request('/competitions'), 'getCompetitions'),

  postCompetition: (body) => withRetry(() => request('/competitions', {
    method: 'POST',
    body: {
      name: body.name,
      description: body.description ?? null,
      location: body.location,
      start_date: body.startDate || body.start_date || null,
      end_date: body.endDate || body.end_date || null,
      is_active: body.isActive ?? body.is_active ?? true,
    },
  }), 'postCompetition'),

  putCompetition: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.location !== undefined) update.location = body.location;
    if (body.startDate !== undefined || body.start_date !== undefined) update.start_date = body.startDate ?? body.start_date;
    if (body.endDate !== undefined || body.end_date !== undefined) update.end_date = body.endDate ?? body.end_date;
    if (body.isActive !== undefined || body.is_active !== undefined) update.is_active = body.isActive ?? body.is_active;
    return withRetry(() => request(`/competitions/${id}`, { method: 'PUT', body: update }), 'putCompetition');
  },

  deleteCompetition: (id) => withRetry(() => request(`/competitions/${id}`, { method: 'DELETE' }), 'deleteCompetition'),

  importCompetitions: (rows) => withRetry(() => request('/competitions/import', { method: 'POST', body: rows }), 'importCompetitions'),

  // ============================================================
  // Contest Contents
  // ============================================================
  getContents: (competitionId) => withRetry(() => request(`/competitions/${competitionId}/contents`), 'getContents'),

  getAllContents: () => withRetry(() => request('/contents'), 'getAllContents'),

  postContent: (competitionId, body) => withRetry(() => request(`/competitions/${competitionId}/contents`, {
    method: 'POST', body,
  }), 'postContent'),

  putContent: (id, body) => withRetry(() => request(`/contents/${id}`, { method: 'PUT', body }), 'putContent'),

  deleteContent: (id) => withRetry(() => request(`/contents/${id}`, { method: 'DELETE' }), 'deleteContent'),

  importContents: (rows) => withRetry(() => request('/contents/import', { method: 'POST', body: rows }), 'importContents'),

  // ============================================================
  // Areas
  // ============================================================
  getAreas: (contestContentId) => withRetry(() => request(`/contents/${contestContentId}/areas`), 'getAreas'),

  getAllAreas: () => withRetry(() => request('/areas'), 'getAllAreas'),

  getArea: (id) => withRetry(() => request(`/areas/${id}`), 'getArea'),

  postArea: (contestContentId, body) => withRetry(() => request(`/contents/${contestContentId}/areas`, {
    method: 'POST',
    body: {
      name: body.name,
      region: body.region ?? 'bac',
      order_index: body.order ?? body.order_index ?? 0,
      competition_id: body.competition_id ?? null,
    },
  }), 'postArea'),

  putArea: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.region !== undefined) update.region = body.region;
    if (body.order !== undefined || body.order_index !== undefined) update.order_index = body.order ?? body.order_index;
    if (body.competition_id !== undefined) update.competition_id = body.competition_id;
    return withRetry(() => request(`/areas/${id}`, { method: 'PUT', body: update }), 'putArea');
  },

  deleteArea: (id) => withRetry(() => request(`/areas/${id}`, { method: 'DELETE' }), 'deleteArea'),

  // ============================================================
  // Boards — 5 bảng cố định toàn hệ thống (Bảng A-E). Nội dung thi chỉ
  // "thêm/bớt" bảng có sẵn vào nội dung của mình, không tạo/sửa/xóa bảng gốc.
  // ============================================================
  getBoards: (contestContentId) => withRetry(() => request(`/contents/${contestContentId}/boards`), 'getBoards'),

  getAllBoards: () => withRetry(() => request('/boards'), 'getAllBoards'),

  // Thêm 1 bảng (đã có sẵn, chọn theo boardId) vào nội dung thi
  postBoard: (contestContentId, boardId) => withRetry(() => request(`/contents/${contestContentId}/boards`, {
    method: 'POST',
    body: { board_id: boardId },
  }), 'postBoard'),

  // Bỏ 1 bảng khỏi nội dung thi (không xóa bảng gốc)
  deleteBoard: (contestContentId, boardId) => withRetry(() => request(`/contents/${contestContentId}/boards/${boardId}`, {
    method: 'DELETE',
  }), 'deleteBoard'),

  // Đặt luật xếp hạng cho 1 (nội dung × bảng): 'measurement' | 'combat'
  putBoardRankingFormat: (contestContentId, boardId, rankingFormat) => withRetry(() => request(
    `/contents/${contestContentId}/boards/${boardId}`,
    { method: 'PUT', body: { ranking_format: rankingFormat } }
  ), 'putBoardRankingFormat'),

  // Xếp hạng gộp 2 lượt (đo lường) hoặc bảng đấu (đối kháng) của 1 bảng
  getRanking: (contestContentId, boardId) => withRetry(() => request(
    `/contents/${contestContentId}/boards/${boardId}/ranking`
  ), 'getRanking'),

  // ============================================================
  // Đối kháng — nhánh đấu loại trực tiếp
  // ============================================================
  getBracket: (contestContentId, boardId) => withRetry(() => request(
    `/contents/${contestContentId}/boards/${boardId}/bracket`
  ), 'getBracket'),

  generateBracket: (contestContentId, boardId) => withRetry(() => request(
    `/contents/${contestContentId}/boards/${boardId}/bracket/generate`, { method: 'POST' }
  ), 'generateBracket'),

  deleteBracket: (contestContentId, boardId, force) => withRetry(() => request(
    `/contents/${contestContentId}/boards/${boardId}/bracket${force ? '?force=1' : ''}`, { method: 'DELETE' }
  ), 'deleteBracket'),

  putMatchResult: (matchId, { winnerId, isDraw }) => withRetry(() => request(
    `/matches/${matchId}/result`, { method: 'PUT', body: { winner_id: winnerId ?? null, is_draw: !!isDraw } }
  ), 'putMatchResult'),

  // ============================================================
  // Trận đối kháng riêng (Fly Smart Cup / Battle of Stars) — content_format
  // ============================================================
  getCombatMatches: (contestContentId) => withRetry(() => request(
    `/contents/${contestContentId}/combat-matches`
  ), 'getCombatMatches'),

  postCombatMatch: (contestContentId, body) => withRetry(() => request(
    `/contents/${contestContentId}/combat-matches`, { method: 'POST', body }
  ), 'postCombatMatch'),

  putCombatMatch: (id, body) => withRetry(() => request(
    `/combat-matches/${id}`, { method: 'PUT', body }
  ), 'putCombatMatch'),

  deleteCombatMatch: (contestContentId, id) => withRetry(() => request(
    `/contents/${contestContentId}/combat-matches/${id}`, { method: 'DELETE' }
  ), 'deleteCombatMatch'),

  // ============================================================
  // Students
  // ============================================================
  getStudents: () => withRetry(() => request('/students'), 'getStudents'),

  postStudent: (body) => withRetry(() => request('/students', {
    method: 'POST',
    body: {
      full_name: body.fullName ?? body.full_name,
      gender: body.gender ?? null,
      birth_date: body.dateOfBirth ?? body.birth_date ?? null,
      school_id: body.schoolId ?? body.school_id ?? null,
      grade: body.grade ?? null,
    },
  }), 'postStudent'),

  putStudent: (id, body) => {
    const update = {};
    if (body.fullName !== undefined || body.full_name !== undefined) update.full_name = body.fullName ?? body.full_name;
    if (body.gender !== undefined) update.gender = body.gender;
    if (body.dateOfBirth !== undefined || body.birth_date !== undefined) update.birth_date = body.dateOfBirth ?? body.birth_date;
    if (body.schoolId !== undefined || body.school_id !== undefined) update.school_id = body.schoolId ?? body.school_id;
    if (body.grade !== undefined) update.grade = body.grade;
    return withRetry(() => request(`/students/${id}`, { method: 'PUT', body: update }), 'putStudent');
  },

  deleteStudent: (id) => withRetry(() => request(`/students/${id}`, { method: 'DELETE' }), 'deleteStudent'),

  importStudents: (rows) => withRetry(() => request('/students/import', { method: 'POST', body: rows }), 'importStudents'),

  // ============================================================
  // Teams
  // ============================================================
  getTeams: (contestContentId) => withRetry(() => request(`/contents/${contestContentId}/teams`), 'getTeams'),

  getAllTeams: () => withRetry(() => request('/teams'), 'getAllTeams'),

  postTeam: (contestContentId, body) => withRetry(() => request(`/contents/${contestContentId}/teams`, {
    method: 'POST',
    body: {
      name: body.name,
      student_ids: body.studentIds ?? body.student_ids ?? [],
      school_id: body.schoolId ?? body.school_id ?? null,
      area_id: body.areaId ?? body.area_id ?? null,
      board_id: body.boardId ?? body.board_id ?? null,
      coach_id: body.coachId ?? body.coach_id ?? null,
      field_ids: body.fieldIds ?? body.field_ids ?? [],
      region: body.region ?? 'bac',
      order_index: body.order ?? body.order_index ?? 0,
    },
  }), 'postTeam'),

  putTeam: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.studentIds !== undefined || body.student_ids !== undefined) update.student_ids = body.studentIds ?? body.student_ids;
    if (body.schoolId !== undefined || body.school_id !== undefined) update.school_id = body.schoolId ?? body.school_id;
    if (body.areaId !== undefined || body.area_id !== undefined) update.area_id = body.areaId ?? body.area_id;
    if (body.boardId !== undefined || body.board_id !== undefined) update.board_id = body.boardId ?? body.board_id;
    if (body.coachId !== undefined || body.coach_id !== undefined) update.coach_id = body.coachId ?? body.coach_id;
    if (body.fieldIds !== undefined || body.field_ids !== undefined) update.field_ids = body.fieldIds ?? body.field_ids;
    if (body.region !== undefined) update.region = body.region;
    if (body.order !== undefined || body.order_index !== undefined) update.order_index = body.order ?? body.order_index;
    if (body.combat_group !== undefined) update.combat_group = body.combat_group;
    return withRetry(() => request(`/teams/${id}`, { method: 'PUT', body: update }), 'putTeam');
  },

  deleteTeam: (id) => withRetry(() => request(`/teams/${id}`, { method: 'DELETE' }), 'deleteTeam'),

  importTeams: (rows) => withRetry(() => request('/teams/import', { method: 'POST', body: rows }), 'importTeams'),

  // ============================================================
  // Scores
  // ============================================================
  // Server trả nested key `teams` (theo Supabase); nhiều trang đọc `score.team`
  // (alias `team:teams(...)` cũ) → gắn thêm alias `team` cho tương thích
  getScoreboard: (contestContentId) => withRetry(() => request(`/scoreboard/${contestContentId}`), 'getScoreboard').then(aliasTeams),

  getTeamScores: (teamId) => withRetry(() => request(`/teams/${teamId}/scores`), 'getTeamScores').then(aliasTeams),

  getStudentScores: (studentId) => withRetry(() => request(`/students/${studentId}/scores`), 'getStudentScores').then(aliasTeams),

  postScore: (body) => withRetry(() => request('/scores', {
    method: 'POST',
    body: {
      team_id: body.team_id ?? body.teamId,
      contest_content_id: body.contest_content_id ?? body.contestContentId,
      referee_id: body.referee_id ?? body.refereeId ?? null,
      score: Number(body.score) || 0,
      time: body.time ?? null,
      round: body.round ?? 1,
      retry_count: body.retry_count ?? body.retryCount ?? 0,
      bonus_points: body.bonus_points ?? body.bonusPoints ?? 0,
      criteria_scores: body.criteria_scores ?? body.criteriaScores ?? {},
      notes: body.notes ?? null,
      arena_entry_time: body.arena_entry_time ?? body.arenaEntryTime ?? null,
      head_referee_name: body.head_referee_name ?? body.headRefereeName ?? null,
      scorekeeper_name: body.scorekeeper_name ?? body.scorekeeperName ?? null,
      objection: body.objection ?? null,
    },
  }), 'postScore'),

  getScores: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.refereeId) qs.set('refereeId', params.refereeId);
    if (params.contestContentId) qs.set('contestContentId', params.contestContentId);
    if (params.teamId) qs.set('teamId', params.teamId);
    const q = qs.toString();
    return withRetry(() => request(`/scores${q ? `?${q}` : ''}`), 'getScores').then(aliasTeams);
  },

  getScore: (id) => withRetry(() => request(`/scores/${id}`), 'getScore').then(aliasTeams),

  putScore: (id, body) => {
    const update = {};
    if (body.team_id !== undefined || body.teamId !== undefined) update.team_id = body.team_id ?? body.teamId;
    if (body.contest_content_id !== undefined || body.contestContentId !== undefined) update.contest_content_id = body.contest_content_id ?? body.contestContentId;
    if (body.referee_id !== undefined || body.refereeId !== undefined) update.referee_id = body.referee_id ?? body.refereeId;
    if (body.score !== undefined) update.score = Number(body.score) || 0;
    if (body.time !== undefined) update.time = body.time;
    if (body.round !== undefined) update.round = body.round;
    if (body.retry_count !== undefined || body.retryCount !== undefined) update.retry_count = body.retry_count ?? body.retryCount;
    if (body.bonus_points !== undefined || body.bonusPoints !== undefined) update.bonus_points = body.bonus_points ?? body.bonusPoints;
    if (body.criteria_scores !== undefined || body.criteriaScores !== undefined) update.criteria_scores = body.criteria_scores ?? body.criteriaScores;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.arena_entry_time !== undefined || body.arenaEntryTime !== undefined) update.arena_entry_time = body.arena_entry_time ?? body.arenaEntryTime;
    if (body.head_referee_name !== undefined || body.headRefereeName !== undefined) update.head_referee_name = body.head_referee_name ?? body.headRefereeName;
    if (body.scorekeeper_name !== undefined || body.scorekeeperName !== undefined) update.scorekeeper_name = body.scorekeeper_name ?? body.scorekeeperName;
    if (body.objection !== undefined) update.objection = body.objection;
    if (body.started_at !== undefined) update.started_at = body.started_at;
    if (body.reviewer_signature !== undefined) update.reviewer_signature = body.reviewer_signature;
    return withRetry(() => request(`/scores/${id}`, { method: 'PUT', body: update }), 'putScore');
  },

  deleteScore: (id) => withRetry(() => request(`/scores/${id}`, { method: 'DELETE' }), 'deleteScore'),
  bulkDeleteScores: (ids) => withRetry(() => request('/scores/bulk-delete', { method: 'POST', body: { ids } }), 'bulkDeleteScores'),

  // Lịch sử sửa điểm (ai sửa, lúc nào, trước/sau)
  getScoreEdits: (scoreId) => withRetry(() => request(`/scores/${scoreId}/edits`), 'getScoreEdits'),

  // ============================================================
  // Khiếu nại bảng điểm
  // ============================================================
  postComplaint: (body) => withRetry(() => request('/complaints', { method: 'POST', body }), 'postComplaint'),

  getComplaints: (status) => withRetry(() => request(`/complaints${status ? `?status=${status}` : ''}`), 'getComplaints'),

  getMyComplaints: () => withRetry(() => request('/complaints/mine'), 'getMyComplaints'),

  getComplaintsCount: (status = 'pending') => withRetry(() => request(`/complaints/count?status=${status}`), 'getComplaintsCount'),

  putComplaint: (id, body) => withRetry(() => request(`/complaints/${id}`, { method: 'PUT', body }), 'putComplaint'),

  // ============================================================
  // Users
  // ============================================================
  getUsers: (role) => withRetry(() => request(`/users${role ? `?role=${role}` : ''}`), 'getUsers'),

  // Tạo tài khoản referee (token lấy tự động từ localStorage — tham số thứ 2 giữ để tương thích)
  createRefereeUser: async ({ email, password, username, full_name, area_id, can_view_scoreboard, language }) => {
    const data = await withRetry(() => request('/users/referee', {
      method: 'POST',
      body: { email, password, username, full_name, area_id, can_view_scoreboard, language },
    }), 'createRefereeUser');
    return data.user;
  },

  importRefereeUsers: (rows) => withRetry(() => request('/users/referee/import', { method: 'POST', body: rows }), 'importRefereeUsers'),

  putUser: (id, body) => {
    const update = {};
    if (body.full_name !== undefined || body.fullName !== undefined) update.full_name = body.full_name ?? body.fullName;
    if (body.area_id !== undefined || body.areaId !== undefined) update.area_id = body.area_id ?? body.areaId;
    if (body.role !== undefined) update.role = body.role;
    if (body.password) update.password = body.password;
    if (body.can_view_scoreboard !== undefined || body.canViewScoreboard !== undefined) {
      update.can_view_scoreboard = body.can_view_scoreboard ?? body.canViewScoreboard;
    }
    if (body.language !== undefined) update.language = body.language;
    return withRetry(() => request(`/users/${id}`, { method: 'PUT', body: update }), 'putUser');
  },

  deleteUser: (id) => withRetry(() => request(`/users/${id}`, { method: 'DELETE' }), 'deleteUser'),
  bulkDeleteRefereeUsers: (ids) => withRetry(() => request('/users/referee/bulk-delete', { method: 'POST', body: { ids } }), 'bulkDeleteRefereeUsers'),

  // Phân quyền trọng tài theo (Nội dung × Field) — trả về mảng
  // {contest_content_id, field_id} (rỗng cho 1 nội dung = chưa giới hạn field nào trong nội dung đó)
  getUserPermissions: (userId) => withRetry(() => request(`/users/${userId}/permissions`), 'getUserPermissions'),

  // Tổng số dòng phân quyền theo từng trọng tài — {referee_id, content_count, row_count}[]
  // dùng để hiện ngay trong danh sách tài khoản, xác nhận Lưu phân quyền có ghi vào DB thật không.
  getUserPermissionCounts: () => withRetry(() => request('/users/permission-counts'), 'getUserPermissionCounts'),

  // Phân quyền của chính trọng tài đang đăng nhập
  getMyPermissions: () => withRetry(() => request('/me/permissions'), 'getMyPermissions'),

  putUserPermissions: (userId, items) => withRetry(() => request(`/users/${userId}/permissions`, {
    method: 'PUT',
    body: { items },
  }), 'putUserPermissions'),

  // ============================================================
  // Tasks
  // ============================================================
  getTasks: (contestContentId) => withRetry(() => request(
    `/tasks${contestContentId ? `?contestContentId=${contestContentId}` : ''}`
  ), 'getTasks'),

  getAllTasks: () => withRetry(() => request('/tasks/all'), 'getAllTasks'),

  getActiveTasks: (contestContentId) => withRetry(() => request(
    `/tasks?contestContentId=${contestContentId}&activeOnly=1`
  ), 'getActiveTasks'),

  getTask: (id) => withRetry(() => request(`/tasks/${id}`), 'getTask'),

  postTask: (body) => withRetry(() => request('/tasks', { method: 'POST', body }), 'postTask'),

  putTask: (id, body) => withRetry(() => request(`/tasks/${id}`, { method: 'PUT', body }), 'putTask'),

  deleteTask: (id) => withRetry(() => request(`/tasks/${id}`, { method: 'DELETE' }), 'deleteTask'),

  importTasks: (rows) => withRetry(() => request('/tasks/import', { method: 'POST', body: rows }), 'importTasks'),

  // Ảnh minh hoạ nhiệm vụ (bytea trong Neon) — URL xem: taskImageUrl(task)
  uploadTaskImage: async ({ taskId, file }) => {
    if (!file) throw new Error('Chưa chọn file ảnh.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh tối đa 5MB.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) throw new Error('Chỉ chấp nhận JPG/PNG/WEBP/GIF.');
    const formData = new FormData();
    formData.append('file', file);
    return request(`/tasks/${taskId}/image`, { method: 'POST', formData });
  },

  deleteTaskImage: (taskId) => withRetry(() => request(`/tasks/${taskId}/image`, { method: 'DELETE' }), 'deleteTaskImage'),

  // ============================================================
  // Score Images (bytes lưu trong Neon, serve qua /api/score-images/:id/raw)
  // ============================================================
  getScoreImages: (scoreId) => withRetry(() => request(`/scores/${scoreId}/images`), 'getScoreImages'),

  uploadScoreImage: async ({ scoreId, file }) => {
    if (!file) throw new Error('Chưa chọn file ảnh.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh tối đa 5MB.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) throw new Error('Chỉ chấp nhận JPG/PNG/WEBP/GIF.');

    const formData = new FormData();
    formData.append('file', file);
    return request(`/scores/${scoreId}/images`, { method: 'POST', formData });
  },

  deleteScoreImage: (imageId) => withRetry(() => request(`/score-images/${imageId}`, { method: 'DELETE' }), 'deleteScoreImage'),

  // ============================================================
  // Huấn luyện viên (HLV)
  // ============================================================
  getCoaches: () => withRetry(() => request('/coaches'), 'getCoaches'),

  postCoach: (body) => withRetry(() => request('/coaches', {
    method: 'POST',
    body: { name: body.name, phone: body.phone ?? null, email: body.email ?? null, notes: body.notes ?? null },
  }), 'postCoach'),

  putCoach: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.email !== undefined) update.email = body.email;
    if (body.notes !== undefined) update.notes = body.notes;
    return withRetry(() => request(`/coaches/${id}`, { method: 'PUT', body: update }), 'putCoach');
  },

  deleteCoach: (id) => withRetry(() => request(`/coaches/${id}`, { method: 'DELETE' }), 'deleteCoach'),

  importCoaches: (rows) => withRetry(() => request('/coaches/import', { method: 'POST', body: rows }), 'importCoaches'),

  // ============================================================
  // Field (khu vực/trạm thi đấu)
  // ============================================================
  getFields: () => withRetry(() => request('/fields'), 'getFields'),

  postField: (body) => withRetry(() => request('/fields', {
    method: 'POST',
    body: { name: body.name, notes: body.notes ?? null },
  }), 'postField'),

  putField: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.notes !== undefined) update.notes = body.notes;
    return withRetry(() => request(`/fields/${id}`, { method: 'PUT', body: update }), 'putField');
  },

  deleteField: (id) => withRetry(() => request(`/fields/${id}`, { method: 'DELETE' }), 'deleteField'),

  importFields: (rows) => withRetry(() => request('/fields/import', { method: 'POST', body: rows }), 'importFields'),

  // ============================================================
  // Báo cáo
  // ============================================================
  getReportScores: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.competitionId) qs.set('competitionId', params.competitionId);
    if (params.contentId) qs.set('contentId', params.contentId);
    const q = qs.toString();
    return withRetry(() => request(`/reports/scores${q ? `?${q}` : ''}`), 'getReportScores');
  },

  // ============================================================
  // Diagnostic
  // ============================================================
  pingServer: async () => {
    try {
      const data = await request('/health');
      return { ok: true, ...data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
