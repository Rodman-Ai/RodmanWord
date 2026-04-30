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
  function syncBrowserTitle() {
    const t = (docTitle.value || 'Document').trim();
    document.title = t + ' — RodmanWord';
  }
  function queueAutosave() {
    statusSaved.textContent = 'Saving…';
    syncBrowserTitle();
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
  syncBrowserTitle();

  function refreshEmptyState() {
    const txt = (editor.innerText || '').replace(/​/g, '').trim();
    const onlyBreaks = !txt && !editor.querySelector('img, table, hr');
    editor.classList.toggle('is-empty', onlyBreaks);
  }

  editor.addEventListener('input', queueAutosave);
  editor.addEventListener('input', refreshEmptyState);
  docTitle.addEventListener('input', queueAutosave);
  refreshEmptyState();

  // Tab key inserts spaces
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertHTML', false, '&emsp;');
    }
  });

  // ---------- Smart paste cleanup ----------
  editor.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;

    // Image paste: insert as data URL
    const items = cd.items || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () => {
            document.execCommand('insertImage', false, reader.result);
            queueAutosave();
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }

    const html = cd.getData('text/html');
    if (html) {
      e.preventDefault();
      document.execCommand('insertHTML', false, cleanPastedHtml(html));
      queueAutosave();
    }
    // Plain text falls through to the browser's default behavior
  });

  function cleanPastedHtml(raw) {
    const tmp = document.createElement('div');
    tmp.innerHTML = raw;

    // Drop everything outside <body> if present (Office/Google docs wraps)
    const bodyMatch = raw.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) tmp.innerHTML = bodyMatch[1];

    // Strip all inline styles, classes, MS Office namespaces, comments
    const banned = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'O:P', 'V:SHAPETYPE', 'V:SHAPE']);
    const walk = (node) => {
      const children = Array.from(node.childNodes);
      for (const c of children) {
        if (c.nodeType === 8) { c.remove(); continue; } // comment
        if (c.nodeType !== 1) continue;
        if (banned.has(c.tagName)) { c.remove(); continue; }
        // Remove conditional comments / MS Office tags by namespace
        if (/[:o]/.test(c.tagName) && c.tagName.includes(':')) {
          while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c);
          c.remove();
          continue;
        }
        // Strip dangerous + cosmetic attrs
        Array.from(c.attributes).forEach((a) => {
          const name = a.name.toLowerCase();
          if (name === 'style' || name === 'class' || name === 'lang' ||
              name === 'dir' || name.startsWith('on') ||
              (name === 'href' && /^javascript:/i.test(a.value))) {
            c.removeAttribute(a.name);
          }
        });
        walk(c);
      }
    };
    walk(tmp);

    // Collapse empty paragraphs
    tmp.querySelectorAll('p').forEach((p) => {
      if (!p.textContent.trim() && !p.querySelector('img')) p.remove();
    });

    return tmp.innerHTML;
  }

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
  // Click on the empty backstage main area (not the side or content) closes it
  backstage.addEventListener('click', (e) => {
    if (e.target === backstage) closeBackstage();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Close any open modal first
    const openM = $$('.modal').find((m) => !m.hidden);
    if (openM) { openM.hidden = true; return; }
    if (!backstage.hidden) closeBackstage();
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
      case 'properties':
        closeBackstage();
        openPropsModal();
        break;
      case 'share':
        renderShareView();
        break;
      case 'goal':
        closeBackstage();
        $('#goalTarget').value = writingGoal || 500;
        openModal(goalModal);
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
      properties: docProps || {},
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

  // ---------- Find & Replace (highlight all + count) ----------
  const findModal = $('#findModal');
  const findCount = $('#findCount');
  let findMarks = [];
  let findCursor = -1;

  $('#findBtn').addEventListener('click', () => {
    saveSelection();
    openModal(findModal);
    $('#findInput').focus();
    rerunFind();
  });

  function clearFindMarks() {
    findMarks.forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    findMarks = [];
    findCursor = -1;
  }

  function rerunFind() {
    clearFindMarks();
    const term = $('#findInput').value;
    if (!term) { findCount.textContent = ''; return; }
    const matchCase = $('#matchCase').checked;
    const re = new RegExp(
      term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      matchCase ? 'g' : 'gi'
    );
    const textNodes = [];
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
        // skip text inside our existing marks (already extracted)
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    textNodes.forEach((node) => {
      const text = node.nodeValue;
      let m, last = 0;
      const fragments = [];
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
          fragments.push(document.createTextNode(text.slice(last, m.index)));
        }
        const mark = document.createElement('span');
        mark.className = 'rwd-find-mark';
        mark.textContent = m[0];
        fragments.push(mark);
        findMarks.push(mark);
        last = m.index + m[0].length;
        if (m[0].length === 0) re.lastIndex++;
      }
      if (!fragments.length) return;
      if (last < text.length) {
        fragments.push(document.createTextNode(text.slice(last)));
      }
      const parent = node.parentNode;
      fragments.forEach((f) => parent.insertBefore(f, node));
      parent.removeChild(node);
    });

    if (findMarks.length) {
      findCursor = 0;
      focusFindMark(0);
    }
    findCount.textContent = findMarks.length
      ? findMarks.length + ' matches'
      : 'No matches';
  }

  function focusFindMark(i) {
    findMarks.forEach((m, idx) => {
      m.classList.toggle('current', idx === i);
    });
    const m = findMarks[i];
    if (!m) return;
    m.scrollIntoView({ block: 'center', behavior: 'smooth' });
    findCount.textContent =
      (i + 1) + ' of ' + findMarks.length + ' matches';
  }

  $('#findInput').addEventListener('input', () => {
    clearTimeout(window.__rwdFindT);
    window.__rwdFindT = setTimeout(rerunFind, 200);
  });
  $('#matchCase').addEventListener('change', rerunFind);

  $('#findNextBtn').addEventListener('click', () => {
    if (!findMarks.length) return rerunFind();
    findCursor = (findCursor + 1) % findMarks.length;
    focusFindMark(findCursor);
  });
  $('#findPrevBtn').addEventListener('click', () => {
    if (!findMarks.length) return rerunFind();
    findCursor = (findCursor - 1 + findMarks.length) % findMarks.length;
    focusFindMark(findCursor);
  });

  $('#replaceOneBtn').addEventListener('click', () => {
    if (!findMarks.length) return;
    const repl = $('#replaceInput').value;
    const m = findMarks[findCursor];
    if (!m) return;
    const txt = document.createTextNode(repl);
    m.parentNode.replaceChild(txt, m);
    findMarks.splice(findCursor, 1);
    if (findCursor >= findMarks.length) findCursor = 0;
    if (findMarks.length) focusFindMark(findCursor);
    else findCount.textContent = 'All replaced';
    queueAutosave();
  });

  $('#replaceAllBtn').addEventListener('click', () => {
    if (!findMarks.length) rerunFind();
    if (!findMarks.length) return;
    const repl = $('#replaceInput').value;
    const count = findMarks.length;
    findMarks.forEach((m) => {
      const txt = document.createTextNode(repl);
      m.parentNode.replaceChild(txt, m);
    });
    findMarks = [];
    findCursor = -1;
    findCount.textContent = 'Replaced ' + count + ' matches';
    queueAutosave();
  });

  // Clear find highlights when the dialog closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !findModal.hidden) clearFindMarks();
  });
  findModal.addEventListener('click', (e) => {
    if (e.target === findModal) clearFindMarks();
  });
  $$('#findModal [data-close-modal]').forEach((b) => {
    b.addEventListener('click', clearFindMarks);
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
  // FEATURE: Table mini-toolbar
  // ============================================================
  const tableBar = $('#tableBar');

  function positionFloatBar(bar, anchor) {
    const r = anchor.getBoundingClientRect();
    // viewport-relative because float-bar is position:fixed
    const top = r.top - bar.offsetHeight - 6;
    bar.style.left = Math.max(8, r.left) + 'px';
    bar.style.top = (top < 8 ? r.bottom + 6 : top) + 'px';
  }

  function activeCell() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return null;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    return n ? n.closest('td, th') : null;
  }

  function showTableBar(cell) {
    tableBar.hidden = false;
    positionFloatBar(tableBar, cell);
  }

  function hideTableBar() { tableBar.hidden = true; }

  editor.addEventListener('click', () => {
    const c = activeCell();
    if (c) showTableBar(c); else hideTableBar();
  });
  editor.addEventListener('keyup', () => {
    const c = activeCell();
    if (c) showTableBar(c);
  });
  document.addEventListener('scroll', () => {
    if (!tableBar.hidden) {
      const c = activeCell();
      if (c) positionFloatBar(tableBar, c);
    }
  }, true);

  tableBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const cell = activeCell();
    if (!cell) return;
    const row = cell.parentElement;
    const table = cell.closest('table');
    const colIdx = Array.from(row.children).indexOf(cell);

    switch (btn.dataset.tact) {
      case 'row-above':
      case 'row-below': {
        const newRow = row.cloneNode(false);
        Array.from(row.children).forEach(() => {
          const c = document.createElement(row.firstElementChild.tagName);
          c.innerHTML = '&nbsp;';
          newRow.appendChild(c);
        });
        row.parentNode.insertBefore(
          newRow,
          btn.dataset.tact === 'row-above' ? row : row.nextSibling
        );
        break;
      }
      case 'col-left':
      case 'col-right': {
        const offset = btn.dataset.tact === 'col-left' ? 0 : 1;
        Array.from(table.rows).forEach((r) => {
          const ref = r.children[colIdx + offset] || null;
          const c = document.createElement(r.children[0].tagName);
          c.innerHTML = '&nbsp;';
          r.insertBefore(c, ref);
        });
        break;
      }
      case 'del-row':
        if (table.rows.length > 1) row.remove();
        break;
      case 'del-col':
        if (row.children.length > 1) {
          Array.from(table.rows).forEach((r) => {
            if (r.children[colIdx]) r.children[colIdx].remove();
          });
        }
        break;
      case 'del-table':
        if (confirm('Delete the entire table?')) {
          table.remove();
          hideTableBar();
        }
        break;
    }
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Image mini-toolbar
  // ============================================================
  const imageBar = $('#imageBar');
  let selectedImg = null;

  editor.addEventListener('click', (e) => {
    const img = e.target.closest && e.target.closest('img');
    if (!img) {
      if (selectedImg) {
        selectedImg.classList.remove('rwd-img-selected');
        selectedImg = null;
      }
      imageBar.hidden = true;
      return;
    }
    if (selectedImg && selectedImg !== img) {
      selectedImg.classList.remove('rwd-img-selected');
    }
    selectedImg = img;
    img.classList.add('rwd-img-selected');
    imageBar.hidden = false;
    positionFloatBar(imageBar, img);
  });

  imageBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !selectedImg) return;
    const a = btn.dataset.iact;
    if (a === 'small' || a === 'medium' || a === 'full') {
      selectedImg.classList.remove('rwd-img-small', 'rwd-img-medium', 'rwd-img-full');
      selectedImg.classList.add('rwd-img-' + a);
    } else if (a === 'alt') {
      const v = prompt('Alt text:', selectedImg.alt || '');
      if (v !== null) selectedImg.alt = v;
    } else if (a === 'delete') {
      selectedImg.remove();
      selectedImg = null;
      imageBar.hidden = true;
    }
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Document outline / navigation pane
  // ============================================================
  const outlinePane = $('#outlinePane');
  const outlineList = $('#outlineList');
  const outlineToggle = $('#outlineToggle');

  let outlineEntries = [];

  function rebuildOutline() {
    if (outlinePane.hidden) return;
    const headings = editor.querySelectorAll('h1, h2, h3, h4');
    outlineList.innerHTML = '';
    outlineEntries = [];
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
      outlineEntries.push({ heading: h, li });
    });
  }

  function syncOutlineCurrent() {
    if (outlinePane.hidden || !outlineEntries.length) return;
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const wsTop = ws.getBoundingClientRect().top;
    let activeIdx = 0;
    for (let i = 0; i < outlineEntries.length; i++) {
      const top = outlineEntries[i].heading.getBoundingClientRect().top;
      if (top - wsTop <= 80) activeIdx = i;
      else break;
    }
    outlineEntries.forEach((e, i) => {
      e.li.classList.toggle('current', i === activeIdx);
    });
  }

  // Throttled scroll sync
  document.querySelector('.workspace-main')?.addEventListener('scroll', () => {
    clearTimeout(window.__rwdScrollT);
    window.__rwdScrollT = setTimeout(syncOutlineCurrent, 80);
  });

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

  // ============================================================
  // FEATURE: Read aloud (text-to-speech)
  // ============================================================
  const ttsIndicator = $('#ttsIndicator');
  const readAloudBtn = $('#readAloudBtn');
  const synth = window.speechSynthesis;
  let ttsSpeaking = false;

  const ttsBar = $('#ttsBar');
  const ttsVoiceSel = $('#ttsVoice');
  const ttsRate = $('#ttsRate');
  const ttsRateLabel = $('#ttsRateLabel');
  const ttsPauseBtn = $('#ttsPauseBtn');
  const ttsStopBtn = $('#ttsStopBtn');

  if (!synth) {
    readAloudBtn.disabled = true;
    readAloudBtn.title = 'Text-to-speech not supported';
    readAloudBtn.style.opacity = 0.5;
  } else {
    function loadVoices() {
      const voices = synth.getVoices();
      ttsVoiceSel.innerHTML = '';
      voices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = v.name + ' (' + v.lang + ')' + (v.default ? ' ★' : '');
        if (v.default) opt.selected = true;
        ttsVoiceSel.appendChild(opt);
      });
    }
    loadVoices();
    if ('onvoiceschanged' in synth) synth.onvoiceschanged = loadVoices;

    ttsRate.addEventListener('input', () => {
      ttsRateLabel.textContent = parseFloat(ttsRate.value).toFixed(1) + '×';
    });

    function startTts() {
      const sel = window.getSelection().toString();
      const text = sel || editor.innerText;
      if (!text.trim()) { flashStatus('Nothing to read'); return; }
      const u = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices();
      const idx = parseInt(ttsVoiceSel.value, 10);
      if (!isNaN(idx) && voices[idx]) u.voice = voices[idx];
      u.rate = parseFloat(ttsRate.value) || 1;
      u.lang = u.voice ? u.voice.lang : (navigator.language || 'en-US');
      u.onstart = () => {
        ttsSpeaking = true;
        readAloudBtn.classList.add('armed');
        ttsIndicator.hidden = false;
        ttsBar.hidden = false;
        ttsPauseBtn.textContent = 'Pause';
      };
      u.onend = u.onerror = () => {
        ttsSpeaking = false;
        readAloudBtn.classList.remove('armed');
        ttsIndicator.hidden = true;
        ttsBar.hidden = true;
      };
      synth.speak(u);
    }

    readAloudBtn.addEventListener('click', () => {
      if (ttsSpeaking) { synth.cancel(); return; }
      startTts();
    });

    ttsPauseBtn.addEventListener('click', () => {
      if (synth.paused) { synth.resume(); ttsPauseBtn.textContent = 'Pause'; }
      else { synth.pause(); ttsPauseBtn.textContent = 'Resume'; }
    });
    ttsStopBtn.addEventListener('click', () => synth.cancel());
  }

  // ============================================================
  // FEATURE: Document properties
  // ============================================================
  const STORE_PROPS = 'rodmanword:props';
  let docProps = {};
  try { docProps = JSON.parse(localStorage.getItem(STORE_PROPS) || '{}'); } catch {}

  const propsModal = $('#propsModal');

  function openPropsModal() {
    $('#propTitle').value = docProps.title || docTitle.value || '';
    $('#propAuthor').value = docProps.author || '';
    $('#propSubject').value = docProps.subject || '';
    $('#propKeywords').value = docProps.keywords || '';
    $('#propDesc').value = docProps.description || '';
    const s = calcStats();
    $('#propStats').innerHTML =
      '<div class="row"><span>Words</span><span>' + s.words + '</span></div>' +
      '<div class="row"><span>Characters</span><span>' + s.chars + '</span></div>' +
      '<div class="row"><span>Paragraphs</span><span>' + s.paragraphs + '</span></div>' +
      '<div class="row"><span>Last edit</span><span>' + new Date().toLocaleString() + '</span></div>';
    openModal(propsModal);
  }

  $('#savePropsBtn').addEventListener('click', () => {
    docProps = {
      title: $('#propTitle').value,
      author: $('#propAuthor').value,
      subject: $('#propSubject').value,
      keywords: $('#propKeywords').value,
      description: $('#propDesc').value,
    };
    try { localStorage.setItem(STORE_PROPS, JSON.stringify(docProps)); } catch {}
    if (docProps.title) {
      docTitle.value = docProps.title;
      queueAutosave();
    }
    closeModal(propsModal);
    flashStatus('Properties saved');
  });

  // ============================================================
  // FEATURE: Writing goal
  // ============================================================
  const STORE_GOAL = 'rodmanword:goal';
  const goalIndicator = $('#goalIndicator');
  const goalLabel = $('#goalLabel');
  const goalFill = $('#goalFill');
  const goalModal = $('#goalModal');
  let writingGoal = parseInt(localStorage.getItem(STORE_GOAL) || '0', 10) || 0;

  function refreshGoal() {
    if (writingGoal <= 0) {
      goalIndicator.hidden = true;
      return;
    }
    goalIndicator.hidden = false;
    const words = calcStats().words;
    const pct = Math.min(100, Math.round((words / writingGoal) * 100));
    goalLabel.textContent = words + ' / ' + writingGoal + ' (' + pct + '%)';
    goalFill.style.width = Math.min(100, pct) + '%';
    goalFill.classList.toggle('over', words > writingGoal);
  }

  $('#saveGoalBtn').addEventListener('click', () => {
    writingGoal = Math.max(0, parseInt($('#goalTarget').value, 10) || 0);
    try { localStorage.setItem(STORE_GOAL, String(writingGoal)); } catch {}
    refreshGoal();
    closeModal(goalModal);
  });

  setInterval(refreshGoal, 1500);
  refreshGoal();

  // ============================================================
  // FEATURE: Auto-correct (smart quotes + common typos)
  // ============================================================
  const STORE_AC = 'rodmanword:autocorrect';
  const autoCorrectToggle = $('#autoCorrectToggle');
  autoCorrectToggle.checked = localStorage.getItem(STORE_AC) === '1';
  autoCorrectToggle.addEventListener('change', () => {
    localStorage.setItem(STORE_AC, autoCorrectToggle.checked ? '1' : '0');
  });

  const TYPOS = {
    teh: 'the', Teh: 'The',
    recieve: 'receive', Recieve: 'Receive',
    seperate: 'separate', Seperate: 'Separate',
    definately: 'definitely', Definately: 'Definitely',
    occured: 'occurred', Occured: 'Occurred',
    untill: 'until', Untill: 'Until',
    alot: 'a lot', Alot: 'A lot',
    accross: 'across', Accross: 'Across',
    wich: 'which', Wich: 'Which',
    becuase: 'because', Becuase: 'Because',
    thier: 'their', Thier: 'Their',
    youre: "you're", Youre: "You're",
    cant: "can't", Cant: "Can't",
    dont: "don't", Dont: "Don't",
    isnt: "isn't", Isnt: "Isn't",
    wasnt: "wasn't", Wasnt: "Wasn't",
    didnt: "didn't", Didnt: "Didn't",
  };

  function autoCorrectAtCursor() {
    if (!autoCorrectToggle.checked) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const node = range.startContainer;
    if (node.nodeType !== 3) return;
    const text = node.nodeValue;
    const offset = range.startOffset;
    if (offset < 2) return;
    const before = text.slice(0, offset);

    // Replace --|space, ...|space, etc.
    let updated = before
      .replace(/(\s|^)--$/, '$1—')
      .replace(/\.\.\.$/, '…');
    if (updated !== before) {
      const newText = updated + text.slice(offset);
      node.nodeValue = newText;
      const newOffset = updated.length;
      range.setStart(node, newOffset);
      range.setEnd(node, newOffset);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    // Smart quotes: if last char typed is " or ', replace by curly equivalent
    const last = text[offset - 1];
    if (last === '"' || last === "'") {
      const prevChar = offset >= 2 ? text[offset - 2] : '';
      const isOpening = !prevChar || /\s|[\(\[\{]/.test(prevChar);
      const replacement = last === '"'
        ? (isOpening ? '“' : '”')
        : (isOpening ? '‘' : '’');
      node.nodeValue = text.slice(0, offset - 1) + replacement + text.slice(offset);
      range.setStart(node, offset);
      range.setEnd(node, offset);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
  }

  function autoCorrectOnSpace() {
    if (!autoCorrectToggle.checked) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return;
    const node = range.startContainer;
    if (node.nodeType !== 3) return;
    const text = node.nodeValue;
    const offset = range.startOffset;
    // Look backwards for word
    const m = text.slice(0, offset).match(/(\S+)\s$/);
    if (!m) return;
    const word = m[1];
    if (TYPOS[word]) {
      const newText = text.slice(0, offset - word.length - 1) + TYPOS[word] + ' ' + text.slice(offset);
      node.nodeValue = newText;
      const newOffset = offset - word.length - 1 + TYPOS[word].length + 1;
      range.setStart(node, newOffset);
      range.setEnd(node, newOffset);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  editor.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\n')) {
      autoCorrectOnSpace();
    } else if (e.inputType === 'insertText') {
      autoCorrectAtCursor();
    }
  });

  // ============================================================
  // FEATURE: Share link (URL hash with base64-encoded doc)
  // ============================================================
  function buildShareLink() {
    const data = {
      v: 1, t: docTitle.value,
      h: editor.innerHTML,
    };
    const json = JSON.stringify(data);
    let b64;
    try {
      b64 = btoa(unescape(encodeURIComponent(json)));
    } catch {
      b64 = btoa(json);
    }
    const url = location.origin + location.pathname + '#d=' + b64;
    return url;
  }

  function decodeShareLink() {
    const m = (location.hash || '').match(/^#d=(.*)$/);
    if (!m) return null;
    try {
      const json = decodeURIComponent(escape(atob(m[1])));
      return JSON.parse(json);
    } catch {
      try { return JSON.parse(atob(m[1])); } catch { return null; }
    }
  }

  function renderShareView() {
    backstageTitle.textContent = 'Share link';
    const url = buildShareLink();
    const max = 1900;
    const tooLong = url.length > max;
    backstageContent.innerHTML =
      '<p>Anyone with this link will be able to open a copy of this document in their browser.</p>' +
      '<label style="display:flex;flex-direction:column;gap:6px"><span style="color:#666;font-size:12px">Share URL</span>' +
      '<textarea id="shareUrl" rows="4" readonly></textarea></label>' +
      (tooLong
        ? '<p style="color:#b71c1c">⚠ This document is large (' +
          url.length.toLocaleString() + ' characters). The link may not work in all browsers ' +
          '(URL length limits). Consider using <b>Save (.rwd)</b> instead.</p>'
        : '<p class="muted">URL length: ' + url.length.toLocaleString() + ' characters.</p>') +
      '<button class="btn primary" id="copyShareBtn">Copy link</button>';
    const ta = $('#shareUrl');
    ta.value = url;
    $('#copyShareBtn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(url);
        flashStatus('Link copied');
      } catch {
        ta.select();
        document.execCommand('copy');
      }
    });
  }

  // Auto-load shared doc from URL on first load
  (function loadShared() {
    const data = decodeShareLink();
    if (!data) return;
    setTimeout(() => {
      if (confirm('A document was shared via this link. Open it? (Your current document will be replaced; a snapshot is taken first.)')) {
        try { snapshot(); } catch {}
        editor.innerHTML = sanitizeImported(data.h || '');
        if (data.t) docTitle.value = data.t;
        history.replaceState(null, '', location.pathname);
        queueAutosave();
        rebuildOutline();
      }
    }, 100);
  })();

  // ============================================================
  // FEATURE: Lorem ipsum generator
  // ============================================================
  const LOREM_LONG = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
  const LOREM_SHORT = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

  $('#loremBtn').addEventListener('click', () => {
    saveSelection();
    openModal($('#loremModal'));
  });
  $('#loremInsertBtn').addEventListener('click', () => {
    const n = Math.max(1, Math.min(50, parseInt($('#loremCount').value, 10) || 3));
    const short = $('#loremShort').checked;
    const para = short ? LOREM_SHORT : LOREM_LONG;
    const html = Array.from({ length: n }, () => '<p>' + para + '</p>').join('');
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    closeModal($('#loremModal'));
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Reading mode (read-only)
  // ============================================================
  const readingExitBtn = $('#readingExitBtn');
  function enterReadingMode() {
    document.body.classList.add('reading-mode');
    editor.contentEditable = 'false';
    readingExitBtn.hidden = false;
  }
  function exitReadingMode() {
    document.body.classList.remove('reading-mode');
    editor.contentEditable = 'true';
    readingExitBtn.hidden = true;
  }
  $('#readingModeBtn').addEventListener('click', enterReadingMode);
  readingExitBtn.addEventListener('click', exitReadingMode);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('reading-mode')) {
      exitReadingMode();
    }
  });

  // ============================================================
  // FEATURE: Comments / sticky notes
  // ============================================================
  const commentModal = $('#commentModal');
  const commentModalTitle = $('#commentModalTitle');
  const deleteCommentBtn = $('#deleteCommentBtn');
  let pendingCommentRange = null;
  let editingCommentSpan = null;

  function openCommentModalForNew() {
    editingCommentSpan = null;
    commentModalTitle.textContent = 'Add comment';
    deleteCommentBtn.hidden = true;
    $('#commentSelectionPreview').textContent =
      '“' + pendingCommentRange.toString().slice(0, 80) +
      (pendingCommentRange.toString().length > 80 ? '…' : '') + '”';
    $('#commentText').value = '';
    openModal(commentModal);
    setTimeout(() => $('#commentText').focus(), 50);
  }

  function openCommentModalForEdit(span) {
    editingCommentSpan = span;
    pendingCommentRange = null;
    commentModalTitle.textContent = 'Edit comment';
    deleteCommentBtn.hidden = false;
    $('#commentSelectionPreview').textContent =
      '“' + span.textContent.slice(0, 80) + (span.textContent.length > 80 ? '…' : '') + '”';
    $('#commentText').value = span.dataset.comment || '';
    openModal(commentModal);
    setTimeout(() => $('#commentText').focus(), 50);
  }

  $('#commentBtn').addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
      flashStatus('Select text first');
      return;
    }
    pendingCommentRange = sel.getRangeAt(0).cloneRange();
    openCommentModalForNew();
  });

  $('#saveCommentBtn').addEventListener('click', () => {
    const text = $('#commentText').value.trim();
    if (editingCommentSpan) {
      if (text) {
        editingCommentSpan.dataset.comment = text;
        editingCommentSpan.title = text;
        queueAutosave();
      }
      editingCommentSpan = null;
      closeModal(commentModal);
      return;
    }
    if (!text || !pendingCommentRange) {
      closeModal(commentModal);
      return;
    }
    const span = document.createElement('span');
    span.className = 'rwd-comment';
    span.dataset.comment = text;
    span.title = text;
    try {
      span.appendChild(pendingCommentRange.extractContents());
      pendingCommentRange.insertNode(span);
    } catch {}
    pendingCommentRange = null;
    closeModal(commentModal);
    queueAutosave();
  });

  deleteCommentBtn.addEventListener('click', () => {
    if (!editingCommentSpan) return;
    const span = editingCommentSpan;
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    editingCommentSpan = null;
    closeModal(commentModal);
    queueAutosave();
  });

  // Click a comment to edit it via the modal
  editor.addEventListener('click', (e) => {
    const span = e.target.closest && e.target.closest('.rwd-comment');
    if (!span) return;
    e.preventDefault();
    openCommentModalForEdit(span);
  });

  // ============================================================
  // FEATURE: Quick parts (saved snippets)
  // ============================================================
  const STORE_SNIPPETS = 'rodmanword:snippets';
  const quickPartsModal = $('#quickPartsModal');

  function getSnippets() {
    try { return JSON.parse(localStorage.getItem(STORE_SNIPPETS) || '[]'); } catch { return []; }
  }
  function setSnippets(list) {
    try { localStorage.setItem(STORE_SNIPPETS, JSON.stringify(list)); } catch {}
  }

  function renderSnippets() {
    const list = getSnippets();
    const ul = $('#snippetList');
    ul.innerHTML = '';
    if (!list.length) {
      ul.innerHTML = '<li class="empty">No snippets yet — select some text and save it.</li>';
      return;
    }
    list.forEach((snip, i) => {
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(snip.name) + '</span>' +
        '<span class="actions">' +
          '<button data-act="insert">Insert</button>' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="insert"]').addEventListener('click', () => {
        restoreSelection();
        document.execCommand('insertHTML', false, snip.html);
        closeModal(quickPartsModal);
        queueAutosave();
      });
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        const next = getSnippets();
        next.splice(i, 1);
        setSnippets(next);
        renderSnippets();
      });
      ul.appendChild(li);
    });
  }

  $('#quickPartsBtn').addEventListener('click', () => {
    saveSelection();
    renderSnippets();
    openModal(quickPartsModal);
  });

  $('#saveSnippetBtn').addEventListener('click', () => {
    const name = ($('#snippetName').value || '').trim();
    if (!name) { alert('Give the snippet a name first.'); return; }
    const sel = window.getSelection();
    let html;
    if (savedRange && !savedRange.collapsed) {
      const div = document.createElement('div');
      div.appendChild(savedRange.cloneContents());
      html = div.innerHTML;
    } else if (sel && !sel.isCollapsed) {
      const div = document.createElement('div');
      div.appendChild(sel.getRangeAt(0).cloneContents());
      html = div.innerHTML;
    }
    if (!html) {
      alert('Select some text in the document first, then open Quick parts and click Save.');
      return;
    }
    const list = getSnippets();
    list.push({ name, html, at: new Date().toISOString() });
    setSnippets(list);
    $('#snippetName').value = '';
    renderSnippets();
    flashStatus('Snippet saved');
  });

  // ============================================================
  // FEATURE: Change case
  // ============================================================
  const changeCaseSelect = $('#changeCase');
  changeCaseSelect.addEventListener('change', () => {
    const mode = changeCaseSelect.value;
    changeCaseSelect.value = '';
    if (!mode) return;
    restoreSelection();
    const sel = window.getSelection();
    const text = sel ? sel.toString() : '';
    if (!text) {
      alert('Select some text first.');
      return;
    }
    let next;
    switch (mode) {
      case 'upper': next = text.toUpperCase(); break;
      case 'lower': next = text.toLowerCase(); break;
      case 'title':
        next = text.toLowerCase().replace(
          /\b([a-zà-ÿ])/g, (m) => m.toUpperCase()
        );
        break;
      case 'sentence':
        next = text.toLowerCase().replace(
          /(^|[.!?]\s+)([a-zà-ÿ])/g,
          (_, p, c) => p + c.toUpperCase()
        );
        break;
      case 'toggle':
        next = text.split('').map((c) =>
          c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()
        ).join('');
        break;
      default: next = text;
    }
    document.execCommand('insertText', false, next);
    queueAutosave();
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
