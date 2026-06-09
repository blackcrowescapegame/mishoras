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

  async findPaged({ page = 1, pageSize = 10, onlyActive = false, sort = 'name', dir = 'asc', q = '' } = {}) {
    const pool    = await getPool();
    const ALLOWED_COLS = ['name', 'custom_id', 'contact_person', 'email', 'phone', 'active', 'created_at'];
    const col     = ALLOWED_COLS.includes(sort) ? sort : 'name';
    const order   = dir === 'desc' ? 'DESC' : 'ASC';
    const qTerm   = q ? q.trim() : '';
    const conditions = [];
    if (onlyActive) conditions.push('active = 1');
    if (qTerm)      conditions.push("(name LIKE @q OR custom_id LIKE @q OR contact_person LIKE @q OR email LIKE @q OR phone LIKE @q)");
    const where   = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset  = (page - 1) * pageSize;
    const buildReq = () => { const r = pool.request(); if (qTerm) r.input('q', sql.NVarChar, '%' + qTerm + '%'); return r; };
    const [dataRes, countRes] = await Promise.all([
      buildReq()
        .input('offset',   sql.Int, offset)
        .input('pageSize', sql.Int, pageSize)
        .query(`SELECT * FROM clients ${where} ORDER BY ${col} ${order}
                OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`),
      buildReq()
        .query(`SELECT COUNT(*) AS total FROM clients ${where}`),
    ]);
    return {
      rows:  dataRes.recordset,
      total: countRes.recordset[0].total,
    };
  },

  async findById(id) {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM clients WHERE id = @id');
    return result.recordset[0] || null;
  },

  async create({ name, description, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number }) {
    const pool = await getPool();
    const result = await pool.request()
      .input('name',           sql.NVarChar,  name)
      .input('description',    sql.NVarChar,  description    || null)
      .input('custom_id',      sql.NVarChar,  custom_id      || null)
      .input('contact_person', sql.NVarChar,  contact_person || null)
      .input('email',          sql.NVarChar,  email          || null)
      .input('phone',          sql.NVarChar,  phone          || null)
      .input('address',        sql.NVarChar,  address        || null)
      .input('tax_name',       sql.NVarChar,  tax_name       || null)
      .input('tax_percentage', sql.Decimal,   tax_percentage != null && tax_percentage !== '' ? parseFloat(tax_percentage) : null)
      .input('tax_number',     sql.NVarChar,  tax_number     || null)
      .query(`INSERT INTO clients (name, description, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number)
              OUTPUT INSERTED.id
              VALUES (@name, @description, @custom_id, @contact_person, @email, @phone, @address, @tax_name, @tax_percentage, @tax_number)`);
    return result.recordset[0].id;
  },

  async update(id, { name, description, active, custom_id, contact_person, email, phone, address, tax_name, tax_percentage, tax_number }) {
    const pool = await getPool();
    await pool.request()
      .input('id',             sql.Int,       id)
      .input('name',           sql.NVarChar,  name)
      .input('description',    sql.NVarChar,  description    || null)
      .input('active',         sql.Bit,       active)
      .input('custom_id',      sql.NVarChar,  custom_id      || null)
      .input('contact_person', sql.NVarChar,  contact_person || null)
      .input('email',          sql.NVarChar,  email          || null)
      .input('phone',          sql.NVarChar,  phone          || null)
      .input('address',        sql.NVarChar,  address        || null)
      .input('tax_name',       sql.NVarChar,  tax_name       || null)
      .input('tax_percentage', sql.Decimal,   tax_percentage != null && tax_percentage !== '' ? parseFloat(tax_percentage) : null)
      .input('tax_number',     sql.NVarChar,  tax_number     || null)
      .query(`UPDATE clients
              SET name = @name, description = @description, active = @active,
                  custom_id = @custom_id, contact_person = @contact_person,
                  email = @email, phone = @phone, address = @address,
                  tax_name = @tax_name, tax_percentage = @tax_percentage, tax_number = @tax_number,
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
