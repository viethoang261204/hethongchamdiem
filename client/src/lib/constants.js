// 5 khối cố định cho học sinh — trước đây "Khối" là ô nhập tự do nên dữ
// liệu bị lệch chuẩn đủ kiểu (Upper/Uppper/Middle/Middle School...). Dùng
// chung danh sách này ở mọi nơi có ô "Khối" (AdminStudents.jsx,
// AdminTeams.jsx) để không lặp lại tình trạng đó. Khớp với
// GRADE_OPTIONS/normalizeGrade ở server/routes.cjs.
export const GRADE_OPTIONS = ['Early Elementary School', 'Lower Elementary School', 'Upper Elementary School', 'Middle School', 'High School'];
