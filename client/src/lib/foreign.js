// Đội nước ngoài — ở Asian Open được nhập với Trường / Trung tâm = tên nước
// (Taiwan, China, Mongolia, Romania, Indonesia, Macau...). Dùng chung cho Xét
// điểm lần 2 và mọi danh sách / số liệu "đủ điều kiện đi Trung Quốc" (không
// tính đội nước ngoài).
import { normalizeText } from './lookup';

const FOREIGN_SCHOOLS = new Set([
  'china', 'taiwan', 'mongolia', 'romania', 'indonesia', 'macau', 'macao', 'hong kong', 'singapore', 'malaysia',
  'thailand', 'philippines', 'cambodia', 'laos', 'myanmar', 'japan', 'korea', 'south korea', 'india', 'australia',
]);

export const isForeignSchool = (name) => FOREIGN_SCHOOLS.has(normalizeText(name).replace(/\s+/g, ' ').trim());
export const isForeignTeam = (t) => isForeignSchool(t?.school_name);
