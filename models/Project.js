'use strict';

const { getPool, sql } = require('../config/database');

const Project = {
  async findAll(onlyActive = false) {
    const pool = await getPool();
    const where = onlyActive ? 'WHERE p.active = 1' : '';
    const result = await pool.request()
      .query(`SELECT p.*, c.name AS client_name
              FROM projects p
              JOIN clients c ON c.id = p.client_id
              ${where}
              ORDER BY c.name, p.name`);
    return result.recordset;
  },

  async findByUser(userId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`SELECT p.*, c.name AS client_name
              FROM projects p
              JOIN clients c ON c.id = p.client_id
              JOIN user_projects up ON up.project_id = p.id
              WHERE up.user_id = @uid AND p.active = 1
              ORDER BY c.name, p.name`);
    return result.recordset;
  },

  async findPaged({ page = 1, pageSize = 10, onlyActive = false, sort = 'name', dir = 'asc', q = '' } = {}) {
    const pool  = await getPool();
    const ALLOWED = { name: 'p.name', client_name: 'c.name', custom_id: 'p.custom_id', active: 'p.active', created_at: 'p.created_at', flat_fee: 'p.flat_fee', total_hours: 'p.total_hours' };
    const col   = ALLOWED[sort] || 'p.name';
    const order = dir === 'desc' ? 'DESC' : 'ASC';
    const qTerm = q ? q.trim() : '';
    const conditions = [];
    if (onlyActive) conditions.push('p.active = 1');
    if (qTerm)      conditions.push("(p.name LIKE @q OR c.name LIKE @q OR p.custom_id LIKE @q)");
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (page - 1) * pageSize;
    const buildReq = () => { const r = pool.request(); if (qTerm) r.input('q', sql.NVarChar, '%' + qTerm + '%'); return r; };
    const [dataRes, countRes] = await Promise.all([
      buildReq()
        .input('offset',   sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`SELECT p.*, c.name AS client_name
                FROM projects p
                JOIN clients c ON c.id = p.client_id
                ${where}
                ORDER BY ${col} ${order}
                OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`),
      buildReq()
        .query(`SELECT COUNT(*) AS total FROM projects p JOIN clients c ON c.id = p.client_id ${where}`),
    ]);
    return { rows: dataRes.recordset, total: countRes.recordset[0].total };
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT p.*, c.name AS client_name
              FROM projects p
              JOIN clients c ON c.id = p.client_id
              WHERE p.id = @id`);
    return result.recordset[0] || null;
  },

  async findByClient(clientId, onlyActive = false) {
    const pool = await getPool();
    const where = onlyActive ? 'AND active = 1' : '';
    const result = await pool.request()
      .input('clientId', sql.Int, clientId)
      .query(`SELECT * FROM projects WHERE client_id = @clientId ${where} ORDER BY name`);
    return result.recordset;
  },

  async create({ name, description, client_id, custom_id, budget_spent_pct, flat_fee, billable_amount, total_hours }) {
    const pool = await getPool();
    const toNum = v => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null;
    const result = await pool.request()
      .input('name',             sql.NVarChar,  name)
      .input('description',      sql.NVarChar,  description     || null)
      .input('client_id',        sql.Int,        client_id)
      .input('custom_id',        sql.NVarChar,  custom_id       || null)
      .input('budget_spent_pct', sql.Decimal,    toNum(budget_spent_pct))
      .input('flat_fee',         sql.Decimal,    toNum(flat_fee))
      .input('billable_amount',  sql.Decimal,    toNum(billable_amount))
      .input('total_hours',      sql.Decimal,    toNum(total_hours))
      .query(`INSERT INTO projects (name, description, client_id, custom_id, budget_spent_pct, flat_fee, billable_amount, total_hours)
              OUTPUT INSERTED.id
              VALUES (@name, @description, @client_id, @custom_id, @budget_spent_pct, @flat_fee, @billable_amount, @total_hours)`);
    return result.recordset[0].id;
  },

  async update(id, { name, description, client_id, active, custom_id, budget_spent_pct, flat_fee, billable_amount }) {
    const pool = await getPool();
    const toNum = v => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null;
    await pool.request()
      .input('id',               sql.Int,        id)
      .input('name',             sql.NVarChar,  name)
      .input('description',      sql.NVarChar,  description     || null)
      .input('client_id',        sql.Int,        client_id)
      .input('active',           sql.Bit,        active)
      .input('custom_id',        sql.NVarChar,  custom_id       || null)
      .input('budget_spent_pct', sql.Decimal,    toNum(budget_spent_pct))
      .input('flat_fee',         sql.Decimal,    toNum(flat_fee))
      .input('billable_amount',  sql.Decimal,    toNum(billable_amount))
      .query(`UPDATE projects
              SET name = @name, description = @description, client_id = @client_id, active = @active,
                  custom_id = @custom_id, budget_spent_pct = @budget_spent_pct,
                  flat_fee = @flat_fee, billable_amount = @billable_amount,
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async delete(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE projects SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id');
  },

  /* ── Computed hours from time_entries ── */
  async getLoggedHours(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT COALESCE(SUM(hours), 0) AS total FROM time_entries WHERE project_id = @id');
    return parseFloat(result.recordset[0].total);
  },

  /* ── User ↔ Project assignments ── */
  async getUsers(projectId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('pid', sql.Int, projectId)
      .query(`SELECT u.id, u.name, u.email, u.role
              FROM user_projects up
              JOIN users u ON u.id = up.user_id
              WHERE up.project_id = @pid
              ORDER BY u.name`);
    return result.recordset;
  },

  async setUsers(projectId, userIds) {
    const pool = await getPool();
    await pool.request()
      .input('pid', sql.Int, projectId)
      .query('DELETE FROM user_projects WHERE project_id = @pid');
    for (const uid of userIds) {
      await pool.request()
        .input('pid', sql.Int, projectId)
        .input('uid', sql.Int, uid)
        .query(`IF NOT EXISTS (SELECT 1 FROM user_projects WHERE user_id=@uid AND project_id=@pid)
                INSERT INTO user_projects (user_id, project_id) VALUES (@uid, @pid)`);
    }
  },

  async getTasks(projectId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('pid', sql.Int, projectId)
      .query(`SELECT t.id, t.name, t.hourly_rate, t.billable_by_default
              FROM project_tasks pt
              JOIN tasks t ON t.id = pt.task_id
              WHERE pt.project_id = @pid
              ORDER BY t.name`);
    return result.recordset;
  },

  async setTasks(projectId, taskIds) {
    const pool = await getPool();
    await pool.request()
      .input('pid', sql.Int, projectId)
      .query('DELETE FROM project_tasks WHERE project_id = @pid');
    for (const tid of taskIds) {
      await pool.request()
        .input('pid', sql.Int, projectId)
        .input('tid', sql.Int, tid)
        .query(`IF NOT EXISTS (SELECT 1 FROM project_tasks WHERE project_id=@pid AND task_id=@tid)
                INSERT INTO project_tasks (project_id, task_id) VALUES (@pid, @tid)`);
    }
  },
};

module.exports = Project;
