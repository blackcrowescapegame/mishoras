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
      .query('SELECT id, name, email, role, active, created_at FROM users ORDER BY name');
    return result.recordset;
  },

  async create({ name, email, password, role = 'user' }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, password)
      .input('role', sql.NVarChar, role)
      .query(`INSERT INTO users (name, email, password, role)
              OUTPUT INSERTED.id
              VALUES (@name, @email, @password, @role)`);
    return result.recordset[0].id;
  },

  async update(id, { name, email, role, active }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('email', sql.NVarChar, email)
      .input('role', sql.NVarChar, role)
      .input('active', sql.Bit, active)
      .query(`UPDATE users
              SET name = @name, email = @email, role = @role, active = @active,
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
};

module.exports = User;
