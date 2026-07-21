// Import schema (+ seed tùy chọn) vào Neon.
// Chạy:  npm run db:setup            → chỉ schema
//        npm run db:setup -- --seed  → schema + dữ liệu mẫu
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const withSeed = process.argv.includes('--seed');
  const dbDir = path.join(__dirname, '..', '..', 'db');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('✅ Đã kết nối Neon');

  const schema = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8');
  await client.query(schema);
  console.log('✅ Đã chạy db/schema.sql');

  if (withSeed) {
    const seed = fs.readFileSync(path.join(dbDir, 'seed.sql'), 'utf8');
    await client.query(seed);
    console.log('✅ Đã chạy db/seed.sql (dữ liệu mẫu + tài khoản admin@enjoyai.vn / Admin@123)');
  }

  const { rows } = await client.query(
    `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
  );
  console.log('📋 Các bảng hiện có:', rows.map((r) => r.table_name).join(', '));
  await client.end();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
