(function () {
  'use strict';

  // ---------- Constants ----------
  var STORAGE_KEY = 'ledger.transactions.v1';
  var CATEGORY_KEY = 'ledger.categories.v1';
  var THEME_KEY = 'ledger.theme.v1';
  var SERIAL_KEY = 'ledger.serial.v1';
  var OVER_LIMIT = 200000; // Rp — single-item spend above this is flagged

  var DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];
  var COLOR_POOL = [
    '#d98e3f', '#3e7c8c', '#b23a2e',
    '#7a8c4b', '#8c5ea8', '#4b6b8c', '#c9a227'
  ];

  // ---------- State ----------
  var transactions = loadTransactions();
  var categories = loadCategories();
  var serial = loadSerial();
  var chart = null;

  // ---------- DOM refs ----------
  var form = document.getElementById('entryForm');
  var itemNameInput = document.getElementById('itemName');
  var itemAmountInput = document.getElementById('itemAmount');
  var itemCategorySelect = document.getElementById('itemCategory');
  var customCategoryField = document.getElementById('customCategoryField');
  var customCategoryInput = document.getElementById('customCategoryInput');
  var formError = document.getElementById('formError');

  var balanceDisplay = document.getElementById('balanceDisplay');
  var entryCount = document.getElementById('entryCount');
  var transactionList = document.getElementById('transactionList');
  var emptyState = document.getElementById('emptyState');
  var sortSelect = document.getElementById('sortSelect');
  var chartCanvas = document.getElementById('categoryChart');
  var chartEmptyState = document.getElementById('chartEmptyState');
  var monthlySummary = document.getElementById('monthlySummary');
  var themeToggle = document.getElementById('themeToggle');
  var serialNumber = document.getElementById('serialNumber');

  // ---------- Storage helpers ----------
  function loadTransactions() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  function loadCategories() {
    try {
      var raw = localStorage.getItem(CATEGORY_KEY);
      var extra = raw ? JSON.parse(raw) : [];
      return DEFAULT_CATEGORIES.concat(extra.filter(function (c) {
        return DEFAULT_CATEGORIES.indexOf(c) === -1;
      }));
    } catch (e) {
      return DEFAULT_CATEGORIES.slice();
    }
  }

  function saveCategories() {
    var extra = categories.filter(function (c) {
      return DEFAULT_CATEGORIES.indexOf(c) === -1;
    });
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(extra));
  }

  function loadSerial() {
    var raw = localStorage.getItem(SERIAL_KEY);
    return raw ? parseInt(raw, 10) : 0;
  }

  function saveSerial() {
    localStorage.setItem(SERIAL_KEY, String(serial));
  }

  // ---------- Theme ----------
  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY);
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = saved ? saved === 'dark' : prefersDark;
    setTheme(dark);
  }

  function setTheme(dark) {
    document.body.classList.toggle('dark', dark);
    themeToggle.textContent = dark ? '☼' : '☾';
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }

  themeToggle.addEventListener('click', function () {
    setTheme(!document.body.classList.contains('dark'));
  });

  // ---------- Category colors ----------
  function colorFor(category) {
    var idx = categories.indexOf(category);
    if (idx === -1) idx = 0;
    return COLOR_POOL[idx % COLOR_POOL.length];
  }

  function populateCategorySelect() {
    var current = itemCategorySelect.value;
    itemCategorySelect.innerHTML = '';
    categories.forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      itemCategorySelect.appendChild(opt);
    });
    var customOpt = document.createElement('option');
    customOpt.value = '__custom';
    customOpt.textContent = '+ New category…';
    itemCategorySelect.appendChild(customOpt);

    if (categories.indexOf(current) !== -1) {
      itemCategorySelect.value = current;
    }
  }

  itemCategorySelect.addEventListener('change', function () {
    var isCustom = itemCategorySelect.value === '__custom';
    customCategoryField.classList.toggle('field--hidden', !isCustom);
    if (isCustom) customCategoryInput.focus();
  });

  // ---------- Currency formatting ----------
  function formatRp(amount) {
    return 'Rp' + Math.round(amount).toLocaleString('id-ID');
  }

  // ---------- Form submit ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formError.textContent = '';

    var name = itemNameInput.value.trim();
    var amountRaw = itemAmountInput.value;
    var amount = parseFloat(amountRaw);
    var categorySelection = itemCategorySelect.value;
    var category = categorySelection;

    if (categorySelection === '__custom') {
      category = customCategoryInput.value.trim();
    }

    if (!name || !amountRaw || isNaN(amount) || amount <= 0 || !category) {
      formError.textContent = 'Please fill in every field with a valid amount.';
      return;
    }

    if (categorySelection === '__custom' && categories.indexOf(category) === -1) {
      categories.push(category);
      saveCategories();
      populateCategorySelect();
    }

    serial += 1;
    saveSerial();

    transactions.push({
      id: Date.now() + '-' + serial,
      name: name,
      amount: amount,
      category: category,
      date: new Date().toISOString()
    });
    saveTransactions();

    form.reset();
    populateCategorySelect();
    customCategoryField.classList.add('field--hidden');
    itemNameInput.focus();

    render();
  });

  // ---------- Delete ----------
  transactionList.addEventListener('click', function (e) {
    var btn = e.target.closest('.tx-delete');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    transactions = transactions.filter(function (t) { return t.id !== id; });
    saveTransactions();
    render();
  });

  // ---------- Sort ----------
  sortSelect.addEventListener('change', render);

  function sortedTransactions() {
    var list = transactions.slice();
    var mode = sortSelect.value;
    if (mode === 'amount') {
      list.sort(function (a, b) { return b.amount - a.amount; });
    } else if (mode === 'category') {
      list.sort(function (a, b) { return a.category.localeCompare(b.category); });
    } else {
      list.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    }
    return list;
  }

  // ---------- Render: list ----------
  function renderList() {
    var list = sortedTransactions();
    transactionList.innerHTML = '';
    emptyState.classList.toggle('is-visible', list.length === 0);

    list.forEach(function (t) {
      var li = document.createElement('li');

      var nameSpan = document.createElement('span');
      nameSpan.className = 'tx-name';
      var dot = document.createElement('span');
      dot.className = 'tx-cat-dot';
      dot.style.background = colorFor(t.category);
      nameSpan.appendChild(dot);
      nameSpan.appendChild(document.createTextNode(t.name + ' · ' + t.category));

      var amountSpan = document.createElement('span');
      amountSpan.className = 'tx-amount' + (t.amount > OVER_LIMIT ? ' over-limit' : '');
      amountSpan.textContent = formatRp(t.amount);

      var delBtn = document.createElement('button');
      delBtn.className = 'tx-delete';
      delBtn.setAttribute('data-id', t.id);
      delBtn.setAttribute('aria-label', 'Delete ' + t.name);
      delBtn.textContent = '✕';

      li.appendChild(nameSpan);
      li.appendChild(amountSpan);
      li.appendChild(delBtn);
      transactionList.appendChild(li);
    });
  }

  // ---------- Render: balance ----------
  function renderBalance() {
    var total = transactions.reduce(function (sum, t) { return sum + t.amount; }, 0);
    balanceDisplay.textContent = formatRp(total);
    entryCount.textContent = transactions.length + (transactions.length === 1 ? ' entry logged' : ' entries logged');
    serialNumber.textContent = String(serial).padStart(6, '0');
  }

  // ---------- Render: chart ----------
  function categoryTotals() {
    var totals = {};
    transactions.forEach(function (t) {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });
    return totals;
  }

  function renderChart() {
    var totals = categoryTotals();
    var labels = Object.keys(totals);
    var data = labels.map(function (l) { return totals[l]; });
    var colors = labels.map(colorFor);

    var hasData = labels.length > 0;
    chartCanvas.style.display = hasData ? 'block' : 'none';
    chartEmptyState.classList.toggle('is-visible', !hasData);
    if (!hasData) {
      if (chart) { chart.destroy(); chart = null; }
      return;
    }

    var isDark = document.body.classList.contains('dark');
    var ctx = chartCanvas.getContext('2d');

    if (chart) {
      chart.data.labels = labels;
      chart.data.datasets[0].data = data;
      chart.data.datasets[0].backgroundColor = colors;
      chart.options.plugins.legend.labels.color = isDark ? '#ece4d2' : '#24231f';
      chart.update();
      return;
    }

    chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: isDark ? '#201e19' : '#f4efe3',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: isDark ? '#ece4d2' : '#24231f',
              font: { family: 'IBM Plex Mono', size: 11 },
              boxWidth: 10
            }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.label + ': ' + formatRp(ctx.raw);
              }
            }
          }
        }
      }
    });
  }

  // ---------- Render: monthly summary ----------
  function renderMonthlySummary() {
    var now = new Date();
    var thisMonth = transactions.filter(function (t) {
      var d = new Date(t.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    monthlySummary.innerHTML = '';

    if (thisMonth.length === 0) {
      var p = document.createElement('p');
      p.className = 'empty-state is-visible';
      p.textContent = 'No entries this month.';
      monthlySummary.appendChild(p);
      return;
    }

    var totals = {};
    thisMonth.forEach(function (t) {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
    });

    Object.keys(totals).sort(function (a, b) {
      return totals[b] - totals[a];
    }).forEach(function (cat) {
      var row = document.createElement('div');
      row.className = 'summary-row';

      var nameWrap = document.createElement('span');
      nameWrap.className = 'cat-name';
      var dot = document.createElement('span');
      dot.className = 'tx-cat-dot';
      dot.style.background = colorFor(cat);
      nameWrap.appendChild(dot);
      nameWrap.appendChild(document.createTextNode(cat));

      var amountSpan = document.createElement('span');
      amountSpan.className = 'cat-amount';
      amountSpan.textContent = formatRp(totals[cat]);

      row.appendChild(nameWrap);
      row.appendChild(amountSpan);
      monthlySummary.appendChild(row);
    });
  }

  // ---------- Render all ----------
  function render() {
    renderBalance();
    renderList();
    renderChart();
    renderMonthlySummary();
  }

  // ---------- Re-render chart colors on theme change ----------
  var themeObserver = new MutationObserver(function () {
    renderChart();
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // ---------- Init ----------
  initTheme();
  populateCategorySelect();
  render();
})();
