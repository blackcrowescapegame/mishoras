'use strict';

const { getPool, sql } = require('../config/database');

const Task = {
  async findAll(onlyActive = false) {
    const pool = await getPool();
    const where = onlyActive ? 'WHERE active = 1' : '';
    const result = await pool.request()
      .query(`SELECT * FROM tasks ${where} ORDER BY name`);
    return result.recordset;
  },

  async findPaged({ page = 1, pageSize = 10, sort = 'name', dir = 'asc', q = '' } = {}) {
    const pool = await getPool();
    const ALLOWED = ['name', 'active', 'hourly_rate', 'billable_by_default', 'created_at'];
    const col   = ALLOWED.includes(sort) ? sort : 'name';
    const order = dir === 'desc' ? 'DESC' : 'ASC';
    const qTerm = q ? q.trim() : '';
    const where = qTerm ? "WHERE (name LIKE @q OR description LIKE @q)" : '';
    const offset = (page - 1) * pageSize;
    const buildReq = () => { const r = pool.request(); if (qTerm) r.input('q', sql.NVarChar, '%' + qTerm + '%'); return r; };
    const [dataRes, countRes] = await Promise.all([
      buildReq()
        .input('offset',   sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`SELECT * FROM tasks ${where}
                ORDER BY ${col} ${order}
                OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`),
      buildReq().query(`SELECT COUNT(*) AS total FROM tasks ${where}`),
    ]);
    return { rows: dataRes.recordset, total: countRes.recordset[0].total };
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM tasks WHERE id = @id');
    return result.recordset[0] || null;
  },

  async findByProject(projectId, onlyActive = false) {
    const pool = await getPool();
    const activeWhere = onlyActive ? 'AND t.active = 1' : '';
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT t.* FROM tasks t
              JOIN project_tasks pt ON pt.task_id = t.id
              WHERE pt.project_id = @projectId ${activeWhere}
              ORDER BY t.name`);
    return result.recordset;
  },

  async create({ name, description, hourly_rate, billable_by_default, add_to_new_projects }) {
    const pool = await getPool();
    const toNum = v => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null;
    const toBit = v => (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true') ? 1 : 0;
    const result = await pool.request()
      .input('name',                sql.NVarChar, name)
      .input('description',         sql.NVarChar, description || null)
      .input('hourly_rate',         sql.Decimal,  toNum(hourly_rate))
      .input('billable_by_default', sql.Bit,      toBit(billable_by_default))
      .input('add_to_new_projects', sql.Bit,      toBit(add_to_new_projects))
      .query(`INSERT INTO tasks (name, description, hourly_rate, billable_by_default, add_to_new_projects)
              OUTPUT INSERTED.id
              VALUES (@name, @description, @hourly_rate, @billable_by_default, @add_to_new_projects)`);
    return result.recordset[0].id;
  },

  async update(id, { name, description, active, hourly_rate, billable_by_default, add_to_new_projects }) {
    const pool = await getPool();
    const toNum = v => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null;
    const toBit = v => (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true') ? 1 : 0;
    await pool.request()
      .input('id',                  sql.Int,      id)
      .input('name',                sql.NVarChar, name)
      .input('description',         sql.NVarChar, description || null)
      .input('active',              sql.Bit,      active)
      .input('hourly_rate',         sql.Decimal,  toNum(hourly_rate))
      .input('billable_by_default', sql.Bit,      toBit(billable_by_default))
      .input('add_to_new_projects', sql.Bit,      toBit(add_to_new_projects))
      .query(`UPDATE tasks
              SET name = @name, description = @description, active = @active,
                  hourly_rate = @hourly_rate, billable_by_default = @billable_by_default,
                  add_to_new_projects = @add_to_new_projects, updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async delete(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE tasks SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id');
  },

  /* ── Task ↔ Project assignments ── */
  async getProjects(taskId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('tid', sql.Int, taskId)
      .query(`SELECT p.id, p.name, c.name AS client_name
              FROM project_tasks pt
              JOIN projects p ON p.id = pt.project_id
              JOIN clients  c ON c.id = p.client_id
              WHERE pt.task_id = @tid
              ORDER BY c.name, p.name`);
    return result.recordset;
  },

  async setProjects(taskId, projectIds) {
    const pool = await getPool();
    await pool.request()
      .input('tid', sql.Int, taskId)
      .query('DELETE FROM project_tasks WHERE task_id = @tid');
    for (const pid of projectIds) {
      await pool.request()
        .input('tid', sql.Int, taskId)
        .input('pid', sql.Int, pid)
        .query(`IF NOT EXISTS (SELECT 1 FROM project_tasks WHERE project_id=@pid AND task_id=@tid)
                INSERT INTO project_tasks (project_id, task_id) VALUES (@pid, @tid)`);
    }
  },
};

module.exports = Task;
