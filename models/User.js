'use strict';

const { getPool, sql } = require('../config/database');

const User = {
  async findByEmail(email) {
    const pool = await getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT * FROM users WHERE email = @email AND active = 1');
    return result.recordset[0] || null;
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM users WHERE id = @id');
    return result.recordset[0] || null;
  },

  async findAll() {
    const pool = await getPool();
    const result = await pool.request()
      .query('SELECT id, name, email, role, active, custom_id, labor_rate, billable_rate, created_at FROM users ORDER BY name');
    return result.recordset;
  },

  async findPaged({ page = 1, pageSize = 10, sort = 'name', dir = 'asc', q = '' } = {}) {
    const pool = await getPool();
    const ALLOWED = ['name', 'email', 'role', 'active', 'created_at'];
    const col   = ALLOWED.includes(sort) ? sort : 'name';
    const order = dir === 'desc' ? 'DESC' : 'ASC';
    const qTerm = q ? q.trim() : '';
    const where = qTerm ? "WHERE (name LIKE @q OR email LIKE @q OR custom_id LIKE @q)" : '';
    const offset = (page - 1) * pageSize;
    const buildReq = () => { const r = pool.request(); if (qTerm) r.input('q', sql.NVarChar, '%' + qTerm + '%'); return r; };
    const [dataRes, countRes] = await Promise.all([
      buildReq()
        .input('offset',   sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`SELECT id, name, email, role, active, custom_id, labor_rate, billable_rate, created_at
                FROM users ${where}
                ORDER BY ${col} ${order}
                OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`),
      buildReq().query(`SELECT COUNT(*) AS total FROM users ${where}`),
    ]);
    return { rows: dataRes.recordset, total: countRes.recordset[0].total };
  },

  async create({ name, email, password, role = 'user', custom_id, labor_rate, billable_rate }) {
    const pool = await getPool();
    const toNum = v => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null;
    const result = await pool.request()
      .input('name',          sql.NVarChar, name)
      .input('email',         sql.NVarChar, email)
      .input('password',      sql.NVarChar, password)
      .input('role',          sql.NVarChar, role)
      .input('custom_id',     sql.NVarChar, custom_id    || null)
      .input('labor_rate',    sql.Decimal,  toNum(labor_rate))
      .input('billable_rate', sql.Decimal,  toNum(billable_rate))
      .query(`INSERT INTO users (name, email, password, role, custom_id, labor_rate, billable_rate)
              OUTPUT INSERTED.id
              VALUES (@name, @email, @password, @role, @custom_id, @labor_rate, @billable_rate)`);
    return result.recordset[0].id;
  },

  async update(id, { name, email, role, active, custom_id, labor_rate, billable_rate }) {
    const pool = await getPool();
    const toNum = v => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null;
    await pool.request()
      .input('id',            sql.Int,      id)
      .input('name',          sql.NVarChar, name)
      .input('email',         sql.NVarChar, email)
      .input('role',          sql.NVarChar, role)
      .input('active',        sql.Bit,      active)
      .input('custom_id',     sql.NVarChar, custom_id    || null)
      .input('labor_rate',    sql.Decimal,  toNum(labor_rate))
      .input('billable_rate', sql.Decimal,  toNum(billable_rate))
      .query(`UPDATE users
              SET name = @name, email = @email, role = @role, active = @active,
                  custom_id = @custom_id, labor_rate = @labor_rate, billable_rate = @billable_rate,
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async updatePassword(id, password) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('password', sql.NVarChar, password)
      .query(`UPDATE users SET password = @password, updated_at = SYSUTCDATETIME() WHERE id = @id`);
  },

  async updateProfile(id, { name }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .query(`UPDATE users SET name = @name, updated_at = SYSUTCDATETIME() WHERE id = @id`);
  },

  /* ── User ↔ Project assignments ── */
  async getProjects(userId) {
    const pool = await getPool();
    const result = await pool.request()
      .input('uid', sql.Int, userId)
      .query(`SELECT p.id, p.name, c.name AS client_name
              FROM user_projects up
              JOIN projects p ON p.id = up.project_id
              JOIN clients  c ON c.id = p.client_id
              WHERE up.user_id = @uid
              ORDER BY c.name, p.name`);
    return result.recordset;
  },

  async setProjects(userId, projectIds) {
    const pool = await getPool();
    await pool.request()
      .input('uid', sql.Int, userId)
      .query('DELETE FROM user_projects WHERE user_id = @uid');
    for (const pid of projectIds) {
      await pool.request()
        .input('uid', sql.Int, userId)
        .input('pid', sql.Int, pid)
        .query(`IF NOT EXISTS (SELECT 1 FROM user_projects WHERE user_id=@uid AND project_id=@pid)
                INSERT INTO user_projects (user_id, project_id) VALUES (@uid, @pid)`);
    }
  },

  async addProject(userId, projectId) {
    const pool = await getPool();
    await pool.request()
      .input('uid', sql.Int, userId)
      .input('pid', sql.Int, projectId)
      .query(`IF NOT EXISTS (SELECT 1 FROM user_projects WHERE user_id=@uid AND project_id=@pid)
              INSERT INTO user_projects (user_id, project_id) VALUES (@uid, @pid)`);
  },
};

module.exports = User;
