'use strict';

const { getPool, sql } = require('../config/database');

const Client = {
  async findAll(onlyActive = false) {
    const pool = await getPool();
    const where = onlyActive ? 'WHERE active = 1' : '';
    const result = await pool.request()
      .query(`SELECT * FROM clients ${where} ORDER BY name`);
    return result.recordset;
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM clients WHERE id = @id');
    return result.recordset[0] || null;
  },

  async create({ name, description }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .query(`INSERT INTO clients (name, description)
              OUTPUT INSERTED.id
              VALUES (@name, @description)`);
    return result.recordset[0].id;
  },

  async update(id, { name, description, active }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('active', sql.Bit, active)
      .query(`UPDATE clients
              SET name = @name, description = @description, active = @active,
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async delete(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE clients SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id');
  },
};

module.exports = Client;
