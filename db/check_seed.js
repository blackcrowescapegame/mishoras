'use strict';
require('dotenv').config();
const { getPool } = require('../config/database');
(async () => {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT u.name, COUNT(*) AS entries,
           CAST(SUM(te.hours) AS DECIMAL(8,2)) AS total_hours,
           MIN(te.entry_date) AS from_date, MAX(te.entry_date) AS to_date
    FROM time_entries te JOIN users u ON u.id = te.user_id
    WHERE u.id IN (2,3,4)
    GROUP BY u.id, u.name ORDER BY u.name
  `);
  r.recordset.forEach(row =>
    console.log(row.name, '|', row.entries, 'entries |', row.total_hours, 'h |',
      new Date(row.from_date).toISOString().slice(0,10), '->', new Date(row.to_date).toISOString().slice(0,10)));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
