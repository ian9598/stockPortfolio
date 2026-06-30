/* ═══════════════════════════════════════════════
   STOCK PORTFOLIO P&L DASHBOARD - APPLICATION LOGIC
   ═══════════════════════════════════════════════ */

(async function () {
  'use strict';

  // ─── State ───
  let state = {
    capital: 0,
    entries: [] // [{ date: '2026-01-15', amount: 500 }, ...]
  };

  let growthChart = null;
  const API_URL = 'api.php';
  const THEME_KEY = 'stock_pnl_theme';

  // ─── DOM References ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const capitalSection   = $('#capitalSection');
  const capitalForm      = $('#capitalForm');
  const capitalDisplay   = $('#capitalDisplay');
  const capitalInput     = $('#capitalInput');
  const displayCapital   = $('#displayCapital');
  const setCapitalBtn    = $('#setCapitalBtn');
  const editCapitalBtn   = $('#editCapitalBtn');

  const dashboardSection = $('#dashboardSection');
  const currentBalanceEl = $('#currentBalance');
  const totalPnLEl       = $('#totalPnL');
  const totalPctEl       = $('#totalPct');
  const bestDayEl        = $('#bestDay');
  const worstDayEl       = $('#worstDay');

  const tradingDaysEl    = $('#tradingDays');
  const winRateEl        = $('#winRate');
  const avgReturnEl      = $('#avgReturn');
  const bestDayPctEl     = $('#bestDayPct');
  const worstDayPctEl    = $('#worstDayPct');
  const totalReturnEl    = $('#totalReturn');

  const addEntryBtn      = $('#addEntryBtn');
  const entryForm        = $('#entryForm');
  const entryDate        = $('#entryDate');
  const entryAmount      = $('#entryAmount');
  const saveEntryBtn     = $('#saveEntryBtn');
  const cancelEntryBtn   = $('#cancelEntryBtn');
  const entriesList      = $('#entriesList');

  const resetBtn         = $('#resetBtn');
  const themeToggleBtn   = $('#themeToggleBtn');
  const themeIcon        = $('#themeIcon');
  const confirmModal     = $('#confirmModal');
  const modalConfirmBtn  = $('#modalConfirmBtn');
  const modalCancelBtn   = $('#modalCancelBtn');

  const toast            = $('#toast');

  // ─── Helpers ───
  function formatCurrency(val) {
    const sign = val < 0 ? '-' : '';
    return sign + 'RM' + Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatPct(val) {
    return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
  }

  function getToday() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function sortEntries(entries) {
    return entries.slice().sort((a, b) => a.date.localeCompare(b.date));
  }

  // ─── Toast ───
  let toastTimer = null;

  function showToast(message, type) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.classList.add('visible');
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }

  // ─── Calculations ───
  function calcStats(entries, capital) {
    const sorted = sortEntries(entries);
    let balance = capital;
    let totalPnL = 0;
    let winCount = 0;
    let totalReturnPct = 0;
    let bestDay = -Infinity;
    let worstDay = Infinity;
    let bestDayPctVal = -Infinity;
    let worstDayPctVal = Infinity;
    let dailyReturns = [];
    let balanceHistory = [{ date: 'Start', balance }];
    let totalPct = 0;

    for (const entry of sorted) {
      const prevBalance = balance;
      const amount = entry.amount;
      const pct = prevBalance !== 0 ? (amount / prevBalance) * 100 : 0;

      balance += amount;
      totalPnL += amount;
      totalPct = capital > 0 ? (totalPnL / capital) * 100 : 0;

      if (amount > 0) winCount++;
      if (amount > bestDay) bestDay = amount;
      if (amount < worstDay) worstDay = amount;
      if (pct > bestDayPctVal) bestDayPctVal = pct;
      if (pct < worstDayPctVal) worstDayPctVal = pct;

      dailyReturns.push(pct);
      balanceHistory.push({ date: entry.date, balance });
    }

    totalReturnPct = capital > 0 ? ((balance - capital) / capital) * 100 : 0;

    const totalDays = sorted.length;
    const winRate = totalDays > 0 ? (winCount / totalDays) * 100 : 0;
    const avgReturn = dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0;

    return {
      balance,
      totalPnL,
      totalPct,
      winRate,
      avgReturn,
      bestDay: bestDay === -Infinity ? 0 : bestDay,
      worstDay: worstDay === Infinity ? 0 : worstDay,
      bestDayPct: bestDayPctVal === -Infinity ? 0 : bestDayPctVal,
      worstDayPct: worstDayPctVal === Infinity ? 0 : worstDayPctVal,
      totalReturnPct,
      tradingDays: totalDays,
      balanceHistory
    };
  }

  function calcEntryPct(entry, entries, capital) {
    const sorted = sortEntries(entries);
    let balance = capital;
    for (const e of sorted) {
      if (e.date === entry.date && e.amount === entry.amount) {
        return balance > 0 ? (entry.amount / balance) * 100 : 0;
      }
      balance += e.amount;
    }
    return 0;
  }

  // ─── API calls ───
  async function apiFetch(method, body = null, query = '') {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== null) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(API_URL + query, opts);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }
    return data;
  }

  // ─── Persistence ───
  async function loadState() {
    try {
      const data = await apiFetch('GET');
      state.capital = data.capital || 0;
      state.entries = data.entries || [];
    } catch (e) {
      console.warn('Failed to load state:', e);
      showToast('Could not connect to server', 'error');
    }
  }

  async function saveCapital() {
    await apiFetch('PUT', { capital: state.capital });
  }

  async function saveEntry(date, amount) {
    await apiFetch('POST', { date, amount });
  }

  async function removeEntry(date, amount) {
    await apiFetch('DELETE', { date, amount });
  }

  async function resetState() {
    await apiFetch('DELETE', null, '?reset=1');
  }

  // ─── Theme ───
  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light') {
      document.documentElement.classList.add('light-mode');
      themeIcon.className = 'fas fa-sun';
    } else {
      // Default to dark
      document.documentElement.classList.remove('light-mode');
      themeIcon.className = 'fas fa-moon';
    }
  }

  function setTheme(mode) {
    if (mode === 'light') {
      document.documentElement.classList.add('light-mode');
      themeIcon.className = 'fas fa-sun';
    } else {
      document.documentElement.classList.remove('light-mode');
      themeIcon.className = 'fas fa-moon';
    }
    localStorage.setItem(THEME_KEY, mode);
    // Re-render chart so it picks up new CSS variable values
    if (state.capital > 0) {
      const stats = calcStats(state.entries, state.capital);
      renderChart(stats.balanceHistory);
    }
  }

  function toggleTheme() {
    const isLight = document.documentElement.classList.contains('light-mode');
    setTheme(isLight ? 'dark' : 'light');
  }

  // ─── CSS variable helper for chart ───
  function getCSSVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ─── Render ───
  function render() {
    renderCapital();
    renderDashboard();
  }

  function renderCapital() {
    if (state.capital > 0) {
      capitalForm.style.display = 'none';
      capitalDisplay.style.display = 'flex';
      displayCapital.textContent = formatCurrency(state.capital);
      dashboardSection.style.display = 'block';
    } else {
      capitalForm.style.display = 'flex';
      capitalDisplay.style.display = 'none';
      dashboardSection.style.display = 'none';
    }
  }

  function renderDashboard() {
    if (state.capital <= 0) return;

    const stats = calcStats(state.entries, state.capital);

    // Summary cards
    currentBalanceEl.textContent = formatCurrency(stats.balance);
    totalPnLEl.textContent = formatCurrency(stats.totalPnL);
    totalPnLEl.className = 'summary-value ' + (stats.totalPnL >= 0 ? 'text-profit' : 'text-loss');
    totalPctEl.textContent = formatPct(stats.totalPct);
    totalPctEl.className = 'summary-pct ' + (stats.totalPnL >= 0 ? 'text-profit' : 'text-loss');
    bestDayEl.textContent = formatCurrency(stats.bestDay);
    bestDayEl.className = 'summary-value text-profit';
    worstDayEl.textContent = formatCurrency(stats.worstDay);
    worstDayEl.className = 'summary-value text-loss';

    // Stats
    tradingDaysEl.textContent = stats.tradingDays;
    winRateEl.textContent = stats.tradingDays > 0 ? stats.winRate.toFixed(1) + '%' : '—';
    avgReturnEl.textContent = stats.tradingDays > 0 ? formatPct(stats.avgReturn) : '—';
    avgReturnEl.className = 'stat-value ' + (stats.avgReturn >= 0 ? 'text-profit' : 'text-loss');
    bestDayPctEl.textContent = stats.tradingDays > 0 ? formatPct(stats.bestDayPct) : '—';
    bestDayPctEl.className = 'stat-value text-profit';
    worstDayPctEl.textContent = stats.tradingDays > 0 ? formatPct(stats.worstDayPct) : '—';
    worstDayPctEl.className = 'stat-value text-loss';
    totalReturnEl.textContent = formatPct(stats.totalReturnPct);
    totalReturnEl.className = 'stat-value ' + (stats.totalReturnPct >= 0 ? 'text-profit' : 'text-loss');

    // Chart
    renderChart(stats.balanceHistory);

    // Entries list
    renderEntries(stats);

    // Calendar
    renderCalendar();
  }

  function renderEntries(stats) {
    const sorted = sortEntries(state.entries);

    if (sorted.length === 0) {
      entriesList.innerHTML = `
        <div class="entries-empty">
          <i class="fas fa-inbox"></i>
          <p>No entries yet. Tap + to add your first P&L entry.</p>
        </div>`;
      return;
    }

    // Build balance lookup
    let balance = state.capital;
    const balanceMap = {};
    balanceMap['Start'] = balance;
    for (const e of sorted) {
      balance += e.amount;
      balanceMap[e.date] = balance;
    }

    let html = '';
    // Show in reverse chronological order (newest first)
    const reversed = [...sorted].reverse();
    for (const entry of reversed) {
      const pct = calcEntryPct(entry, state.entries, state.capital);
      const isProfit = entry.amount >= 0;
      const dateObj = new Date(entry.date + 'T00:00:00');
      const formattedDate = dateObj.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
      });

      html += `
        <div class="entry-item" data-date="${entry.date}">
          <div>
            <div class="entry-date">${formattedDate}</div>
            <div>
              <span class="entry-amount ${isProfit ? 'positive' : 'negative'}">
                ${isProfit ? '+' : ''}${formatCurrency(entry.amount)}
              </span>
              <span class="entry-pct ${isProfit ? 'positive' : 'negative'}">
                ${formatPct(pct)}
              </span>
            </div>
          </div>
          <div class="entry-actions">
            <button class="delete-btn" data-date="${entry.date}" data-amount="${entry.amount}" aria-label="Delete entry">
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        </div>`;
    }

    entriesList.innerHTML = html;

    // Attach delete handlers
    entriesList.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const date = this.dataset.date;
        const amount = parseFloat(this.dataset.amount);
        deleteEntry(date, amount);
      });
    });
  }

  // ─── Calendar View ───
  let calendarView = 'weekly';
  let calYear = new Date().getFullYear();
  let calMonth = new Date().getMonth();       // 0-indexed
  let calWeekStart = null;                    // Date object for Monday of current week

  // ─── Week helpers ───
  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;   // Monday = 1
    date.setDate(date.getDate() + diff);
    date.setHours(0,0,0,0);
    return date;
  }

  function formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  function getMonthName(y, m) {
    return new Date(y, m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  // ─── Entry lookup (fast) ───
  function buildEntryMap(entries) {
    const map = {};
    for (const e of entries) {
      map[e.date] = e.amount;
    }
    return map;
  }

  function getBalanceBefore(dateKey, entries, capital) {
    const sorted = sortEntries(entries);
    let balance = capital;
    for (const e of sorted) {
      if (e.date >= dateKey) break;
      balance += e.amount;
    }
    return balance;
  }

  // ─── Weekly grid ───
  function renderCalendarWeekly() {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    if (!calWeekStart) {
      calWeekStart = getMonday(new Date());
    }
    const monday = new Date(calWeekStart);
    const sunday = addDays(monday, 6);

    // Title
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const title = monday.toLocaleDateString('en-US', opts) + ' – ' + sunday.toLocaleDateString('en-US', opts);
    document.getElementById('calNavTitle').textContent = title;

    if (state.capital <= 0 || state.entries.length === 0) {
      container.innerHTML = `
        <div class="calendar-empty-state">
          <i class="fas fa-calendar"></i>
          <p>Add P&L entries to see your weekly breakdown.</p>
        </div>`;
      return;
    }

    const entryMap = buildEntryMap(state.entries);
    const today = getToday();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    let html = '<div class="calendar-grid-week">';
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const dateKey = formatDateKey(d);
      const isToday = dateKey === today;
      const hasEntry = dateKey in entryMap;
      const amount = entryMap[dateKey] || 0;
      const isProfit = amount >= 0;

      let pnlHtml = '';
      let pctHtml = '';
      if (hasEntry) {
        const balanceBefore = getBalanceBefore(dateKey, state.entries, state.capital);
        const pct = balanceBefore > 0 ? (amount / balanceBefore) * 100 : 0;
        pnlHtml = `<div class="calendar-week-pnl ${isProfit ? 'positive' : 'negative'}">${isProfit ? '+' : ''}${formatCurrency(amount)}</div>`;
        pctHtml = `<div class="calendar-week-pct ${isProfit ? 'positive' : 'negative'}">${formatPct(pct)}</div>`;
      }

      html += `
        <div class="calendar-week-cell ${isToday ? 'today' : ''} ${hasEntry ? 'has-entry' : ''}">
          <div class="calendar-week-dayname">${dayNames[i]}</div>
          <div class="calendar-week-date">${d.getDate()}</div>
          ${pnlHtml}
          ${pctHtml}
        </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // ─── Monthly grid ───
  function renderCalendarMonthly() {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    const title = getMonthName(calYear, calMonth);
    document.getElementById('calNavTitle').textContent = title;

    if (state.capital <= 0 || state.entries.length === 0) {
      container.innerHTML = `
        <div class="calendar-empty-state">
          <i class="fas fa-calendar"></i>
          <p>Add P&L entries to see your monthly breakdown.</p>
        </div>`;
      return;
    }

    const entryMap = buildEntryMap(state.entries);
    const today = getToday();
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth, daysInMonth(calYear, calMonth));
    const startDow = firstDay.getDay(); // 0=Sun
    const numDays = daysInMonth(calYear, calMonth);

    // Weekday headers
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = '<div class="calendar-weekdays">';
    for (const wd of weekdays) {
      html += `<div class="calendar-weekday">${wd}</div>`;
    }
    html += '</div>';

    html += '<div class="calendar-grid-month">';

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) {
      html += '<div class="calendar-day-cell other-month"></div>';
    }

    // Day cells
    for (let day = 1; day <= numDays; day++) {
      const d = new Date(calYear, calMonth, day);
      const dateKey = formatDateKey(d);
      const isToday = dateKey === today;
      const hasEntry = dateKey in entryMap;
      const amount = entryMap[dateKey] || 0;
      const isProfit = amount >= 0;

      let pnlHtml = '';
      let pctHtml = '';
      if (hasEntry) {
        const balanceBefore = getBalanceBefore(dateKey, state.entries, state.capital);
        const pct = balanceBefore > 0 ? (amount / balanceBefore) * 100 : 0;
        pnlHtml = `<div class="calendar-day-pnl ${isProfit ? 'positive' : 'negative'}">${isProfit ? '+' : ''}${formatCurrency(amount)}</div>`;
        pctHtml = `<div class="calendar-day-pct ${isProfit ? 'positive' : 'negative'}">${formatPct(pct)}</div>`;
      }

      html += `
        <div class="calendar-day-cell ${isToday ? 'today' : ''} ${hasEntry ? 'has-entry' : ''}">
          <div class="calendar-day-number">${day}</div>
          ${pnlHtml}
          ${pctHtml}
        </div>`;
    }

    // Fill remaining cells to complete last row
    const totalCells = startDow + numDays;
    const remainder = totalCells % 7;
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        html += '<div class="calendar-day-cell other-month"></div>';
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ─── Annual grid ───
  function renderCalendarAnnual() {
    const container = document.getElementById('calendarContainer');
    if (!container) return;

    document.getElementById('calNavTitle').textContent = String(calYear);

    if (state.capital <= 0 || state.entries.length === 0) {
      container.innerHTML = `
        <div class="calendar-empty-state">
          <i class="fas fa-calendar"></i>
          <p>Add P&L entries to see your annual breakdown.</p>
        </div>`;
      return;
    }

    // Group entries by month within the year
    const monthData = [];
    for (let m = 0; m < 12; m++) {
      monthData.push({
        month: m,
        label: new Date(calYear, m).toLocaleDateString('en-US', { month: 'short' }),
        totalPnL: 0,
        days: 0,
        startingBalance: null
      });
    }

    const sorted = sortEntries(state.entries);
    let balance = state.capital;
    for (const e of sorted) {
      const ey = parseInt(e.date.slice(0, 4));
      const em = parseInt(e.date.slice(5, 7)) - 1;
      if (ey === calYear) {
        if (monthData[em].startingBalance === null) {
          monthData[em].startingBalance = balance;
        }
        monthData[em].totalPnL += e.amount;
        monthData[em].days++;
      }
      balance += e.amount;
    }

    // For months with no entries, set startingBalance to prevent NaN
    for (let m = 0; m < 12; m++) {
      if (monthData[m].startingBalance === null) {
        monthData[m].startingBalance = 0;
      }
    }

    let html = '<div class="calendar-grid-annual">';
    for (const md of monthData) {
      const isProfit = md.totalPnL >= 0;
      const pct = md.startingBalance > 0 ? (md.totalPnL / md.startingBalance) * 100 : 0;
      const sign = isProfit ? '+' : '';

      let content = '';
      if (md.days > 0) {
        content = `
          <div class="calendar-month-pnl ${isProfit ? 'positive' : 'negative'}">
            ${sign}${formatCurrency(md.totalPnL)}
          </div>
          <div class="calendar-month-pct ${isProfit ? 'positive' : 'negative'}">
            ${formatPct(pct)}
          </div>
          <div class="calendar-month-days">${md.days} day${md.days !== 1 ? 's' : ''}</div>`;
      } else {
        content = '<div class="calendar-month-days">—</div>';
      }

      html += `
        <div class="calendar-month-block ${md.days > 0 ? (isProfit ? 'positive' : 'negative') : ''}">
          <div class="calendar-month-name">${md.label}</div>
          ${content}
        </div>`;
    }
    html += '</div>';

    container.innerHTML = html;
  }

  // ─── Dispatch ───
  function renderCalendar() {
    switch (calendarView) {
      case 'weekly':  renderCalendarWeekly();  break;
      case 'monthly': renderCalendarMonthly(); break;
      case 'annual':  renderCalendarAnnual();  break;
    }
  }

  function switchCalendarView(view) {
    calendarView = view;
    // Reset navigation position
    if (view === 'weekly') {
      calWeekStart = getMonday(new Date());
    } else if (view === 'monthly') {
      calYear = new Date().getFullYear();
      calMonth = new Date().getMonth();
    } else if (view === 'annual') {
      calYear = new Date().getFullYear();
    }
    // Update tab buttons
    document.querySelectorAll('.calendar-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    renderCalendar();
  }

  // ─── Navigation ───
  function calendarNavigatePrev() {
    if (calendarView === 'weekly') {
      calWeekStart = addDays(calWeekStart, -7);
    } else if (calendarView === 'monthly') {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
    } else if (calendarView === 'annual') {
      calYear--;
    }
    renderCalendar();
  }

  function calendarNavigateNext() {
    if (calendarView === 'weekly') {
      calWeekStart = addDays(calWeekStart, 7);
    } else if (calendarView === 'monthly') {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
    } else if (calendarView === 'annual') {
      calYear++;
    }
    renderCalendar();
  }

  // ─── Chart ───
  function renderChart(balanceHistory) {
    if (!balanceHistory || balanceHistory.length < 1) return;

    const canvas = document.getElementById('growthChart');
    if (!canvas) return;

    // Destroy previous chart
    if (growthChart) {
      growthChart.destroy();
      growthChart = null;
    }

    const ctx = canvas.getContext('2d');

    // If only starting capital, show minimal chart
    if (balanceHistory.length === 1) {
      // Add a dummy second point to show a line
      balanceHistory = [
        { date: 'Start', balance: state.capital },
        { date: state.entries.length > 0 ? state.entries[0].date : getToday(), balance: state.capital }
      ];
    }

    const labels = balanceHistory.map((h) => {
      if (h.date === 'Start') return 'Start';
      const d = new Date(h.date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });

    const data = balanceHistory.map((h) => Math.round(h.balance * 100) / 100);

    const isProfit = data[data.length - 1] >= state.capital;

    growthChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Portfolio Value',
          data,
          borderColor: '#6c63ff',
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 260);
            gradient.addColorStop(0, 'rgba(108, 99, 255, 0.25)');
            gradient.addColorStop(1, 'rgba(108, 99, 255, 0.01)');
            return gradient;
          },
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#6c63ff',
          pointBorderColor: getCSSVar('--bg-card') || '#22223a',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: getCSSVar('--bg-card') || '#1a1a2e',
            titleColor: getCSSVar('--text-primary') || '#f0f0f5',
            bodyColor: getCSSVar('--text-primary') || '#f0f0f5',
            borderColor: getCSSVar('--border') || '#3a3a5c',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => formatCurrency(ctx.raw)
            }
          }
        },
        scales: {
          x: {
            grid: { display: false, drawBorder: false },
            ticks: {
              color: getCSSVar('--text-muted') || '#6c6c8a',
              font: { size: 10, family: 'Inter' },
              maxTicksLimit: 10,
              maxRotation: 0
            }
          },
          y: {
            grid: {
              color: getCSSVar('--border') || 'rgba(255,255,255,0.05)',
              drawBorder: false
            },
            ticks: {
              color: getCSSVar('--text-muted') || '#6c6c8a',
              font: { size: 10, family: 'Inter' },
              callback: (val) => 'RM' + val.toLocaleString()
            }
          }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  }

  // ─── Actions ───
  async function setCapital() {
    const val = parseFloat(capitalInput.value);
    if (isNaN(val) || val <= 0) {
      showToast('Please enter a valid capital amount', 'error');
      return;
    }
    state.capital = Math.round(val * 100) / 100;
    capitalInput.value = '';
    try {
      await saveCapital();
      render();
      showToast('Starting capital set to ' + formatCurrency(state.capital), 'success');
    } catch (e) {
      showToast('Failed to save capital: ' + e.message, 'error');
    }
  }

  function editCapital() {
    capitalForm.style.display = 'flex';
    capitalDisplay.style.display = 'none';
    capitalInput.value = state.capital;
    capitalInput.focus();
    capitalInput.select();
  }

  async function addEntry() {
    const date = entryDate.value;
    const amountRaw = entryAmount.value.trim();

    if (!date) {
      showToast('Please select a date', 'error');
      return;
    }

    if (amountRaw === '') {
      showToast('Please enter a P&L amount', 'error');
      return;
    }

    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount === 0) {
      showToast('Amount must be a non-zero number', 'error');
      return;
    }

    // Check for duplicate date (client-side)
    const existing = state.entries.find((e) => e.date === date);
    if (existing) {
      showToast('An entry for ' + date + ' already exists. Delete it first to replace.', 'error');
      return;
    }

    try {
      await saveEntry(date, Math.round(amount * 100) / 100);
      state.entries.push({ date, amount: Math.round(amount * 100) / 100 });
      render();
      hideEntryForm();
      showToast('Entry saved for ' + date, 'success');
    } catch (e) {
      showToast('Failed to save entry: ' + e.message, 'error');
    }
  }

  async function deleteEntry(date, amount) {
    const idx = state.entries.findIndex(
      (e) => e.date === date && Math.abs(e.amount - amount) < 0.001
    );
    if (idx === -1) return;

    try {
      await removeEntry(date, amount);
      state.entries.splice(idx, 1);
      render();
      showToast('Entry deleted', 'success');
    } catch (e) {
      showToast('Failed to delete entry: ' + e.message, 'error');
    }
  }

  function showEntryForm() {
    entryForm.style.display = 'block';
    entryDate.value = getToday();
    entryAmount.value = '';
    entryAmount.focus();
    addEntryBtn.style.display = 'none';
  }

  function hideEntryForm() {
    entryForm.style.display = 'none';
    addEntryBtn.style.display = 'flex';
    entryDate.value = '';
    entryAmount.value = '';
  }

  async function resetAllData() {
    try {
      await resetState();
      state.capital = 0;
      state.entries = [];
      render();
      confirmModal.classList.remove('active');
      hideEntryForm();
      showToast('All data reset', 'success');
    } catch (e) {
      showToast('Failed to reset data: ' + e.message, 'error');
    }
  }

  // ─── Event Listeners ───
  // Capital
  setCapitalBtn.addEventListener('click', setCapital);
  capitalInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') await setCapital();
  });
  editCapitalBtn.addEventListener('click', editCapital);

  // Calendar Tabs
  document.querySelectorAll('.calendar-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      switchCalendarView(btn.dataset.view);
    });
  });

  // Calendar Navigation
  document.getElementById('calPrevBtn').addEventListener('click', calendarNavigatePrev);
  document.getElementById('calNextBtn').addEventListener('click', calendarNavigateNext);

  // Theme Toggle
  themeToggleBtn.addEventListener('click', toggleTheme);

  // Entries
  addEntryBtn.addEventListener('click', showEntryForm);
  cancelEntryBtn.addEventListener('click', hideEntryForm);
  saveEntryBtn.addEventListener('click', addEntry);
  entryAmount.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') await addEntry();
  });

  // Reset
  resetBtn.addEventListener('click', () => {
    if (state.capital > 0 || state.entries.length > 0) {
      confirmModal.classList.add('active');
    } else {
      showToast('No data to reset', 'error');
    }
  });

  modalConfirmBtn.addEventListener('click', resetAllData);
  modalCancelBtn.addEventListener('click', () => {
    confirmModal.classList.remove('active');
  });

  // Close modal on overlay click
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) {
      confirmModal.classList.remove('active');
    }
  });

  // ─── Init ───
  await loadState();
  loadTheme();
  render();

  // If capital is set, pre-fill date for faster entry
  if (state.capital > 0) {
    entryDate.value = getToday();
  }

})();