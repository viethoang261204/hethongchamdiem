const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  getCompetitions: () => request('/competitions'),
  postCompetition: (body) => request('/competitions', { method: 'POST', body: JSON.stringify(body) }),
  putCompetition: (id, body) => request(`/competitions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteCompetition: (id) => request(`/competitions/${id}`, { method: 'DELETE' }),

  getContents: (competitionId) => request(`/competitions/${competitionId}/contents`),
  getAllContents: () => request('/contents'),
  postContent: (competitionId, body) => request(`/competitions/${competitionId}/contents`, { method: 'POST', body: JSON.stringify(body) }),
  putContent: (id, body) => request(`/contents/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteContent: (id) => request(`/contents/${id}`, { method: 'DELETE' }),

  getAreas: (contestContentId) => request(`/contents/${contestContentId}/areas`),
  postArea: (contestContentId, body) => request(`/contents/${contestContentId}/areas`, { method: 'POST', body: JSON.stringify(body) }),

  getStudents: () => request('/students'),
  postStudent: (body) => request('/students', { method: 'POST', body: JSON.stringify(body) }),
  putStudent: (id, body) => request(`/students/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteStudent: (id) => request(`/students/${id}`, { method: 'DELETE' }),

  getTeams: (contestContentId) => request(`/contents/${contestContentId}/teams`),
  getAllTeams: () => request('/teams'),
  postTeam: (contestContentId, body) => request(`/contents/${contestContentId}/teams`, { method: 'POST', body: JSON.stringify(body) }),
  putTeam: (id, body) => request(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTeam: (id) => request(`/teams/${id}`, { method: 'DELETE' }),

  getScoreboard: (contestContentId) => request(`/contents/${contestContentId}/scoreboard`),
  postScore: (body) => request('/scores', { method: 'POST', body: JSON.stringify(body) }),
  getTeamScores: (teamId) => request(`/teams/${teamId}/scores`),

  getStudentScores: (studentId) => request(`/students/${studentId}/scores`),

  getUsers: (role) => request(role ? `/users?role=${role}` : '/users'),
  postUser: (body) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  putUser: (id, body) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  getSchools: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request(q ? `/schools?${q}` : '/schools');
  },
  postSchool: (body) => request('/schools', { method: 'POST', body: JSON.stringify(body) }),
  importSchools: (items) => request('/schools/import', { method: 'POST', body: JSON.stringify(items) }),

  getScores: (params) => {
    const q = new URLSearchParams(params || {}).toString();
    return request(q ? `/scores?${q}` : '/scores');
  },
  getScore: (id) => request(`/scores/${id}`),
  putScore: (id, body) => request(`/scores/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteScore: (id) => request(`/scores/${id}`, { method: 'DELETE' }),
};
