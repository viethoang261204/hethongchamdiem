import { supabase, isSupabaseConfigured } from './lib/supabase';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const handleError = (error) => {
  throw new Error(error?.message || 'Lỗi không xác định');
};

// Retry wrapper cho Supabase queries
async function withRetry(fn, label = 'query') {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err?.message || '';
      // Không retry lỗi logic (auth, not found, constraint)
      const isFatal = [
        'Chưa cấu hình',
        'not found',
        'duplicate key',
        'unique constraint',
        'foreign key constraint',
        'violates check',
        'permission denied',
        'JWS signature verification',
        'Invalid login credentials',
        'Email not confirmed',
      ].some((fatal) => msg.toLowerCase().includes(fatal.toLowerCase()));

      if (isFatal || attempt >= MAX_RETRIES) break;
      console.warn(`[api] ${label} attempt ${attempt + 1} failed (${msg}), retrying...`);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastError;
}

// ============================================================
// Schools
// ============================================================
export const api = {
  // Schools
  getSchools: async (params = {}) => {
    let query = supabase.from('schools').select('*');
    if (params.query) query = query.ilike('name', `%${params.query}%`);
    if (params.level) query = query.eq('level', params.level);
    if (params.province) query = query.ilike('province', `%${params.province}%`);
    if (params.district) query = query.ilike('district', `%${params.district}%`);
    const { data, error } = await withRetry(() => query.limit(200).order('name'), 'getSchools');
    if (error) handleError(error);
    return data || [];
  },

  postSchool: async (body) => {
    const { data, error } = await withRetry(() => supabase.from('schools').insert(body).select().single(), 'postSchool');
    if (error) handleError(error);
    return data;
  },

  putSchool: async (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.level !== undefined) update.level = body.level;
    if (body.province !== undefined) update.province = body.province;
    if (body.district !== undefined) update.district = body.district;
    const { data, error } = await withRetry(() => supabase.from('schools').update(update).eq('id', id).select().single(), 'putSchool');
    if (error) handleError(error);
    return data;
  },

  deleteSchool: async (id) => {
    const { error } = await withRetry(() => supabase.from('schools').delete().eq('id', id), 'deleteSchool');
    if (error) handleError(error);
    return { ok: true };
  },

  importSchools: async (items) => {
    const { data, error } = await withRetry(() => supabase.from('schools').upsert(items, { ignoreDuplicates: true }).select(), 'importSchools');
    if (error) handleError(error);
    return { ok: true, added: data?.length || 0 };
  },

  // Competitions
  getCompetitions: async () => {
    const { data, error } = await withRetry(() => supabase
      .from('competitions')
      .select('*')
      .order('created_at', { ascending: false }), 'getCompetitions');
    if (error) handleError(error);
    return data || [];
  },

  postCompetition: async (body) => {
    const { data, error } = await withRetry(() => supabase.from('competitions').insert({
      name: body.name,
      description: body.description ?? null,
      location: body.location,
      start_date: body.startDate || body.start_date || null,
      end_date: body.endDate || body.end_date || null,
      is_active: body.isActive ?? body.is_active ?? true,
    }).select().single(), 'postCompetition');
    if (error) handleError(error);
    return data;
  },

  putCompetition: async (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.location !== undefined) update.location = body.location;
    if (body.startDate !== undefined || body.start_date !== undefined) update.start_date = body.startDate ?? body.start_date;
    if (body.endDate !== undefined || body.end_date !== undefined) update.end_date = body.endDate ?? body.end_date;
    if (body.isActive !== undefined || body.is_active !== undefined) update.is_active = body.isActive ?? body.is_active;
    const { data, error } = await withRetry(() => supabase.from('competitions').update(update).eq('id', id).select().single(), 'putCompetition');
    if (error) handleError(error);
    return data;
  },

  deleteCompetition: async (id) => {
    const { error } = await withRetry(() => supabase.from('competitions').delete().eq('id', id), 'deleteCompetition');
    if (error) handleError(error);
    return { ok: true };
  },

  // Contest Contents
  getContents: async (competitionId) => {
    const { data, error } = await withRetry(() => supabase
      .from('contest_contents')
      .select('*')
      .eq('competition_id', competitionId)
      .order('order_index'), 'getContents');
    if (error) handleError(error);
    return data || [];
  },

  getAllContents: async () => {
    const { data, error } = await withRetry(() => supabase
      .from('contest_contents')
      .select('*, competitions(name)')
      .order('order_index'), 'getAllContents');
    if (error) handleError(error);
    return data || [];
  },

  postContent: async (competitionId, body) => {
    const { data, error } = await withRetry(() => supabase
      .from('contest_contents')
      .insert({ competition_id: competitionId, ...body })
      .select()
      .single(), 'postContent');
    if (error) handleError(error);
    return data;
  },

  putContent: async (id, body) => {
    const { data, error } = await withRetry(() => supabase.from('contest_contents').update(body).eq('id', id).select().single(), 'putContent');
    if (error) handleError(error);
    return data;
  },

  deleteContent: async (id) => {
    const { error } = await withRetry(() => supabase.from('contest_contents').delete().eq('id', id), 'deleteContent');
    if (error) handleError(error);
    return { ok: true };
  },

  // Areas (CRUD khu vực thi / trung tâm)
  getAreas: async (contestContentId) => {
    const { data, error } = await withRetry(() => supabase
      .from('areas')
      .select('*')
      .eq('contest_content_id', contestContentId)
      .order('order_index'), 'getAreas');
    if (error) handleError(error);
    return data || [];
  },

  getAllAreas: async () => {
    const { data, error } = await withRetry(() => supabase
      .from('areas')
      .select('*, contest_contents(name, competitions(name))')
      .order('order_index'), 'getAllAreas');
    if (error) handleError(error);
    return data || [];
  },

  getArea: async (id) => {
    const { data, error } = await withRetry(() => supabase.from('areas').select('*').eq('id', id).single(), 'getArea');
    if (error) handleError(error);
    return data;
  },

  postArea: async (contestContentId, body) => {
    const payload = {
      contest_content_id: contestContentId,
      name: body.name,
      region: body.region ?? 'bac',
      order_index: body.order ?? body.order_index ?? 0,
    };
    if (body.competition_id) payload.competition_id = body.competition_id;
    const { data, error } = await withRetry(() => supabase.from('areas').insert(payload).select().single(), 'postArea');
    if (error) handleError(error);
    return data;
  },

  putArea: async (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.region !== undefined) update.region = body.region;
    if (body.order !== undefined || body.order_index !== undefined) update.order_index = body.order ?? body.order_index;
    if (body.competition_id !== undefined) update.competition_id = body.competition_id;
    const { data, error } = await withRetry(() => supabase.from('areas').update(update).eq('id', id).select().single(), 'putArea');
    if (error) handleError(error);
    return data;
  },

  deleteArea: async (id) => {
    const { error } = await withRetry(() => supabase.from('areas').delete().eq('id', id), 'deleteArea');
    if (error) handleError(error);
    return { ok: true };
  },

  // Students
  getStudents: async () => {
    const { data, error } = await withRetry(() => supabase
      .from('students')
      .select('*, schools(name, level)')
      .order('created_at', { ascending: false }), 'getStudents');
    if (error) handleError(error);
    return data || [];
  },

  postStudent: async (body) => {
    const payload = {
      full_name: body.fullName ?? body.full_name,
      gender: body.gender ?? null,
      birth_date: body.dateOfBirth ?? body.birth_date ?? null,
      school_id: body.schoolId ?? body.school_id ?? null,
      grade: body.grade ?? null,
    };
    const { data, error } = await withRetry(() => supabase.from('students').insert(payload).select().single(), 'postStudent');
    if (error) handleError(error);
    return data;
  },

  putStudent: async (id, body) => {
    const update = {};
    if (body.fullName !== undefined || body.full_name !== undefined) update.full_name = body.fullName ?? body.full_name;
    if (body.gender !== undefined) update.gender = body.gender;
    if (body.dateOfBirth !== undefined || body.birth_date !== undefined) update.birth_date = body.dateOfBirth ?? body.birth_date;
    if (body.schoolId !== undefined || body.school_id !== undefined) update.school_id = body.schoolId ?? body.school_id;
    if (body.grade !== undefined) update.grade = body.grade;
    const { data, error } = await withRetry(() => supabase.from('students').update(update).eq('id', id).select().single(), 'putStudent');
    if (error) handleError(error);
    return data;
  },

  deleteStudent: async (id) => {
    const { error } = await withRetry(() => supabase.from('students').delete().eq('id', id), 'deleteStudent');
    if (error) handleError(error);
    return { ok: true };
  },

  // Teams
  getTeams: async (contestContentId) => {
    const { data, error } = await withRetry(() => supabase
      .from('teams')
      .select('*, schools(name, level)')
      .eq('contest_content_id', contestContentId)
      .order('order_index'), 'getTeams');
    if (error) handleError(error);
    return data || [];
  },

  getAllTeams: async () => {
    const { data, error } = await withRetry(() => supabase
      .from('teams')
      .select('*, schools(name, level), contest_contents(name, competitions(name))')
      .order('order_index'), 'getAllTeams');
    if (error) handleError(error);
    return data || [];
  },

  postTeam: async (contestContentId, body) => {
    const payload = {
      contest_content_id: contestContentId,
      name: body.name,
      student_ids: body.studentIds ?? body.student_ids ?? [],
      school_id: body.schoolId ?? body.school_id ?? null,
      area_id: body.areaId ?? body.area_id ?? null,
      region: body.region ?? 'bac',
      order_index: body.order ?? body.order_index ?? 0,
    };
    const { data, error } = await withRetry(() => supabase.from('teams').insert(payload).select().single(), 'postTeam');
    if (error) handleError(error);
    return data;
  },

  putTeam: async (id, body) => {
    const update = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.studentIds !== undefined || body.student_ids !== undefined) update.student_ids = body.studentIds ?? body.student_ids;
    if (body.schoolId !== undefined || body.school_id !== undefined) update.school_id = body.schoolId ?? body.school_id;
    if (body.areaId !== undefined || body.area_id !== undefined) update.area_id = body.areaId ?? body.area_id;
    if (body.region !== undefined) update.region = body.region;
    if (body.order !== undefined || body.order_index !== undefined) update.order_index = body.order ?? body.order_index;
    const { data, error } = await withRetry(() => supabase.from('teams').update(update).eq('id', id).select().single(), 'putTeam');
    if (error) handleError(error);
    return data;
  },

  deleteTeam: async (id) => {
    const { error } = await withRetry(() => supabase.from('teams').delete().eq('id', id), 'deleteTeam');
    if (error) handleError(error);
    return { ok: true };
  },

  // Scores
  getScoreboard: async (contestContentId) => {
    const { data, error } = await withRetry(() => supabase
      .from('scores')
      .select('*, teams(*, schools(name, level)), users!referee_id(full_name)')
      .eq('contest_content_id', contestContentId)
      .order('score', { ascending: false }), 'getScoreboard');
    if (error) handleError(error);
    return data || [];
  },

  getTeamScores: async (teamId) => {
    const { data, error } = await withRetry(() => supabase
      .from('scores')
      .select('*, users!referee_id(full_name)')
      .eq('team_id', teamId), 'getTeamScores');
    if (error) handleError(error);
    return data || [];
  },

  getStudentScores: async (studentId) => {
    const { data, error } = await withRetry(() => supabase
      .from('teams')
      .select('id, name, contest_contents(name)')
      .contains('student_ids', [studentId]), 'getStudentScores');
    if (error) handleError(error);
    if (!data?.length) return [];

    const teamIds = data.map(t => t.id);
    const { data: scores, error: e2 } = await withRetry(() => supabase
      .from('scores')
      .select('*, teams(*), users!referee_id(full_name)')
      .in('team_id', teamIds)
      .order('submitted_at', { ascending: false }), 'getStudentScores[scores]');
    if (e2) handleError(e2);
    return (scores || []).map(s => ({ ...s, team: data.find(t => t.id === s.team_id) }));
  },

  postScore: async (body) => {
    const payload = {
      team_id: body.team_id ?? body.teamId,
      contest_content_id: body.contest_content_id ?? body.contestContentId,
      referee_id: body.referee_id ?? body.refereeId ?? null,
      score: Number(body.score) || 0,
      time: body.time ?? null,
      criteria_scores: body.criteria_scores ?? body.criteriaScores ?? {},
      notes: body.notes ?? null,
    };
    const { data, error } = await withRetry(() => supabase.from('scores').insert(payload).select().single(), 'postScore');
    if (error) handleError(error);
    return data;
  },

  getScores: async (params = {}) => {
    let query = supabase
      .from('scores')
      .select('*, teams(*, schools(name)), contest_contents(name), users!referee_id(full_name)')
      .order('submitted_at', { ascending: false });

    if (params.refereeId) query = query.eq('referee_id', params.refereeId);
    if (params.contestContentId) query = query.eq('contest_content_id', params.contestContentId);
    if (params.teamId) query = query.eq('team_id', params.teamId);

    const { data, error } = await withRetry(() => query, 'getScores');
    if (error) handleError(error);
    return data || [];
  },

  getScore: async (id) => {
    const { data, error } = await withRetry(() => supabase
      .from('scores')
      .select('*, teams(*, schools(name)), users!referee_id(full_name)')
      .eq('id', id)
      .single(), 'getScore');
    if (error) handleError(error);
    return data;
  },

  putScore: async (id, body) => {
    const update = {};
    if (body.team_id !== undefined || body.teamId !== undefined) update.team_id = body.team_id ?? body.teamId;
    if (body.contest_content_id !== undefined || body.contestContentId !== undefined) update.contest_content_id = body.contest_content_id ?? body.contestContentId;
    if (body.referee_id !== undefined || body.refereeId !== undefined) update.referee_id = body.referee_id ?? body.refereeId;
    if (body.score !== undefined) update.score = Number(body.score) || 0;
    if (body.time !== undefined) update.time = body.time;
    if (body.criteria_scores !== undefined || body.criteriaScores !== undefined) update.criteria_scores = body.criteria_scores ?? body.criteriaScores;
    if (body.notes !== undefined) update.notes = body.notes;
    const { data, error } = await withRetry(() => supabase.from('scores').update(update).eq('id', id).select().single(), 'putScore');
    if (error) handleError(error);
    return data;
  },

  deleteScore: async (id) => {
    const { error } = await withRetry(() => supabase.from('scores').delete().eq('id', id), 'deleteScore');
    if (error) handleError(error);
    return { ok: true };
  },

  // Users
  getUsers: async (role) => {
    let query = supabase.from('users').select('id, username, full_name, role, area_id, created_at');
    if (role) query = query.eq('role', role);
    const { data, error } = await withRetry(() => query, 'getUsers');
    if (error) handleError(error);
    return data || [];
  },

  // Tạo tài khoản referee (gọi edge function)
  createRefereeUser: async ({ email, password, username, full_name, area_id }, accessToken) => {
    const { data, error } = await withRetry(() => supabase.functions.invoke('create-referee-user', {
      body: { email, password, username, full_name, area_id },
      headers: { Authorization: `Bearer ${accessToken}` },
    }), 'createRefereeUser');
    if (error) handleError(error);
    if (data?.error) throw new Error(data.error);
    return data.user;
  },

  putUser: async (id, body) => {
    const update = {};
    if (body.full_name !== undefined || body.fullName !== undefined) update.full_name = body.full_name ?? body.fullName;
    if (body.area_id !== undefined || body.areaId !== undefined) update.area_id = body.area_id ?? body.areaId;
    if (body.role !== undefined) update.role = body.role;
    const { data, error } = await withRetry(() => supabase.from('users').update(update).eq('id', id).select().single(), 'putUser');
    if (error) handleError(error);
    return data;
  },

  deleteUser: async (id) => {
    const { error } = await withRetry(() => supabase.from('users').delete().eq('id', id), 'deleteUser');
    if (error) handleError(error);
    return { ok: true };
  },

  // Tasks
  getTasks: async (contestContentId) => {
    let query = supabase.from('tasks').select('*');
    if (contestContentId) query = query.eq('contest_content_id', contestContentId);
    query = query.order('order_index').order('created_at');
    const { data, error } = await withRetry(() => query, 'getTasks');
    if (error) handleError(error);
    return data || [];
  },

  getAllTasks: async () => {
    const { data, error } = await withRetry(() => supabase
      .from('tasks')
      .select('*, contest_contents(name, competitions(name))')
      .order('order_index'), 'getAllTasks');
    if (error) handleError(error);
    return data || [];
  },

  getActiveTasks: async (contestContentId) => {
    const { data, error } = await withRetry(() => supabase
      .from('tasks')
      .select('*')
      .eq('contest_content_id', contestContentId)
      .eq('is_active', true)
      .order('order_index')
      .order('created_at'), 'getActiveTasks');
    if (error) handleError(error);
    return data || [];
  },

  getTask: async (id) => {
    const { data, error } = await withRetry(() => supabase.from('tasks').select('*').eq('id', id).single(), 'getTask');
    if (error) handleError(error);
    return data;
  },

  postTask: async (body) => {
    const { data, error } = await withRetry(() => supabase.from('tasks').insert(body).select().single(), 'postTask');
    if (error) handleError(error);
    return data;
  },

  putTask: async (id, body) => {
    const { data, error } = await withRetry(() => supabase.from('tasks').update(body).eq('id', id).select().single(), 'putTask');
    if (error) handleError(error);
    return data;
  },

  deleteTask: async (id) => {
    const { error } = await withRetry(() => supabase.from('tasks').delete().eq('id', id), 'deleteTask');
    if (error) handleError(error);
    return { ok: true };
  },

  // Score Images
  getScoreImages: async (scoreId) => {
    const { data, error } = await withRetry(() => supabase
      .from('score_images')
      .select('*')
      .eq('score_id', scoreId)
      .order('created_at'), 'getScoreImages');
    if (error) handleError(error);
    return data || [];
  },

  uploadScoreImage: async ({ scoreId, file }, accessToken) => {
    if (!file) throw new Error('Chưa chọn file ảnh.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh tối đa 5MB.');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) throw new Error('Chỉ chấp nhận JPG/PNG/WEBP/GIF.');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${scoreId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: upErr } = await withRetry(() => supabase.storage
      .from('score-images')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type }), 'uploadScoreImage[storage]');
    if (upErr) throw new Error(`Upload lỗi: ${upErr.message}`);

    const { data: pub } = supabase.storage.from('score-images').getPublicUrl(path);

    const { data, error } = await withRetry(() => supabase
      .from('score_images')
      .insert({
        score_id: scoreId,
        storage_path: path,
        public_url: pub.publicUrl,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: accessToken ? null : null,
      })
      .select()
      .single(), 'uploadScoreImage[db]');
    if (error) {
      await supabase.storage.from('score-images').remove([path]);
      throw new Error(error.message);
    }
    return data;
  },

  deleteScoreImage: async (imageId, storagePath) => {
    if (storagePath) {
      await withRetry(() => supabase.storage.from('score-images').remove([storagePath]), 'deleteScoreImage[storage]');
    }
    const { error } = await withRetry(() => supabase.from('score_images').delete().eq('id', imageId), 'deleteScoreImage');
    if (error) handleError(error);
    return { ok: true };
  },

  // Diagnostic
  pingSupabase: async () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const envOk = !!(url && key && !url.includes('your-project-id') && !key.includes('your-anon-key'));
    let queryOk = false;
    let queryError = null;
    let sample = null;
    try {
      const { data, error } = await withRetry(() => supabase.from('competitions').select('id, name').limit(1), 'pingSupabase');
      queryOk = !error;
      queryError = error?.message || null;
      sample = data?.[0] || null;
    } catch (e) {
      queryError = e.message;
    }
    return { envOk, url, keyPrefix: key ? `${key.slice(0, 8)}…` : null, queryOk, queryError, sample };
  },
};
