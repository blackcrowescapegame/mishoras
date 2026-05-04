'use strict';

const { getPool, sql } = require('../config/database');

const TimeEntry = {
  async findByUser(userId, { from, to } = {}) {
    const pool = await getPool();
    const req = pool.request().input('userId', sql.Int, userId);
    let where = 'WHERE te.user_id = @userId';
    if (from) { req.input('from', sql.Date, from); where += ' AND te.entry_date >= @from'; }
    if (to)   { req.input('to', sql.Date, to);     where += ' AND te.entry_date <= @to';   }
    const result = await req.query(`
      SELECT te.*, p.name AS project_name, c.name AS client_name, t.name AS task_name
      FROM time_entries te
      JOIN projects p ON p.id = te.project_id
      JOIN clients c ON c.id = p.client_id
      LEFT JOIN tasks t ON t.id = te.task_id
      ${where}
      ORDER BY te.entry_date DESC, te.id DESC
    `);
    return result.recordset;
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT te.*, p.name AS project_name, c.name AS client_name, t.name AS task_name
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
        JOIN clients c ON c.id = p.client_id
        LEFT JOIN tasks t ON t.id = te.task_id
        WHERE te.id = @id
      `);
    return result.recordset[0] || null;
  },

  async create({ user_id, project_id, task_id, entry_date, hours, description }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('user_id',     sql.Int,        user_id)
      .input('project_id',  sql.Int,        project_id)
      .input('task_id',     sql.Int,        task_id || null)
      .input('entry_date',  sql.Date,       entry_date)
      .input('hours',       sql.Decimal(5,2), parseFloat(hours))
      .input('description', sql.NVarChar,   description || null)
      .query(`INSERT INTO time_entries (user_id, project_id, task_id, entry_date, hours, description)
              OUTPUT INSERTED.id
              VALUES (@user_id, @project_id, @task_id, @entry_date, @hours, @description)`);
    return result.recordset[0].id;
  },

  async update(id, { project_id, task_id, entry_date, hours, description }) {
    const pool = await getPool();
    await pool.request()
      .input('id',          sql.Int,        id)
      .input('project_id',  sql.Int,        project_id)
      .input('task_id',     sql.Int,        task_id || null)
      .input('entry_date',  sql.Date,       entry_date)
      .input('hours',       sql.Decimal(5,2), parseFloat(hours))
      .input('description', sql.NVarChar,   description || null)
      .query(`UPDATE time_entries
              SET project_id = @project_id, task_id = @task_id, entry_date = @entry_date,
                  hours = @hours, description = @description, updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async delete(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM time_entries WHERE id = @id');
  },

  /* ---------- report helpers ---------- */

  async reportByClientProject({ from, to, userId } = {}) {
    const pool = await getPool();
    const req = pool.request();
    const conditions = [];
    if (from)   { req.input('from', sql.Date, from);      conditions.push('te.entry_date >= @from'); }
    if (to)     { req.input('to', sql.Date, to);          conditions.push('te.entry_date <= @to');   }
    if (userId) { req.input('userId', sql.Int, userId);   conditions.push('te.user_id = @userId');   }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await req.query(`
      SELECT
        c.id AS client_id, c.name AS client_name,
        p.id AS project_id, p.name AS project_name,
        u.id AS user_id,    u.name AS user_name,
        SUM(te.hours) AS total_hours
      FROM time_entries te
      JOIN projects p ON p.id = te.project_id
      JOIN clients  c ON c.id = p.client_id
      JOIN users    u ON u.id = te.user_id
      ${where}
      GROUP BY c.id, c.name, p.id, p.name, u.id, u.name
      ORDER BY c.name, p.name, u.name
    `);
    return result.recordset;
  },

  async reportSummaryByUser({ from, to } = {}) {
    const pool = await getPool();
    const req = pool.request();
    const conditions = [];
    if (from) { req.input('from', sql.Date, from); conditions.push('te.entry_date >= @from'); }
    if (to)   { req.input('to', sql.Date, to);     conditions.push('te.entry_date <= @to');   }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await req.query(`
      SELECT u.id AS user_id, u.name AS user_name, SUM(te.hours) AS total_hours
      FROM time_entries te
      JOIN users u ON u.id = te.user_id
      ${where}
      GROUP BY u.id, u.name
      ORDER BY total_hours DESC
    `);
    return result.recordset;
  },
};

module.exports = TimeEntry;
