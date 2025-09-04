/* global $, window, document */
(function () {
  // --- Константы и настройки ---
  const MONTHS = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
  ];
  const DOW_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

  const now = new Date();
  let year = now.getFullYear();
  const startMonth = 8; // Сентябрь
  const endMonth = 10;  // Ноябрь

  // Ключ для локального хранения заметок на случай клиентских правок
  const localKey = (y) => `calendarNotes_${y}`;

  // --- Работа с локальным хранилищем ---
  function loadNotes() {
    try {
      const raw = localStorage.getItem(localKey(year));
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch { return {}; }
  }

  function saveNotes(notes) {
    try {
      localStorage.setItem(localKey(year), JSON.stringify(notes));
    } catch (e) {
      console.warn('Не удалось сохранить заметки в localStorage', e);
    }
  }

  // --- Вспомогательные функции ---
  function debounce(fn, ms) {
    let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  function fmtDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Путь к JSON в корне сайта
  function getNotesJsonUrl() {
    // Всегда берём из корня домена
    return '/calendar-notes.json';
  }

  // Загружаем JSON с заметками и определяем год из файла
  function fetchNotesFromFile() {
    const url = getNotesJsonUrl();
    // При открытии по file:// большинство браузеров блокируют fetch
    if (window.location.protocol === 'file:') {
      console.warn('[calendar] Похоже, страница открыта по file:// — браузер блокирует чтение файлов через fetch. Запустите локальный сервер (например, `python3 -m http.server 8080`) и откройте через http://localhost:8080/.');
    }
    return fetch(url, { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        try { console.log('[calendar] calendar-notes.json (parsed):', data); } catch {}
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return { notes: {}, usedYear: year };
        }
        // Соберём список годов из ключей JSON формата YYYY-MM-DD
        const years = new Set();
        Object.keys(data).forEach((k) => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(k)) years.add(parseInt(k.slice(0, 4), 10));
        });
        let usedYear = year;
        if (years.size) {
          if (!years.has(usedYear)) {
            // если в файле нет текущего года — берём максимальный доступный
            usedYear = Math.max(...Array.from(years));
          }
        }
        const filtered = {};
        const prefix = `${usedYear}-`;
        Object.keys(data).forEach((k) => { if (k.startsWith(prefix)) filtered[k] = data[k]; });
        try {
          console.log(`[calendar] выбранный год: ${usedYear}; записей: ${Object.keys(filtered).length}`);
        } catch {}
        return { notes: filtered, usedYear };
      })
      .catch((err) => {
        console.warn('Не удалось загрузить calendar-notes.json. Будут пустые заметки.', err);
        console.warn('[calendar] URL:', getNotesJsonUrl(), 'protocol:', window.location.protocol);
        return { notes: {}, usedYear: year };
      });
  }

  // --- Построение одного месяца ---
  function buildMonth(year, monthIndex, notes) {
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);

    const $month = $('<section/>', { class: 'month' });
    const $head = $('<div/>', { class: 'month-head' })
      .append($('<div/>', { class: 'month-title', text: `${MONTHS[monthIndex]} ${year}` }))
      .append($('<div/>', { class: 'month-sub', text: `${last.getDate()} дней` }));

    const $grid = $('<div/>', { class: 'grid' });

    for (let day = 1; day <= last.getDate(); day++) {
      const date = new Date(year, monthIndex, day);
      const dow = date.getDay();
      const key = fmtDateKey(date);
      const labelDow = DOW_SHORT[dow];

      let colorClass = '';
      if (monthIndex === 10 && (day === 3 || day === 4)) {
        colorClass = 'red';
      } else if ([0, 1, 3, 5].includes(dow)) { // Вс, Пн, Ср, Пт
        colorClass = 'blue';
      }

      const $day = $('<div/>', { class: `day ${colorClass}`.trim(), 'data-date': key });
      const $dayHead = $('<div/>', { class: 'day-head' })
        .append($('<div/>', { class: 'date', text: day }))
        .append($('<div/>', { class: 'dw', text: labelDow }));

      const $ta = $('<textarea/>', {
        class: 'note',
        placeholder: 'Заметка для этого дня…',
        'data-key': key,
      }).val(notes[key] || '');

      $day.append($dayHead, $ta);
      $grid.append($day);
    }

    $month.append($head, $grid);
    return $month;
  }

  // --- Рендер календаря и обработчики ввода ---
  function render(notes) {
    $('#yearLabel').text(year);
    const $root = $('#calendarRoot').empty();

    for (let m = startMonth; m <= endMonth; m++) {
      $root.append(buildMonth(year, m, notes));
    }

    // Автосохранение правок в localStorage
    const handleInput = debounce(function () {
      const key = $(this).data('key');
      const value = $(this).val();
      const current = loadNotes();
      if (value && value.trim().length > 0) current[key] = value;
      else delete current[key];
      saveNotes(current);
    }, 400);

    $root.on('input', 'textarea.note', handleInput);
  }

  // --- Экспорт заметок в файл JSON ---
  function exportJSON() {
    const notes = loadNotes();
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'calendar-notes.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // --- Импорт заметок из JSON (только записи текущего года) ---
  function importJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'));
        if (typeof data !== 'object' || Array.isArray(data)) throw new Error('bad json');
        try {
          console.log('[calendar] Импортированный JSON (parsed):', data);
          if (data && typeof data === 'object') {
            const rows = Object.entries(data).map(([date, text]) => ({ date, text }));
            if (rows.length) console.table(rows);
          }
        } catch {}
        const filtered = {};
        const prefix = `${year}-`;
        Object.keys(data).forEach((k) => { if (k.startsWith(prefix)) filtered[k] = data[k]; });
        saveNotes(filtered);
        render(filtered);
        try {
          console.log('[calendar] Отфильтровано для года', year, 'записей:', Object.keys(filtered).length);
          if (Object.keys(filtered).length) {
            console.table(Object.entries(filtered).map(([date, text]) => ({ date, text })));
          }
        } catch {}
      } catch (e) {
        alert('Не удалось импортировать JSON. Проверьте формат.');
      }
    };
    reader.readAsText(file);
  }

  // --- Инициализация страницы ---
  $(function () {
    // 1) Всегда грузим начальные данные из JSON в корне
    fetchNotesFromFile().then(({ notes, usedYear }) => {
      // 2) Если файл задаёт другой год — используем его
      year = usedYear;
      // 3) Рендерим с данными из файла (без чтения localStorage)
      render(notes);
      try {
        console.log('[calendar] Заметки, использованные для рендера:', notes);
        if (Object.keys(notes).length) {
          console.table(Object.entries(notes).map(([date, text]) => ({ date, text })));
        }
      } catch {}
    });

    // Уведомления на странице не показываем

    // Кнопки импорт/экспорт
    $('#exportBtn').on('click', exportJSON);
    $('#importInput').on('change', function () { importJSON(this.files && this.files[0]); this.value = ''; });
  });
})();
