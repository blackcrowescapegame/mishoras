'use strict';

const { getPool, sql } = require('../config/database');

const Task = {
  async findAll(onlyActive = false) {
    const pool = await getPool();
    const where = onlyActive ? 'WHERE t.active = 1' : '';
    const result = await pool.request()
      .query(`SELECT t.*, p.name AS project_name, c.name AS client_name
              FROM tasks t
              JOIN projects p ON p.id = t.project_id
              JOIN clients c ON c.id = p.client_id
              ${where}
              ORDER BY p.name, t.name`);
    return result.recordset;
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT t.*, p.name AS project_name
              FROM tasks t
              JOIN projects p ON p.id = t.project_id
              WHERE t.id = @id`);
    return result.recordset[0] || null;
  },

  async findByProject(projectId, onlyActive = false) {
    const pool = await getPool();
    const where = onlyActive ? 'AND active = 1' : '';
    const result = await pool.request()
      .input('projectId', sql.Int, projectId)
      .query(`SELECT * FROM tasks WHERE project_id = @projectId ${where} ORDER BY name`);
    return result.recordset;
  },

  async create({ name, description, project_id }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('project_id', sql.Int, project_id)
      .query(`INSERT INTO tasks (name, description, project_id)
              OUTPUT INSERTED.id
              VALUES (@name, @description, @project_id)`);
    return result.recordset[0].id;
  },

  async update(id, { name, description, project_id, active }) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('project_id', sql.Int, project_id)
      .input('active', sql.Bit, active)
      .query(`UPDATE tasks
              SET name = @name, description = @description, project_id = @project_id,
                  active = @active, updated_at = SYSUTCDATETIME()
              WHERE id = @id`);
  },

  async delete(id) {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE tasks SET active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id');
  },
};

module.exports = Task;
