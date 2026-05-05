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

  async create({ name, description, client_id }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('client_id', sql.Int, client_id)
      .query(`INSERT INTO projects (name, description, client_id)
              OUTPUT INSERTED.id
              VALUES (@name, @description, @client_id)`);
    return result.recordset[0].id;
  },

  async update(id, { name, description, client_id, active }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('client_id', sql.Int, client_id)
      .input('active', sql.Bit, active)
      .query(`UPDATE projects
              SET name = @name, description = @description, client_id = @client_id,
                  active = @active, updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async delete(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE projects SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id');
  },
};

module.exports = Project;
