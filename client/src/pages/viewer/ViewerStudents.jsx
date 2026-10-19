import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLookupData } from './ViewerLayout';
import { contentLabel, normalizeText } from '../../lib/lookup';
import { usePagination } from '../../hooks/usePagination';
import Pagination from '../../components/Pagination';

export default function ViewerStudents() {
  const { lookup } = useLookupData();
  const [q, setQ] = useState('');
  const [school, setSchool] = useState('');
  const [contentId, setContentId] = useState('');
  const [grade, setGrade] = useState('');

  const grades = useMemo(() => [...new Set((lookup?.students || []).map((s) => s.grade).filter(Boolean))].sort(), [lookup]);

  const filtered = useMemo(() => {
    if (!lookup) return [];
    const nq = normalizeText(q);
    return lookup.students.filter((s) => {
      if (school && s.school_name !== school && !s.teams.some((t) => t.school_name === school)) return false;
      if (contentId && !s.teams.some((t) => t.contest_content_id === contentId)) return false;
      if (grade && s.grade !== grade) return false;
      if (!nq) return true;
      return [s.full_name, s.school_name, ...s.teams.map((t) => t.name)].some((v) => normalizeText(v).includes(nq));
    });
  }, [lookup, q, school, contentId, grade]);

  const { pageItems, page, setPage, pageCount, totalItems, pageSize } = usePagination(filtered, 30);
  if (!lookup) return null;

  return (
    <div className="referee-content-wrap">
      <div className="referee-page-header">
        <h1 className="referee-page-title">Học sinh tham dự</h1>
        <p className="referee-page-subtitle">{lookup.students.length} học sinh trong giải — tìm theo tên học sinh, tên đội hoặc trường / trung tâm.</p>
      </div>

      <div className="filters-bar viewer-filters">
        <div className="search-box">
          <input type="text" placeholder="Tên học sinh, đội, trường..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="filter-select" value={contentId} onChange={(e) => setContentId(e.target.value)}>
          <option value="">Tất cả nội dung</option>
          {lookup.contents.map((c) => <option key={c.id} value={c.id}>{contentLabel(lookup, c)}</option>)}
        </select>
        <select className="filter-select" value={school} onChange={(e) => setSchool(e.target.value)}>
          <option value="">Tất cả trường / TT</option>
          {lookup.schools.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        {grades.length > 0 && (
          <select className="filter-select" value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Tất cả khối</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>

      <p className="viewer-count">{filtered.length} học sinh</p>

      <div className="card">
        <div className="table-container">
          <table>
            <thead><tr><th>Học sinh</th><th>Khối</th><th>Trường / Trung tâm</th><th>Đội thi</th></tr></thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>Không tìm thấy học sinh nào.</td></tr>
              ) : pageItems.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.full_name}</strong></td>
                  <td>{s.grade || '—'}</td>
                  <td>{s.school_name || '—'}</td>
                  <td>
                    {s.teams.map((t) => (
                      <div key={t.id}>
                        <Link className="viewer-link" to={`/tra-cuu/doi-thi?q=${encodeURIComponent(t.name)}&noiDung=${t.contest_content_id}`}>{t.name}</Link>
                        <span className="viewer-sub"> — {contentLabel(lookup, t.content)} · {t.boardName}</span>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} totalItems={totalItems} pageSize={pageSize} />
      </div>
    </div>
  );
}
