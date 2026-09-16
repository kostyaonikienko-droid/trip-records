(() => {
    const PASSWORD_KEY = 'trip_boss_password';
    const ROLE_KEY = 'trip_current_role';
    const USERNAME_KEY = 'trip_current_user';
    const GITHUB_CONFIG_KEY = 'trip_github_config';
    const REFRESH_INTERVAL = 20000;

    const DEFAULT_EMPLOYEES = [
        'Жунева Е.В.', 'Мерзляков А.В.', 'Нифонтова О.В.', 'Мерзлякова А.Д.',
        'Новикова Л.Г.', 'Яровинкина И.Н.', 'Полыгалов А.А.', 'Шлегерис С.Я.',
        'Заиконников М.Г.', 'Тихомиров Э.С.', 'Генш А.А.', 'Новикова А.Э.',
        'Хузина А.А.', 'Нифонтов Ю.В.', 'Габов И.С.'
    ];

    let records = [];
    let companies = [];
    let employees = [...DEFAULT_EMPLOYEES];
    let spareParts = [];
    let sparePartUsage = [];
    let sparePartEmployees = [];
    let editingId = null;
    let editingSpareId = null;
    let sortField = 'date';
    let sortDir = 'desc';
    let currentRole = 'employee';
    let currentUserName = '';
    let githubConfig = null;
    let lastSha = null;
    let refreshTimer = null;
    let currentTab = 'journal';
    let isSaving = false;

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const form = $('#trip-form');
    const dateInput = $('#date');
    const companyInput = $('#company');
    const contactNameInput = $('#contact-name');
    const contactPhoneInput = $('#contact-phone');
    const addressInput = $('#address');
    const employeeTrigger = $('#employee-trigger');
    const employeeDropdown = $('#employee-dropdown');
    let selectedEmployees = [];
    const noteInput = $('#note');
    const btnCancel = $('#btn-cancel');
    const btnSubmit = $('#btn-submit');
    const recordsBody = $('#records-body');
    const emptyState = $('#empty-state');
    const statsEl = $('#stats');
    const filterSearch = $('#filter-search');
    const filterDateFrom = $('#filter-date-from');
    const filterDateTo = $('#filter-date-to');
    const btnClearFilter = $('#btn-clear-filter');
    const btnExportCsv = $('#btn-export-csv');
    const btnAdd = $('#btn-add');
    const fabAdd = $('#fab-add');
    const modalOverlay = $('#modal-overlay');
    const modalClose = $('#modal-close');
    const modalTitle = $('#modal-title');

    const btnLogin = $('#btn-login');
    const btnLogout = $('#btn-logout');
    const roleIndicator = $('#role-indicator');
    const roleText = $('#role-text');
    const roleDot = roleIndicator.querySelector('.role-dot');

    const githubStatus = $('#github-status');
    const githubStatusDot = githubStatus.querySelector('.file-status-dot');
    const githubStatusText = $('#github-status-text');
    const btnGithubSettings = $('#btn-github-settings');

    const loginOverlay = $('#login-overlay');
    const loginClose = $('#login-close');
    const loginForm = $('#login-form');
    const loginRole = $('#login-role');
    const loginNameGroup = $('#login-name-group');
    const loginPasswordGroup = $('#login-password-group');
    const loginName = $('#login-name');
    const loginPassword = $('#login-password');
    const loginError = $('#login-error');
    const btnLoginCancel = $('#btn-login-cancel');

    const githubOverlay = $('#github-overlay');
    const githubClose = $('#github-close');
    const githubForm = $('#github-form');
    const ghOwner = $('#gh-owner');
    const ghRepo = $('#gh-repo');
    const ghToken = $('#gh-token');
    const githubError = $('#github-error');
    const btnGithubCancel = $('#btn-github-cancel');

    const spareBody = $('#spare-body');
    const spareEmpty = $('#spare-empty');
    const usageBody = $('#usage-body');
    const usageEmpty = $('#usage-empty');
    const btnAddSpare = $('#btn-add-spare');
    const btnDesignate = $('#btn-designate');
    const btnWriteoff = $('#btn-writeoff');

    const spareOverlay = $('#spare-overlay');
    const spareClose = $('#spare-close');
    const spareForm = $('#spare-form');
    const spareNameInput = $('#spare-name');
    const spareQtyInput = $('#spare-quantity');
    const spareCostInput = $('#spare-cost');
    const spareModalTitle = $('#spare-modal-title');
    const btnSpareSubmit = $('#btn-spare-submit');
    const btnSpareCancel = $('#btn-spare-cancel');

    const writeoffOverlay = $('#writeoff-overlay');
    const writeoffClose = $('#writeoff-close');
    const writeoffForm = $('#writeoff-form');
    const writeoffPart = $('#writeoff-part');
    const writeoffQty = $('#writeoff-qty');
    const writeoffRemaining = $('#writeoff-remaining');
    const writeoffVerify = $('#writeoff-verify');
    const writeoffRepair = $('#writeoff-repair');
    const writeoffNote = $('#writeoff-note');
    const btnWriteoffCancel = $('#btn-writeoff-cancel');

    const designateOverlay = $('#designate-overlay');
    const designateClose = $('#designate-close');
    const designateList = $('#designate-list');
    const btnDesignateSave = $('#btn-designate-save');
    const btnDesignateCancel = $('#btn-designate-cancel');

    // ===================== GitHub API =====================
    function loadGithubConfig() {
        try {
            const raw = localStorage.getItem(GITHUB_CONFIG_KEY);
            if (raw) githubConfig = JSON.parse(raw);
        } catch { githubConfig = null; }
    }

    function saveGithubConfig(config) {
        githubConfig = config;
        localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(config));
    }

    function clearGithubConfig() {
        githubConfig = null;
        lastSha = null;
        localStorage.removeItem(GITHUB_CONFIG_KEY);
    }

    function ghHeaders() {
        return {
            'Authorization': `Bearer ${githubConfig.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }

    function ghUrl(path) {
        return `https://api.github.com/repos/${githubConfig.owner}/${githubConfig.repo}${path}`;
    }

    async function fetchGithubData() {
        if (!githubConfig) return null;
        try {
            const res = await fetch(ghUrl('/contents/data.json'), { headers: ghHeaders() });
            if (res.status === 404) return { content: null, sha: null };
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const content = data.content ? JSON.parse(atob(data.content)) : null;
            return { content, sha: data.sha };
        } catch (e) {
            console.error('GitHub fetch error:', e);
            return null;
        }
    }

    async function saveGithubData() {
        if (!githubConfig || isSaving) return;
        isSaving = true;
        updateGithubStatus('syncing');
        try {
            const current = await fetchGithubData();
            if (current === null) {
                updateGithubStatus('error');
                isSaving = false;
                return;
            }
            if (current.sha && current.sha !== lastSha && lastSha !== null) {
                const overwrite = confirm('Данные были изменены другим пользователем. Ваши изменения могут перезаписать чужие. Продолжить?');
                if (!overwrite) {
                    if (current.content) loadSyncedData(current.content);
                    lastSha = current.sha;
                    renderAll();
                    updateGithubStatus('connected');
                    isSaving = false;
                    return;
                }
            }
            const payload = {
                records, companies, employees,
                spareParts, sparePartUsage, sparePartEmployees,
                updatedAt: new Date().toISOString()
            };
            const body = {
                message: 'Update data.json',
                content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
                sha: current.sha || undefined
            };
            const res = await fetch(ghUrl('/contents/data.json'), {
                method: 'PUT',
                headers: ghHeaders(),
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 409) {
                    const retry = confirm('Конфликт записи. Данные изменились во время сохранения. Повторить?');
                    if (retry) {
                        isSaving = false;
                        await saveGithubData();
                        return;
                    }
                }
                throw new Error(err.message || `HTTP ${res.status}`);
            }
            const result = await res.json();
            lastSha = result.content.sha;
            updateGithubStatus('connected');
        } catch (e) {
            console.error('GitHub save error:', e);
            updateGithubStatus('error');
        }
        isSaving = false;
    }

    async function testGithubConnection(owner, repo, token) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data.json`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        if (res.status === 401) throw new Error('Неверный токен');
        if (res.status === 403) throw new Error('Нет доступа к репозиторию');
        if (res.status === 404) {
            const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/data.json`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Create data.json',
                    content: btoa(JSON.stringify({
                        records: [], companies: [], employees: [...DEFAULT_EMPLOYEES],
                        spareParts: [], sparePartUsage: [], sparePartEmployees: [],
                        createdAt: new Date().toISOString()
                    }, null, 2))
                })
            });
            if (!createRes.ok) throw new Error('Не удалось создать data.json');
            return true;
        }
        return true;
    }

    // ===================== Status =====================
    function updateGithubStatus(status) {
        githubStatusDot.className = 'file-status-dot';
        switch (status) {
            case 'connected': githubStatusDot.classList.add('connected'); githubStatusText.textContent = 'GitHub подключён'; break;
            case 'syncing': githubStatusDot.classList.add('syncing'); githubStatusText.textContent = 'Синхронизация...'; break;
            case 'error': githubStatusDot.classList.add('disconnected'); githubStatusText.textContent = 'Ошибка GitHub'; break;
            default: githubStatusDot.classList.add('disconnected'); githubStatusText.textContent = 'Не настроено';
        }
    }

    // ===================== Data =====================
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function getBossPassword() { return localStorage.getItem(PASSWORD_KEY) || '1234'; }

    function loadData() {
        try {
            currentRole = localStorage.getItem(ROLE_KEY) || 'employee';
            currentUserName = localStorage.getItem(USERNAME_KEY) || '';
        } catch {
            currentRole = 'employee';
            currentUserName = '';
        }
    }

    function saveSession() {
        localStorage.setItem(ROLE_KEY, currentRole);
        localStorage.setItem(USERNAME_KEY, currentUserName);
    }

    function loadSyncedData(data) {
        if (!data) return;
        records = data.records || [];
        companies = data.companies || [];
        employees = data.employees || [...DEFAULT_EMPLOYEES];
        DEFAULT_EMPLOYEES.forEach(name => {
            if (!employees.some(e => e.toLowerCase() === name.toLowerCase())) {
                employees.push(name);
            }
        });
        spareParts = data.spareParts || [];
        sparePartUsage = data.sparePartUsage || [];
        sparePartEmployees = data.sparePartEmployees || [];
        updateDatalist('company-list', companies);
    }

    async function saveData() {
        renderAll();
        await saveGithubData();
    }

    function addCompany(name) {
        const t = name.trim();
        if (!t) return;
        if (!companies.some(c => c.toLowerCase() === t.toLowerCase())) {
            companies.push(t);
            companies.sort((a, b) => a.localeCompare(b, 'ru'));
            updateDatalist('company-list', companies);
        }
    }

    function updateDatalist(id, items) {
        const dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = '';
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            dl.appendChild(opt);
        });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return `${d}.${m}.${y}`;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function normalizeEmployeeField(record) {
        if (Array.isArray(record.employee)) return record.employee;
        if (typeof record.employee === 'string' && record.employee.trim()) return [record.employee.trim()];
        return [];
    }

    // ===================== Multi-select =====================
    function renderMultiSelect(selected) {
        selectedEmployees = [...selected];
        employeeDropdown.innerHTML = '';
        employees.forEach(name => {
            const opt = document.createElement('div');
            opt.className = 'multi-select-option';
            const checked = selectedEmployees.some(n => n.toLowerCase() === name.toLowerCase());
            opt.innerHTML = `<input type="checkbox" value="${escapeHtml(name)}" ${checked ? 'checked' : ''}><span>${escapeHtml(name)}</span>`;
            opt.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                const cb = opt.querySelector('input');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            });
            opt.querySelector('input').addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (!selectedEmployees.some(n => n.toLowerCase() === name.toLowerCase())) {
                        selectedEmployees.push(name);
                    }
                } else {
                    selectedEmployees = selectedEmployees.filter(n => n.toLowerCase() !== name.toLowerCase());
                }
                updateTriggerDisplay();
            });
            employeeDropdown.appendChild(opt);
        });
        updateTriggerDisplay();
    }

    function updateTriggerDisplay() {
        if (selectedEmployees.length === 0) {
            employeeTrigger.textContent = 'Выберите сотрудников...';
            employeeTrigger.classList.add('placeholder');
        } else {
            employeeTrigger.classList.remove('placeholder');
            employeeTrigger.innerHTML = selectedEmployees.map(n => `<span class="multi-select-tag">${escapeHtml(n)}</span>`).join('');
        }
    }

    function toggleMultiSelect() { employeeDropdown.classList.toggle('open'); }
    function closeMultiSelect() { employeeDropdown.classList.remove('open'); }

    // ===================== Tabs =====================
    function switchTab(tab) {
        currentTab = tab;
        $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        $('#tab-journal').style.display = tab === 'journal' ? '' : 'none';
        $('#tab-spare').style.display = tab === 'spare' ? '' : 'none';
        renderAll();
    }

    // ===================== Refresh =====================
    async function refreshFromGithub() {
        if (!githubConfig || isSaving) return;
        try {
            const data = await fetchGithubData();
            if (data === null) {
                updateGithubStatus('error');
                return;
            }
            if (data.sha !== lastSha) {
                if (data.content) loadSyncedData(data.content);
                lastSha = data.sha;
                renderAll();
            }
            updateGithubStatus('connected');
        } catch (e) {
            console.error('Refresh error:', e);
            updateGithubStatus('error');
        }
    }

    function startRefresh() { stopRefresh(); refreshTimer = setInterval(refreshFromGithub, REFRESH_INTERVAL); }
    function stopRefresh() { if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; } }

    // ===================== UI =====================
    function updateUI() {
        const isBoss = currentRole === 'boss';
        roleText.textContent = isBoss ? 'Начальник' : 'Сотрудник';
        roleDot.className = 'role-dot ' + (isBoss ? 'boss' : 'employee');

        $$('.boss-only').forEach(el => { el.style.display = isBoss ? '' : 'none'; });

        const isDesignated = sparePartEmployees.some(
            n => currentUserName && n.toLowerCase() === currentUserName.toLowerCase()
        );
        const showSpareTab = isBoss || isDesignated;
        $$('button[data-tab="spare"]').forEach(el => { el.style.display = showSpareTab ? '' : 'none'; });
        if (currentTab === 'spare' && !showSpareTab) switchTab('journal');
        $$('.spare-designated').forEach(el => {
            el.style.display = (!isBoss && isDesignated) ? '' : 'none';
        });

        btnLogin.style.display = currentUserName ? 'none' : 'inline-block';
        btnLogout.style.display = currentUserName ? 'inline-block' : 'none';
        btnLogout.textContent = currentUserName ? 'Выйти' : 'Войти';

        renderAll();
    }

    // ===================== Render =====================
    function renderAll() {
        if (currentTab === 'journal') {
            renderJournalTable();
        } else {
            renderSpareParts();
            renderUsage();
        }
    }

    function getFilteredRecords() {
        let result = [...records];
        const search = filterSearch.value.trim().toLowerCase();
        const dateFrom = filterDateFrom.value;
        const dateTo = filterDateTo.value;

        if (search) {
            result = result.filter(r => {
                const empStr = Array.isArray(r.employee) ? r.employee.join(' ') : (r.employee || '');
                return (r.date || '').toLowerCase().includes(search) ||
                    (r.company || '').toLowerCase().includes(search) ||
                    (r.contactName || '').toLowerCase().includes(search) ||
                    (r.contactPhone || '').toLowerCase().includes(search) ||
                    (r.address || '').toLowerCase().includes(search) ||
                    empStr.toLowerCase().includes(search) ||
                    (r.note || '').toLowerCase().includes(search);
            });
        }
        if (dateFrom) result = result.filter(r => r.date >= dateFrom);
        if (dateTo) result = result.filter(r => r.date <= dateTo);

        result.sort((a, b) => {
            const aVal = (sortField === 'employee'
                ? (Array.isArray(a.employee) ? a.employee.join(', ') : (a.employee || ''))
                : (a[sortField] || '')).toLowerCase();
            const bVal = (sortField === 'employee'
                ? (Array.isArray(b.employee) ? b.employee.join(', ') : (b.employee || ''))
                : (b[sortField] || '')).toLowerCase();
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }

    function renderJournalTable() {
        const filtered = getFilteredRecords();
        const isBoss = currentRole === 'boss';
        recordsBody.innerHTML = '';

        if (!githubConfig) {
            emptyState.classList.add('visible');
            emptyState.innerHTML = 'Настройте подключение к GitHub для начала работы.<br>Нажмите <b>"Настройки GitHub"</b> и укажите данные репозитория.';
        } else if (records.length === 0) {
            emptyState.classList.add('visible');
            emptyState.innerHTML = 'Журнал пуст. Добавьте первую запись.';
        } else {
            emptyState.classList.remove('visible');
        }

        filtered.forEach(r => {
            const tr = document.createElement('tr');
            const empList = normalizeEmployeeField(r);
            const ackList = r.acknowledgedBy || [];

            if (isBoss && empList.length > 0) {
                const ackCount = empList.filter(emp =>
                    ackList.some(n => n.toLowerCase() === emp.toLowerCase())
                ).length;
                if (ackCount === empList.length) tr.classList.add('row-accepted');
                else if (ackCount > 0) tr.classList.add('row-partial');
                else tr.classList.add('row-pending');
            } else if (!isBoss && currentUserName) {
                const isAck = ackList.some(n => n.toLowerCase() === currentUserName.toLowerCase());
                tr.classList.add(isAck ? 'row-accepted' : 'row-pending');
            }

            const empHtml = empList.length > 0
                ? `<div class="employee-badges">${empList.map(n => `<span class="employee-badge">${escapeHtml(n)}</span>`).join('')}</div>`
                : '<span style="color:#94a3b8;font-size:12px;">—</span>';

            let ackHtml;
            if (isBoss) {
                if (empList.length > 0) {
                    const ackCount = empList.filter(emp =>
                        ackList.some(n => n.toLowerCase() === emp.toLowerCase())
                    ).length;
                    const pct = Math.round((ackCount / empList.length) * 100);
                    ackHtml = `<span class="ack-percent">${ackCount}/${empList.length} (${pct}%)</span><div style="margin-top:4px;">`;
                    empList.forEach(name => {
                        const checked = ackList.some(n => n.toLowerCase() === name.toLowerCase());
                        ackHtml += `<div class="ack-item"><input type="checkbox" class="ack-checkbox" data-id="${r.id}" data-name="${escapeHtml(name)}" ${checked ? 'checked' : ''} disabled><span class="ack-name ${checked ? 'checked' : ''}">${escapeHtml(name)}</span></div>`;
                    });
                    ackHtml += '</div>';
                } else {
                    ackHtml = '<span style="color:#94a3b8;font-size:12px;">—</span>';
                }
            } else if (currentUserName) {
                const isCurrentUserInRecord = empList.some(n => n.toLowerCase() === currentUserName.toLowerCase());
                if (isCurrentUserInRecord) {
                    const isAck = ackList.some(n => n.toLowerCase() === currentUserName.toLowerCase());
                    ackHtml = `<div class="ack-item"><input type="checkbox" class="ack-checkbox" data-id="${r.id}" data-name="${escapeHtml(currentUserName)}" ${isAck ? 'checked' : ''}><span class="ack-name ${isAck ? 'checked' : ''}">${isAck ? 'Ознакомлен' : 'Отметить'}</span></div>`;
                } else {
                    ackHtml = '<span style="color:#94a3b8;font-size:12px;">Не назначен</span>';
                }
            } else {
                if (empList.length > 0) {
                    ackHtml = empList.map(name => {
                        const checked = ackList.some(n => n.toLowerCase() === name.toLowerCase());
                        return `<div class="ack-item"><span class="ack-name ${checked ? 'checked' : ''}">${escapeHtml(name)} ${checked ? '✓' : ''}</span></div>`;
                    }).join('');
                } else {
                    ackHtml = '<span style="color:#94a3b8;font-size:12px;">—</span>';
                }
            }

            const actionsHtml = isBoss
                ? `<td class="actions-cell"><button class="btn btn-edit" data-id="${r.id}">Изм.</button><button class="btn btn-danger" data-id="${r.id}">Уд.</button></td>`
                : '';

            tr.innerHTML = `
                <td title="${r.date}">${formatDate(r.date)}</td>
                <td title="${escapeHtml(r.company)}">${escapeHtml(r.company)}</td>
                <td title="${escapeHtml(r.contactName)}">${escapeHtml(r.contactName)}</td>
                <td title="${escapeHtml(r.contactPhone || '')}">${escapeHtml(r.contactPhone || '—')}</td>
                <td title="${escapeHtml(r.address)}">${escapeHtml(r.address)}</td>
                <td>${empHtml}</td>
                <td title="${escapeHtml(r.note || '')}">${escapeHtml(r.note || '—')}</td>
                <td class="ack-cell">${ackHtml}</td>
                ${actionsHtml}
            `;
            recordsBody.appendChild(tr);
        });

        const total = records.length;
        const shown = filtered.length;
        statsEl.textContent = total === shown ? `Всего записей: ${total}` : `Показано ${shown} из ${total} записей`;
        updateSortIndicators();
    }

    function updateSortIndicators() {
        $$('.table-wrapper th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === sortField) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        });
    }

    // ===================== Spare Parts =====================
    function renderSpareParts() {
        const isBoss = currentRole === 'boss';
        spareBody.innerHTML = '';
        if (spareParts.length === 0) spareEmpty.classList.add('visible');
        else spareEmpty.classList.remove('visible');
        spareParts.forEach((sp, idx) => {
            const tr = document.createElement('tr');
            const actionsHtml = isBoss
                ? `<td class="actions-cell"><button class="btn btn-edit btn-spare-edit" data-id="${sp.id}">Изм.</button><button class="btn btn-danger btn-spare-delete" data-id="${sp.id}">Уд.</button></td>`
                : '';
            tr.innerHTML = `<td>${idx + 1}</td><td title="${escapeHtml(sp.name)}">${escapeHtml(sp.name)}</td><td>${sp.quantity} шт.</td><td>${Number(sp.cost).toLocaleString('ru-RU')} ₽</td>${actionsHtml}`;
            spareBody.appendChild(tr);
        });
    }

    function renderUsage() {
        usageBody.innerHTML = '';
        const isBoss = currentRole === 'boss';
        let filtered = sparePartUsage;
        if (!isBoss && currentUserName) {
            filtered = sparePartUsage.filter(u => u.filledBy && u.filledBy.toLowerCase() === currentUserName.toLowerCase());
        }
        if (filtered.length === 0) usageEmpty.classList.add('visible');
        else usageEmpty.classList.remove('visible');
        filtered.slice().reverse().forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${u.filledAt ? formatDate(u.filledAt.slice(0, 10)) : '—'}</td><td>${escapeHtml(u.sparePartName || '—')}</td><td>${u.quantity} шт.</td><td>${escapeHtml(u.verificationAccount || '—')}</td><td>${escapeHtml(u.repairAccount || '—')}</td><td title="${escapeHtml(u.note || '')}">${escapeHtml(u.note || '—')}</td><td>${escapeHtml(u.filledBy || '—')}</td>`;
            usageBody.appendChild(tr);
        });
    }

    function updateWriteoffPartInfo() {
        const sp = spareParts.find(p => p.id === writeoffPart.value);
        writeoffRemaining.textContent = sp ? `Осталось: ${sp.quantity} шт.` : '';
        writeoffQty.max = sp ? sp.quantity : 1;
        if (sp && writeoffQty.value > sp.quantity) writeoffQty.value = sp.quantity;
    }

    // ===================== Modals =====================
    function openModal() { modalOverlay.classList.add('active'); }
    function closeModal() { modalOverlay.classList.remove('active'); }

    function resetForm() {
        form.reset();
        dateInput.value = new Date().toISOString().slice(0, 10);
        selectedEmployees = [];
        renderMultiSelect([]);
        closeMultiSelect();
        editingId = null;
        modalTitle.textContent = 'Новая запись';
        btnSubmit.textContent = 'Добавить';
        closeModal();
    }

    function openAddModal() { resetForm(); openModal(); setTimeout(() => companyInput.focus(), 200); }

    function openEditModal(record) {
        dateInput.value = record.date;
        companyInput.value = record.company;
        contactNameInput.value = record.contactName;
        contactPhoneInput.value = record.contactPhone;
        addressInput.value = record.address;
        renderMultiSelect(normalizeEmployeeField(record));
        noteInput.value = record.note;
        editingId = record.id;
        modalTitle.textContent = 'Редактировать запись';
        btnSubmit.textContent = 'Сохранить';
        openModal();
    }

    function openSpareModal() {
        spareForm.reset();
        editingSpareId = null;
        spareModalTitle.textContent = 'Новая запчасть';
        btnSpareSubmit.textContent = 'Добавить';
        spareOverlay.classList.add('active');
    }

    function openEditSpareModal(sp) {
        spareNameInput.value = sp.name;
        spareQtyInput.value = sp.quantity;
        spareCostInput.value = sp.cost;
        editingSpareId = sp.id;
        spareModalTitle.textContent = 'Редактировать запчасть';
        btnSpareSubmit.textContent = 'Сохранить';
        spareOverlay.classList.add('active');
    }

    function closeSpareModal() { spareOverlay.classList.remove('active'); editingSpareId = null; }

    function openWriteoffModal() {
        writeoffForm.reset();
        writeoffQty.value = 1;
        writeoffRemaining.textContent = '';
        writeoffPart.innerHTML = '<option value="">Выберите запчасть...</option>';
        spareParts.filter(p => p.quantity > 0).forEach(sp => {
            const opt = document.createElement('option');
            opt.value = sp.id;
            opt.textContent = `${sp.name} (осталось: ${sp.quantity} шт.)`;
            writeoffPart.appendChild(opt);
        });
        writeoffOverlay.classList.add('active');
    }

    function closeWriteoffModal() { writeoffOverlay.classList.remove('active'); }

    function openDesignateModal() {
        designateList.innerHTML = '';
        const allNames = [...new Set([...employees, ...sparePartEmployees])].sort((a, b) => a.localeCompare(b, 'ru'));
        if (allNames.length === 0) {
            designateList.innerHTML = '<p style="color:#94a3b8;padding:12px 0;">Нет сотрудников.</p>';
        }
        allNames.forEach(name => {
            const div = document.createElement('div');
            div.className = 'designate-item';
            const checked = sparePartEmployees.some(n => n.toLowerCase() === name.toLowerCase());
            div.innerHTML = `<input type="checkbox" id="des-${name}" value="${escapeHtml(name)}" ${checked ? 'checked' : ''}><label for="des-${name}">${escapeHtml(name)}</label>`;
            designateList.appendChild(div);
        });
        designateOverlay.classList.add('active');
    }

    function closeDesignateModal() { designateOverlay.classList.remove('active'); }

    function openLoginModal() {
        loginForm.reset();
        loginError.classList.remove('visible');
        loginRole.value = 'employee';
        loginNameGroup.style.display = '';
        loginPasswordGroup.style.display = 'none';
        loginName.required = true;
        loginPassword.required = false;
        updateDatalist('login-employee-list', employees);
        loginOverlay.classList.add('active');
    }

    function closeLoginModal() { loginOverlay.classList.remove('active'); }

    function openGithubModal() {
        githubForm.reset();
        githubError.classList.remove('visible');
        if (githubConfig) {
            ghOwner.value = githubConfig.owner || '';
            ghRepo.value = githubConfig.repo || '';
            ghToken.value = githubConfig.token || '';
        }
        githubOverlay.classList.add('active');
    }

    function closeGithubModal() { githubOverlay.classList.remove('active'); }

    // ===================== Events =====================
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    loginRole.addEventListener('change', () => {
        if (loginRole.value === 'boss') {
            loginNameGroup.style.display = 'none';
            loginPasswordGroup.style.display = '';
            loginName.required = false;
            loginPassword.required = true;
        } else {
            loginNameGroup.style.display = '';
            loginPasswordGroup.style.display = 'none';
            loginName.required = true;
            loginPassword.required = false;
        }
        loginError.classList.remove('visible');
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (loginRole.value === 'employee') {
            const name = loginName.value.trim();
            if (!name) { loginError.textContent = 'Введите ФИО'; loginError.classList.add('visible'); return; }
            currentRole = 'employee';
            currentUserName = name;
        } else {
            if (loginPassword.value !== getBossPassword()) { loginError.textContent = 'Неверный пароль'; loginError.classList.add('visible'); return; }
            currentRole = 'boss';
            currentUserName = 'Администратор';
        }
        saveSession();
        closeLoginModal();
        updateUI();
    });

    btnLogout.addEventListener('click', () => {
        currentRole = 'employee';
        currentUserName = '';
        saveSession();
        updateUI();
    });

    btnLogin.addEventListener('click', openLoginModal);
    loginClose.addEventListener('click', closeLoginModal);
    btnLoginCancel.addEventListener('click', closeLoginModal);
    loginOverlay.addEventListener('click', (e) => { if (e.target === loginOverlay) closeLoginModal(); });

    // --- GitHub settings ---
    btnGithubSettings.addEventListener('click', openGithubModal);
    githubClose.addEventListener('click', closeGithubModal);
    btnGithubCancel.addEventListener('click', closeGithubModal);
    githubOverlay.addEventListener('click', (e) => { if (e.target === githubOverlay) closeGithubModal(); });

    githubForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        githubError.classList.remove('visible');
        const owner = ghOwner.value.trim();
        const repo = ghRepo.value.trim();
        const token = ghToken.value.trim();
        if (!owner || !repo || !token) { githubError.textContent = 'Заполните все поля'; githubError.classList.add('visible'); return; }
        try {
            await testGithubConnection(owner, repo, token);
            saveGithubConfig({ owner, repo, token });
            closeGithubModal();
            updateGithubStatus('syncing');
            const data = await fetchGithubData();
            if (data && data.content) { loadSyncedData(data.content); lastSha = data.sha; }
            else if (data && data.sha) { lastSha = data.sha; }
            updateGithubStatus('connected');
            renderAll();
            startRefresh();
        } catch (err) {
            githubError.textContent = err.message || 'Ошибка подключения';
            githubError.classList.add('visible');
        }
    });

    // --- Trip form ---
    btnAdd.addEventListener('click', openAddModal);
    fabAdd.addEventListener('click', openAddModal);
    modalClose.addEventListener('click', resetForm);
    btnCancel.addEventListener('click', resetForm);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) resetForm(); });
    employeeTrigger.addEventListener('click', toggleMultiSelect);
    document.addEventListener('click', (e) => { if (!e.target.closest('#employee-multi-select')) closeMultiSelect(); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (selectedEmployees.length === 0) { alert('Выберите хотя бы одного сотрудника'); return; }
        const record = {
            id: editingId || generateId(),
            date: dateInput.value,
            company: companyInput.value.trim(),
            contactName: contactNameInput.value.trim(),
            contactPhone: contactPhoneInput.value.trim(),
            address: addressInput.value.trim(),
            employee: [...selectedEmployees],
            note: noteInput.value.trim(),
            acknowledgedBy: editingId ? (records.find(r => r.id === editingId)?.acknowledgedBy || []) : [],
            createdAt: editingId ? (records.find(r => r.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        addCompany(record.company);
        if (editingId) {
            const idx = records.findIndex(r => r.id === editingId);
            if (idx !== -1) records[idx] = record;
        } else {
            records.push(record);
        }
        await saveData();
        resetForm();
    });

    recordsBody.addEventListener('click', async (e) => {
        const ackCheck = e.target.closest('.ack-checkbox');
        if (ackCheck && !ackCheck.disabled) {
            const id = ackCheck.dataset.id;
            const name = ackCheck.dataset.name;
            const record = records.find(r => r.id === id);
            if (!record || !name) return;
            if (!record.acknowledgedBy) record.acknowledgedBy = [];
            if (ackCheck.checked) {
                if (!record.acknowledgedBy.some(n => n.toLowerCase() === name.toLowerCase())) record.acknowledgedBy.push(name);
            } else {
                record.acknowledgedBy = record.acknowledgedBy.filter(n => n.toLowerCase() !== name.toLowerCase());
            }
            record.updatedAt = new Date().toISOString();
            await saveData();
            return;
        }
        const btn = e.target.closest('button[data-id]');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('btn-danger')) {
            if (confirm('Удалить запись?')) { records = records.filter(r => r.id !== id); await saveData(); }
        } else if (btn.classList.contains('btn-edit')) {
            const record = records.find(r => r.id === id);
            if (record) openEditModal(record);
        }
    });

    $$('.table-wrapper th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            sortDir = (sortField === field && sortDir === 'asc') ? 'desc' : 'asc';
            sortField = field;
            renderAll();
        });
    });

    filterSearch.addEventListener('input', renderAll);
    filterDateFrom.addEventListener('change', renderAll);
    filterDateTo.addEventListener('change', renderAll);
    btnClearFilter.addEventListener('click', () => { filterSearch.value = ''; filterDateFrom.value = ''; filterDateTo.value = ''; renderAll(); });

    // --- Spare parts ---
    btnAddSpare.addEventListener('click', () => openSpareModal());
    btnDesignate.addEventListener('click', openDesignateModal);
    btnWriteoff.addEventListener('click', openWriteoffModal);
    spareClose.addEventListener('click', closeSpareModal);
    spareOverlay.addEventListener('click', (e) => { if (e.target === spareOverlay) closeSpareModal(); });
    btnSpareCancel.addEventListener('click', closeSpareModal);

    spareForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sp = {
            id: editingSpareId || generateId(),
            name: spareNameInput.value.trim(),
            quantity: parseInt(spareQtyInput.value, 10),
            cost: parseFloat(spareCostInput.value),
            createdAt: editingSpareId ? (spareParts.find(p => p.id === editingSpareId)?.createdAt || new Date().toISOString()) : new Date().toISOString()
        };
        if (editingSpareId) {
            const idx = spareParts.findIndex(p => p.id === editingSpareId);
            if (idx !== -1) spareParts[idx] = sp;
        } else { spareParts.push(sp); }
        await saveData();
        closeSpareModal();
    });

    spareBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-spare-edit');
        if (editBtn) { const sp = spareParts.find(p => p.id === editBtn.dataset.id); if (sp) openEditSpareModal(sp); return; }
        const delBtn = e.target.closest('.btn-spare-delete');
        if (delBtn && confirm('Удалить запчасть?')) { spareParts = spareParts.filter(p => p.id !== delBtn.dataset.id); await saveData(); }
    });

    writeoffPart.addEventListener('change', updateWriteoffPartInfo);
    writeoffClose.addEventListener('click', closeWriteoffModal);
    btnWriteoffCancel.addEventListener('click', closeWriteoffModal);
    writeoffOverlay.addEventListener('click', (e) => { if (e.target === writeoffOverlay) closeWriteoffModal(); });

    writeoffForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const sp = spareParts.find(p => p.id === writeoffPart.value);
        if (!sp) return;
        const qty = parseInt(writeoffQty.value, 10);
        if (qty < 1 || qty > sp.quantity) { alert(`Некорректное количество. Доступно: ${sp.quantity} шт.`); return; }
        sp.quantity -= qty;
        sparePartUsage.push({
            id: generateId(), sparePartId: sp.id, sparePartName: sp.name, quantity: qty,
            verificationAccount: writeoffVerify.value.trim(), repairAccount: writeoffRepair.value.trim(),
            note: writeoffNote.value.trim(), filledBy: currentUserName, filledAt: new Date().toISOString()
        });
        await saveData();
        closeWriteoffModal();
    });

    designateClose.addEventListener('click', closeDesignateModal);
    btnDesignateCancel.addEventListener('click', closeDesignateModal);
    designateOverlay.addEventListener('click', (e) => { if (e.target === designateOverlay) closeDesignateModal(); });
    btnDesignateSave.addEventListener('click', async () => {
        sparePartEmployees = Array.from(designateList.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        await saveData();
        closeDesignateModal();
        updateUI();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('active')) resetForm();
            if (loginOverlay.classList.contains('active')) closeLoginModal();
            if (githubOverlay.classList.contains('active')) closeGithubModal();
            if (spareOverlay.classList.contains('active')) closeSpareModal();
            if (writeoffOverlay.classList.contains('active')) closeWriteoffModal();
            if (designateOverlay.classList.contains('active')) closeDesignateModal();
        }
    });

    // --- Export CSV ---
    btnExportCsv.addEventListener('click', () => {
        const filtered = getFilteredRecords();
        if (filtered.length === 0) { alert('Нет данных для экспорта'); return; }
        const headers = ['Дата', 'Предприятие', 'Контактное лицо', 'Телефон', 'Адрес', 'Кто поедет', 'Примечание', 'Ознакомлен'];
        const rows = filtered.map(r => {
            const empStr = Array.isArray(r.employee) ? r.employee.join(', ') : (r.employee || '');
            return [formatDate(r.date), r.company, r.contactName, r.contactPhone, r.address, empStr, r.note, (r.acknowledgedBy || []).join(', ')];
        });
        const csv = [headers, ...rows].map(row => row.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `records_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // ===================== Init =====================
    async function init() {
        loadData();
        loadGithubConfig();
        dateInput.value = new Date().toISOString().slice(0, 10);

        if (githubConfig) {
            updateGithubStatus('syncing');
            const data = await fetchGithubData();
            if (data && data.content) { loadSyncedData(data.content); lastSha = data.sha; }
            else if (data && data.sha) { lastSha = data.sha; }
            if (data !== null) {
                updateGithubStatus('connected');
                startRefresh();
            } else {
                updateGithubStatus('error');
            }
        } else {
            updateGithubStatus('disconnected');
        }
        updateUI();
    }

    init();
})();
