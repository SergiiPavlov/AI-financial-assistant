
  let currentUiLang = 'ru';
  let accessToken = localStorage.getItem('demoAccessToken') || '';
  let currentUser = null;
  let lastParse = null;
  let lastParseSource = 'manual';
  let lastDraftId = null;
  let lastLoadedTransactions = [];
  let lastSummaryData = null;
  let draftList = [];
  let currentDraft = null;
  let draftEditItems = [];
  let draftEditTitle = '';
  let categoriesMeta = [];
  let categoryLabelById = {};
  const activeTxFilters = { from: '', to: '', category: '', type: 'all', page: 1, limit: 50 };

  const UI_TEXT = window.UI_TEXT || {};

  function t(key) {
    const lang = UI_TEXT[currentUiLang] ? currentUiLang : 'ru';
    return (UI_TEXT[lang] && UI_TEXT[lang][key]) || (UI_TEXT['ru'] && UI_TEXT['ru'][key]) || key;
  }

  function applyUiLang() {
    const lang = UI_TEXT[currentUiLang] ? currentUiLang : 'ru';
    const map = UI_TEXT[lang] || UI_TEXT['ru'];
    const langLabel = document.querySelector('label[for="uiLangSelect"][data-i18n="ui_lang_label"]');
    if (langLabel && map.ui_lang_label) {
      langLabel.textContent = map.ui_lang_label;
    }
    Object.keys(map).forEach((key) => {
      const nodes = document.querySelectorAll('[data-i18n="' + key + '"]');
      nodes.forEach((el) => {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.setAttribute('placeholder', map[key]);
        } else {
          el.textContent = map[key];
        }
      });
    });
    renderAssistantExamples();
    updateTransactionsFilterInfo();
  }

  const langSelect = document.getElementById('uiLangSelect');
  if (langSelect) {
    langSelect.addEventListener('change', (e) => {
      currentUiLang = e.target.value;
      applyUiLang();
      loadCategoriesForLang(currentUiLang);
      renderTransactionsTable(lastLoadedTransactions);
      if (lastSummaryData) {
        renderSummaryTables(lastSummaryData);
      }
    });
  }

  function setCategoriesMeta(meta) {
    categoriesMeta = Array.isArray(meta) ? meta : [];
    categoryLabelById = Object.fromEntries(categoriesMeta.map((c) => [c.id, c.label]));
    renderCategoryFilterOptions();
    renderTransactionsTable(lastLoadedTransactions);
    if (lastSummaryData) {
      renderSummaryTables(lastSummaryData);
    }
    updateTransactionsFilterInfo();
  }

  async function loadCategoriesForLang(lang) {
    try {
      const res = await fetch(`/api/finance/meta/categories?lang=${encodeURIComponent(lang || 'ru')}`);
      if (!res.ok) {
        throw new Error('Failed to load categories');
      }
      const data = await res.json();
      setCategoriesMeta(data);
    } catch (e) {
      console.error(e);
      setCategoriesMeta([]);
    }
  }

  function getCategoryLabelForUi(id) {
    if (!id) return t('msg_no_category');
    return categoryLabelById[id] || t('msg_no_category');
  }

  function getCategoryIdByLabel(label) {
    if (!label) return '';
    const normalized = label.trim().toLowerCase();
    const found = categoriesMeta.find(
      (c) => c.id.toLowerCase() === normalized || c.label.toLowerCase() === normalized
    );
    return found ? found.id : '';
  }

  function setAccessToken(token) {
    accessToken = token || '';
    if (accessToken) {
      localStorage.setItem('demoAccessToken', accessToken);
    } else {
      localStorage.removeItem('demoAccessToken');
    }
  }

  function updateAuthUi() {
    const userLabel = document.getElementById('currentUser');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtn = document.getElementById('loginBtn');
    if (userLabel) {
      if (currentUser) {
        userLabel.textContent = `${t('label_current_user')} ${currentUser.email || currentUser.id}`;
      } else {
        userLabel.textContent = `${t('label_current_user')} ${t('label_not_logged_in')}`;
      }
    }
    if (logoutBtn) logoutBtn.disabled = !currentUser;
    if (loginBtn) loginBtn.disabled = false;
  }

  async function apiFetch(path, options = {}, retry = true) {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    const res = await fetch(path, { ...options, headers, credentials: 'include' });
    if (res.status === 401 && retry) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return apiFetch(path, options, false);
      }
    }
    return res;
  }

  async function refreshAccessToken() {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        currentUser = data.user || null;
        updateAuthUi();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async function login() {
    const emailInput = document.getElementById('emailInput');
    const email = emailInput && emailInput.value ? emailInput.value.trim() : '';
    const res = await fetch('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      credentials: 'include'
    });
    if (!res.ok) {
      alert('Login failed');
      return;
    }
    const data = await res.json();
    setAccessToken(data.accessToken || '');
    currentUser = data.user || null;
    updateAuthUi();
    await loadDrafts();
    await loadTransactions();
    await getSummary();
  }

  async function logout() {
    await apiFetch('/api/auth/logout', { method: 'POST' }, false);
    currentUser = null;
    setAccessToken('');
    updateAuthUi();
    document.getElementById('transactions').textContent = '';
    document.getElementById('summary').textContent = '';
    document.getElementById('transactionsTable').querySelector('tbody').innerHTML = '';
    draftList = [];
    currentDraft = null;
    draftEditItems = [];
    draftEditTitle = '';
    renderDraftsList();
    renderDraftDetails();
  }

  function ensureLoggedIn() {
    if (!accessToken) {
      alert(t('msg_login_required'));
      return false;
    }
    return true;
  }

  function renderWarningsAndQuestions(data) {
    const warningsBlock = document.getElementById('parseWarningsBlock');
    const warningsList = document.getElementById('parseWarningsList');
    const questionsBlock = document.getElementById('parseQuestionsBlock');
    const questionsList = document.getElementById('parseQuestionsList');
    const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
    const questions = Array.isArray(data?.questions) ? data.questions : [];

    if (warningsBlock && warningsList) {
      warningsBlock.style.display = warnings.length ? 'block' : 'none';
      warningsList.innerHTML = warnings.map((w) => `<li>${w}</li>`).join('');
    }
    if (questionsBlock && questionsList) {
      questionsBlock.style.display = questions.length ? 'block' : 'none';
      questionsList.innerHTML = questions.map((q) => `<li>${q}</li>`).join('');
    }
  }

  async function parseText() {
    if (!ensureLoggedIn()) return;
    const textInput = document.getElementById('text');
    const text = textInput ? textInput.value : '';
    const res = await apiFetch('/api/finance/parse-text', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    lastParse = data;
    lastParseSource = 'ai-text';
    renderWarningsAndQuestions(data);
    updateDraftButton('btn_create_draft', false);
    const target = document.getElementById('parseResult');
    if (target) {
      target.textContent = JSON.stringify(data, null, 2);
    }
  }

  async function parseVoice() {
    if (!ensureLoggedIn()) return;
    const fileInput = document.getElementById('voiceFile');
    if (!fileInput || !(fileInput instanceof HTMLInputElement) || !fileInput.files || fileInput.files.length === 0) {
      alert(t('msg_select_file_first'));
      return;
    }
    const file = fileInput.files[0];
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch('/api/finance/voice', {
      method: 'POST',
      body: form,
      headers: {}
    });
    const data = await res.json();
    lastParse = data;
    lastParseSource = 'ai-voice';
    renderWarningsAndQuestions(data);
    updateDraftButton('btn_create_draft', false);
    const target = document.getElementById('voiceResult');
    if (target) {
      target.textContent = JSON.stringify(data, null, 2);
    }
  }

  function updateDraftButton(labelKey, disabled) {
    const btn = document.getElementById('saveParsedBtn');
    if (btn) {
      btn.disabled = disabled;
      btn.textContent = t(labelKey);
    }
  }

  function buildDraftTitle(source) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const sourceLabel =
      source === 'ai-voice' ? t('draft_source_voice') : source === 'ai-text' ? t('draft_source_text') : t('draft_source_manual');
    return `${t('draft_title_prefix')} ${dateStr} (${sourceLabel})`;
  }

  function normalizeDraftItemsPayload(items, fallbackSource) {
    return (items || []).map((t) => ({
      date: t.date,
      amount: Number(t.amount),
      currency: (t.currency || 'UAH').trim(),
      category: t.category,
      description: t.description || '',
      source: t.source || fallbackSource,
      type: t.type || 'expense'
    }));
  }

  async function createDraftFromParsed() {
    if (!ensureLoggedIn()) return;
    if (!lastParse || !Array.isArray(lastParse.transactions) || lastParse.transactions.length === 0) {
      alert(t('msg_parse_text_first'));
      return;
    }

    const fallbackSource = lastParseSource === 'ai-voice' ? 'voice' : 'manual';
    const items = normalizeDraftItemsPayload(lastParse.transactions, fallbackSource);
    const payload = {
      source: lastParseSource,
      lang: currentUiLang,
      title: buildDraftTitle(lastParseSource),
      items
    };

    const res = await apiFetch('/api/finance/drafts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t('msg_failed_create_draft'));
      return;
    }

    lastDraftId = data.draftId;
    updateDraftButton('btn_draft_created', true);
    await loadDrafts(true, data.draftId);
    if (data.draftId) {
      await openDraft(data.draftId);
    }
  }

  function formatDraftStatus(status) {
    if (status === 'applied') return t('draft_status_applied');
    if (status === 'discarded') return t('draft_status_discarded');
    return t('draft_status_draft');
  }

  function renderDraftsList() {
    const container = document.getElementById('draftsList');
    if (!container) return;
    const items = Array.isArray(draftList) ? draftList : [];
    container.innerHTML = '';
    if (!items.length) {
      container.textContent = t('msg_no_drafts');
      return;
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['col_title', 'col_status', 'col_items', 'col_created', 'col_actions'].forEach((key) => {
      const th = document.createElement('th');
      th.textContent = t(key);
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    items.forEach((draft) => {
      const row = document.createElement('tr');
      const createdAt = draft.createdAt ? new Date(draft.createdAt) : null;
      const createdLabel = createdAt && !isNaN(createdAt.getTime()) ? createdAt.toISOString().slice(0, 19).replace('T', ' ') : '';
      const cells = [
        draft.title || t('msg_no_title'),
        formatDraftStatus(draft.status),
        String(draft.itemsCount || 0),
        createdLabel
      ];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        row.appendChild(td);
      });

      const actionsTd = document.createElement('td');
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.textContent = t('btn_open');
      openBtn.onclick = () => openDraft(draft.id);

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.style.marginLeft = '4px';
      applyBtn.textContent = t('btn_apply_draft');
      applyBtn.onclick = () => applyDraftById(draft.id);

      const discardBtn = document.createElement('button');
      discardBtn.type = 'button';
      discardBtn.style.marginLeft = '4px';
      discardBtn.textContent = t('btn_discard_draft');
      discardBtn.onclick = () => discardDraftById(draft.id);

      actionsTd.appendChild(openBtn);
      actionsTd.appendChild(applyBtn);
      actionsTd.appendChild(discardBtn);
      row.appendChild(actionsTd);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderDraftDetails() {
    const container = document.getElementById('draftDetails');
    if (!container) return;
    container.innerHTML = '';

    if (!currentDraft) {
      container.innerHTML = `<div class="muted">${t('msg_select_draft')}</div>`;
      return;
    }

    const wrapper = document.createElement('div');
    const editable = currentDraft.status === 'draft';

    const titleLabel = document.createElement('label');
    titleLabel.textContent = t('label_draft_title');
    const titleInput = document.createElement('input');
    titleInput.value = draftEditTitle;
    titleInput.disabled = !editable;
    titleInput.oninput = (e) => {
      draftEditTitle = e.target.value;
    };

    const statusLabel = document.createElement('div');
    statusLabel.className = 'muted';
    statusLabel.textContent = `${t('label_draft_status')} ${formatDraftStatus(currentDraft.status)}`;

    const itemsTable = document.createElement('table');
    itemsTable.id = 'draftItemsTable';
    const headRow = document.createElement('tr');
    ['col_date', 'col_category', 'col_type', 'col_amount', 'col_currency', 'col_description', 'col_source'].forEach((key) => {
      const th = document.createElement('th');
      th.textContent = t(key);
      headRow.appendChild(th);
    });
    const head = document.createElement('thead');
    head.appendChild(headRow);
    itemsTable.appendChild(head);

    const body = document.createElement('tbody');
    if (!draftEditItems.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = t('msg_no_items');
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      draftEditItems.forEach((item, index) => {
        const row = document.createElement('tr');

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = item.date ? item.date.slice(0, 10) : '';
        dateInput.disabled = !editable;
        dateInput.onchange = (e) => updateDraftEditItem(index, 'date', e.target.value);

        const categorySelect = document.createElement('select');
        categorySelect.disabled = !editable;
        categoriesMeta.forEach((cat) => {
          const opt = document.createElement('option');
          opt.value = cat.id;
          opt.textContent = cat.label;
          categorySelect.appendChild(opt);
        });
        categorySelect.value = item.category;
        categorySelect.onchange = (e) => updateDraftEditItem(index, 'category', e.target.value);

        const typeSelect = document.createElement('select');
        typeSelect.disabled = !editable;
        ['expense', 'income'].forEach((tVal) => {
          const opt = document.createElement('option');
          opt.value = tVal;
          opt.textContent = formatTxTypeLabel(tVal);
          typeSelect.appendChild(opt);
        });
        typeSelect.value = item.type || 'expense';
        typeSelect.onchange = (e) => updateDraftEditItem(index, 'type', e.target.value);

        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.step = '0.01';
        amountInput.min = '0';
        amountInput.value = item.amount;
        amountInput.disabled = !editable;
        amountInput.onchange = (e) => updateDraftEditItem(index, 'amount', Number(e.target.value));

        const currencyInput = document.createElement('input');
        currencyInput.value = item.currency || '';
        currencyInput.disabled = !editable;
        currencyInput.onchange = (e) => updateDraftEditItem(index, 'currency', e.target.value);

        const descriptionInput = document.createElement('input');
        descriptionInput.value = item.description || '';
        descriptionInput.disabled = !editable;
        descriptionInput.onchange = (e) => updateDraftEditItem(index, 'description', e.target.value);

        const sourceInput = document.createElement('input');
        sourceInput.value = item.source || '';
        sourceInput.disabled = !editable;
        sourceInput.onchange = (e) => updateDraftEditItem(index, 'source', e.target.value);

        [
          dateInput,
          categorySelect,
          typeSelect,
          amountInput,
          currencyInput,
          descriptionInput,
          sourceInput
        ].forEach((input) => {
          const td = document.createElement('td');
          td.appendChild(input);
          row.appendChild(td);
        });

        body.appendChild(row);
      });
    }

    itemsTable.appendChild(body);

    const actions = document.createElement('div');
    actions.className = 'inline';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = t('btn_save_draft');
    saveBtn.disabled = !editable;
    saveBtn.onclick = () => saveDraftChanges();

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = t('btn_apply_draft');
    applyBtn.onclick = () => applyDraftById(currentDraft.id);

    const discardBtn = document.createElement('button');
    discardBtn.type = 'button';
    discardBtn.textContent = t('btn_discard_draft');
    discardBtn.onclick = () => discardDraftById(currentDraft.id);

    actions.appendChild(saveBtn);
    actions.appendChild(applyBtn);
    actions.appendChild(discardBtn);

    wrapper.appendChild(titleLabel);
    wrapper.appendChild(titleInput);
    wrapper.appendChild(statusLabel);
    wrapper.appendChild(itemsTable);
    wrapper.appendChild(actions);
    container.appendChild(wrapper);
  }

  function updateDraftEditItem(index, field, value) {
    if (!draftEditItems[index]) return;
    draftEditItems[index] = { ...draftEditItems[index], [field]: value };
  }

  async function loadDrafts(openLatest = false, focusId = '') {
    if (!ensureLoggedIn()) return;
    const res = await apiFetch('/api/finance/drafts');
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t('msg_failed_load_drafts'));
      return;
    }
    draftList = Array.isArray(data?.items) ? data.items : [];
    renderDraftsList();

    const targetId = focusId || (openLatest && draftList.length ? draftList[0].id : '');
    if (targetId) {
      await openDraft(targetId);
    }
  }

  async function openDraft(id) {
    if (!ensureLoggedIn()) return;
    if (!id) return;
    const res = await apiFetch('/api/finance/drafts/' + encodeURIComponent(id));
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t('msg_failed_load_drafts'));
      return;
    }
    currentDraft = data.draft;
    draftEditItems = Array.isArray(currentDraft?.items) ? currentDraft.items.map((i) => ({ ...i })) : [];
    draftEditTitle = currentDraft?.title || '';
    renderDraftDetails();
  }

  async function saveDraftChanges() {
    if (!ensureLoggedIn() || !currentDraft) return;
    const fallbackSource = currentDraft.source || 'manual';
    const items = normalizeDraftItemsPayload(draftEditItems, fallbackSource);
    const res = await apiFetch('/api/finance/drafts/' + encodeURIComponent(currentDraft.id), {
      method: 'PATCH',
      body: JSON.stringify({ title: draftEditTitle, items })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t('msg_failed_save_draft'));
      return;
    }
    currentDraft = data.draft;
    draftEditItems = Array.isArray(currentDraft?.items) ? currentDraft.items.map((i) => ({ ...i })) : [];
    draftEditTitle = currentDraft?.title || '';
    await loadDrafts(false, currentDraft.id);
    renderDraftDetails();
    alert(t('msg_draft_saved'));
  }

  async function applyDraftById(id) {
    if (!ensureLoggedIn()) return;
    const res = await apiFetch('/api/finance/drafts/' + encodeURIComponent(id) + '/apply', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t('msg_failed_apply_draft'));
      return;
    }
    await loadDrafts();
    if (currentDraft && currentDraft.id === id) {
      currentDraft = { ...currentDraft, status: 'applied' };
      renderDraftDetails();
    }
    await loadTransactions();
    await getSummary();
    alert(data.duplicate ? t('msg_apply_duplicate') : t('msg_draft_applied'));
  }

  async function discardDraftById(id) {
    if (!ensureLoggedIn()) return;
    const res = await apiFetch('/api/finance/drafts/' + encodeURIComponent(id) + '/discard', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data?.error || t('msg_failed_discard_draft'));
      return;
    }
    await loadDrafts();
    if (currentDraft && currentDraft.id === id) {
      currentDraft = { ...currentDraft, status: 'discarded' };
      renderDraftDetails();
    }
    alert(t('msg_draft_discarded'));
  }

  function formatTxTypeLabel(type) {
    if (type === 'income') return t('tx_type_income');
    if (type === 'expense') return t('tx_type_expense');
    return t('tx_type_all');
  }

  function updateTransactionsFilterInfo() {
    const info = document.getElementById('txFiltersInfo');
    if (!info) return;
    const parts = [];
    if (activeTxFilters.category) parts.push(`${t('filter_category')}: ${getCategoryLabelForUi(activeTxFilters.category)}`);
    if (activeTxFilters.type && activeTxFilters.type !== 'all') parts.push(`${t('filter_type')}: ${formatTxTypeLabel(activeTxFilters.type)}`);
    if (activeTxFilters.from) parts.push(`${t('filter_from')}: ${activeTxFilters.from}`);
    if (activeTxFilters.to) parts.push(`${t('filter_to')}: ${activeTxFilters.to}`);
    info.textContent = `${t('label_active_filters')} ${parts.length ? parts.join(', ') : t('filters_none')}`;
  }

  function updateCategoryFilterOptions() {
    const select = document.getElementById('txCategoryFilter');
    if (!select) return;
    const previous = select.value || activeTxFilters.category || '';
    select.innerHTML = '';
    const baseOption = document.createElement('option');
    baseOption.value = '';
    baseOption.setAttribute('data-i18n', 'tx_category_all');
    baseOption.textContent = t('tx_category_all');
    select.appendChild(baseOption);
    categoriesMeta.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.label;
      select.appendChild(opt);
    });
    select.value = previous;
  }

  function applyCategoryFilterFromSelect() {
    const select = document.getElementById('txCategoryFilter');
    activeTxFilters.category = select ? (select.value || '') : '';
    updateTransactionsFilterInfo();
  }

  function applyTypeFilterFromSelect() {
    const select = document.getElementById('txTypeFilter');
    activeTxFilters.type = select ? select.value || 'all' : 'all';
    updateTransactionsFilterInfo();
  }

  const categorySelect = document.getElementById('txCategoryFilter');
  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      applyCategoryFilterFromSelect();
      loadTransactions();
    });
  }

  const typeSelect = document.getElementById('txTypeFilter');
  if (typeSelect) {
    typeSelect.addEventListener('change', () => {
      applyTypeFilterFromSelect();
      loadTransactions();
      getSummary();
    });
  }

  async function loadTransactions() {
    if (!ensureLoggedIn()) return;
    const limitInput = document.getElementById('txLimit');
    const limit = limitInput && limitInput.value ? Number(limitInput.value) : 50;
    activeTxFilters.limit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;
    applyCategoryFilterFromSelect();
    applyTypeFilterFromSelect();

    const params = new URLSearchParams({
      page: String(activeTxFilters.page || 1),
      limit: String(activeTxFilters.limit)
    });
    if (activeTxFilters.from) params.append('from', activeTxFilters.from);
    if (activeTxFilters.to) params.append('to', activeTxFilters.to);
    if (activeTxFilters.category) params.append('category', activeTxFilters.category);
    if (activeTxFilters.type && activeTxFilters.type !== 'all') params.append('type', activeTxFilters.type);

    const res = await apiFetch('/api/finance/transactions?' + params.toString());
    const data = await res.json();
    const target = document.getElementById('transactions');
    if (target) {
      target.textContent = JSON.stringify(data, null, 2);
    }

    const items = Array.isArray(data.items) ? data.items : [];
    lastLoadedTransactions = items.slice();
    updateCategoryFilterOptions();
    renderTransactionsTable(items);
    updateTransactionsFilterInfo();
  }

  async function exportTransactionsCsv() {
    if (!ensureLoggedIn()) return;
    const fromInput = document.getElementById('summaryFrom');
    const toInput = document.getElementById('summaryTo');
    const from = activeTxFilters.from || (fromInput && fromInput.value ? fromInput.value : '');
    const to = activeTxFilters.to || (toInput && toInput.value ? toInput.value : '');

    applyTypeFilterFromSelect();

    if (!from || !to) {
      alert(t('msg_export_period_required'));
      return;
    }

    activeTxFilters.from = from;
    activeTxFilters.to = to;

    const params = new URLSearchParams({ from, to, lang: currentUiLang || 'ru' });
    if (activeTxFilters.category) params.append('category', activeTxFilters.category);
    if (activeTxFilters.type && activeTxFilters.type !== 'all') params.append('type', activeTxFilters.type);

    const res = await apiFetch('/api/finance/transactions/export?' + params.toString(), { method: 'GET' });
    if (!res.ok) {
      try {
        const error = await res.json();
        alert((error && error.error) || t('msg_export_failed'));
      } catch (e) {
        alert(t('msg_export_failed'));
      }
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transactions_${from}_${to}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderTransactionsTable(items) {
    const table = document.getElementById('transactionsTable');
    const tbody = document.querySelector('#transactionsTable tbody');
    if (!table || !tbody) return;
    tbody.innerHTML = '';
    const rows = Array.isArray(items) ? items : [];

    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = t('msg_no_transactions');
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    rows.forEach((item) => {
      const row = document.createElement('tr');
      const date = new Date(item.date);
      const dateStr = isNaN(date.getTime()) ? (item.date || '') : date.toISOString().slice(0, 10);
      const cells = [
        dateStr,
        getCategoryLabelForUi(item.category),
        formatTxTypeLabel(item.type || 'all'),
        String(item.amount ?? ''),
        item.currency || '',
        item.description || '',
        item.source || ''
      ];
      cells.forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        row.appendChild(td);
      });

      const actionsTd = document.createElement('td');
      actionsTd.style.whiteSpace = 'nowrap';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = t('btn_edit');
      editBtn.onclick = () => editTransaction(item.id);
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = t('btn_delete');
      deleteBtn.style.marginLeft = '4px';
      deleteBtn.onclick = () => deleteTransaction(item.id);
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(deleteBtn);
      row.appendChild(actionsTd);
      tbody.appendChild(row);
    });
  }

  function findTransactionById(id) {
    return (lastLoadedTransactions || []).find((tx) => tx.id === id);
  }

  async function deleteTransaction(id) {
    if (!ensureLoggedIn()) return;
    if (!id) return;
    if (!confirm(t('confirm_delete'))) return;
    try {
      const res = await apiFetch('/api/finance/transactions/' + encodeURIComponent(id), { method: 'DELETE' });
      if (res.status === 204) {
        await loadTransactions();
        await getSummary();
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function editTransaction(id) {
    if (!ensureLoggedIn()) return;
    const tx = findTransactionById(id);
    if (!tx) return;
    const newAmountStr = prompt(t('prompt_edit_amount'), tx.amount);
    if (newAmountStr === null) return;
    const newAmount = Number(newAmountStr);
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      alert(t('msg_invalid_amount'));
      return;
    }
    const categoryLabel = getCategoryLabelForUi(tx.category);
    const newCategoryInput = prompt(t('prompt_edit_category'), categoryLabel) || categoryLabel;
    const newCategory = getCategoryIdByLabel(newCategoryInput) || tx.category;
    const newDescription = prompt(t('prompt_edit_description'), tx.description || '') || tx.description;

    const res = await apiFetch('/api/finance/transactions/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ amount: newAmount, category: newCategory, description: newDescription })
    });
    const data = await res.json();
    if (data?.item) {
      await loadTransactions();
      await getSummary();
    }
  }

  async function getSummary() {
    if (!ensureLoggedIn()) return;
    const fromInput = document.getElementById('summaryFrom');
    const toInput = document.getElementById('summaryTo');
    const from = fromInput ? fromInput.value : '';
    const to = toInput ? toInput.value : '';
    applyTypeFilterFromSelect();
    if (!from || !to) {
      alert('from/to are required');
      return;
    }
    const params = new URLSearchParams({ from, to, groupBy: 'both' });
    if (activeTxFilters.type && activeTxFilters.type !== 'all') params.append('type', activeTxFilters.type);
    const res = await apiFetch('/api/finance/summary?' + params.toString());
    const data = await res.json();
    const target = document.getElementById('summary');
    if (target) {
      target.textContent = JSON.stringify(data, null, 2);
    }
    lastSummaryData = data;
    renderSummaryTotals(data);
    renderSummaryTables(data);
    activeTxFilters.from = from;
    activeTxFilters.to = to;
    updateTransactionsFilterInfo();
  }

  function renderSummaryTables(data) {
    const byCatBody = document.querySelector('#summaryByCategory tbody');
    const byDateBody = document.querySelector('#summaryByDate tbody');
    if (byCatBody) {
      byCatBody.innerHTML = '';
      if (Array.isArray(data.byCategory) && data.byCategory.length) {
        data.byCategory.forEach((row) => {
          const tr = document.createElement('tr');
          tr.classList.add('drill-row');
          tr.dataset.category = String(row.category);
          const tdCat = document.createElement('td');
          tdCat.textContent = getCategoryLabelForUi(row.category);
          const tdAmount = document.createElement('td');
          tdAmount.textContent = String(row.amount ?? '');
          tr.appendChild(tdCat);
          tr.appendChild(tdAmount);
          tr.addEventListener('click', () => {
            const select = document.getElementById('txCategoryFilter');
            if (select) {
              select.value = row.category || '';
            }
            activeTxFilters.category = row.category || '';
            updateTransactionsFilterInfo();
            loadTransactions();
          });
          byCatBody.appendChild(tr);
        });
      } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.textContent = t('msg_no_data');
        tr.appendChild(td);
        byCatBody.appendChild(tr);
      }
    }

    if (byDateBody) {
      byDateBody.innerHTML = '';
      if (Array.isArray(data.byDate) && data.byDate.length) {
        data.byDate.forEach((row) => {
          const tr = document.createElement('tr');
          tr.classList.add('drill-row');
          tr.dataset.date = String(row.date);
          const tdDate = document.createElement('td');
          tdDate.textContent = row.date || '';
          const tdAmount = document.createElement('td');
          tdAmount.textContent = String(row.amount ?? '');
          tr.appendChild(tdDate);
          tr.appendChild(tdAmount);
          tr.addEventListener('click', () => {
            activeTxFilters.from = row.date;
            activeTxFilters.to = row.date;
            const select = document.getElementById('txCategoryFilter');
            if (select) {
              select.value = '';
            }
            activeTxFilters.category = '';
            loadTransactions();
          });
          byDateBody.appendChild(tr);
        });
      } else {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 2;
        td.textContent = t('msg_no_data');
        tr.appendChild(td);
        byDateBody.appendChild(tr);
      }
    }
  }

  function renderSummaryTotals(data) {
    const container = document.getElementById('summaryTotals');
    if (!container) return;
    container.innerHTML = '';
    if (!data) return;

    const income = typeof data.incomeTotal === 'number' ? data.incomeTotal : 0;
    const expense = typeof data.expenseTotal === 'number' ? data.expenseTotal : 0;
    const balance = typeof data.balance === 'number' ? data.balance : income - expense;

    const items = [
      { label: t('summary_income'), value: income },
      { label: t('summary_expense'), value: expense },
      { label: t('summary_balance'), value: balance }
    ];

    items.forEach((item) => {
      const span = document.createElement('span');
      span.textContent = `${item.label}: ${item.value}`;
      container.appendChild(span);
    });
  }

  async function askAssistant() {
    if (!ensureLoggedIn()) return;
    const msgInput = document.getElementById('assistantMsg');
    const message = msgInput ? msgInput.value : '';
    const res = await apiFetch('/api/finance/assistant', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    const target = document.getElementById('assistant');
    if (target) {
      target.textContent = JSON.stringify(data, null, 2);
    }
    const human = document.getElementById('assistantHuman');
    if (human) {
      const answer = data && typeof data.answer === 'string' ? data.answer : '';
      human.textContent = answer || '';
    }
  }

  function toIsoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function setSummaryRange(rangeKey) {
    const fromInput = document.getElementById('summaryFrom');
    const toInput = document.getElementById('summaryTo');
    if (!fromInput || !toInput) return;
    const today = new Date();
    let from = new Date(today);
    let to = new Date(today);
    if (rangeKey === 'week') {
      const day = today.getDay();
      const diffToMonday = (day + 6) % 7;
      from.setDate(today.getDate() - diffToMonday);
    } else if (rangeKey === 'month') {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }
    fromInput.value = toIsoDate(from);
    toInput.value = toIsoDate(to);
    activeTxFilters.from = fromInput.value;
    activeTxFilters.to = toInput.value;
    getSummary();
  }

  const EXAMPLE_QUESTIONS = {
    ru: [
      'Сколько потратил на еду в этом месяце?',
      'Сколько всего я потратил сегодня?',
      'Какая категория трат самая большая за последнюю неделю?'
    ],
    uk: [
      'Скільки я витратив на їжу цього місяця?',
      'Скільки всього я витратив сьогодні?',
      'Яка категорія витрат була найбільшою за останній тиждень?'
    ],
    en: [
      'How much did I spend on food this month?',
      'How much did I spend in total today?',
      'Which spending category was the biggest in the last week?'
    ]
  };

  function renderAssistantExamples() {
    const container = document.getElementById('assistantExamples');
    if (!container) return;
    const select = document.getElementById('uiLangSelect');
    const lang = (select && select.value) || currentUiLang || 'ru';
    const examples = EXAMPLE_QUESTIONS[lang] || EXAMPLE_QUESTIONS.ru;
    container.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'quick-examples-label';
    label.textContent = 'Примеры:';
    container.appendChild(label);
    const buttons = document.createElement('div');
    buttons.className = 'quick-examples-buttons';
    examples.forEach((ex) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = ex;
      btn.onclick = () => {
        const msgInput = document.getElementById('assistantMsg');
        if (msgInput) msgInput.value = ex;
      };
      buttons.appendChild(btn);
    });
    container.appendChild(buttons);
  }

  async function bootstrap() {
    applyUiLang();
    renderAssistantExamples();
    renderDraftsList();
    renderDraftDetails();
    updateDraftButton('btn_create_draft', true);
    await loadCategoriesForLang(currentUiLang);
    if (accessToken) {
      await refreshAccessToken();
    }
    updateAuthUi();
  }

  bootstrap();
