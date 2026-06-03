// mishoras – client-side helpers

// Auto-dismiss alerts after 5 s
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.alert.alert-success').forEach(function (el) {
    setTimeout(function () {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(el);
      bsAlert.close();
    }, 5000);
  });

  // ── Shared time helpers ────────────────────────────────────────────────────
  function toHHMM(dec) {
    if (!dec || dec <= 0) return '';
    const total = Math.round(dec * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h + ':' + String(m).padStart(2, '0');
  }

  function fromHHMM(str) {
    if (!str || !str.trim()) return 0;
    const s = str.trim();
    if (s.includes(':')) {
      const parts = s.split(':');
      return (parseInt(parts[0], 10) || 0) + (parseInt(parts[1], 10) || 0) / 60;
    }
    return parseFloat(s) || 0;
  }

  // ── Week view (timesheet grid) ─────────────────────────────────────────────
  if (document.getElementById('timesheetForm')) {
    const cfg = window.TS_CONFIG || {};

    function normaliseInput(input) {
      const raw = input.value.trim();
      if (!raw) { input.value = ''; input.classList.remove('has-value'); return; }
      const dec = fromHHMM(raw);
      input.value = dec > 0 ? toHHMM(dec) : '';
      input.classList.toggle('has-value', dec > 0);
    }

    function recalcTotals() {
      const rows = document.querySelectorAll('#tsRows .ts-row');
      const numDays = cfg.weekDays ? cfg.weekDays.length : 5;
      const colSums = new Array(numDays).fill(0);

      rows.forEach(function (row) {
        let rowSum = 0;
        for (let d = 0; d < numDays; d++) {
          const inp = row.querySelector('input[name$="[d' + d + ']"]');
          if (inp) { const v = fromHHMM(inp.value); rowSum += v; colSums[d] += v; }
        }
        const rowTotal = row.querySelector('.ts-row-total');
        if (rowTotal) rowTotal.textContent = toHHMM(rowSum) || '0:00';
      });

      document.querySelectorAll('[data-col-idx]').forEach(function (el) {
        el.textContent = toHHMM(colSums[parseInt(el.dataset.colIdx, 10)]) || '0:00';
      });
      document.querySelectorAll('[data-total-col]').forEach(function (el) {
        el.textContent = toHHMM(colSums[parseInt(el.dataset.totalCol, 10)]) || '0:00';
      });

      const grand = colSums.reduce(function (a, b) { return a + b; }, 0);
      const grandEl = document.getElementById('tsGrandTotal');
      if (grandEl) grandEl.textContent = toHHMM(grand) || '0:00';
      const weekEl = document.getElementById('tsWeekTotal');
      if (weekEl) weekEl.textContent = toHHMM(grand) || '0:00';
    }

    function loadTasks(projectSelect, taskSelect, selectedTaskId) {
      const pid = projectSelect.value;
      taskSelect.innerHTML = '<option value="">Select a task...</option>';
      if (!pid) return;
      fetch('/hours/api/tasks/' + pid)
        .then(function (r) { return r.json(); })
        .then(function (tasks) {
          tasks.forEach(function (t) {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            if (selectedTaskId && t.id == selectedTaskId) opt.selected = true;
            taskSelect.appendChild(opt);
          });
        })
        .catch(function () {});
    }

    function buildProjectOptions() {
      const byClient = {};
      (cfg.projects || []).forEach(function (p) {
        if (!byClient[p.client_name]) byClient[p.client_name] = [];
        byClient[p.client_name].push(p);
      });
      let html = '<option value="">Select a project...</option>';
      Object.keys(byClient).forEach(function (cn) {
        const esc = cn.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        html += '<optgroup label="' + esc + '">';
        byClient[cn].forEach(function (p) {
          const label = (cn + ' - ' + p.name).replace(/&/g, '&amp;').replace(/</g, '&lt;');
          html += '<option value="' + p.id + '">' + label + '</option>';
        });
        html += '</optgroup>';
      });
      return html;
    }

    function buildRowHTML(idx) {
      const days = cfg.weekDays || [];
      let dayCells = '';
      days.forEach(function (wd, j) {
        dayCells += '<div class="ts-col-day' + (wd.isToday ? ' ts-today-col' : '') + '">' +
          '<input type="text" name="rows[' + idx + '][d' + j + ']" class="ts-time-input" placeholder="hh:mm" autocomplete="off"' +
          ' data-entry-id="" data-entry-date="' + (wd.date || '') + '" data-row="' + idx + '" />' +
          '</div>';
      });
      return '<div class="ts-row" data-row="' + idx + '">' +
        '<div class="ts-col-project"><select name="rows[' + idx + '][project_id]" class="ts-select ts-project-select">' + buildProjectOptions() + '</select></div>' +
        '<div class="ts-col-task"><select name="rows[' + idx + '][task_id]" class="ts-select ts-task-select"><option value="">Select a task...</option></select></div>' +
        dayCells +
        '<div class="ts-col-total ts-row-total">0:00</div>' +
        '</div>';
    }

    function bindRow(rowEl) {
      const projectSel = rowEl.querySelector('.ts-project-select');
      const taskSel    = rowEl.querySelector('.ts-task-select');
      if (projectSel) {
      if (projectSel) {
        projectSel.addEventListener('change', function () {
          loadTasks(projectSel, taskSel, null);
          sortTsRows();
        });
        if (projectSel.value) loadTasks(projectSel, taskSel, taskSel.dataset.selected || taskSel.value || null);
      }
      rowEl.querySelectorAll('.ts-time-input').forEach(function (inp) {
        if (inp.value) inp.classList.add('has-value');
        inp.addEventListener('focus', function () { this.select(); });
        inp.addEventListener('blur', function () {
          normaliseInput(this);
          recalcTotals();
          autoSaveCell(this, rowEl);
        });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); this.blur(); } });
      });
    }

    var toastTimer = null;
    function showToast(msg, isError) {
      var el  = document.getElementById('asToast');
      var txt = document.getElementById('asToastMsg');
      if (!el) return;
      if (toastTimer) clearTimeout(toastTimer);
      txt.textContent = msg || 'Saved';
      el.style.background = isError ? '#dc3545' : '#198754';
      el.style.display = 'flex';
      // force reflow then fade in
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.style.opacity = '1'; });
      });
      toastTimer = setTimeout(function () {
        el.style.opacity = '0';
        setTimeout(function () { el.style.display = 'none'; }, 220);
      }, 2500);
    }

    function autoSaveCell(inp, rowEl) {
      var projectSel = rowEl.querySelector('.ts-project-select');
      var taskSel    = rowEl.querySelector('.ts-task-select');
      var pid        = projectSel ? projectSel.value : '';
      var hrs        = inp.value.trim();
      var entryId    = inp.dataset.entryId || '';
      var entryDate  = inp.dataset.entryDate || '';

      // Nothing to do if no date (shouldn't happen)
      if (!entryDate) return;

      // If no project and no existing entry, skip
      if (!pid && !entryId) return;

      // If clearing a cell with no existing entry, skip
      if (!hrs && !entryId) return;

      var body = {
        _csrf:       window.TS_CSRF || '',
        entry_id:    entryId,
        project_id:  pid,
        task_id:     taskSel ? (taskSel.value || '') : '',
        entry_date:  entryDate,
        hours:       hrs,
        description: '',
      };

      fetch('/hours/api/autosave', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body:    JSON.stringify(body),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.ok) {
          if (data.deleted) {
            inp.dataset.entryId = '';
            // Remove pencil button if present
            var cellDiv = inp.parentElement;
            var existingBtn = cellDiv.querySelector('.ts-edit-btn');
            if (existingBtn) existingBtn.remove();
            showToast('Entry deleted');
          } else if (!data.noop) {
            inp.dataset.entryId = data.id || '';
            // Inject or update the pencil edit button
            var cellDiv = inp.parentElement;
            var btn = cellDiv.querySelector('.ts-edit-btn');
            if (!btn) {
              btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'ts-edit-btn';
              btn.setAttribute('data-bs-toggle', 'modal');
              btn.setAttribute('data-bs-target', '#editTimeLogModal');
              btn.title = 'Edit entry';
              btn.innerHTML = '<i class="bi bi-pencil-square"></i>';
              cellDiv.appendChild(btn);
            }
            var taskName = taskSel && taskSel.selectedIndex > 0
              ? taskSel.options[taskSel.selectedIndex].text : '';
            btn.dataset.id          = data.id;
            btn.dataset.projectId   = pid;
            btn.dataset.taskId      = taskSel ? (taskSel.value || '') : '';
            btn.dataset.taskName    = taskName;
            btn.dataset.hoursStr    = inp.value;
            btn.dataset.date        = entryDate;
            btn.dataset.description = '';
            showToast('Saved \u2713');
          }
        } else {
          showToast(data.error || 'Save failed', true);
        }
      })
      .catch(function () { showToast('Save failed', true); });
    }

    document.querySelectorAll('#tsRows .ts-row').forEach(bindRow);

    function sortTsRows() {
      var container = document.getElementById('tsRows');
      if (!container) return;
      var rowEls = Array.from(container.querySelectorAll('.ts-row'));
      rowEls.sort(function (a, b) {
        var selA = a.querySelector('.ts-project-select');
        var selB = b.querySelector('.ts-project-select');
        var sa = selA && selA.selectedIndex > 0 ? selA.options[selA.selectedIndex].text : '';
        var sb = selB && selB.selectedIndex > 0 ? selB.options[selB.selectedIndex].text : '';
        // empty rows always go to bottom
        var aEmpty = !a.querySelector('.ts-project-select').value;
        var bEmpty = !b.querySelector('.ts-project-select').value;
        if (aEmpty && !bEmpty) return 1;
        if (!aEmpty && bEmpty) return -1;
        return sa.localeCompare(sb);
      });
      rowEls.forEach(function (r) { container.appendChild(r); });
    }

    document.getElementById('tsAddRow').addEventListener('click', function () {
      const idx = cfg.nextRowIdx++;
      const container = document.getElementById('tsRows');
      const tmp = document.createElement('div');
      tmp.innerHTML = buildRowHTML(idx);
      const newRow = tmp.firstElementChild;
      container.appendChild(newRow);
      bindRow(newRow);
      newRow.querySelector('.ts-project-select').focus();
    });

    recalcTotals();

    // Week jump date picker
    const weekJump = document.getElementById('weekJumpPicker');
    const weekLabelBtn = document.getElementById('weekLabelBtn');
    if (weekJump && weekLabelBtn) {
      weekLabelBtn.addEventListener('click', function () {
        try { weekJump.showPicker(); } catch (e) { weekJump.click(); }
      });
      weekJump.addEventListener('change', function () {
        if (!this.value) return;
        const d = new Date(this.value + 'T00:00:00');
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        const monday = d.toISOString().slice(0, 10);
        window.location.href = '/hours?weekStart=' + monday;
      });
    }
  }

  // ── Day view modal ─────────────────────────────────────────────────────────
  const addTimeLogForm = document.getElementById('addTimeLogForm');
  if (addTimeLogForm) {
    const modalProjectSel = document.getElementById('modalProjectId');
    const modalTaskSel    = document.getElementById('modalTaskId');

    if (modalProjectSel) {
      modalProjectSel.addEventListener('change', function () {
        const pid = this.value;
        modalTaskSel.innerHTML = '<option value="">Select a task...</option>';
        if (!pid) return;
        fetch('/hours/api/tasks/' + pid)
          .then(function (r) { return r.json(); })
          .then(function (tasks) {
            tasks.forEach(function (t) {
              const opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.name;
              modalTaskSel.appendChild(opt);
            });
          })
          .catch(function () {});
      });
    }

    // Reset form when modal is closed
    const modalEl = document.getElementById('addTimeLogModal');
    if (modalEl) {
      modalEl.addEventListener('hidden.bs.modal', function () {
        addTimeLogForm.reset();
        if (modalTaskSel) modalTaskSel.innerHTML = '<option value="">Select a task...</option>';
        const dur = document.getElementById('modalDuration');
        if (dur) dur.classList.remove('is-invalid');
      });
    }

    // Convert hh:mm to decimal before submit
    addTimeLogForm.addEventListener('submit', function (e) {
      const dur = document.getElementById('modalDuration');
      if (!dur) return;
      const dec = fromHHMM(dur.value);
      if (dec <= 0) {
        e.preventDefault();
        dur.classList.add('is-invalid');
        dur.focus();
        return;
      }
      dur.classList.remove('is-invalid');
      dur.value = dec.toFixed(4);
    });
  }

  // ── Edit time log modal ────────────────────────────────────────────────────
  const editModal = document.getElementById('editTimeLogModal');
  if (editModal) {
    const editForm       = document.getElementById('editTimeLogForm');
    const editProjectSel = document.getElementById('editModalProjectId');
    const editTaskSel    = document.getElementById('editModalTaskId');
    const editDesc       = document.getElementById('editModalDescription');
    const editDur        = document.getElementById('editModalDuration');

    // Populate modal when triggered
    editModal.addEventListener('show.bs.modal', function (event) {
      const btn = event.relatedTarget;
      editForm.action = '/hours/' + btn.dataset.id + '?_method=PUT';
      const projectId = btn.dataset.projectId;
      const taskId    = btn.dataset.taskId;

      editProjectSel.value = projectId || '';
      editDesc.value = btn.dataset.description || '';
      editDur.value  = btn.dataset.hoursStr || '';
      editDur.classList.remove('is-invalid');

      // Set correct entry_date and _returnTo for the clicked cell
      const dateInput   = editForm.querySelector('[name="entry_date"]');
      const returnInput = editForm.querySelector('[name="_returnTo"]');
      const cfgView = (window.TS_CONFIG || {}).view;
      if (btn.dataset.date) {
        if (dateInput) dateInput.value = btn.dataset.date;
        if (returnInput) {
          returnInput.value = cfgView === 'week'
            ? '/hours?' + new URLSearchParams(window.location.search).toString()
            : '/hours?view=day&date=' + btn.dataset.date;
        }
      }

      // Load tasks and pre-select
      editTaskSel.innerHTML = '<option value="">Select a task...</option>';
      if (projectId) {
        fetch('/hours/api/tasks/' + projectId)
          .then(function (r) { return r.json(); })
          .then(function (tasks) {
            tasks.forEach(function (t) {
              const opt = document.createElement('option');
              opt.value = t.id;
              opt.textContent = t.name;
              if (taskId && String(t.id) === String(taskId)) opt.selected = true;
              editTaskSel.appendChild(opt);
            });
          })
          .catch(function () {});
      }
    });

    // Reset on close
    editModal.addEventListener('hidden.bs.modal', function () {
      editForm.reset();
      editTaskSel.innerHTML = '<option value="">Select a task...</option>';
      editDur.classList.remove('is-invalid');
    });

    // Project change inside edit modal
    editProjectSel.addEventListener('change', function () {
      const pid = this.value;
      editTaskSel.innerHTML = '<option value="">Select a task...</option>';
      if (!pid) return;
      fetch('/hours/api/tasks/' + pid)
        .then(function (r) { return r.json(); })
        .then(function (tasks) {
          tasks.forEach(function (t) {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            editTaskSel.appendChild(opt);
          });
        })
        .catch(function () {});
    });

    // Convert hh:mm to decimal before submit
    editForm.addEventListener('submit', function (e) {
      const dec = fromHHMM(editDur.value);
      if (dec <= 0) {
        e.preventDefault();
        editDur.classList.add('is-invalid');
        editDur.focus();
        return;
      }
      editDur.classList.remove('is-invalid');
      editDur.value = dec.toFixed(4);
    });
  }
});


