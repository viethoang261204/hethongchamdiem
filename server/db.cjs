// Kết nối Neon PostgreSQL qua pg Pool.
// DATABASE_URL phải là connection string dạng -pooler (PgBouncer) của Neon.
const { Pool, types } = require('pg');

// numeric (OID 1700) mặc định trả string — parse thành number cho giống
// shape JSON của Supabase/PostgREST (client sort/tính toán trực tiếp trên score)
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// date (OID 1082): giữ nguyên chuỗi 'YYYY-MM-DD' như Supabase,
// tránh pg convert thành Date → serialize ISO kèm giờ + timezone
types.setTypeParser(1082, (v) => v);

if (!process.env.DATABASE_URL) {
  console.error('[db] Thiếu DATABASE_URL trong .env — copy .env.example thành .env và điền connection string Neon.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Neon pooler chịu được nhiều client, nhưng mỗi instance server chỉ cần pool nhỏ
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[db] Pool error:', err.message);
});

const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
