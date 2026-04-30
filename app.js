(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const editor = $('#editor');
  const docTitle = $('#docTitle');
  const ribbon = $('#ribbon');
  const page = $('#page');
  const statusWords = $('#statusWords');
  const statusChars = $('#statusChars');
  const statusPage = $('#statusPage');
  const statusSaved = $('#statusSaved');

  const STORE_KEY = 'rodmanword:doc';
  const STORE_TITLE = 'rodmanword:title';
  const STORE_PREFS = 'rodmanword:prefs';
  const STORE_RECENT = 'rodmanword:recent';

  // ---------- Tabs ----------
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      if (target === 'file') {
        openBackstage();
        return;
      }
      $$('.tab').forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
      });
      $$('.ribbon-panel').forEach((p) => {
        p.classList.toggle('active', p.dataset.panel === target);
      });
      ribbon.classList.remove('collapsed');
    });
  });

  $('#toggleRibbonBtn').addEventListener('click', () => {
    ribbon.classList.toggle('collapsed');
  });

  // ---------- Selection helpers ----------
  let savedRange = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedRange) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    editor.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }

  editor.addEventListener('keyup', saveSelection);
  editor.addEventListener('mouseup', saveSelection);
  editor.addEventListener('focus', saveSelection);

  // ---------- Commands ----------
  function exec(cmd, value = null) {
    restoreSelection();
    document.execCommand(cmd, false, value);
    saveSelection();
    queueAutosave();
    updateToolbarState();
  }

  $$('[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      exec(btn.dataset.cmd);
    });
  });

  // Font family / size
  $('#fontFamily').addEventListener('change', (e) => {
    exec('fontName', e.target.value);
  });

  $('#fontSize').addEventListener('change', (e) => {
    const px = parseInt(e.target.value, 10);
    restoreSelection();
    document.execCommand('fontSize', false, '7');
    const fonts = editor.querySelectorAll('font[size="7"]');
    fonts.forEach((f) => {
      f.removeAttribute('size');
      f.style.fontSize = px + 'pt';
    });
    saveSelection();
    queueAutosave();
  });

  // Color pickers
  $('#foreColor').addEventListener('input', (e) => {
    exec('foreColor', e.target.value);
  });
  $('#hiliteColor').addEventListener('input', (e) => {
    if (!document.execCommand('hiliteColor', false, e.target.value)) {
      exec('backColor', e.target.value);
    } else {
      saveSelection();
      queueAutosave();
    }
  });

  // Block style
  $('#blockStyle').addEventListener('change', (e) => {
    exec('formatBlock', e.target.value);
  });

  // ---------- Insert: image, link, table, etc ----------
  $('#insertImageBtn').addEventListener('click', () => {
    saveSelection();
    $('#imagePicker').click();
  });

  $('#imagePicker').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      exec('insertImage', reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  $('#insertLinkBtn').addEventListener('click', () => {
    saveSelection();
    const url = prompt('Enter URL:', 'https://');
    if (url) exec('createLink', url);
  });

  $('#insertDateBtn').addEventListener('click', () => {
    const today = new Date().toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric'
    });
    exec('insertText', today);
  });

  $('#pageBreakBtn').addEventListener('click', () => {
    restoreSelection();
    document.execCommand(
      'insertHTML',
      false,
      '<hr class="page-break" contenteditable="false"/><p><br/></p>'
    );
    queueAutosave();
  });

  // Table modal
  const tableModal = $('#tableModal');
  $('#insertTableBtn').addEventListener('click', () => {
    saveSelection();
    openModal(tableModal);
  });

  $('#insertTableConfirm').addEventListener('click', () => {
    const rows = parseInt($('#tblRows').value, 10) || 3;
    const cols = parseInt($('#tblCols').value, 10) || 3;
    const bordered = $('#tblBorders').checked;
    const cls = bordered ? ' class="bordered"' : '';
    let html = `<table${cls}><tbody>`;
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<td>&nbsp;</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    closeModal(tableModal);
    queueAutosave();
  });

  // Symbol modal
  const symbolModal = $('#symbolModal');
  const SYMBOLS = [
    '©','®','™','§','¶','†','‡','•','…','‰',
    '€','£','¥','¢','$','¤','₹','₽','₩','₿',
    '°','±','×','÷','≠','≈','≤','≥','∞','√',
    '∑','∏','∫','∂','∆','π','µ','Ω','α','β',
    'γ','δ','ε','θ','λ','σ','φ','ψ','ω','Φ',
    '←','→','↑','↓','↔','⇐','⇒','⇑','⇓','⇔',
    '★','☆','♥','♦','♣','♠','♪','♫','☀','☁',
    '☂','☃','☎','✓','✗','✉','✿','❀','❤','☮'
  ];
  const symbolGrid = $('#symbolGrid');
  SYMBOLS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = s;
    b.addEventListener('click', () => {
      restoreSelection();
      document.execCommand('insertText', false, s);
      closeModal(symbolModal);
      queueAutosave();
    });
    symbolGrid.appendChild(b);
  });
  $('#insertSymbolBtn').addEventListener('click', () => {
    saveSelection();
    openModal(symbolModal);
  });

  // ---------- Layout ----------
  const pageSize = $('#pageSize');
  const orientation = $('#orientation');
  const margins = $('#margins');

  function applyLayout() {
    page.classList.remove('a4', 'letter', 'legal');
    page.classList.add(pageSize.value);
    page.classList.toggle('landscape', orientation.value === 'landscape');
    page.classList.toggle('portrait', orientation.value === 'portrait');
    page.classList.remove('margins-normal', 'margins-narrow', 'margins-wide');
    page.classList.add('margins-' + margins.value);
    savePrefs();
  }

  [pageSize, orientation, margins].forEach((el) =>
    el.addEventListener('change', applyLayout)
  );

  // ---------- View ----------
  const zoom = $('#zoom');
  const zoomLabel = $('#zoomLabel');
  zoom.addEventListener('input', () => {
    const z = parseInt(zoom.value, 10) / 100;
    page.style.setProperty('--zoom', z);
    zoomLabel.textContent = zoom.value + '%';
    savePrefs();
  });

  const darkMode = $('#darkMode');
  darkMode.addEventListener('change', () => {
    document.documentElement.dataset.theme = darkMode.checked ? 'dark' : '';
    savePrefs();
  });

  const rulerToggle = $('#rulerToggle');
  rulerToggle.addEventListener('change', () => {
    $('#ruler').classList.toggle('hidden', !rulerToggle.checked);
    savePrefs();
  });

  // ---------- Word/char count ----------
  function updateCounts() {
    const text = editor.innerText.trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    statusWords.textContent = words + (words === 1 ? ' word' : ' words');
    statusChars.textContent = chars + (chars === 1 ? ' character' : ' characters');

    // Estimate page count by content height vs page inner height
    const ph = page.getBoundingClientRect().height;
    const eh = editor.scrollHeight;
    const est = Math.max(1, Math.ceil(eh / ph));
    statusPage.textContent = `Page 1 of ${est}`;
  }

  // ---------- Toolbar state ----------
  function updateToolbarState() {
    ['bold', 'italic', 'underline', 'strikeThrough'].forEach((cmd) => {
      const btn = document.querySelector(`[data-cmd="${cmd}"]`);
      if (!btn) return;
      try {
        btn.classList.toggle('active', document.queryCommandState(cmd));
      } catch {}
    });
  }

  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) updateToolbarState();
  });

  // ---------- Autosave ----------
  let saveTimer = null;
  function queueAutosave() {
    statusSaved.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, editor.innerHTML);
        localStorage.setItem(STORE_TITLE, docTitle.value);
        statusSaved.textContent = 'Saved';
      } catch {
        statusSaved.textContent = 'Save failed (storage full)';
      }
      updateCounts();
    }, 400);
  }

  editor.addEventListener('input', queueAutosave);
  docTitle.addEventListener('input', queueAutosave);

  // Tab key inserts spaces
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&emsp;');
    }
  });

  // ---------- Keyboard shortcuts ----------
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      saveDocument();
    } else if (key === 'p') {
      e.preventDefault();
      window.print();
    } else if (key === 'f') {
      e.preventDefault();
      openModal($('#findModal'));
      $('#findInput').focus();
    } else if (key === 'o') {
      e.preventDefault();
      $('#filePicker').click();
    } else if (key === 'n') {
      e.preventDefault();
      newDocument();
    }
  });

  // ---------- Backstage / File menu ----------
  const backstage = $('#backstage');
  const backstageTitle = $('#backstageTitle');
  const backstageContent = $('#backstageContent');

  function openBackstage() {
    backstage.hidden = false;
    setBackstageView('home');
  }

  function closeBackstage() {
    backstage.hidden = true;
    // Keep current tab as Home if File was active
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
      $$('.tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.tab === 'home');
      });
    }
  }

  $('#backCloseBtn').addEventListener('click', closeBackstage);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !backstage.hidden) closeBackstage();
  });

  function setBackstageView(action) {
    switch (action) {
      case 'new':
        renderTemplates();
        break;
      case 'open':
        backstageTitle.textContent = 'Open';
        backstageContent.innerHTML = `
          <p>Open a RodmanWord (.rwd), HTML, or text file from your device.</p>
          <button class="btn primary" id="openFromDevice">Browse this device…</button>
        `;
        $('#openFromDevice').addEventListener('click', () => {
          $('#filePicker').click();
        });
        break;
      case 'save':
        saveDocument();
        closeBackstage();
        break;
      case 'export-html':
        exportHtml();
        closeBackstage();
        break;
      case 'export-md':
        exportMarkdown();
        closeBackstage();
        break;
      case 'export-txt':
        exportTxt();
        closeBackstage();
        break;
      case 'history':
        renderHistory();
        break;
      case 'print':
        closeBackstage();
        setTimeout(() => window.print(), 100);
        break;
      case 'recent':
        renderRecent();
        break;
      case 'about':
        backstageTitle.textContent = 'About RodmanWord';
        backstageContent.innerHTML = `
          <p><b>RodmanWord</b> is an open-source Microsoft Word–style editor that runs entirely in your browser.</p>
          <p>It works on desktop and mobile, saves to local storage automatically, and can export documents as <code>.rwd</code>, HTML, or plain text. Use Print → Save as PDF for PDF export.</p>
          <p>No data leaves your device.</p>
        `;
        break;
      default:
        backstageTitle.textContent = 'File';
        backstageContent.textContent = 'Choose a command on the left.';
    }
  }

  $$('.backstage-side button[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => setBackstageView(btn.dataset.action));
  });

  // ---------- Document operations ----------
  function newDocument() {
    if (!confirm('Start a new blank document? Unsaved changes will be lost.')) return;
    editor.innerHTML = '<h1>Untitled document</h1><p><br/></p>';
    docTitle.value = 'Document';
    queueAutosave();
    editor.focus();
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function saveDocument() {
    const data = {
      version: 1,
      title: docTitle.value,
      html: editor.innerHTML,
      layout: {
        size: pageSize.value,
        orientation: orientation.value,
        margins: margins.value
      },
      savedAt: new Date().toISOString()
    };
    downloadBlob(
      JSON.stringify(data, null, 2),
      sanitizeFileName(docTitle.value) + '.rwd',
      'application/json'
    );
    addRecent(docTitle.value);
    statusSaved.textContent = 'Saved';
  }

  function exportHtml() {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(docTitle.value)}</title>
<style>
body { font-family: Calibri, Arial, sans-serif; max-width: 8.5in; margin: 1in auto; line-height: 1.5; color: #222; padding: 0 1in; }
h1, h2, h3 { color: #2b579a; }
table { border-collapse: collapse; }
table.bordered td, table.bordered th { border: 1px solid #ccc; }
td, th { padding: 4px 8px; }
img { max-width: 100%; }
blockquote { border-left: 4px solid #2b579a; margin: 0; padding: 0.2em 0.8em; color: #555; }
hr.page-break { page-break-after: always; border: none; }
</style></head><body>
${editor.innerHTML}
</body></html>`;
    downloadBlob(html, sanitizeFileName(docTitle.value) + '.html', 'text/html');
  }

  function exportTxt() {
    downloadBlob(
      editor.innerText,
      sanitizeFileName(docTitle.value) + '.txt',
      'text/plain'
    );
  }

  function sanitizeFileName(name) {
    return (name || 'document').replace(/[^\w\-]+/g, '_').slice(0, 64) || 'document';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  $('#filePicker').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      if (file.name.endsWith('.rwd') || file.type === 'application/json') {
        try {
          const data = JSON.parse(content);
          editor.innerHTML = sanitizeImported(data.html || '');
          docTitle.value = data.title || file.name.replace(/\.rwd$/, '');
          if (data.layout) {
            pageSize.value = data.layout.size || pageSize.value;
            orientation.value = data.layout.orientation || orientation.value;
            margins.value = data.layout.margins || margins.value;
            applyLayout();
          }
        } catch {
          alert('Could not read this RodmanWord file.');
          return;
        }
      } else if (/\.html?$/.test(file.name) || file.type.includes('html')) {
        const tmp = document.createElement('div');
        tmp.innerHTML = content;
        const body = tmp.querySelector('body') || tmp;
        editor.innerHTML = sanitizeImported(body.innerHTML);
        docTitle.value = file.name.replace(/\.html?$/, '');
      } else {
        const escaped = escapeHtml(content)
          .split(/\n{2,}/)
          .map((p) => '<p>' + p.replace(/\n/g, '<br/>') + '</p>')
          .join('');
        editor.innerHTML = escaped;
        docTitle.value = file.name.replace(/\.txt$/, '');
      }
      addRecent(docTitle.value);
      queueAutosave();
      closeBackstage();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function sanitizeImported(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('script, style, link, meta').forEach((n) => n.remove());
    tmp.querySelectorAll('*').forEach((n) => {
      [...n.attributes].forEach((a) => {
        if (a.name.startsWith('on')) n.removeAttribute(a.name);
        if (a.name === 'href' && /^javascript:/i.test(a.value)) {
          n.removeAttribute(a.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  // ---------- Recent ----------
  function addRecent(title) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    const entry = { title, at: new Date().toISOString() };
    list = [entry, ...list.filter((x) => x.title !== title)].slice(0, 10);
    localStorage.setItem(STORE_RECENT, JSON.stringify(list));
  }

  function renderRecent() {
    backstageTitle.textContent = 'Recent';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    if (!list.length) {
      backstageContent.innerHTML = '<p>No recent documents yet. Save a document to see it here.</p>';
      return;
    }
    backstageContent.innerHTML = '<ul class="recent-list"></ul>';
    const ul = backstageContent.querySelector('ul');
    list.forEach((item) => {
      const li = document.createElement('li');
      const dt = new Date(item.at);
      li.innerHTML = `<button>📄 <b>${escapeHtml(item.title)}</b><br/><small>${dt.toLocaleString()}</small></button>`;
      ul.appendChild(li);
    });
  }

  // ---------- Find & Replace ----------
  const findModal = $('#findModal');
  $('#findBtn').addEventListener('click', () => {
    saveSelection();
    openModal(findModal);
    $('#findInput').focus();
  });

  let lastFindIndex = -1;

  $('#findNextBtn').addEventListener('click', () => {
    const term = $('#findInput').value;
    if (!term) return;
    const matchCase = $('#matchCase').checked;
    const haystack = matchCase ? editor.innerText : editor.innerText.toLowerCase();
    const needle = matchCase ? term : term.toLowerCase();
    let from = lastFindIndex + 1;
    let idx = haystack.indexOf(needle, from);
    if (idx === -1) idx = haystack.indexOf(needle, 0);
    if (idx === -1) {
      alert('Not found');
      lastFindIndex = -1;
      return;
    }
    lastFindIndex = idx;
    selectTextAt(idx, idx + needle.length);
  });

  $('#replaceOneBtn').addEventListener('click', () => {
    const sel = window.getSelection();
    const find = $('#findInput').value;
    const repl = $('#replaceInput').value;
    if (!find) return;
    if (sel && sel.toString() === find) {
      restoreSelection();
      document.execCommand('insertText', false, repl);
      queueAutosave();
    }
    $('#findNextBtn').click();
  });

  $('#replaceAllBtn').addEventListener('click', () => {
    const find = $('#findInput').value;
    const repl = $('#replaceInput').value;
    if (!find) return;
    const matchCase = $('#matchCase').checked;
    const flags = matchCase ? 'g' : 'gi';
    const re = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    walkTextNodes(editor, (node) => {
      if (re.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(re, repl);
      }
    });
    queueAutosave();
  });

  function walkTextNodes(root, fn) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) fn(n);
  }

  function selectTextAt(start, end) {
    let pos = 0;
    const range = document.createRange();
    let started = false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const len = n.nodeValue.length;
      if (!started && pos + len >= start) {
        range.setStart(n, start - pos);
        started = true;
      }
      if (started && pos + len >= end) {
        range.setEnd(n, end - pos);
        break;
      }
      pos += len;
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
    savedRange = range.cloneRange();
  }

  // ---------- Modal helpers ----------
  function openModal(m) { m.hidden = false; }
  function closeModal(m) { m.hidden = true; }
  $$('[data-close-modal]').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.closest('.modal');
      if (m) closeModal(m);
    });
  });
  $$('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m);
    });
  });

  // ---------- Prefs ----------
  function savePrefs() {
    const outlineVisible = !document.getElementById('outlinePane').hidden;
    const prefs = {
      darkMode: darkMode.checked,
      ruler: rulerToggle.checked,
      outline: outlineVisible,
      zoom: zoom.value,
      pageSize: pageSize.value,
      orientation: orientation.value,
      margins: margins.value
    };
    try { localStorage.setItem(STORE_PREFS, JSON.stringify(prefs)); } catch {}
  }

  function loadPrefs() {
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(STORE_PREFS) || '{}'); } catch {}
    if (prefs.darkMode) {
      darkMode.checked = true;
      document.documentElement.dataset.theme = 'dark';
    }
    if (prefs.ruler === false) {
      rulerToggle.checked = false;
      $('#ruler').classList.add('hidden');
    }
    if (prefs.zoom) {
      zoom.value = prefs.zoom;
      zoomLabel.textContent = prefs.zoom + '%';
      page.style.setProperty('--zoom', parseInt(prefs.zoom, 10) / 100);
    }
    if (prefs.pageSize) pageSize.value = prefs.pageSize;
    if (prefs.orientation) orientation.value = prefs.orientation;
    if (prefs.margins) margins.value = prefs.margins;
    applyLayout();
    if (prefs.outline) {
      const ot = document.getElementById('outlineToggle');
      const op = document.getElementById('outlinePane');
      if (ot && op) { ot.checked = true; op.hidden = false; }
    }
  }

  // ---------- Restore document ----------
  function restoreFromStorage() {
    const html = localStorage.getItem(STORE_KEY);
    const title = localStorage.getItem(STORE_TITLE);
    if (html) editor.innerHTML = html;
    if (title) docTitle.value = title;
  }

  // ---------- Init ----------
  loadPrefs();
  restoreFromStorage();
  updateCounts();
  updateToolbarState();
  setInterval(updateCounts, 1500);
  // Outline rebuild after init (function defined later in feature block)
  setTimeout(() => { try { rebuildOutline(); } catch {} }, 0);

  // Prevent dropping random files into the editor as URLs
  editor.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => {
        const range = document.caretRangeFromPoint
          ? document.caretRangeFromPoint(e.clientX, e.clientY)
          : null;
        if (range) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          savedRange = range.cloneRange();
        }
        exec('insertImage', reader.result);
      };
      reader.readAsDataURL(files[0]);
    }
  });

  // ============================================================
  // FEATURE: Format painter
  // ============================================================
  const formatPainterBtn = $('#formatPainterBtn');
  const formatPainterIndicator = $('#formatPainterIndicator');
  let painterStyles = null;

  function captureStyleAt(node) {
    if (!node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      textDecoration: cs.textDecorationLine || cs.textDecoration,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
    };
  }

  formatPainterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (painterStyles) {
      painterStyles = null;
      formatPainterBtn.classList.remove('armed');
      formatPainterIndicator.hidden = true;
      return;
    }
    const sel = window.getSelection();
    const node = sel && sel.rangeCount ? sel.anchorNode : null;
    painterStyles = captureStyleAt(node);
    if (!painterStyles) {
      alert('Place the cursor in formatted text first, then click Format painter.');
      return;
    }
    formatPainterBtn.classList.add('armed');
    formatPainterIndicator.hidden = false;
  });

  editor.addEventListener('mouseup', () => {
    if (!painterStyles) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement('span');
    Object.assign(span.style, {
      fontFamily: painterStyles.fontFamily,
      fontSize: painterStyles.fontSize,
      fontWeight: painterStyles.fontWeight,
      fontStyle: painterStyles.fontStyle,
      textDecoration: painterStyles.textDecoration,
      color: painterStyles.color,
    });
    if (painterStyles.backgroundColor &&
        painterStyles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      span.style.backgroundColor = painterStyles.backgroundColor;
    }
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    } catch {}
    painterStyles = null;
    formatPainterBtn.classList.remove('armed');
    formatPainterIndicator.hidden = true;
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Cut / Copy / Paste
  // ============================================================
  $('#cutBtn').addEventListener('click', async () => {
    restoreSelection();
    try {
      const sel = window.getSelection().toString();
      if (sel && navigator.clipboard) {
        await navigator.clipboard.writeText(sel);
      }
      document.execCommand('delete');
    } catch {
      document.execCommand('cut');
    }
    queueAutosave();
  });

  $('#copyBtn').addEventListener('click', async () => {
    restoreSelection();
    try {
      const sel = window.getSelection().toString();
      if (sel && navigator.clipboard) {
        await navigator.clipboard.writeText(sel);
        flashStatus('Copied');
      } else {
        document.execCommand('copy');
      }
    } catch {
      document.execCommand('copy');
    }
  });

  $('#pasteBtn').addEventListener('click', async () => {
    restoreSelection();
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const txt = await navigator.clipboard.readText();
        document.execCommand('insertText', false, txt);
        queueAutosave();
        return;
      }
    } catch {}
    flashStatus('Use Ctrl+V to paste');
  });

  function flashStatus(msg) {
    const prev = statusSaved.textContent;
    statusSaved.textContent = msg;
    setTimeout(() => { statusSaved.textContent = prev; }, 1200);
  }

  // ============================================================
  // FEATURE: Document outline / navigation pane
  // ============================================================
  const outlinePane = $('#outlinePane');
  const outlineList = $('#outlineList');
  const outlineToggle = $('#outlineToggle');

  function rebuildOutline() {
    if (outlinePane.hidden) return;
    const headings = editor.querySelectorAll('h1, h2, h3, h4');
    outlineList.innerHTML = '';
    if (!headings.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No headings yet — apply Heading 1–4 to build an outline.';
      outlineList.appendChild(li);
      return;
    }
    headings.forEach((h, i) => {
      if (!h.id) h.id = 'rwd-h-' + i;
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);
      li.textContent = h.textContent || '(empty heading)';
      li.addEventListener('click', () => {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const r = document.createRange();
        r.selectNodeContents(h);
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      outlineList.appendChild(li);
    });
  }

  outlineToggle.addEventListener('change', () => {
    outlinePane.hidden = !outlineToggle.checked;
    if (outlineToggle.checked) rebuildOutline();
    savePrefs();
  });

  $('#outlineCloseBtn').addEventListener('click', () => {
    outlineToggle.checked = false;
    outlinePane.hidden = true;
    savePrefs();
  });

  // Refresh outline when editor changes
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdOutlineT);
    window.__rwdOutlineT = setTimeout(rebuildOutline, 300);
  });

  // ============================================================
  // FEATURE: Word count details modal
  // ============================================================
  const countModal = $('#countModal');
  const countBody = $('#countBody');
  const statusReading = $('#statusReading');

  function calcStats() {
    const text = editor.innerText || '';
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const paragraphs = (editor.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre').length) || 0;
    const sentences = trimmed ? (trimmed.match(/[.!?…]+(\s|$)/g) || []).length || 1 : 0;
    const minutes = Math.max(1, Math.round(words / 220));
    return { words, chars, charsNoSpace, paragraphs, sentences, minutes };
  }

  function renderCountModal() {
    const s = calcStats();
    countBody.innerHTML = `
      <div class="row"><span>Pages</span><b>${statusPage.textContent.replace('Page 1 of ', '')}</b></div>
      <div class="row"><span>Words</span><b>${s.words.toLocaleString()}</b></div>
      <div class="row"><span>Characters (with spaces)</span><b>${s.chars.toLocaleString()}</b></div>
      <div class="row"><span>Characters (no spaces)</span><b>${s.charsNoSpace.toLocaleString()}</b></div>
      <div class="row"><span>Paragraphs</span><b>${s.paragraphs.toLocaleString()}</b></div>
      <div class="row"><span>Sentences</span><b>${s.sentences.toLocaleString()}</b></div>
      <div class="row"><span>Reading time (~220 wpm)</span><b>${s.minutes} min</b></div>
    `;
  }

  $('#statusWords').addEventListener('click', () => {
    renderCountModal();
    openModal(countModal);
  });

  // Update reading-time indicator in status bar on the same cadence as counts
  setInterval(() => {
    const s = calcStats();
    statusReading.textContent = s.minutes + ' min read';
  }, 1500);

  // ============================================================
  // FEATURE: Export to Markdown
  // ============================================================
  function htmlToMarkdown(root) {
    const lines = [];

    function inline(node) {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      const inner = childrenInline(node);
      switch (tag) {
        case 'b': case 'strong': return '**' + inner + '**';
        case 'i': case 'em': return '*' + inner + '*';
        case 'u': return '<u>' + inner + '</u>';
        case 's': case 'strike': case 'del': return '~~' + inner + '~~';
        case 'code': return '`' + inner + '`';
        case 'a':
          return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
        case 'img':
          return '![' + (node.getAttribute('alt') || '') + '](' +
                 (node.getAttribute('src') || '') + ')';
        case 'br': return '  \n';
        default: return inner;
      }
    }

    function childrenInline(node) {
      let out = '';
      node.childNodes.forEach((c) => { out += inline(c); });
      return out;
    }

    function walk(node) {
      if (node.nodeType === 3) {
        const t = node.nodeValue.trim();
        if (t) lines.push(t);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      switch (tag) {
        case 'h1': lines.push('# ' + childrenInline(node)); break;
        case 'h2': lines.push('## ' + childrenInline(node)); break;
        case 'h3': lines.push('### ' + childrenInline(node)); break;
        case 'h4': lines.push('#### ' + childrenInline(node)); break;
        case 'h5': lines.push('##### ' + childrenInline(node)); break;
        case 'h6': lines.push('###### ' + childrenInline(node)); break;
        case 'p': lines.push(childrenInline(node)); break;
        case 'blockquote':
          lines.push('> ' + childrenInline(node).replace(/\n/g, '\n> '));
          break;
        case 'pre':
          lines.push('```\n' + (node.textContent || '') + '\n```');
          break;
        case 'hr': lines.push('---'); break;
        case 'ul':
          node.querySelectorAll(':scope > li').forEach((li) => {
            lines.push('- ' + childrenInline(li));
          });
          break;
        case 'ol': {
          let i = 1;
          node.querySelectorAll(':scope > li').forEach((li) => {
            lines.push(i++ + '. ' + childrenInline(li));
          });
          break;
        }
        case 'table': {
          const rows = node.querySelectorAll('tr');
          if (!rows.length) break;
          const headerCells = rows[0].querySelectorAll('th, td');
          const widths = headerCells.length;
          lines.push('| ' + Array.from(headerCells)
            .map((c) => childrenInline(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
          lines.push('|' + ' --- |'.repeat(widths));
          for (let r = 1; r < rows.length; r++) {
            const cells = rows[r].querySelectorAll('td, th');
            lines.push('| ' + Array.from(cells)
              .map((c) => childrenInline(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
          }
          break;
        }
        default:
          node.childNodes.forEach(walk);
      }
    }

    Array.from(root.childNodes).forEach(walk);
    return lines.join('\n\n');
  }

  function exportMarkdown() {
    const md = '# ' + (docTitle.value || 'Document') + '\n\n' + htmlToMarkdown(editor);
    downloadBlob(md, sanitizeFileName(docTitle.value) + '.md', 'text/markdown');
  }

  // ============================================================
  // FEATURE: Version history (auto snapshots)
  // ============================================================
  const STORE_HISTORY = 'rodmanword:history';
  const HISTORY_LIMIT = 20;

  function snapshot() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_HISTORY) || '[]'); } catch {}
    const latest = list[0];
    const html = editor.innerHTML;
    if (latest && latest.html === html) return;
    const entry = {
      title: docTitle.value,
      html,
      at: new Date().toISOString(),
      words: calcStats().words,
    };
    list = [entry, ...list].slice(0, HISTORY_LIMIT);
    try { localStorage.setItem(STORE_HISTORY, JSON.stringify(list)); } catch {}
  }
  // Snapshot every 2 minutes
  setInterval(snapshot, 2 * 60 * 1000);

  function renderHistory() {
    backstageTitle.textContent = 'Version history';
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_HISTORY) || '[]'); } catch {}
    if (!list.length) {
      backstageContent.innerHTML =
        '<p>No snapshots yet. RodmanWord auto-snapshots every 2 minutes while you edit.</p>' +
        '<button class="btn primary" id="snapNowBtn">Take a snapshot now</button>';
      $('#snapNowBtn').addEventListener('click', () => { snapshot(); renderHistory(); });
      return;
    }
    backstageContent.innerHTML =
      '<p>Click any version to restore it. Up to ' + HISTORY_LIMIT + ' snapshots are kept.</p>' +
      '<ul class="history-list"></ul>' +
      '<button class="btn" id="snapNowBtn">Take a snapshot now</button>';
    const ul = backstageContent.querySelector('ul');
    list.forEach((item, idx) => {
      const li = document.createElement('li');
      const dt = new Date(item.at);
      li.innerHTML = `<button>🕓 <b>${escapeHtml(item.title || 'Untitled')}</b><br/>` +
        `<small>${dt.toLocaleString()} • ${item.words} words</small></button>`;
      li.querySelector('button').addEventListener('click', () => {
        if (!confirm('Restore this version? Your current document will be replaced (a new snapshot is taken first).')) return;
        snapshot();
        editor.innerHTML = sanitizeImported(item.html);
        if (item.title) docTitle.value = item.title;
        queueAutosave();
        rebuildOutline();
        closeBackstage();
      });
      ul.appendChild(li);
    });
    $('#snapNowBtn').addEventListener('click', () => { snapshot(); renderHistory(); });
  }

  // ============================================================
  // FEATURE: Templates gallery
  // ============================================================
  const TEMPLATES = [
    {
      id: 'blank',
      name: 'Blank',
      desc: 'Start from scratch.',
      html: '<h1>Untitled document</h1><p><br/></p>',
    },
    {
      id: 'resume',
      name: 'Resume',
      desc: 'Single-page professional resume.',
      html: `<h1 style="text-align:center;margin-bottom:0">Your Name</h1>
<p style="text-align:center;color:#666;margin:0 0 1em">your.email@example.com  •  (555) 555-1234  •  city, country  •  linkedin.com/in/you</p>
<h2>Summary</h2>
<p>Two-to-three sentences describing what you do, what you're great at, and what you're looking for.</p>
<h2>Experience</h2>
<h3>Job title — Company</h3>
<p style="color:#666"><i>Jan 2023 – Present</i></p>
<ul><li>Impact-oriented bullet point with metrics.</li><li>Another accomplishment.</li><li>And one more.</li></ul>
<h3>Job title — Company</h3>
<p style="color:#666"><i>Jun 2020 – Dec 2022</i></p>
<ul><li>What you did.</li><li>What you delivered.</li></ul>
<h2>Education</h2>
<p><b>Degree</b>, University · 2016–2020</p>
<h2>Skills</h2>
<p>Skill 1, Skill 2, Skill 3, Skill 4, Skill 5</p>`,
    },
    {
      id: 'cover-letter',
      name: 'Cover letter',
      desc: 'Classic block-style cover letter.',
      html: `<p>Your Name<br/>Street address<br/>City, ZIP<br/>your.email@example.com</p>
<p>${new Date().toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'})}</p>
<p>Hiring Manager<br/>Company Name<br/>Street address<br/>City, ZIP</p>
<p>Dear Hiring Manager,</p>
<p>I am writing to apply for the [Role] position at [Company]. With [N] years of experience in [field], I am excited about the opportunity to contribute to your team.</p>
<p>In my current role at [Company], I have [accomplishment with metric]. I bring [skill 1], [skill 2], and a passion for [thing relevant to the company].</p>
<p>Thank you for your consideration. I would welcome the chance to discuss how I can contribute to [Company]'s continued success.</p>
<p>Sincerely,<br/><br/>Your Name</p>`,
    },
    {
      id: 'report',
      name: 'Report',
      desc: 'Structured report with TOC-style headings.',
      html: `<h1>Report title</h1>
<p style="color:#666"><i>Author name • ${new Date().toLocaleDateString()}</i></p>
<h2>Executive summary</h2>
<p>A 3–5 sentence overview of the key findings and recommendations.</p>
<h2>Background</h2>
<p>Context for why this report exists and what question it answers.</p>
<h2>Findings</h2>
<h3>Finding 1</h3>
<p>Details and supporting data.</p>
<h3>Finding 2</h3>
<p>Details and supporting data.</p>
<h2>Recommendations</h2>
<ol><li>Recommendation 1.</li><li>Recommendation 2.</li><li>Recommendation 3.</li></ol>
<h2>Appendix</h2>
<p>References, raw data, and additional materials.</p>`,
    },
    {
      id: 'memo',
      name: 'Memo',
      desc: 'Internal memo with To/From/Re header.',
      html: `<h1>Memo</h1>
<table><tbody>
<tr><td><b>To:</b></td><td>Recipient</td></tr>
<tr><td><b>From:</b></td><td>Sender</td></tr>
<tr><td><b>Date:</b></td><td>${new Date().toLocaleDateString()}</td></tr>
<tr><td><b>Re:</b></td><td>Subject</td></tr>
</tbody></table>
<hr/>
<p>Opening paragraph that states the memo's purpose.</p>
<p>Body paragraph(s) with details, context, and any supporting information.</p>
<p>Closing paragraph with action items or next steps.</p>`,
    },
    {
      id: 'meeting',
      name: 'Meeting notes',
      desc: 'Agenda, attendees, decisions, action items.',
      html: `<h1>Meeting notes</h1>
<p><b>Date:</b> ${new Date().toLocaleString()}<br/>
<b>Attendees:</b> name, name, name<br/>
<b>Notetaker:</b> you</p>
<h2>Agenda</h2>
<ol><li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>
<h2>Discussion</h2>
<p>Key points discussed.</p>
<h2>Decisions</h2>
<ul><li>Decision 1</li><li>Decision 2</li></ul>
<h2>Action items</h2>
<table class="bordered"><thead><tr><th>Owner</th><th>Item</th><th>Due</th></tr></thead>
<tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table>`,
    },
  ];

  // ============================================================
  // FEATURE: Voice dictation (Web Speech API)
  // ============================================================
  const dictateBtn = $('#dictateBtn');
  const dictationIndicator = $('#dictationIndicator');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let dictating = false;

  if (!SR) {
    dictateBtn.title = 'Voice dictation is not supported by this browser.';
    dictateBtn.disabled = true;
    dictateBtn.style.opacity = 0.5;
  } else {
    recognizer = new SR();
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.lang = navigator.language || 'en-US';

    recognizer.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
      }
      if (!text) return;
      restoreSelection();
      document.execCommand('insertText', false, text);
      saveSelection();
      queueAutosave();
    };
    recognizer.onerror = () => stopDictation();
    recognizer.onend = () => {
      if (dictating) {
        try { recognizer.start(); } catch {}
      }
    };

    dictateBtn.addEventListener('click', () => {
      if (dictating) stopDictation();
      else startDictation();
    });
  }

  function startDictation() {
    if (!recognizer) return;
    saveSelection();
    try { recognizer.start(); dictating = true; } catch {}
    dictateBtn.classList.add('armed');
    dictationIndicator.hidden = false;
  }

  function stopDictation() {
    if (!recognizer) return;
    dictating = false;
    try { recognizer.stop(); } catch {}
    dictateBtn.classList.remove('armed');
    dictationIndicator.hidden = true;
  }

  // ============================================================
  // FEATURE: Emoji picker
  // ============================================================
  const EMOJI = {
    '😀 Smileys': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕'],
    '👍 People': ['👋','🤚','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪','🦵','🦶','👂','👃','🧠','🦷','🦴','👀','👁️','👅','👄','💋'],
    '🐶 Animals': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐠','🐟','🐡','🐬','🦈','🐳','🐋','🐊'],
    '🍎 Food': ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔','🍟','🍕','🥪','🥙','🧆','🌮','🌯','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪'],
    '⚽ Activity': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🎯','🪀','🎮','🕹️','🎰','🎲','🧩','🧸','♠️','♥️','♦️','♣️'],
    '🚗 Travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','✈️','🛩️','🛫','🛬','🪂','💺','🚁','🚟','🚠','🚡','🛰️','🚀','🛸'],
    '💡 Objects': ['💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','💰','💳','💎','⚖️','🧰','🔧','🔨','⚒️','🛠️','⛏️','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','⚱️','🏺','🔮','📿','💈','⚗️','🔭','🔬','🕳️','💊','💉','🩸','🩹','🩺','🌡️'],
    '✅ Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐'],
  };

  const emojiCats = $('#emojiCats');
  const emojiGrid = $('#emojiGrid');
  const emojiModal = $('#emojiModal');

  function showEmojiCategory(catName) {
    emojiGrid.innerHTML = '';
    (EMOJI[catName] || []).forEach((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.addEventListener('click', () => {
        restoreSelection();
        document.execCommand('insertText', false, e);
        queueAutosave();
      });
      emojiGrid.appendChild(b);
    });
    Array.from(emojiCats.children).forEach((c) => {
      c.classList.toggle('active', c.dataset.cat === catName);
    });
  }

  Object.keys(EMOJI).forEach((cat, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.cat = cat;
    b.textContent = cat.split(' ')[0];
    b.title = cat;
    if (i === 0) b.classList.add('active');
    b.addEventListener('click', () => showEmojiCategory(cat));
    emojiCats.appendChild(b);
  });
  showEmojiCategory(Object.keys(EMOJI)[0]);

  $('#insertEmojiBtn').addEventListener('click', () => {
    saveSelection();
    openModal(emojiModal);
  });

  // ============================================================
  // FEATURE: Focus mode
  // ============================================================
  function enterFocusMode() {
    document.body.classList.add('focus-mode');
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (!$('.focus-mode-exit')) {
      const btn = document.createElement('button');
      btn.className = 'focus-mode-exit';
      btn.textContent = 'Exit focus (Esc)';
      btn.addEventListener('click', exitFocusMode);
      document.body.appendChild(btn);
    }
    editor.focus();
  }

  function exitFocusMode() {
    document.body.classList.remove('focus-mode');
    const btn = $('.focus-mode-exit');
    if (btn) btn.remove();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function toggleFocus() {
    if (document.body.classList.contains('focus-mode')) exitFocusMode();
    else enterFocusMode();
  }

  $('#focusBtn').addEventListener('click', toggleFocus);
  $('#focusBtn2').addEventListener('click', toggleFocus);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      toggleFocus();
    } else if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
      exitFocusMode();
    }
  });

  // ============================================================
  // FEATURE: Keyboard shortcuts cheatsheet
  // ============================================================
  $('#helpBtn').addEventListener('click', () => openModal($('#shortcutsModal')));
  document.addEventListener('keydown', (e) => {
    if (e.key === '?' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement === editor) return;
      e.preventDefault();
      openModal($('#shortcutsModal'));
    }
  });

  function renderTemplates() {
    backstageTitle.textContent = 'New';
    backstageContent.innerHTML =
      '<p>Pick a template to get started, or choose Blank.</p>' +
      '<div class="template-grid"></div>';
    const grid = backstageContent.querySelector('.template-grid');
    TEMPLATES.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="thumb">
          <b>${escapeHtml(t.name)}</b>
          <div class="bar"></div>
          <div class="bar short"></div>
          <div class="bar"></div>
          <div class="bar short"></div>
          <div class="bar"></div>
        </div>
        <div class="name">${escapeHtml(t.name)}</div>
        <div class="desc">${escapeHtml(t.desc)}</div>
      `;
      card.addEventListener('click', () => {
        if (editor.innerText.trim() &&
            !confirm('Replace the current document with the ' + t.name + ' template?')) return;
        editor.innerHTML = t.html;
        docTitle.value = t.name === 'Blank' ? 'Document' : t.name;
        queueAutosave();
        rebuildOutline();
        closeBackstage();
      });
      grid.appendChild(card);
    });
  }

})();
