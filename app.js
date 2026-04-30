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
        backstageTitle.textContent = 'New';
        backstageContent.innerHTML = `
          <p>Start a new blank document. Your current document will be cleared from the editor.</p>
          <button class="btn primary" id="confirmNew">Create new document</button>
        `;
        $('#confirmNew').addEventListener('click', () => {
          newDocument();
          closeBackstage();
        });
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
      case 'export-txt':
        exportTxt();
        closeBackstage();
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
    const prefs = {
      darkMode: darkMode.checked,
      ruler: rulerToggle.checked,
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
})();
