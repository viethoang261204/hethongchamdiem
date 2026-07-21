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

  importSchools: (items) => withRetry(() => request('/schools/import', { method: 'POST', body: items }), 'importSchools'),

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
  // Boards (bảng đấu theo độ tuổi)
  // ============================================================
  getBoards: (contestContentId) => withRetry(() => request(`/contents/${contestContentId}/boards`), 'getBoards'),

  getAllBoards: () => withRetry(() => request('/boards'), 'getAllBoards'),

  postBoard: (contestContentId, body) => withRetry(() => request(`/contents/${contestContentId}/boards`, {
    method: 'POST',
    body: {
      name: body.name,
      age_group: body.age_group ?? body.ageGroup ?? null,
      order_index: body.order_index ?? body.order ?? 0,
    },
  }), 'postBoard'),

  putBoard: (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.age_group !== undefined || body.ageGroup !== undefined) update.age_group = body.age_group ?? body.ageGroup;
    if (body.order_index !== undefined || body.order !== undefined) update.order_index = body.order_index ?? body.order;
    return withRetry(() => request(`/boards/${id}`, { method: 'PUT', body: update }), 'putBoard');
  },

  deleteBoard: (id) => withRetry(() => request(`/boards/${id}`, { method: 'DELETE' }), 'deleteBoard'),

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
    if (body.region !== undefined) update.region = body.region;
    if (body.order !== undefined || body.order_index !== undefined) update.order_index = body.order ?? body.order_index;
    return withRetry(() => request(`/teams/${id}`, { method: 'PUT', body: update }), 'putTeam');
  },

  deleteTeam: (id) => withRetry(() => request(`/teams/${id}`, { method: 'DELETE' }), 'deleteTeam'),

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
    return withRetry(() => request(`/scores/${id}`, { method: 'PUT', body: update }), 'putScore');
  },

  deleteScore: (id) => withRetry(() => request(`/scores/${id}`, { method: 'DELETE' }), 'deleteScore'),

  // ============================================================
  // Users
  // ============================================================
  getUsers: (role) => withRetry(() => request(`/users${role ? `?role=${role}` : ''}`), 'getUsers'),

  // Tạo tài khoản referee (token lấy tự động từ localStorage — tham số thứ 2 giữ để tương thích)
  createRefereeUser: async ({ email, password, username, full_name, area_id }) => {
    const data = await withRetry(() => request('/users/referee', {
      method: 'POST',
      body: { email, password, username, full_name, area_id },
    }), 'createRefereeUser');
    return data.user;
  },

  putUser: (id, body) => {
    const update = {};
    if (body.full_name !== undefined || body.fullName !== undefined) update.full_name = body.full_name ?? body.fullName;
    if (body.area_id !== undefined || body.areaId !== undefined) update.area_id = body.area_id ?? body.areaId;
    if (body.role !== undefined) update.role = body.role;
    if (body.password) update.password = body.password;
    return withRetry(() => request(`/users/${id}`, { method: 'PUT', body: update }), 'putUser');
  },

  deleteUser: (id) => withRetry(() => request(`/users/${id}`, { method: 'DELETE' }), 'deleteUser'),

  // Phân quyền trọng tài theo bảng đấu — trả về mảng board_id (rỗng = chưa giới hạn)
  getUserBoards: (userId) => withRetry(() => request(`/users/${userId}/boards`), 'getUserBoards'),

  putUserBoards: (userId, boardIds) => withRetry(() => request(`/users/${userId}/boards`, {
    method: 'PUT',
    body: { board_ids: boardIds },
  }), 'putUserBoards'),

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
