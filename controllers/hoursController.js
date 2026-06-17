'use strict';

const TimeEntry = require('../models/TimeEntry');
const Project   = require('../models/Project');
const Task      = require('../models/Task');
const Client    = require('../models/Client');
const User      = require('../models/User');
const ExcelJS   = require('exceljs');
const PDFDoc    = require('pdfkit');

/* ── Week helpers ── */
const MONTH_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAY_SHORT   = ['Lun','Mar','Mié','Jue','Vie'];

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun,1=Mon…
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function hoursToHHMM(h) {
  if (!h || h <= 0) return '';
  const total = Math.round(parseFloat(h) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

function parseHHMM(str) {
  if (!str || !str.trim()) return 0;
  const s = str.trim();
  if (s.includes(':')) {
    const [h, m] = s.split(':').map(n => parseInt(n, 10) || 0);
    return h + m / 60;
  }
  return parseFloat(s) || 0;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart, today) {
  const mon = new Date(weekStart + 'T00:00:00');
  const sun = new Date(weekStart + 'T00:00:00');
  sun.setDate(sun.getDate() + 6);
  const label = `${mon.getDate()} ${MONTH_SHORT[mon.getMonth()]} → ${sun.getDate()} ${MONTH_SHORT[sun.getMonth()]} ${sun.getFullYear()}`;
  const isCurrentWeek = today >= weekStart && today <= sun.toISOString().slice(0, 10);
  return { label: isCurrentWeek ? `Esta semana, ${label}` : label, isCurrentWeek };
}

/* ── Shared: resolve filters from query for detailedView & downloadDetailed ── */
function resolveDetailedFilters(query, today, isAdmin, sessionUserId) {
  const preset = query.preset || 'this_week';
  let from, to;
  if (preset === 'today') {
    from = to = today;
  } else if (preset === 'this_week') {
    from = getMondayOf(today); to = addDays(from, 6);
  } else if (preset === 'this_month') {
    const d = new Date(today + 'T00:00:00');
    from = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; to = today;
  } else if (preset === 'last_week') {
    from = getMondayOf(addDays(today, -7)); to = addDays(from, 6);
  } else if (preset === 'last_month') {
    const d = new Date(today + 'T00:00:00');
    const y = d.getMonth() === 0 ? d.getFullYear()-1 : d.getFullYear();
    const m = d.getMonth() === 0 ? 12 : d.getMonth();
    from = `${y}-${String(m).padStart(2,'0')}-01`;
    to   = `${y}-${String(m).padStart(2,'0')}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
  } else if (preset === 'this_year') {
    from = `${new Date().getFullYear()}-01-01`; to = today;
  } else {
    from = (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) ? query.from : getMondayOf(today);
    to   = (query.to   && /^\d{4}-\d{2}-\d{2}$/.test(query.to))   ? query.to   : addDays(getMondayOf(today), 6);
  }
  const filterUserId    = isAdmin && query.user_id    ? parseInt(query.user_id, 10)    : null;
  const filterProjectId = query.project_id ? parseInt(query.project_id, 10) : null;
  const filterClientId  = query.client_id  ? parseInt(query.client_id, 10)  : null;
  const filterTaskId    = query.task_id    ? parseInt(query.task_id, 10)    : null;
  return { preset, from, to, filterUserId, filterProjectId, filterClientId, filterTaskId,
           userId: isAdmin ? filterUserId : sessionUserId };
}

const HoursController = {
  async index(req, res) {
    const today = getTodayStr();
    const view  = req.query.view === 'day' ? 'day' : 'week';

    /* ── Day view ── */
    if (view === 'day') {
      const currentDate = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
        ? req.query.date : today;
      const prevDay = addDays(currentDate, -1);
      const nextDay = addDays(currentDate,  1);
      const isToday = currentDate === today;
      const d = new Date(currentDate + 'T00:00:00');
      const dowIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const DAY_LONG = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
      const dayLabel = `${DAY_LONG[dowIdx]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}${isToday ? ' (Hoy)' : ''}`;
      try {
        const [rawEntries, projects] = await Promise.all([
          TimeEntry.findByUser(req.session.userId, { from: currentDate, to: currentDate }),
          req.session.userRole === 'admin' ? Project.findAll(true) : Project.findByUser(req.session.userId),
        ]);
        const dayEntries = rawEntries.map(e => ({ ...e, hoursStr: hoursToHHMM(e.hours) || '0:00' }));
        const dayTotal   = hoursToHHMM(rawEntries.reduce((s, e) => s + parseFloat(e.hours), 0)) || '0:00';
        return res.render('hours/index', {
          title: 'Track',
          view: 'day',
          currentDate, prevDay, nextDay, isToday, dayLabel, dayEntries, dayTotal, projects,
          weekStart: getMondayOf(today),
          weekDays: [], weekLabel: '', isCurrentWeek: false,
          prevWeek: '', nextWeek: '', rows: [], colTotals: [], weekTotal: '0:00',
          success: req.flash('success'),
          error:   req.flash('error'),
          user:    req.session.user,
        });
      } catch (err) {
        console.error(err);
        req.flash('error', 'No se pudieron cargar los registros.');
        return res.redirect('/');
      }
    }

    /* ── Week view ── */
    const weekStart = getMondayOf(req.query.weekStart || today);
    const prevWeek  = addDays(weekStart, -7);
    const nextWeek  = addDays(weekStart,  7);

    // Build weekDays array: Mon–Fri
    const weekDays = [];
    for (let i = 0; i < 5; i++) {
      const dateStr = addDays(weekStart, i);
      const d = new Date(dateStr + 'T00:00:00');
      weekDays.push({
        date:    dateStr,
        label:   DAY_SHORT[i],
        num:     d.getDate(),
        month:   MONTH_SHORT[d.getMonth()],
        isToday: dateStr === today,
      });
    }

    const { label: weekLabel, isCurrentWeek } = formatWeekLabel(weekStart, today);

    try {
      const [entries, projects] = await Promise.all([
        TimeEntry.findByUser(req.session.userId, { from: weekDays[0].date, to: weekDays[4].date }),
        req.session.userRole === 'admin' ? Project.findAll(true) : Project.findByUser(req.session.userId),
      ]);

      // Group entries by project_id + task_id
      const rowMap = new Map();
      for (const e of entries) {
        const key = `${e.project_id}_${e.task_id || 'null'}`;
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            project_id:   e.project_id,
            project_name: e.project_name,
            client_name:  e.client_name,
            task_id:      e.task_id,
            task_name:    e.task_name,
            days: {},
          });
        }
        const raw = e.entry_date instanceof Date ? e.entry_date.toISOString().slice(0, 10) : String(e.entry_date).slice(0, 10);
        rowMap.get(key).days[raw] = { hhmm: hoursToHHMM(e.hours), id: e.id, description: e.description || '' };
      }

      const rows = Array.from(rowMap.values())
        .sort((a, b) => {
          const ka = (a.client_name || '') + ' - ' + (a.project_name || '');
          const kb = (b.client_name || '') + ' - ' + (b.project_name || '');
          return ka.localeCompare(kb);
        });
      while (rows.length < 3) rows.push({ project_id: '', task_id: '', days: {} });

      const colTotals = weekDays.map(wd => {
        const total = entries
          .filter(e => (e.entry_date instanceof Date ? e.entry_date.toISOString().slice(0,10) : String(e.entry_date).slice(0,10)) === wd.date)
          .reduce((s, e) => s + parseFloat(e.hours), 0);
        return hoursToHHMM(total) || '0:00';
      });
      const weekTotal = hoursToHHMM(entries.reduce((s, e) => s + parseFloat(e.hours), 0)) || '0:00';

      res.render('hours/index', {
        title: 'Track',
        view: 'week',
        currentDate: today,
        weekDays, weekLabel, isCurrentWeek, weekStart, prevWeek, nextWeek, rows, projects, colTotals, weekTotal,
        dayEntries: [], dayTotal: '0:00', dayLabel: '', isToday: false, prevDay: '', nextDay: '',
        success: req.flash('success'),
        error:   req.flash('error'),
        user:    req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudieron cargar los registros.');
      res.redirect('/');
    }
  },

  async saveWeekly(req, res) {
    const weekStart = req.body.weekStart;
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      req.flash('error', 'Invalid week.');
      return res.redirect('/hours');
    }

    const weekEnd = addDays(weekStart, 4);

    const rows = req.body.rows ? (Array.isArray(req.body.rows) ? req.body.rows : Object.values(req.body.rows)) : [];

    // Validar todo antes de tocar la base de datos
    for (const row of rows) {
      if (!row.project_id) continue;
      for (let i = 0; i < 5; i++) {
        const hhmm = row[`d${i}`];
        const hrs  = parseHHMM(hhmm);
        if (hrs <= 0) continue;
        if (hrs > 24) {
          const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
          req.flash('error', `El valor ingresado en ${DAY_NAMES[i]} (${hhmm}) supera el máximo permitido de 24 horas por día.`);
          return res.redirect(`/hours?weekStart=${weekStart}`);
        }
      }
    }

    try {
      await TimeEntry.deleteByUserAndDateRange(req.session.userId, weekStart, weekEnd);

      for (const row of rows) {
        if (!row.project_id) continue;
        for (let i = 0; i < 5; i++) {
          const hhmm = row[`d${i}`];
          const hrs  = parseHHMM(hhmm);
          if (hrs <= 0) continue;
          await TimeEntry.create({
            user_id:     req.session.userId,
            project_id:  parseInt(row.project_id, 10),
            task_id:     row.task_id ? parseInt(row.task_id, 10) : null,
            entry_date:  addDays(weekStart, i),
            hours:       hrs,
            description: row.description || null,
          });
        }
      }

      req.flash('success', 'Horas registradas exitosamente.');
      res.redirect(`/hours?weekStart=${weekStart}`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudieron guardar los registros.');
      res.redirect(`/hours?weekStart=${weekStart}`);
    }
  },

  async create(req, res) {
    const { project_id, task_id, entry_date, hours, description, entry_mode } = req.body;
    const finalDate = entry_date || new Date().toISOString().slice(0, 10);
    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      req.flash('error', 'Las horas deben ser un valor entre 0.01 y 24.');
      const returnUrl = entry_mode === 'day' ? `/hours?view=day&date=${finalDate}` : '/hours';
      return res.redirect(returnUrl);
    }
    try {
      await TimeEntry.create({
        user_id: req.session.userId,
        project_id: parseInt(project_id, 10),
        task_id: task_id ? parseInt(task_id, 10) : null,
        entry_date: finalDate,
        hours,
        description,
      });
      req.flash('success', 'Horas registradas exitosamente.');
      const returnUrl = req.body._dayView ? `/hours?view=day&date=${finalDate}` : '/hours';
      res.redirect(returnUrl);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not save entry. Please check your input.');
      res.redirect('/hours');
    }
  },

  async showEdit(req, res) {
    try {
      const entry = await TimeEntry.findById(parseInt(req.params.id, 10));
      if (!entry || entry.user_id !== req.session.userId) {
        req.flash('error', 'Entry not found.');
        return res.redirect('/hours');
      }
      const projects = req.session.userRole === 'admin' ? await Project.findAll(true) : await Project.findByUser(req.session.userId);
      const tasks    = entry.project_id ? await Task.findByProject(entry.project_id, true) : [];
      res.render('hours/form', {
        title: 'Edit Hours',
        entry,
        projects,
        tasks,
        error: req.flash('error'),
        user: req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not load entry.');
      res.redirect('/hours');
    }
  },

  async update(req, res) {
    const id = parseInt(req.params.id, 10);
    const { project_id, task_id, entry_date, hours, description } = req.body;
    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours <= 0 || parsedHours > 24) {
      req.flash('error', 'Las horas deben ser un valor entre 0.01 y 24.');
      return res.redirect(req.body._returnTo || '/hours');
    }
    try {
      const entry = await TimeEntry.findById(id);
      if (!entry || entry.user_id !== req.session.userId) {
        req.flash('error', 'Entry not found.');
        return res.redirect('/hours');
      }
      await TimeEntry.update(id, {
        project_id: parseInt(project_id, 10),
        task_id: task_id ? parseInt(task_id, 10) : null,
        entry_date,
        hours,
        description,
      });
      req.flash('success', 'Entrada actualizada.');
      res.redirect(req.body._returnTo || '/hours');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not update entry.');
      res.redirect('/hours');
    }
  },

  async delete(req, res) {
    const id = parseInt(req.params.id, 10);
    try {
      const entry = await TimeEntry.findById(id);
      if (!entry || entry.user_id !== req.session.userId) {
        req.flash('error', 'Entry not found.');
        return res.redirect('/hours');
      }
      await TimeEntry.delete(id);
      req.flash('success', 'Entrada eliminada.');
      res.redirect(req.body._returnTo || '/hours');
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not delete entry.');
      res.redirect('/hours');
    }
  },

  /* AJAX – returns tasks for a project */
  /* AJAX – auto-save a single time entry (create / update / delete) */
  async autoSave(req, res) {
    const { entry_id, project_id, task_id, entry_date, hours, description } = req.body;
    const userId = req.session.userId;

    // Validate required fields
    if (!project_id || !entry_date || !/^\d{4}-\d{2}-\d{2}$/.test(entry_date)) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }

    const parsedHours = parseHHMM(String(hours || ''));
    const id = entry_id ? parseInt(entry_id, 10) : null;

    if (parsedHours > 24) {
      return res.status(400).json({ ok: false, error: 'El valor ingresado supera el máximo permitido de 24 horas por día.' });
    }

    try {
      // Empty hours + existing entry → delete
      if (parsedHours <= 0 && id) {
        const existing = await TimeEntry.findById(id);
        if (existing && existing.user_id === userId) {
          await TimeEntry.delete(id);
        }
        return res.json({ ok: true, deleted: true });
      }

      if (parsedHours <= 0) {
        return res.json({ ok: true, noop: true });
      }

      // Update existing entry
      if (id) {
        const existing = await TimeEntry.findById(id);
        if (!existing || existing.user_id !== userId) {
          return res.status(403).json({ ok: false, error: 'Entry not found.' });
        }
        await TimeEntry.update(id, {
          project_id:  parseInt(project_id, 10),
          task_id:     task_id ? parseInt(task_id, 10) : null,
          entry_date,
          hours:       parsedHours,
          description: description || null,
        });
        return res.json({ ok: true, id });
      }

      // Create new entry
      const newId = await TimeEntry.create({
        user_id:     userId,
        project_id:  parseInt(project_id, 10),
        task_id:     task_id ? parseInt(task_id, 10) : null,
        entry_date,
        hours:       parsedHours,
        description: description || null,
      });
      return res.json({ ok: true, id: newId });

    } catch (err) {
      console.error('autoSave error:', err);
      return res.status(500).json({ ok: false, error: 'Could not save entry.' });
    }
  },

  async getTasksByProject(req, res) {
    try {
      const tasks = await Task.findByProject(parseInt(req.params.projectId, 10), true);
      res.json(tasks);
    } catch (err) {
      res.status(500).json({ error: 'Could not load tasks.' });
    }
  },

  async detailedView(req, res) {
    const isAdmin = req.session.userRole === 'admin';
    const today   = getTodayStr();
    const { preset, from, to, filterUserId, filterProjectId, filterClientId, filterTaskId, userId }
      = resolveDetailedFilters(req.query, today, isAdmin, req.session.userId);

    const PAGE_SIZE = 10;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    try {
      const [allEntries, clients, projects, users] = await Promise.all([
        TimeEntry.findDetailed({ from, to, userId, projectId: filterProjectId, clientId: filterClientId, taskId: filterTaskId }),
        Client.findAll(true),
        Project.findAll(true),
        isAdmin ? User.findAll() : Promise.resolve([]),
      ]);
      // Ensure newest-first order (entry_date may be a Date object or ISO string)
      const toDateVal = (v) => v instanceof Date ? v.getTime() : new Date(String(v).slice(0,10) + 'T00:00:00').getTime();
      allEntries.sort((a, b) => {
        const diff = toDateVal(b.entry_date) - toDateVal(a.entry_date);
        return diff !== 0 ? diff : b.id - a.id;
      });
      const total      = allEntries.length;
      const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
      const safePage   = Math.min(page, totalPages);
      const entries    = allEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
      const totalHours = allEntries.reduce((s, e) => s + parseFloat(e.hours), 0);
      res.render('hours/detailed', {
        title: 'Detailed View',
        entries: entries.map(e => ({ ...e, hoursStr: hoursToHHMM(e.hours) || '0:00' })),
        totalHours: hoursToHHMM(totalHours) || '0:00',
        preset, from, to, clients, projects, users,
        filterUserId, filterProjectId, filterClientId, filterTaskId, isAdmin,
        page: safePage, totalPages, total,
        success: req.flash('success'), error: req.flash('error'), user: req.session.user,
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'No se pudieron cargar los registros.');
      res.redirect('/hours');
    }
  },

  async dashboardView(req, res) {
    const isAdmin = req.session.userRole === 'admin';
    const now     = new Date();

    // ── Period ──────────────────────────────────────────────────────────────
    const preset = req.query.preset || 'month';
    let from, to, displayPeriod, prevLink, nextLink, navYear, navMonth;

    if (preset === 'custom') {
      const today = getTodayStr();
      from = (req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)) ? req.query.from : today;
      to   = (req.query.to   && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to))   ? req.query.to   : today;
      displayPeriod = `${from} → ${to}`;
      prevLink = null; nextLink = null; navYear = null; navMonth = null;
    } else {
      navYear  = parseInt(req.query.year  || now.getFullYear(), 10);
      navMonth = parseInt(req.query.month || (now.getMonth() + 1), 10);
      from = `${navYear}-${String(navMonth).padStart(2,'0')}-01`;
      const lastDay = new Date(navYear, navMonth, 0).getDate();
      to = `${navYear}-${String(navMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
      const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                           'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      displayPeriod = `${MONTH_NAMES[navMonth - 1]} ${navYear}`;
      prevLink = null; nextLink = null; // computed below after filters are parsed
    }

    const sumBy = ['projects_tasks','projects_users','clients_projects'].includes(req.query.sum_by)
      ? req.query.sum_by : 'projects_tasks';
    const showActivity    = req.query.activity === '1';
    const filterUserId    = isAdmin && req.query.user_id    ? parseInt(req.query.user_id,    10) : null;
    const filterClientId  = req.query.client_id  ? parseInt(req.query.client_id,  10) : null;
    const filterProjectId = req.query.project_id ? parseInt(req.query.project_id, 10) : null;
    const userId          = isAdmin ? filterUserId : req.session.userId;

    // Build extra query params for prev/next month links (preserve all active filters)
    const extraParts = [];
    if (req.query.sum_by)   extraParts.push(`sum_by=${req.query.sum_by}`);
    if (req.query.activity === '1') extraParts.push('activity=1');
    if (filterUserId)    extraParts.push(`user_id=${filterUserId}`);
    if (filterClientId)  extraParts.push(`client_id=${filterClientId}`);
    if (filterProjectId) extraParts.push(`project_id=${filterProjectId}`);
    const extra = extraParts.length ? '&' + extraParts.join('&') : '';

    if (preset !== 'custom') {
      const pM = navMonth === 1 ? 12 : navMonth - 1;
      const pY = navMonth === 1 ? navYear - 1 : navYear;
      const nM = navMonth === 12 ? 1 : navMonth + 1;
      const nY = navMonth === 12 ? navYear + 1 : navYear;
      prevLink = `/hours/dashboard?year=${pY}&month=${pM}${extra}`;
      nextLink = `/hours/dashboard?year=${nY}&month=${nM}${extra}`;
    }

    try {
      const [rawGrouped, activityRows, users, clients, projects] = await Promise.all([
        TimeEntry.dashboardGrouped({ from, to, userId, sumBy, clientId: filterClientId, projectId: filterProjectId }),
        TimeEntry.dashboardActivity({ from, to, userId, clientId: filterClientId, projectId: filterProjectId }),
        isAdmin ? User.findAll() : Promise.resolve([]),
        Client.findAll(true),
        Project.findAll(true),
      ]);

      // Build groups array
      const groupMap = new Map();
      rawGrouped.forEach(row => {
        if (!groupMap.has(row.group_id)) {
          groupMap.set(row.group_id, { id: row.group_id, name: row.group_name, totalHours: 0, subs: [] });
        }
        const g = groupMap.get(row.group_id);
        const h = parseFloat(row.hours);
        g.totalHours += h;
        g.subs.push({ id: row.sub_id, name: row.sub_name, hours: h });
      });
      const groups = Array.from(groupMap.values()).sort((a, b) => b.totalHours - a.totalHours);
      const totalHours = groups.reduce((s, g) => s + g.totalHours, 0);

      // Donut 1: group (project or client) distribution
      const donut1 = groups.map(g => ({ label: g.name, value: parseFloat(g.totalHours.toFixed(2)) }));

      // Donut 2: sub (task/user/project) distribution aggregated across all groups
      const subMap = new Map();
      rawGrouped.forEach(row => {
        const k = String(row.sub_id) + '||' + row.sub_name;
        subMap.set(k, (subMap.get(k) || 0) + parseFloat(row.hours));
      });
      const donut2 = Array.from(subMap.entries())
        .map(([k, v]) => ({ label: k.split('||')[1], value: parseFloat(v.toFixed(2)) }))
        .sort((a, b) => b.value - a.value);

      // Labels
      const donut1Label  = sumBy === 'clients_projects' ? 'Cliente'   : 'Proyecto';
      const donut2Label  = sumBy === 'projects_tasks'   ? 'Tarea'     : sumBy === 'projects_users' ? 'Usuario' : 'Proyecto';
      const tableHeader  = sumBy === 'projects_tasks'   ? 'PROYECTO / TAREA'
                         : sumBy === 'projects_users'   ? 'PROYECTO / USUARIO' : 'CLIENTE / PROYECTO';

      // Detailed-report link base
      const detailBase = `/hours/detailed?preset=custom&from=${from}&to=${to}`;

      // Activity map: day → hours
      const activityByDay = {};
      activityRows.forEach(r => { activityByDay[r.day] = parseFloat(r.hours); });

      res.render('hours/dashboard', {
        title: 'Dashboard',
        from, to, preset, displayPeriod, prevLink, nextLink,
        navYear, navMonth, sumBy, showActivity,
        totalHoursStr:     hoursToHHMM(totalHours) || '0:00',
        totalHoursDecimal: parseFloat(totalHours.toFixed(2)),
        groups: groups.map(g => ({
          ...g,
          totalHoursStr: hoursToHHMM(g.totalHours) || '0:00',
          detailLink: sumBy === 'clients_projects'
            ? `${detailBase}&client_id=${g.id}`
            : `${detailBase}&project_id=${g.id}`,
          subs: g.subs.map(s => ({
            ...s,
            hoursStr: hoursToHHMM(s.hours) || '0:00',
            detailLink: sumBy === 'projects_tasks'
              ? `${detailBase}&project_id=${g.id}&task_id=${s.id}`
              : sumBy === 'clients_projects'
                ? `${detailBase}&client_id=${g.id}&project_id=${s.id}`
                : `${detailBase}&project_id=${g.id}`,
          })),
        })),
        donut1, donut2, donut1Label, donut2Label, tableHeader,
        activityByDay: JSON.stringify(activityByDay),
        users, filterUserId, isAdmin,
        clients, projects, filterClientId, filterProjectId,
        user:    req.session.user,
        success: req.flash('success'),
        error:   req.flash('error'),
      });
    } catch (err) {
      console.error(err);
      req.flash('error', 'Could not load dashboard.');
      res.redirect('/hours');
    }
  },

  async downloadDetailed(req, res) {
    const isAdmin = req.session.userRole === 'admin';
    const today   = getTodayStr();
    const fmt     = req.params.fmt; // 'excel' or 'pdf'
    const { from, to, filterProjectId, filterClientId, filterTaskId, userId }
      = resolveDetailedFilters(req.query, today, isAdmin, req.session.userId);

    try {
      const entries = await TimeEntry.findDetailed({
        from, to, userId,
        projectId: filterProjectId, clientId: filterClientId, taskId: filterTaskId,
      });
      const totalHours = entries.reduce((s, e) => s + parseFloat(e.hours), 0);
      const dateStr = (ds) => {
        if (!ds) return '';
        const d = new Date((ds instanceof Date ? ds.toISOString() : String(ds)).slice(0,10) + 'T00:00:00');
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      };
      const filename = `detailed_${from}_${to}`;

      if (fmt === 'excel') {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Mis Horas';
        const ws = wb.addWorksheet('Detailed');
        const colDefs = isAdmin
          ? ['Fecha','Usuario','Cliente','Proyecto','Tarea','Descripción','Duración']
          : ['Fecha','Cliente','Proyecto','Tarea','Descripción','Duración'];
        ws.addRow(colDefs);
        const headerRow = ws.getRow(1);
        headerRow.height = 22;
        headerRow.eachCell(cell => {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a56db' } };
          cell.alignment = { vertical: 'middle' };
        });
        entries.forEach(e => {
          const row = ws.addRow(isAdmin
            ? [dateStr(e.entry_date), e.user_name, e.client_name, e.project_name, e.task_name||'', e.description||'', parseFloat(e.hours) / 24]
            : [dateStr(e.entry_date), e.client_name, e.project_name, e.task_name||'', e.description||'', parseFloat(e.hours) / 24]);
          row.getCell(colDefs.length).numFmt = '[h]:mm';
        });
        const tr = ws.addRow(isAdmin
          ? ['','','','','','TOTAL', parseFloat(totalHours.toFixed(4)) / 24]
          : ['','','','','TOTAL', parseFloat(totalHours.toFixed(4)) / 24]);
        tr.font = { bold: true };
        tr.getCell(colDefs.length).numFmt = '[h]:mm';
        const lastCol = colDefs.length; const secLast = lastCol - 1;
        [secLast, lastCol].forEach(ci => {
          tr.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF3FF' } };
        });
        const widths = isAdmin ? [12,18,18,20,18,34,10] : [12,18,20,18,34,10];
        ws.columns.forEach((col, i) => { col.width = widths[i] || 14; });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
        await wb.xlsx.write(res);
        return res.end();
      }

      if (fmt === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
        const doc = new PDFDoc({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: true });
        doc.pipe(res);

        doc.fontSize(16).font('Helvetica-Bold').text('Mis Horas – Vista Detallada');
        doc.fontSize(9).font('Helvetica').fillColor('#555555')
           .text(`Período: ${from} → ${to}   |   Registros: ${entries.length}   |   Total: ${hoursToHHMM(totalHours)||'0:00'}`);
        doc.moveDown(0.8);

        const pageW = doc.page.width - 80;
        const cols2 = isAdmin
          ? [{l:'Fecha',w:68},{l:'Usuario',w:90},{l:'Cliente',w:88},{l:'Proyecto',w:108},{l:'Tarea',w:98},{l:'Descripción',w:0},{l:'Duración',w:54}]
          : [{l:'Fecha',w:68},{l:'Cliente',w:100},{l:'Proyecto',w:118},{l:'Tarea',w:108},{l:'Descripción',w:0},{l:'Duración',w:54}];
        const fixedW = cols2.reduce((s,c) => s + c.w, 0);
        cols2.find(c => c.l === 'Descripción').w = Math.max(60, pageW - fixedW);

        const rowH = 17; const headH = 20;
        function drawHead(y) {
          doc.rect(40, y, pageW, headH).fill('#1a56db');
          let x = 40;
          cols2.forEach(c => {
            doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
               .text(c.l, x+4, y+6, { width: c.w-6, lineBreak: false });
            x += c.w;
          });
          return y + headH;
        }

        let y = drawHead(doc.y); let odd = false;
        entries.forEach(e => {
          if (y + rowH > doc.page.height - 50) { doc.addPage(); y = drawHead(40); odd = false; }
          doc.rect(40, y, pageW, rowH).fill(odd ? '#f0f5ff' : '#ffffff');
          odd = !odd;
          const vals = isAdmin
            ? [dateStr(e.entry_date), e.user_name||'', e.client_name||'', e.project_name||'', e.task_name||'', e.description||'', hoursToHHMM(e.hours)||'0:00']
            : [dateStr(e.entry_date), e.client_name||'', e.project_name||'', e.task_name||'', e.description||'', hoursToHHMM(e.hours)||'0:00'];
          let x = 40;
          vals.forEach((v, i) => {
            doc.fillColor('#222222').fontSize(8).font('Helvetica')
               .text(String(v), x+4, y+5, { width: cols2[i].w-6, lineBreak: false, ellipsis: true });
            x += cols2[i].w;
          });
          y += rowH;
        });

        if (y + rowH > doc.page.height - 50) { doc.addPage(); y = 40; }
        doc.rect(40, y, pageW, rowH).fill('#dbeafe');
        let tx = 40;
        cols2.forEach((c, i) => {
          const v = i === cols2.length-2 ? 'TOTAL' : i === cols2.length-1 ? (hoursToHHMM(totalHours)||'0:00') : '';
          doc.fillColor('#1a56db').fontSize(8).font('Helvetica-Bold')
             .text(v, tx+4, y+5, { width: c.w-6, lineBreak: false });
          tx += c.w;
        });

        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
          doc.switchToPage(pages.start + i);
          doc.fillColor('#999999').fontSize(8).font('Helvetica')
             .text(`Página ${i+1} de ${pages.count}`, 40, doc.page.height - 30, { align: 'right', width: pageW });
        }
        doc.switchToPage(pages.start + pages.count - 1);
        doc.end();
        return;
      }

      res.status(400).send('Invalid format');
    } catch (err) {
      console.error(err);
      res.status(500).send('Could not generate file');
    }
  },

  async downloadDashboardPdf(req, res) {
    const isAdmin  = req.session.userRole === 'admin';
    const today    = getTodayStr();
    const { from: qFrom, to: qTo, user_id: qUserId, chart1, chart2, donut1Label, donut2Label, donut1Data, donut2Data, totalHours: totalHoursStr } = req.body;

    let donut1 = [], donut2 = [], totalHoursDecimal = 0;
    try { donut1 = JSON.parse(donut1Data || '[]'); } catch (_) {}
    try { donut2 = JSON.parse(donut2Data || '[]'); } catch (_) {}
    totalHoursDecimal = parseFloat(totalHoursStr) || 0;

    const from = (qFrom && /^\d{4}-\d{2}-\d{2}$/.test(qFrom)) ? qFrom : today;
    const to   = (qTo   && /^\d{4}-\d{2}-\d{2}$/.test(qTo))   ? qTo   : today;
    const filterUserId = isAdmin && qUserId ? parseInt(qUserId, 10) : null;
    const userId       = isAdmin ? filterUserId : req.session.userId;

    try {
      const entries    = await TimeEntry.findDetailed({ from, to, userId });
      const totalHours = entries.reduce((s, e) => s + parseFloat(e.hours), 0);

      const dateStr = (ds) => {
        if (!ds) return '';
        const d = new Date((ds instanceof Date ? ds.toISOString() : String(ds)).slice(0,10) + 'T00:00:00');
        return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      };

      const filename = `panel_${from}_${to}`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

      const doc = new PDFDoc({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: true });
      doc.pipe(res);

      const PALETTE = [
        '#10b981','#3b82f6','#14b8a6','#8b5cf6','#f59e0b',
        '#ef4444','#06b6d4','#84cc16','#f97316','#ec4899',
        '#6366f1','#0891b2','#059669','#7c3aed','#dc2626',
      ];

      // ── Title ──────────────────────────────────────────────────────────────
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#000000')
         .text('Panel – Distribución de Horas');
      doc.fontSize(9).font('Helvetica').fillColor('#555555')
         .text(`Período: ${from} → ${to}   |   Registros: ${entries.length}   |   Total: ${hoursToHHMM(totalHours)||'0:00'}`);
      doc.moveDown(0.8);

      // ── Charts ─────────────────────────────────────────────────────────────
      const pageW  = doc.page.width - 80;
      const chartW = 160;
      const chartH = 160;
      const halfW  = Math.floor(pageW / 2);
      const legX1  = 40 + chartW + 10;
      const legW1  = halfW - chartW - 14;
      const chartX2 = 40 + halfW;
      const legX2  = chartX2 + chartW + 10;
      const legW2  = halfW - chartW - 14;
      const chartY = doc.y;
      let hasCharts = false;

      const label1 = donut1Label || '';
      const label2 = donut2Label || '';

      if (chart1 && chart1.length > 100) {
        try {
          const buf = Buffer.from(chart1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          if (label1) {
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#6b7280')
               .text(label1.toUpperCase(), 40, chartY, { width: chartW, align: 'center' });
          }
          const imgY1 = chartY + (label1 ? 11 : 0);
          doc.image(buf, 40, imgY1, { width: chartW, height: chartH });
          // Legend
          let ly = imgY1 + 4;
          donut1.forEach(function (item, i) {
            if (ly > imgY1 + chartH - 4) return;
            const pct = totalHoursDecimal > 0 ? Math.round(item.value / totalHoursDecimal * 100) : 0;
            const color = PALETTE[i % PALETTE.length];
            doc.rect(legX1, ly + 1, 8, 8).fill(color);
            const lbl = item.label.length > 28 ? item.label.slice(0, 26) + '…' : item.label;
            doc.fillColor('#222222').fontSize(7.5).font('Helvetica')
               .text(`${lbl} – ${item.value.toFixed(2)} H (${pct}%)`, legX1 + 12, ly, { width: legW1, lineBreak: false, ellipsis: true });
            ly += 13;
          });
          hasCharts = true;
        } catch (_) {}
      }

      if (chart2 && chart2.length > 100) {
        try {
          const buf = Buffer.from(chart2.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          if (label2) {
            doc.fontSize(7).font('Helvetica-Bold').fillColor('#6b7280')
               .text(label2.toUpperCase(), chartX2, chartY, { width: chartW, align: 'center' });
          }
          const imgY2 = chartY + (label2 ? 11 : 0);
          doc.image(buf, chartX2, imgY2, { width: chartW, height: chartH });
          // Legend
          let ly = imgY2 + 4;
          donut2.forEach(function (item, i) {
            if (ly > imgY2 + chartH - 4) return;
            const pct = totalHoursDecimal > 0 ? Math.round(item.value / totalHoursDecimal * 100) : 0;
            const color = PALETTE[i % PALETTE.length];
            doc.rect(legX2, ly + 1, 8, 8).fill(color);
            const lbl = item.label.length > 28 ? item.label.slice(0, 26) + '…' : item.label;
            doc.fillColor('#222222').fontSize(7.5).font('Helvetica')
               .text(`${lbl} – ${item.value.toFixed(2)} H (${pct}%)`, legX2 + 12, ly, { width: legW2, lineBreak: false, ellipsis: true });
            ly += 13;
          });
          hasCharts = true;
        } catch (_) {}
      }

      if (hasCharts) {
        doc.y = chartY + chartH + (label1 || label2 ? 11 : 0) + 14;
        doc.x = 40;
      }
      doc.moveDown(0.4);

      // ── Detail table ───────────────────────────────────────────────────────
      const cols = isAdmin
        ? [{l:'Fecha',w:68},{l:'Usuario',w:90},{l:'Cliente',w:88},{l:'Proyecto',w:108},{l:'Tarea',w:98},{l:'Descripción',w:0},{l:'Duración',w:54}]
        : [{l:'Fecha',w:68},{l:'Cliente',w:100},{l:'Proyecto',w:118},{l:'Tarea',w:108},{l:'Descripción',w:0},{l:'Duración',w:54}];
      const fixedW = cols.reduce((s, c) => s + c.w, 0);
      cols.find(c => c.l === 'Descripción').w = Math.max(60, pageW - fixedW);

      const rowH = 17; const headH = 20;
      function drawHead(y) {
        doc.rect(40, y, pageW, headH).fill('#1a56db');
        let x = 40;
        cols.forEach(c => {
          doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold')
             .text(c.l, x + 4, y + 6, { width: c.w - 6, lineBreak: false });
          x += c.w;
        });
        return y + headH;
      }

      let y = drawHead(doc.y); let odd = false;
      entries.forEach(e => {
        if (y + rowH > doc.page.height - 50) { doc.addPage(); y = drawHead(40); odd = false; }
        doc.rect(40, y, pageW, rowH).fill(odd ? '#f0f5ff' : '#ffffff');
        odd = !odd;
        const vals = isAdmin
          ? [dateStr(e.entry_date), e.user_name||'', e.client_name||'', e.project_name||'', e.task_name||'', e.description||'', hoursToHHMM(e.hours)||'0:00']
          : [dateStr(e.entry_date), e.client_name||'', e.project_name||'', e.task_name||'', e.description||'', hoursToHHMM(e.hours)||'0:00'];
        let x = 40;
        vals.forEach((v, i) => {
          doc.fillColor('#222222').fontSize(8).font('Helvetica')
             .text(String(v), x + 4, y + 5, { width: cols[i].w - 6, lineBreak: false, ellipsis: true });
          x += cols[i].w;
        });
        y += rowH;
      });

      // Total row
      if (y + rowH > doc.page.height - 50) { doc.addPage(); y = 40; }
      doc.rect(40, y, pageW, rowH).fill('#dbeafe');
      let tx = 40;
      cols.forEach((c, i) => {
        const v = i === cols.length - 2 ? 'TOTAL' : i === cols.length - 1 ? (hoursToHHMM(totalHours)||'0:00') : '';
        doc.fillColor('#1a56db').fontSize(8).font('Helvetica-Bold')
           .text(v, tx + 4, y + 5, { width: c.w - 6, lineBreak: false });
        tx += c.w;
      });

      // Page numbers
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(pages.start + i);
        doc.fillColor('#999999').fontSize(8).font('Helvetica')
           .text(`Página ${i + 1} de ${pages.count}`, 40, doc.page.height - 30, { align: 'right', width: pageW });
      }
      doc.switchToPage(pages.start + pages.count - 1);
      doc.end();
    } catch (err) {
      console.error(err);
      res.status(500).send('No se pudo generar el PDF');
    }
  },
};

module.exports = HoursController;

