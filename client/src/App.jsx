import { createContext, useContext, useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { NotifyProvider } from './context/NotifyContext';
import HomePage from './pages/HomePage';
import AdminLogin from './pages/admin/AdminLogin';
import AdminLayout from './pages/admin/AdminLayout';
import AdminCompetitions from './pages/admin/AdminCompetitions';
import AdminContents from './pages/admin/AdminContents';
import AdminTeams from './pages/admin/AdminTeams';
import AdminStudents from './pages/admin/AdminStudents';
import AdminRefereeAccounts from './pages/admin/AdminRefereeAccounts';
import AdminScores from './pages/admin/AdminScores';
import AdminScoreDetail from './pages/admin/AdminScoreDetail';
import AdminScoreboard from './pages/admin/AdminScoreboard';
import AdminContentsPage from './pages/admin/AdminContentsPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import RefereeLogin from './pages/referee/RefereeLogin';
import RefereeLayout from './pages/referee/RefereeLayout';
import RefereeSelect from './pages/referee/RefereeSelect';
import RefereeTeams from './pages/referee/RefereeTeams';
import RefereeScoreForm from './pages/referee/RefereeScoreForm';
import RefereeScoreHistory from './pages/referee/RefereeScoreHistory';
import RefereeScoreDetail from './pages/referee/RefereeScoreDetail';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const s = localStorage.getItem('enjoy-ai-user');
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback((u) => {
    setUser(u);
    localStorage.setItem('enjoy-ai-user', JSON.stringify(u));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('enjoy-ai-user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <NotifyProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={user?.role === 'admin' ? <AdminLayout /> : <AdminLogin />}>
          {user?.role === 'admin' && (
            <>
              <Route index element={<AdminDashboard />} />
              <Route path="competitions" element={<AdminCompetitions />} />
              <Route path="competitions/:competitionId/contents" element={<AdminContents />} />
              <Route path="competitions/:competitionId/contents/:contentId/teams" element={<AdminTeams />} />
              <Route path="competitions/:competitionId/contents/:contentId/scoreboard" element={<AdminScoreboard />} />
              <Route path="contents" element={<AdminContentsPage />} />
              <Route path="teams" element={<AdminTeams />} />
              <Route path="scoreboard" element={<AdminScoreboard />} />
              <Route path="students" element={<AdminStudents />} />
              <Route path="referee-accounts" element={<AdminRefereeAccounts />} />
              <Route path="scores" element={<AdminScores />} />
              <Route path="scores/:scoreId" element={<AdminScoreDetail />} />
            </>
          )}
        </Route>
        <Route path="/referee" element={user?.role === 'referee' ? <RefereeLayout /> : <RefereeLogin />}>
          {user?.role === 'referee' && (
            <>
              <Route index element={<RefereeSelect />} />
              <Route path="competition/:competitionId/content/:contentId/region/:region/teams" element={<RefereeTeams />} />
              <Route path="competition/:competitionId/content/:contentId/region/:region/team/:teamId/score" element={<RefereeScoreForm />} />
              <Route path="history" element={<RefereeScoreHistory />} />
              <Route path="history/:scoreId" element={<RefereeScoreDetail />} />
            </>
          )}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </NotifyProvider>
    </AuthContext.Provider>
  );
}
