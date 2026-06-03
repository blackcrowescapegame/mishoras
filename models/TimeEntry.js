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

  async deleteByUserAndDateRange(userId, from, to) {
    const pool = await getPool();
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('from',   sql.Date, from)
      .input('to',     sql.Date, to)
      .query('DELETE FROM time_entries WHERE user_id = @userId AND entry_date >= @from AND entry_date <= @to');
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

  async findDetailed({ from, to, userId, projectId, taskId, clientId } = {}) {
    const pool = await getPool();
    const req = pool.request();
    const conds = [];
    if (userId)    { req.input('userId',    sql.Int,  userId);    conds.push('te.user_id = @userId');    }
    if (from)      { req.input('from',      sql.Date, from);      conds.push('te.entry_date >= @from');  }
    if (to)        { req.input('to',        sql.Date, to);        conds.push('te.entry_date <= @to');    }
    if (projectId) { req.input('projectId', sql.Int,  projectId); conds.push('te.project_id = @projectId'); }
    if (taskId)    { req.input('taskId',    sql.Int,  taskId);    conds.push('te.task_id = @taskId');    }
    if (clientId)  { req.input('clientId',  sql.Int,  clientId);  conds.push('c.id = @clientId');        }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await req.query(`
      SELECT te.id, te.entry_date, te.hours, te.description,
             u.id AS user_id, u.name AS user_name,
             c.id AS client_id, c.name AS client_name,
             p.id AS project_id, p.name AS project_name,
             t.id AS task_id, t.name AS task_name
      FROM time_entries te
      JOIN projects p ON p.id = te.project_id
      JOIN clients  c ON c.id = p.client_id
      JOIN users    u ON u.id = te.user_id
      LEFT JOIN tasks t ON t.id = te.task_id
      ${where}
      ORDER BY te.entry_date DESC, te.id DESC
    `);
    return result.recordset;
  },

  async dashboardActivity({ from, to, userId, clientId, projectId } = {}) {
    const pool = await getPool();
    const req  = pool.request();
    const conds = [];
    if (from)      { req.input('from',      sql.Date, from);      conds.push('te.entry_date >= @from'); }
    if (to)        { req.input('to',        sql.Date, to);        conds.push('te.entry_date <= @to');   }
    if (userId)    { req.input('userId',    sql.Int,  userId);    conds.push('te.user_id = @userId');   }
    if (clientId)  { req.input('clientId',  sql.Int,  clientId);  conds.push('p.client_id = @clientId');    }
    if (projectId) { req.input('projectId', sql.Int,  projectId); conds.push('te.project_id = @projectId'); }
    const joins = clientId ? 'JOIN projects p ON p.id = te.project_id' : '';
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await req.query(`
      SELECT CONVERT(VARCHAR(10), te.entry_date, 23) AS day, SUM(te.hours) AS hours
      FROM time_entries te
      ${joins}
      ${where}
      GROUP BY te.entry_date
      ORDER BY te.entry_date
    `);
    return result.recordset;
  },

  async dashboardGrouped({ from, to, userId, sumBy, clientId, projectId } = {}) {
    const pool = await getPool();
    const req  = pool.request();
    const conds = [];
    if (from)      { req.input('from',      sql.Date, from);      conds.push('te.entry_date >= @from'); }
    if (to)        { req.input('to',        sql.Date, to);        conds.push('te.entry_date <= @to');   }
    if (userId)    { req.input('userId',    sql.Int,  userId);    conds.push('te.user_id = @userId');   }
    if (clientId)  { req.input('clientId',  sql.Int,  clientId);  conds.push('p.client_id = @clientId');    }
    if (projectId) { req.input('projectId', sql.Int,  projectId); conds.push('te.project_id = @projectId'); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    let qtext;
    if (sumBy === 'clients_projects') {
      qtext = `
        SELECT c.id AS group_id, c.name AS group_name,
               p.id AS sub_id, p.name AS sub_name,
               SUM(te.hours) AS hours
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
        JOIN clients  c ON c.id = p.client_id
        ${where}
        GROUP BY c.id, c.name, p.id, p.name
        ORDER BY c.name, p.name`;
    } else if (sumBy === 'projects_users') {
      qtext = `
        SELECT p.id AS group_id, p.name AS group_name,
               u.id AS sub_id, u.name AS sub_name,
               SUM(te.hours) AS hours
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
        JOIN users    u ON u.id = te.user_id
        ${where}
        GROUP BY p.id, p.name, u.id, u.name
        ORDER BY p.name, u.name`;
    } else {
      // projects_tasks (default)
      qtext = `
        SELECT p.id AS group_id, p.name AS group_name,
               ISNULL(t.id, 0) AS sub_id, ISNULL(t.name, N'(No task)') AS sub_name,
               SUM(te.hours) AS hours
        FROM time_entries te
        JOIN projects p ON p.id = te.project_id
        LEFT JOIN tasks t ON t.id = te.task_id
        ${where}
        GROUP BY p.id, p.name, t.id, t.name
        ORDER BY p.name, t.name`;
    }
    const result = await req.query(qtext);
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
