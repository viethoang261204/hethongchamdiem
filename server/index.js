import express from 'express';
import cors from 'cors';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'data');

const app = express();
app.use(cors());
app.use(express.json());

const readData = async (file) => {
  const raw = await readFile(path.join(dataPath, `${file}.json`), 'utf-8');
  return JSON.parse(raw);
};

const writeData = async (file, data) => {
  await writeFile(path.join(dataPath, `${file}.json`), JSON.stringify(data, null, 2));
};

// Schools
app.get('/api/schools', async (req, res) => {
  try {
    const { schools } = await readData('schools');
    const query = (req.query.query || '').toString().trim().toLowerCase();
    const level = (req.query.level || '').toString().trim().toUpperCase(); // TH|THCS|THPT
    const province = (req.query.province || '').toString().trim().toLowerCase();
    const district = (req.query.district || '').toString().trim().toLowerCase();

    let list = schools || [];
    if (level) list = list.filter(s => (s.level || '').toUpperCase() === level);
    if (province) list = list.filter(s => (s.province || '').toLowerCase().includes(province));
    if (district) list = list.filter(s => (s.district || '').toLowerCase().includes(district));
    if (query) list = list.filter(s => (s.name || '').toLowerCase().includes(query));

    res.json(list.slice(0, 200));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/schools', async (req, res) => {
  try {
    const data = await readData('schools');
    const id = 'school-' + (Date.now().toString(36));
    const name = (req.body?.name || '').toString().trim();
    const level = (req.body?.level || '').toString().trim().toUpperCase();
    if (!name) return res.status(400).json({ error: 'Thiếu tên trường' });
    if (!['TH', 'THCS', 'THPT'].includes(level)) return res.status(400).json({ error: 'Level không hợp lệ (TH/THCS/THPT)' });

    const newItem = {
      id,
      name,
      level,
      province: (req.body?.province || '').toString().trim(),
      district: (req.body?.district || '').toString().trim(),
      source: req.body?.source || 'manual',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    data.schools = data.schools || [];
    data.schools.push(newItem);
    await writeData('schools', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Import schools (expects JSON array in body: [{name,level,province,district,source?}, ...])
app.post('/api/schools/import', async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body phải là mảng items' });

    const data = await readData('schools');
    data.schools = data.schools || [];

    let added = 0;
    for (const raw of items) {
      const name = (raw?.name || '').toString().trim();
      const level = (raw?.level || '').toString().trim().toUpperCase();
      if (!name || !['TH', 'THCS', 'THPT'].includes(level)) continue;

      const dup = data.schools.find(s => (s.name || '').toLowerCase() === name.toLowerCase() && (s.level || '').toUpperCase() === level);
      if (dup) continue;

      data.schools.push({
        id: 'school-' + (Date.now().toString(36)) + '-' + Math.random().toString(36).slice(2, 6),
        name,
        level,
        province: (raw?.province || '').toString().trim(),
        district: (raw?.district || '').toString().trim(),
        source: raw?.source || 'import',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      added++;
      if (added > 5000) break;
    }

    await writeData('schools', data);
    res.json({ ok: true, added, total: data.schools.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { users } = await readData('users');
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    const { password: _, ...safe } = user;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Competitions
app.get('/api/competitions', async (req, res) => {
  try {
    const data = await readData('competitions');
    res.json(data.competitions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/competitions', async (req, res) => {
  try {
    const data = await readData('competitions');
    const id = 'comp-' + (Date.now().toString(36));
    const newItem = { id, ...req.body, createdAt: new Date().toISOString() };
    data.competitions.push(newItem);
    await writeData('competitions', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/competitions/:id', async (req, res) => {
  try {
    const data = await readData('competitions');
    const i = data.competitions.findIndex(c => c.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found' });
    data.competitions[i] = { ...data.competitions[i], ...req.body };
    await writeData('competitions', data);
    res.json(data.competitions[i]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/competitions/:id', async (req, res) => {
  try {
    const data = await readData('competitions');
    data.competitions = data.competitions.filter(c => c.id !== req.params.id);
    await writeData('competitions', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Contest contents
app.get('/api/contents', async (req, res) => {
  try {
    const { contestContents } = await readData('contestContents');
    res.json(contestContents.sort((a, b) => (a.order || 0) - (b.order || 0)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/competitions/:competitionId/contents', async (req, res) => {
  try {
    const { contestContents } = await readData('contestContents');
    const list = contestContents.filter(c => c.competitionId === req.params.competitionId);
    res.json(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/competitions/:competitionId/contents', async (req, res) => {
  try {
    const data = await readData('contestContents');
    const id = 'content-' + (Date.now().toString(36));
    const newItem = { id, competitionId: req.params.competitionId, ...req.body };
    data.contestContents.push(newItem);
    await writeData('contestContents', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/contents/:id', async (req, res) => {
  try {
    const data = await readData('contestContents');
    const i = data.contestContents.findIndex(c => c.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found' });
    data.contestContents[i] = { ...data.contestContents[i], ...req.body };
    await writeData('contestContents', data);
    res.json(data.contestContents[i]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/contents/:id', async (req, res) => {
  try {
    const data = await readData('contestContents');
    data.contestContents = data.contestContents.filter(c => c.id !== req.params.id);
    await writeData('contestContents', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Areas
app.get('/api/contents/:contestContentId/areas', async (req, res) => {
  try {
    const { areas } = await readData('areas');
    const list = areas.filter(a => a.contestContentId === req.params.contestContentId);
    res.json(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/contents/:contestContentId/areas', async (req, res) => {
  try {
    const data = await readData('areas');
    const { contestContents } = await readData('contestContents');
    const content = contestContents.find(c => c.id === req.params.contestContentId);
    const id = 'area-' + (Date.now().toString(36));
    const newItem = {
      id,
      contestContentId: req.params.contestContentId,
      competitionId: content?.competitionId || req.body.competitionId,
      ...req.body,
    };
    data.areas.push(newItem);
    await writeData('areas', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Students
app.get('/api/students', async (req, res) => {
  try {
    const data = await readData('students');
    res.json(data.students);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const data = await readData('students');
    const id = 'student-' + (Date.now().toString(36));
    const newItem = { id, ...req.body, createdAt: new Date().toISOString() };
    data.students.push(newItem);
    await writeData('students', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    const data = await readData('students');
    const i = data.students.findIndex(s => s.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found' });
    data.students[i] = { ...data.students[i], ...req.body };
    await writeData('students', data);
    res.json(data.students[i]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const data = await readData('students');
    data.students = data.students.filter(s => s.id !== req.params.id);
    await writeData('students', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Teams
// Lấy tất cả teams (với thông tin contestContentId và competitionId)
app.get('/api/teams', async (req, res) => {
  try {
    const { teams } = await readData('teams');
    const list = teams.map(t => ({ ...t, region: t.region || 'bac' }));
    res.json(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/contents/:contestContentId/teams', async (req, res) => {
  try {
    const { teams } = await readData('teams');
    const list = teams
      .filter(t => t.contestContentId === req.params.contestContentId)
      .map(t => ({ ...t, region: t.region || 'bac' }));
    res.json(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/contents/:contestContentId/teams', async (req, res) => {
  try {
    const data = await readData('teams');
    const id = 'team-' + (Date.now().toString(36));
    const { areaId: _areaId, ...rest } = req.body || {};
    const newItem = { id, contestContentId: req.params.contestContentId, ...rest, createdAt: new Date().toISOString() };
    data.teams.push(newItem);
    await writeData('teams', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/teams/:id', async (req, res) => {
  try {
    const data = await readData('teams');
    const i = data.teams.findIndex(t => t.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found' });
    data.teams[i] = { ...data.teams[i], ...req.body };
    await writeData('teams', data);
    res.json(data.teams[i]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/teams/:id', async (req, res) => {
  try {
    const data = await readData('teams');
    data.teams = data.teams.filter(t => t.id !== req.params.id);
    await writeData('teams', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scores (referee submit)
app.get('/api/teams/:teamId/scores', async (req, res) => {
  try {
    const { scores } = await readData('scores');
    const list = scores.filter(s => s.teamId === req.params.teamId);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/scores', async (req, res) => {
  try {
    const data = await readData('scores');
    const id = 'score-' + (Date.now().toString(36));
    const newItem = { id, ...req.body, submittedAt: new Date().toISOString() };
    data.scores.push(newItem);
    await writeData('scores', data);
    res.json(newItem);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scoreboard: scores by content (for admin & student view)
app.get('/api/contents/:contestContentId/scoreboard', async (req, res) => {
  try {
    const { scores } = await readData('scores');
    const { teams } = await readData('teams');
    const list = scores.filter(s => s.contestContentId === req.params.contestContentId);
    const withTeam = list.map(s => {
      const team = teams.find(t => t.id === s.teamId);
      return { ...s, team };
    });
    withTeam.sort((a, b) => (b.score || 0) - (a.score || 0));
    res.json(withTeam);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Student: my scores (by studentId from user)
app.get('/api/students/:studentId/scores', async (req, res) => {
  try {
    const { teams } = await readData('teams');
    const { scores } = await readData('scores');
    const myTeams = teams.filter(t => (t.studentIds || []).includes(req.params.studentId));
    const teamIds = myTeams.map(t => t.id);
    const myScores = scores.filter(s => teamIds.includes(s.teamId));
    const withTeam = myScores.map(s => {
      const team = myTeams.find(t => t.id === s.teamId);
      return { ...s, team };
    });
    res.json(withTeam);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Users (admin) - referee accounts
app.get('/api/users', async (req, res) => {
  try {
    const data = await readData('users');
    const role = req.query.role;
    let list = data.users.map(u => {
      const { password, ...rest } = u;
      return rest;
    });
    if (role) list = list.filter(u => u.role === role);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const data = await readData('users');
    const id = 'user-' + (Date.now().toString(36));
    const newItem = { id, role: 'referee', ...req.body };
    if (!newItem.password) newItem.password = 'referee123';
    data.users.push(newItem);
    await writeData('users', data);
    const { password: _, ...safe } = newItem;
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const data = await readData('users');
    const i = data.users.findIndex(u => u.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found' });
    const { password, ...rest } = req.body;
    if (password !== undefined) data.users[i].password = password;
    Object.assign(data.users[i], rest);
    await writeData('users', data);
    const { password: _p, ...safe } = data.users[i];
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const data = await readData('users');
    const u = data.users.find(x => x.id === req.params.id);
    if (u?.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin' });
    data.users = data.users.filter(u => u.id !== req.params.id);
    await writeData('users', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scores list (admin - filter)
app.get('/api/scores', async (req, res) => {
  try {
    const { scores } = await readData('scores');
    const { teams } = await readData('teams');
    let list = scores.map(s => {
      const team = teams.find(t => t.id === s.teamId);
      return { ...s, team };
    });
    if (req.query.refereeId) list = list.filter(s => s.refereeId === req.query.refereeId);
    if (req.query.competitionId) list = list.filter(s => s.team?.competitionId === req.query.competitionId);
    if (req.query.contestContentId) list = list.filter(s => s.contestContentId === req.query.contestContentId);
    if (req.query.teamId) list = list.filter(s => s.teamId === req.query.teamId);
    list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/scores/:id', async (req, res) => {
  try {
    const { scores } = await readData('scores');
    const { teams } = await readData('teams');
    const score = scores.find(s => s.id === req.params.id);
    if (!score) return res.status(404).json({ error: 'Not found' });
    const team = teams.find(t => t.id === score.teamId);
    res.json({ ...score, team });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/scores/:id', async (req, res) => {
  try {
    const data = await readData('scores');
    const i = data.scores.findIndex(s => s.id === req.params.id);
    if (i === -1) return res.status(404).json({ error: 'Not found' });
    data.scores[i] = { ...data.scores[i], ...req.body };
    await writeData('scores', data);
    res.json(data.scores[i]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/scores/:id', async (req, res) => {
  try {
    const data = await readData('scores');
    data.scores = data.scores.filter(s => s.id !== req.params.id);
    await writeData('scores', data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static files from client build (for production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'client/dist')));

// SPA fallback - must be last route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
