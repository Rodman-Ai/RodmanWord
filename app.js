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
  const STORE_HEADER = 'rodmanword:header';
  const STORE_FOOTER = 'rodmanword:footer';
  const STORE_PREFS = 'rodmanword:prefs';
  const STORE_RECENT = 'rodmanword:recent';

  const docHeader = document.getElementById('docHeader');
  const docFooter = document.getElementById('docFooter');

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

  // ============================================================
  // IMPROVEMENT: Color swatches palette + recent colors
  // ============================================================
  const SWATCHES = [
    '#000000','#444444','#666666','#999999','#CCCCCC','#EEEEEE','#FFFFFF','#FFFFFF','#FFFFFF','#FFFFFF',
    '#C00000','#E97132','#FFC000','#70AD47','#4472C4','#7030A0','#B83280','#0F6FC6','#222F3E','#E03E2D',
    '#F2C2C2','#FAD9C0','#FFE9B0','#D2E5C6','#CCD9EE','#D8C7E0','#F2D2DE','#BDDBEF','#A8B2BE','#F2C0BC',
  ];
  const STORE_RECENT_COLOR = 'rodmanword:recentColors';
  let recentColors = [];
  try { recentColors = JSON.parse(localStorage.getItem(STORE_RECENT_COLOR) || '[]'); } catch {}

  function rememberColor(hex) {
    recentColors = [hex, ...recentColors.filter((c) => c !== hex)].slice(0, 10);
    try { localStorage.setItem(STORE_RECENT_COLOR, JSON.stringify(recentColors)); } catch {}
  }

  let activeColorPopup = null;
  function openColorPopup(anchor, applyFn) {
    if (activeColorPopup) activeColorPopup.remove();
    const pop = document.createElement('div');
    pop.className = 'color-popup';
    SWATCHES.forEach((c) => {
      const s = document.createElement('div');
      s.className = 'swatch';
      s.style.background = c;
      s.title = c;
      s.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        applyFn(c);
        rememberColor(c);
        pop.remove();
        activeColorPopup = null;
      });
      pop.appendChild(s);
    });
    if (recentColors.length) {
      const hr = document.createElement('hr');
      pop.appendChild(hr);
      const row = document.createElement('div');
      row.className = 'row';
      row.textContent = 'Recent';
      pop.appendChild(row);
      recentColors.forEach((c) => {
        const s = document.createElement('div');
        s.className = 'swatch';
        s.style.background = c;
        s.title = c;
        s.addEventListener('mousedown', (ev) => {
          ev.preventDefault();
          applyFn(c);
          rememberColor(c);
          pop.remove();
          activeColorPopup = null;
        });
        pop.appendChild(s);
      });
    }
    const more = document.createElement('button');
    more.className = 'pick-btn';
    more.type = 'button';
    more.textContent = 'More colors…';
    more.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.style.position = 'fixed';
      inp.style.opacity = '0';
      document.body.appendChild(inp);
      inp.addEventListener('input', () => {
        applyFn(inp.value);
        rememberColor(inp.value);
        inp.remove();
      });
      inp.addEventListener('change', () => inp.remove());
      inp.click();
      pop.remove();
      activeColorPopup = null;
    });
    pop.appendChild(more);
    const r = anchor.getBoundingClientRect();
    pop.style.left = r.left + 'px';
    pop.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(pop);
    activeColorPopup = pop;
    setTimeout(() => {
      document.addEventListener('mousedown', (ev) => {
        if (!pop.contains(ev.target)) { pop.remove(); activeColorPopup = null; }
      }, { once: true });
    }, 0);
  }

  // Replace native color inputs with swatch popups
  const foreColorBtn = document.querySelector('label.color[title="Font color"]');
  const hiliteColorBtn = document.querySelector('label.color[title="Highlight color"]');
  if (foreColorBtn) {
    const inp = foreColorBtn.querySelector('input');
    if (inp) inp.remove();
    foreColorBtn.style.cursor = 'pointer';
    foreColorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
    });
    foreColorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openColorPopup(foreColorBtn, (c) => exec('foreColor', c));
    });
  }
  if (hiliteColorBtn) {
    const inp = hiliteColorBtn.querySelector('input');
    if (inp) inp.remove();
    hiliteColorBtn.style.cursor = 'pointer';
    hiliteColorBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      saveSelection();
    });
    hiliteColorBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openColorPopup(hiliteColorBtn, (c) => {
        if (!document.execCommand('hiliteColor', false, c)) exec('backColor', c);
        saveSelection();
        queueAutosave();
      });
    });
  }

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

  $('#insertLinkBtn').addEventListener('click', openLinkModal);

  $('#insertDateBtn').addEventListener('click', () => {
    saveSelection();
    $('#calInput').value = new Date().toISOString().slice(0, 10);
    openModal($('#calModal'));
  });
  $('#calInsertBtn').addEventListener('click', () => {
    const v = $('#calInput').value;
    if (!v) { closeModal($('#calModal')); return; }
    const date = new Date(v + 'T00:00:00');
    const fmt = $('#calFormat').value;
    let out;
    switch (fmt) {
      case 'short': out = date.toLocaleDateString(undefined,
        { year: 'numeric', month: 'numeric', day: 'numeric' }); break;
      case 'iso':   out = v; break;
      case 'full':  out = date.toLocaleDateString(undefined,
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); break;
      default: out = date.toLocaleDateString(undefined,
        { year: 'numeric', month: 'long', day: 'numeric' });
    }
    restoreSelection();
    document.execCommand('insertText', false, out);
    closeModal($('#calModal'));
    queueAutosave();
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
  const SYMBOL_CATS = {
    'General': ['©','®','™','§','¶','†','‡','•','…','‰','°','′','″','‴','¦','¬','¤'],
    'Currency': ['€','£','¥','¢','$','₹','₽','₩','₿','₪','₡','₦','₱','₫','₭','₮','₲','₴'],
    'Math': ['±','×','÷','≠','≈','≤','≥','∞','√','∑','∏','∫','∂','∆','∇','∈','∉','∋','∝','∠','⊥','∥','∧','∨','⊕','⊗','∴','∵'],
    'Greek': ['α','β','γ','δ','ε','ζ','η','θ','ι','κ','λ','µ','ν','ξ','ο','π','ρ','σ','τ','υ','φ','χ','ψ','ω','Α','Β','Γ','Δ','Ε','Ζ','Η','Θ','Λ','Π','Σ','Φ','Ψ','Ω'],
    'Arrows': ['←','→','↑','↓','↔','↕','⇐','⇒','⇑','⇓','⇔','↩','↪','↻','↺','⤴','⤵','⤶','⤷'],
    'Shapes': ['★','☆','♥','♦','♣','♠','♪','♫','♩','♬','☀','☁','☂','☃','☎','✓','✗','✉','✿','❀','❤','☮','☯','☘','✪','✦','✧','◆','◇','■','□','●','○','▲','△','▼','▽'],
  };
  const symbolGrid = $('#symbolGrid');

  function renderSymbolCategory(cat) {
    symbolGrid.innerHTML = '';
    // Cat tab strip on top
    const tabs = document.createElement('div');
    tabs.style.cssText = 'grid-column:1/-1;display:flex;gap:4px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px solid var(--ribbon-border);margin-bottom:6px';
    Object.keys(SYMBOL_CATS).forEach((c) => {
      const t = document.createElement('button');
      t.type = 'button';
      t.textContent = c;
      t.style.cssText = 'background:' + (c === cat ? 'var(--active)' : 'transparent') +
        ';border:1px solid var(--ribbon-border);border-radius:3px;padding:2px 8px;font-size:11px;cursor:pointer;color:var(--text)';
      t.addEventListener('click', () => renderSymbolCategory(c));
      tabs.appendChild(t);
    });
    symbolGrid.appendChild(tabs);
    SYMBOL_CATS[cat].forEach((s) => {
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
  }
  renderSymbolCategory(Object.keys(SYMBOL_CATS)[0]);
  $('#insertSymbolBtn').addEventListener('click', () => {
    saveSelection();
    openModal(symbolModal);
  });

  // ---------- Layout ----------
  const pageSize = $('#pageSize');
  const orientation = $('#orientation');
  const margins = $('#margins');

  const columns = $('#columns');

  function applyLayout() {
    page.classList.remove('a4', 'letter', 'legal');
    page.classList.add(pageSize.value);
    page.classList.toggle('landscape', orientation.value === 'landscape');
    page.classList.toggle('portrait', orientation.value === 'portrait');
    page.classList.remove('margins-normal', 'margins-narrow', 'margins-wide');
    page.classList.add('margins-' + margins.value);
    page.classList.remove('cols-1', 'cols-2', 'cols-3');
    if (columns) page.classList.add('cols-' + columns.value);
    savePrefs();
  }

  [pageSize, orientation, margins, columns].filter(Boolean).forEach((el) =>
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

  // ============================================================
  // IMPROVEMENT: Spell-check toggle
  // ============================================================
  const spellToggle = $('#spellToggle');
  if (spellToggle) {
    const stored = localStorage.getItem('rodmanword:spell');
    if (stored === '0') spellToggle.checked = false;
    editor.spellcheck = spellToggle.checked;
    spellToggle.addEventListener('change', () => {
      editor.spellcheck = spellToggle.checked;
      localStorage.setItem('rodmanword:spell', spellToggle.checked ? '1' : '0');
    });
  }

  // ============================================================
  // IMPROVEMENT: Theme picker (Light / Dark / Sepia / High contrast)
  // ============================================================
  const themeSelect = $('#themeSelect');
  if (themeSelect) {
    const storedTheme = localStorage.getItem('rodmanword:theme') || '';
    themeSelect.value = storedTheme;
    document.documentElement.dataset.theme = storedTheme;
    if (darkMode) darkMode.checked = storedTheme === 'dark';
    themeSelect.addEventListener('change', () => {
      document.documentElement.dataset.theme = themeSelect.value;
      if (darkMode) darkMode.checked = themeSelect.value === 'dark';
      localStorage.setItem('rodmanword:theme', themeSelect.value);
    });
  }

  // ============================================================
  // IMPROVEMENT: Ctrl/Cmd + Click on a link opens it in a new tab
  // ============================================================
  editor.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      window.open(a.href, '_blank', 'noopener');
    }
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
        if (docHeader) localStorage.setItem(STORE_HEADER, docHeader.innerHTML);
        if (docFooter) localStorage.setItem(STORE_FOOTER, docFooter.innerHTML);
        statusSaved.textContent = 'Saved';
        if (typeof markClean === 'function') markClean();
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

  // ---------- Dirty indicator + last-edit timestamp ----------
  const dirtyDot = $('#dirtyDot');
  const statusCursor = $('#statusCursor');
  const statusSize = $('#statusSize');
  let isDirty = false;
  let lastEditAt = Date.now();

  function markDirty() {
    isDirty = true;
    dirtyDot.hidden = false;
    lastEditAt = Date.now();
  }
  function markClean() {
    isDirty = false;
    dirtyDot.hidden = true;
  }

  editor.addEventListener('input', queueAutosave);
  editor.addEventListener('input', refreshEmptyState);
  editor.addEventListener('input', markDirty);
  docTitle.addEventListener('input', queueAutosave);
  docTitle.addEventListener('input', markDirty);
  if (docHeader) {
    docHeader.addEventListener('input', queueAutosave);
    docHeader.addEventListener('input', markDirty);
  }
  if (docFooter) {
    docFooter.addEventListener('input', queueAutosave);
    docFooter.addEventListener('input', markDirty);
  }
  refreshEmptyState();

  // beforeunload warning
  window.addEventListener('beforeunload', (e) => {
    if (!isDirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- Cursor position (line:col) ----------
  function updateCursorPos() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    // Compute line/col by scanning text up to cursor
    const before = document.createRange();
    before.setStart(editor, 0);
    before.setEnd(range.endContainer, range.endOffset);
    const text = before.toString();
    const lines = text.split(/\n/);
    const ln = lines.length;
    const col = lines[lines.length - 1].length + 1;
    statusCursor.textContent = 'Ln ' + ln + ', Col ' + col;
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) updateCursorPos();
  });

  // ---------- Document size in KB ----------
  function updateDocSize() {
    const html = editor.innerHTML || '';
    const bytes = new Blob([html]).size;
    statusSize.textContent = bytes < 1024
      ? bytes + ' B'
      : (bytes / 1024).toFixed(1) + ' KB';
  }
  setInterval(updateDocSize, 2000);
  updateDocSize();

  // ---------- Last edit relative time ----------
  function relativeTime(ms) {
    const s = Math.round(ms / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + ' s ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' h ago';
    return new Date(Date.now() - ms).toLocaleString();
  }
  setInterval(() => {
    if (isDirty) return;
    const t = statusSaved.textContent;
    if (t && t.indexOf('Saved') === 0) {
      statusSaved.textContent = 'Saved ' + relativeTime(Date.now() - lastEditAt);
    }
  }, 5000);

  // ---------- Selection-aware word count ----------
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const text = sel.toString();
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    statusWords.textContent = words + ' selected';
  });

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
    const shift = e.shiftKey;
    if (key === 's') {
      e.preventDefault();
      saveDocument();
    } else if (key === 'p') {
      e.preventDefault();
      preparePrint();
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
    } else if (key === 'k') {
      e.preventDefault();
      openLinkModal();
    } else if (key === 'l' && !shift) {
      e.preventDefault();
      exec('justifyLeft');
    } else if (key === 'e') {
      e.preventDefault();
      exec('justifyCenter');
    } else if (key === 'r') {
      e.preventDefault();
      exec('justifyRight');
    } else if (key === 'j') {
      e.preventDefault();
      exec('justifyFull');
    } else if (key === 'l' && shift) {
      e.preventDefault();
      exec('removeFormat');
      toast('Formatting cleared');
    } else if (key === 'enter') {
      e.preventDefault();
      restoreSelection();
      document.execCommand('insertHTML', false,
        '<hr class="page-break" contenteditable="false"/><p><br/></p>');
      queueAutosave();
    } else if (shift && key === 'h') {
      e.preventDefault();
      cycleHeading();
    }
  });

  function cycleHeading() {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest && n.closest('h1,h2,h3,h4,p,blockquote,pre,li');
    const tag = block ? block.tagName : 'P';
    const order = ['P', 'H1', 'H2', 'H3', 'H4'];
    const idx = order.indexOf(tag);
    const next = order[(idx + 1) % order.length];
    exec('formatBlock', next);
  }

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
      case 'export-docx':
        exportDocx();
        closeBackstage();
        break;
      case 'export-pdf':
        exportPdf();
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
      case 'merge':
        closeBackstage();
        openModal($('#mailMergeModal'));
        break;
      case 'compare':
        closeBackstage();
        openModal($('#compareModal'));
        break;
      case 'encrypt':
        closeBackstage();
        $('#encryptPwd').value = '';
        $('#encryptPwd2').value = '';
        openModal($('#encryptModal'));
        break;
      case 'customcss':
        closeBackstage();
        $('#customCss').value = localStorage.getItem('rodmanword:customCss') || '';
        openModal($('#cssModal'));
        break;
      case 'print':
        closeBackstage();
        setTimeout(() => { preparePrint(); window.print(); }, 100);
        break;
      case 'recent':
        renderRecent();
        break;
      case 'about':
        closeBackstage();
        openModal($('#aboutModal'));
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
  async function newDocument() {
    if (isDirty &&
        !(await confirmDialog('Start a new blank document? Unsaved changes will be lost.', 'New document'))) {
      return;
    }
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
      header: docHeader ? docHeader.innerHTML : '',
      footer: docFooter ? docFooter.innerHTML : '',
      layout: {
        size: pageSize.value,
        orientation: orientation.value,
        margins: margins.value
      },
      properties: docProps || {},
      threads: typeof threads === 'object' ? threads : {},
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

  function exportDocx() {
    if (!window.RodmanDocx) {
      toast('docx.js not loaded', 'error');
      return;
    }
    try {
      const blob = window.RodmanDocx.saveDocx(editor.innerHTML, {
        title: docTitle.value,
        header: getHeaderHtml(),
        footer: getFooterHtml(),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(docTitle.value) + '.docx';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast('Exported .docx', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  }

  function exportPdf() {
    if (!window.RodmanPdf) {
      toast('pdfio.js not loaded', 'error');
      return;
    }
    try {
      // Map current page size to PDF media box (points)
      const sizes = {
        a4:     { w: 595, h: 842 },
        letter: { w: 612, h: 792 },
        legal:  { w: 612, h: 1008 },
      };
      const sz = sizes[pageSize.value] || sizes.a4;
      const land = orientation.value === 'landscape';
      const marginsMap = { normal: 72, narrow: 36, wide: 108 };
      const blob = window.RodmanPdf.savePdf(editor.innerHTML, {
        pageW: land ? sz.h : sz.w,
        pageH: land ? sz.w : sz.h,
        margin: marginsMap[margins.value] || 72,
        title: docTitle.value,
        header: getHeaderHtml(),
        footer: getFooterHtml(),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = sanitizeFileName(docTitle.value) + '.pdf';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast('Exported PDF', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
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

  async function decryptRwd(payloadStr) {
    let payload;
    try { payload = JSON.parse(payloadStr); } catch { return null; }
    if (!payload.rwdEnc) return null;
    const pwd = prompt('Password for this document:');
    if (!pwd) return null;
    try {
      const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
      const salt = b64ToBytes(payload.salt);
      const iv = b64ToBytes(payload.iv);
      const ct = b64ToBytes(payload.data);
      const key = await deriveKey(pwd, salt);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return JSON.parse(new TextDecoder().decode(pt));
    } catch {
      toast('Wrong password or corrupted file', 'error');
      return null;
    }
  }

  $('#filePicker').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (/\.rwd\.enc$/i.test(file.name)) {
      const txt = await file.text();
      const data = await decryptRwd(txt);
      e.target.value = '';
      if (!data) return;
      editor.innerHTML = sanitizeImported(data.html || '');
      docTitle.value = data.title || file.name.replace(/\.rwd\.enc$/i, '');
      if (docHeader) docHeader.innerHTML = sanitizeImported(data.header || '');
      if (docFooter) docFooter.innerHTML = sanitizeImported(data.footer || '');
      if (data.threads && typeof data.threads === 'object') {
        threads = data.threads;
        persistThreads();
      }
      if (data.layout) {
        pageSize.value = data.layout.size || pageSize.value;
        orientation.value = data.layout.orientation || orientation.value;
        margins.value = data.layout.margins || margins.value;
        applyLayout();
      }
      applyResolvedClasses();
      rebuildCommentsPane();
      addRecent(docTitle.value);
      queueAutosave();
      closeBackstage();
      return;
    }
    if (/\.docx$/i.test(file.name) ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const buf = await file.arrayBuffer();
        if (!window.RodmanDocx) throw new Error('docx.js not loaded');
        const html = await window.RodmanDocx.loadDocx(buf);
        editor.innerHTML = sanitizeImported(html);
        docTitle.value = file.name.replace(/\.docx$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        rebuildOutline();
        closeBackstage();
        toast('Imported .docx', 'success');
      } catch (err) {
        toast('Could not read this .docx file: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      try {
        const buf = await file.arrayBuffer();
        if (!window.RodmanPdf) throw new Error('pdfio.js not loaded');
        const html = await window.RodmanPdf.loadPdf(buf);
        editor.innerHTML = sanitizeImported(html);
        docTitle.value = file.name.replace(/\.pdf$/i, '');
        addRecent(docTitle.value);
        queueAutosave();
        rebuildOutline();
        closeBackstage();
        toast('Imported PDF text', 'success');
      } catch (err) {
        toast('Could not extract text from PDF: ' + err.message, 'error');
      }
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      if (file.name.endsWith('.rwd') || file.type === 'application/json') {
        try {
          const data = JSON.parse(content);
          editor.innerHTML = sanitizeImported(data.html || '');
          docTitle.value = data.title || file.name.replace(/\.rwd$/, '');
          if (docHeader) docHeader.innerHTML = sanitizeImported(data.header || '');
          if (docFooter) docFooter.innerHTML = sanitizeImported(data.footer || '');
          if (data.threads && typeof data.threads === 'object') {
            threads = data.threads;
            persistThreads();
          }
          if (data.layout) {
            pageSize.value = data.layout.size || pageSize.value;
            orientation.value = data.layout.orientation || orientation.value;
            margins.value = data.layout.margins || margins.value;
            applyLayout();
          }
          applyResolvedClasses();
          rebuildCommentsPane();
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
      const sizeStr = item.size != null
        ? (item.size < 1024 ? item.size + ' B' : (item.size / 1024).toFixed(1) + ' KB')
        : '';
      li.innerHTML = `<button>📄 <b>${escapeHtml(item.title)}</b><br/><small>${dt.toLocaleString()}${sizeStr ? ' • ' + sizeStr : ''}</small></button>`;
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

  // Find search history
  const STORE_FIND_HISTORY = 'rodmanword:findHistory';
  function addFindHistory(term) {
    if (!term) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_FIND_HISTORY) || '[]'); } catch {}
    list = [term, ...list.filter((x) => x !== term)].slice(0, 10);
    try { localStorage.setItem(STORE_FIND_HISTORY, JSON.stringify(list)); } catch {}
    refreshFindHistoryUI();
  }
  function refreshFindHistoryUI() {
    const dl = document.getElementById('findHistory');
    if (!dl) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_FIND_HISTORY) || '[]'); } catch {}
    dl.innerHTML = list.map((t) => '<option value="' + escapeHtml(t) + '"></option>').join('');
  }
  refreshFindHistoryUI();

  function rerunFind() {
    clearFindMarks();
    const term = $('#findInput').value;
    if (!term) { findCount.textContent = ''; return; }
    const matchCase = $('#matchCase').checked;
    const matchWord = $('#matchWord') && $('#matchWord').checked;
    const matchRegex = $('#matchRegex') && $('#matchRegex').checked;
    let pattern;
    try {
      if (matchRegex) {
        pattern = term;
      } else {
        pattern = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (matchWord) pattern = '\\b' + pattern + '\\b';
      }
    } catch {
      findCount.textContent = 'Invalid pattern';
      return;
    }
    let re;
    try {
      re = new RegExp(pattern, matchCase ? 'g' : 'gi');
    } catch {
      findCount.textContent = 'Invalid regex';
      return;
    }
    addFindHistory(term);
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
  if ($('#matchWord')) $('#matchWord').addEventListener('change', rerunFind);
  if ($('#matchRegex')) $('#matchRegex').addEventListener('change', rerunFind);

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
    const header = localStorage.getItem(STORE_HEADER);
    const footer = localStorage.getItem(STORE_FOOTER);
    if (html) editor.innerHTML = html;
    if (title) docTitle.value = title;
    if (header && docHeader) docHeader.innerHTML = header;
    if (footer && docFooter) docFooter.innerHTML = footer;
  }

  // ---------- Init ----------
  loadPrefs();
  restoreFromStorage();
  updateCounts();
  updateToolbarState();
  setInterval(updateCounts, 1500);
  // Outline rebuild after init (function defined later in feature block)
  setTimeout(() => { try { rebuildOutline(); } catch {} }, 0);

  // ============================================================
  // IMPROVEMENT: Undo/redo button state
  // ============================================================
  function refreshUndoRedoState() {
    try {
      const u = document.querySelector('[data-cmd="undo"]');
      const r = document.querySelector('[data-cmd="redo"]');
      if (!u || !r) return;
      const canU = document.queryCommandEnabled && document.queryCommandEnabled('undo');
      const canR = document.queryCommandEnabled && document.queryCommandEnabled('redo');
      u.style.opacity = canU ? '1' : '0.4';
      r.style.opacity = canR ? '1' : '0.4';
    } catch {}
  }
  editor.addEventListener('input', refreshUndoRedoState);
  document.addEventListener('selectionchange', refreshUndoRedoState);
  refreshUndoRedoState();

  // ============================================================
  // IMPROVEMENT: Double-click word → highlight all instances
  // ============================================================
  editor.addEventListener('dblclick', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const word = sel.toString().trim();
    if (!word || word.length < 2 || /\s/.test(word)) return;
    $('#findInput').value = word;
    $('#matchCase').checked = false;
    rerunFind();
    toast('Highlighted ' + findMarks.length + ' matches of "' + word + '"', 'info', 1800);
  });

  // ============================================================
  // IMPROVEMENT: Default font/size preference
  // ============================================================
  const STORE_DEFAULT_FONT = 'rodmanword:defaultFont';
  const STORE_DEFAULT_SIZE = 'rodmanword:defaultSize';
  const savedFont = localStorage.getItem(STORE_DEFAULT_FONT);
  const savedSize = localStorage.getItem(STORE_DEFAULT_SIZE);
  if (savedFont) {
    $('#fontFamily').value = savedFont;
    editor.style.fontFamily = savedFont;
  }
  if (savedSize) {
    $('#fontSize').value = savedSize;
    editor.style.fontSize = savedSize + 'pt';
  }
  $('#fontFamily').addEventListener('change', () => {
    localStorage.setItem(STORE_DEFAULT_FONT, $('#fontFamily').value);
  });
  $('#fontSize').addEventListener('change', () => {
    localStorage.setItem(STORE_DEFAULT_SIZE, $('#fontSize').value);
  });

  // ============================================================
  // IMPROVEMENT: Right-click context menu
  // ============================================================
  function buildContextMenu(items, x, y) {
    const old = document.querySelector('.context-menu');
    if (old) old.remove();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    items.forEach((item) => {
      if (item === '-') {
        const hr = document.createElement('hr');
        menu.appendChild(hr);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = item.label +
        (item.shortcut ? '<span class="shortcut">' + item.shortcut + '</span>' : '');
      b.addEventListener('click', () => {
        item.run();
        menu.remove();
      });
      menu.appendChild(b);
    });
    menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - menu.offsetHeight - 10) + 'px';
    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('mousedown', (ev) => {
        if (!menu.contains(ev.target)) menu.remove();
      }, { once: true });
    }, 0);
  }

  editor.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed && editor.contains(sel.anchorNode);
    saveSelection();
    const items = [];
    if (hasSel) {
      items.push({ label: 'Cut', shortcut: 'Ctrl+X', run: () => $('#cutBtn').click() });
      items.push({ label: 'Copy', shortcut: 'Ctrl+C', run: () => $('#copyBtn').click() });
    }
    items.push({ label: 'Paste', shortcut: 'Ctrl+V', run: () => $('#pasteBtn').click() });
    if (hasSel) {
      items.push('-');
      items.push({ label: 'Bold', shortcut: 'Ctrl+B', run: () => exec('bold') });
      items.push({ label: 'Italic', shortcut: 'Ctrl+I', run: () => exec('italic') });
      items.push({ label: 'Underline', shortcut: 'Ctrl+U', run: () => exec('underline') });
      items.push('-');
      items.push({ label: 'Insert link…', shortcut: 'Ctrl+K', run: () => openLinkModal() });
      items.push({ label: 'Add comment…', run: () => $('#commentBtn').click() });
      items.push('-');
      items.push({ label: 'Highlight all matches', run: () => {
        const word = sel.toString().trim();
        if (word) { $('#findInput').value = word; rerunFind(); }
      }});
    } else {
      items.push('-');
      items.push({ label: 'Find & replace…', shortcut: 'Ctrl+F', run: () => $('#findBtn').click() });
      items.push({ label: 'Insert date', run: () => $('#insertDateBtn').click() });
      items.push({ label: 'Insert symbol…', run: () => $('#insertSymbolBtn').click() });
    }
    buildContextMenu(items, e.clientX, e.clientY);
  });

  // ============================================================
  // IMPROVEMENT: Recent files with size in backstage
  // ============================================================
  // Override addRecent to record size
  const _origAddRecent = addRecent;
  addRecent = function (title) {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(STORE_RECENT) || '[]'); } catch {}
    const size = new Blob([editor.innerHTML]).size;
    const entry = { title, at: new Date().toISOString(), size };
    list = [entry, ...list.filter((x) => x.title !== title)].slice(0, 10);
    localStorage.setItem(STORE_RECENT, JSON.stringify(list));
  };

  // ============================================================
  // FEATURE: Command palette (Ctrl+Shift+P)
  // ============================================================
  const PALETTE = [
    { name: 'New document', shortcut: 'Ctrl+N', run: () => newDocument() },
    { name: 'Open file', shortcut: 'Ctrl+O', run: () => $('#filePicker').click() },
    { name: 'Save document', shortcut: 'Ctrl+S', run: () => saveDocument() },
    { name: 'Print / PDF', shortcut: 'Ctrl+P', run: () => { preparePrint(); window.print(); } },
    { name: 'Find & replace', shortcut: 'Ctrl+F', run: () => $('#findBtn').click() },
    { name: 'Insert link', shortcut: 'Ctrl+K', run: () => openLinkModal() },
    { name: 'Insert table', run: () => $('#insertTableBtn').click() },
    { name: 'Insert image', run: () => $('#insertImageBtn').click() },
    { name: 'Insert symbol', run: () => $('#insertSymbolBtn').click() },
    { name: 'Insert emoji', run: () => $('#insertEmojiBtn').click() },
    { name: 'Insert date', run: () => $('#insertDateBtn').click() },
    { name: 'Insert lorem ipsum', run: () => $('#loremBtn').click() },
    { name: 'Export as Word (.docx)', run: () => exportDocx() },
    { name: 'Export as PDF', run: () => exportPdf() },
    { name: 'Export as HTML', run: () => exportHtml() },
    { name: 'Export as Markdown', run: () => exportMarkdown() },
    { name: 'Export as Text', run: () => exportTxt() },
    { name: 'Insert table of contents', run: () => $('#insertTocBtn').click() },
    { name: 'Insert footnote', run: () => $('#insertFootnoteBtn').click() },
    { name: 'Insert pull quote', run: () => $('#pullQuoteBtn').click() },
    { name: 'Insert equation', run: () => openEquationModalForNew() },
    { name: 'Insert code block', run: () => $('#codeBlockBtn').click() },
    { name: 'Insert word art', run: () => $('#wordArtBtn').click() },
    { name: 'Add bookmark', run: () => $('#bookmarkBtn').click() },
    { name: 'Show bookmarks', run: () => $('#bookmarksMenuBtn').click() },
    { name: 'Add comment', run: () => $('#commentBtn').click() },
    { name: 'Toggle drop cap', run: () => $('#dropCapBtn').click() },
    { name: 'Sort selected lines (A → Z)', run: () => sortSelectedLines(false) },
    { name: 'Sort selected lines (Z → A)', run: () => sortSelectedLines(true) },
    { name: 'Toggle focus mode', shortcut: 'F11', run: () => toggleFocus() },
    { name: 'Toggle reading mode', run: () => $('#readingModeBtn').click() },
    { name: 'Read aloud', run: () => $('#readAloudBtn').click() },
    { name: 'Voice dictation', run: () => $('#dictateBtn').click() },
    { name: 'Word count details', run: () => { renderCountModal(); openModal(countModal); } },
    { name: 'Document properties', run: () => openPropsModal() },
    { name: 'Writing goal…', run: () => { $('#goalTarget').value = writingGoal || 500; openModal(goalModal); } },
    { name: 'Mail merge…', run: () => openModal($('#mailMergeModal')) },
    { name: 'Compare with another document', run: () => openModal($('#compareModal')) },
    { name: 'Watermark…', run: () => $('#watermarkBtn').click() },
    { name: 'Custom CSS…', run: () => { $('#customCss').value = localStorage.getItem('rodmanword:customCss') || ''; openModal($('#cssModal')); } },
    { name: 'Save with password', run: () => { $('#encryptPwd').value=''; $('#encryptPwd2').value=''; openModal($('#encryptModal')); } },
    { name: 'Share link', run: () => { setBackstageView('share'); backstage.hidden = false; } },
    { name: 'Theme: Light', run: () => { themeSelect.value = ''; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Theme: Dark', run: () => { themeSelect.value = 'dark'; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Theme: Sepia', run: () => { themeSelect.value = 'sepia'; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Theme: High contrast', run: () => { themeSelect.value = 'contrast'; themeSelect.dispatchEvent(new Event('change')); } },
    { name: 'Keyboard shortcuts', shortcut: '?', run: () => openModal($('#shortcutsModal')) },
    { name: 'About RodmanWord', run: () => openModal($('#aboutModal')) },
  ];

  const paletteModal = $('#paletteModal');
  const paletteInput = $('#paletteInput');
  const paletteResults = $('#paletteResults');

  function renderPalette(query) {
    const q = (query || '').toLowerCase().trim();
    paletteResults.innerHTML = '';
    const items = !q ? PALETTE : PALETTE.filter((c) =>
      c.name.toLowerCase().includes(q));
    items.slice(0, 30).forEach((c, i) => {
      const li = document.createElement('li');
      if (i === 0) li.classList.add('active');
      li.innerHTML = '<span>' + escapeHtml(c.name) + '</span>' +
        (c.shortcut ? '<span class="shortcut">' + c.shortcut + '</span>' : '');
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        c.run();
        closeModal(paletteModal);
      });
      paletteResults.appendChild(li);
    });
  }

  paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));
  paletteInput.addEventListener('keydown', (e) => {
    const items = Array.from(paletteResults.children);
    const idx = items.findIndex((li) => li.classList.contains('active'));
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items[idx]) items[idx].classList.remove('active');
      const ni = Math.min(items.length - 1, idx + 1);
      if (items[ni]) items[ni].classList.add('active');
      items[ni]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items[idx]) items[idx].classList.remove('active');
      const ni = Math.max(0, idx - 1);
      if (items[ni]) items[ni].classList.add('active');
      items[ni]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const li = items[idx >= 0 ? idx : 0];
      if (li) li.dispatchEvent(new MouseEvent('mousedown'));
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      paletteInput.value = '';
      renderPalette('');
      openModal(paletteModal);
      setTimeout(() => paletteInput.focus(), 50);
    }
  });

  // ============================================================
  // FEATURE: Repeat last action (Ctrl+Alt+Y)
  // ============================================================
  let lastAction = null;
  // Wrap exec to record last action
  const _exec = exec;
  exec = function (cmd, value) {
    lastAction = { kind: 'exec', cmd, value };
    return _exec(cmd, value);
  };
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (!lastAction) { toast('No action to repeat', 'info'); return; }
      if (lastAction.kind === 'exec') exec(lastAction.cmd, lastAction.value);
      toast('Repeated: ' + lastAction.cmd);
    }
  });

  // ============================================================
  // FEATURE: Password-protected .rwd export (AES-GCM)
  // ============================================================
  async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  $('#encryptSaveBtn').addEventListener('click', async () => {
    const p1 = $('#encryptPwd').value;
    const p2 = $('#encryptPwd2').value;
    if (!p1) { toast('Password is empty', 'error'); return; }
    if (p1 !== p2) { toast('Passwords do not match', 'error'); return; }
    const data = JSON.stringify({
      version: 1,
      title: docTitle.value,
      html: editor.innerHTML,
      header: docHeader ? docHeader.innerHTML : '',
      footer: docFooter ? docFooter.innerHTML : '',
      layout: { size: pageSize.value, orientation: orientation.value, margins: margins.value },
      properties: docProps || {},
      threads: typeof threads === 'object' ? threads : {},
      savedAt: new Date().toISOString(),
    });
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const key = await deriveKey(p1, salt);
      const ct = new Uint8Array(await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, new TextEncoder().encode(data)
      ));
      const payload = JSON.stringify({
        rwdEnc: 1,
        salt: bytesToB64(salt),
        iv: bytesToB64(iv),
        data: bytesToB64(ct),
      });
      downloadBlob(payload, sanitizeFileName(docTitle.value) + '.rwd.enc', 'application/octet-stream');
      closeModal($('#encryptModal'));
      toast('Saved encrypted .rwd.enc', 'success');
    } catch (err) {
      toast('Encryption failed: ' + err.message, 'error');
    }
  });

  // ============================================================
  // FEATURE: Custom CSS editor
  // ============================================================
  function applyCustomCss() {
    const css = localStorage.getItem('rodmanword:customCss') || '';
    let style = document.getElementById('rwd-custom-css');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rwd-custom-css';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }
  applyCustomCss();
  $('#saveCssBtn').addEventListener('click', () => {
    localStorage.setItem('rodmanword:customCss', $('#customCss').value);
    applyCustomCss();
    closeModal($('#cssModal'));
    toast('Custom CSS applied', 'success');
  });
  $('#clearCssBtn').addEventListener('click', () => {
    $('#customCss').value = '';
    localStorage.removeItem('rodmanword:customCss');
    applyCustomCss();
    toast('Custom CSS cleared', 'info');
  });

  // ============================================================
  // FEATURE: Mini map in outline pane
  // ============================================================
  const miniMap = $('#miniMap');
  let miniMapCanvas = null, miniMapViewport = null;
  function ensureMiniMap() {
    if (!miniMap) return;
    if (!miniMapCanvas) {
      miniMapCanvas = document.createElement('div');
      miniMapCanvas.className = 'canvas';
      miniMap.appendChild(miniMapCanvas);
      miniMapViewport = document.createElement('div');
      miniMapViewport.className = 'viewport';
      miniMap.appendChild(miniMapViewport);
      miniMap.addEventListener('click', (e) => {
        const ws = document.querySelector('.workspace-main');
        const r = miniMap.getBoundingClientRect();
        const ratio = (e.clientY - r.top) / r.height;
        if (ws) ws.scrollTo({ top: ratio * ws.scrollHeight - 100, behavior: 'smooth' });
      });
    }
  }
  function refreshMiniMap() {
    if (outlinePane.hidden || !miniMap) return;
    ensureMiniMap();
    miniMapCanvas.textContent = (editor.innerText || '').slice(0, 8000);
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const total = ws.scrollHeight;
    const view = ws.clientHeight;
    const top = ws.scrollTop;
    const r = miniMap.getBoundingClientRect();
    miniMapViewport.style.top = (top / total * r.height) + 'px';
    miniMapViewport.style.height = Math.max(20, view / total * r.height) + 'px';
  }
  setInterval(refreshMiniMap, 600);
  document.querySelector('.workspace-main')?.addEventListener('scroll', refreshMiniMap);

  // ============================================================
  // FEATURE: Compare two documents (line diff)
  // ============================================================
  function lineDiff(a, b) {
    // Simple Myers-style longest common subsequence (small docs only)
    const al = a.split(/\r?\n/);
    const bl = b.split(/\r?\n/);
    const m = al.length, n = bl.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (al[i] === bl[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (al[i] === bl[j]) { out.push({ kind: ' ', text: al[i] }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: '-', text: al[i] }); i++; }
      else { out.push({ kind: '+', text: bl[j] }); j++; }
    }
    while (i < m) { out.push({ kind: '-', text: al[i++] }); }
    while (j < n) { out.push({ kind: '+', text: bl[j++] }); }
    return out;
  }

  $('#runCompareBtn').addEventListener('click', () => {
    const other = $('#compareInput').value;
    const me = editor.innerText;
    if (!other.trim()) { $('#compareResult').textContent = 'Paste text first.'; return; }
    if (me.length > 20000 || other.length > 20000) {
      if (!confirm('Documents are large; comparison may be slow. Continue?')) return;
    }
    const diff = lineDiff(me, other);
    const html = diff.map((d) => {
      const cls = d.kind === '+' ? 'add' : d.kind === '-' ? 'del' : '';
      const prefix = d.kind === '+' ? '+ ' : d.kind === '-' ? '- ' : '  ';
      return cls
        ? '<div class="' + cls + '">' + escapeHtml(prefix + d.text) + '</div>'
        : '<div>' + escapeHtml(prefix + d.text) + '</div>';
    }).join('');
    $('#compareResult').innerHTML = html;
  });

  // ============================================================
  // FEATURE: Word definition + Thesaurus (right-click menu items)
  // ============================================================
  function selectedWord() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    const t = sel.toString().trim();
    return /^[\p{L}\p{N}'-]{2,40}$/u.test(t) ? t : '';
  }
  // Hook into the existing context menu by wrapping the listener:
  // The listener is already there; instead we extend it via a delegated listener
  // that adds extra entries when a word is selected.
  document.addEventListener('contextmenu', (e) => {
    if (!editor.contains(e.target)) return;
    const w = selectedWord();
    if (!w) return;
    setTimeout(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return;
      const hr = document.createElement('hr');
      menu.appendChild(hr);
      const def = document.createElement('button');
      def.type = 'button';
      def.innerHTML = 'Define "' + escapeHtml(w) + '"';
      def.addEventListener('click', () => {
        window.open('https://www.merriam-webster.com/dictionary/' +
          encodeURIComponent(w), '_blank', 'noopener');
        menu.remove();
      });
      menu.appendChild(def);
      const th = document.createElement('button');
      th.type = 'button';
      th.innerHTML = 'Synonyms for "' + escapeHtml(w) + '"';
      th.addEventListener('click', () => {
        window.open('https://www.merriam-webster.com/thesaurus/' +
          encodeURIComponent(w), '_blank', 'noopener');
        menu.remove();
      });
      menu.appendChild(th);
    }, 10);
  }, true);

  // ============================================================
  // FEATURE: Watermark
  // ============================================================
  const STORE_WM = 'rodmanword:watermark';
  const watermarkOverlay = $('#watermarkOverlay');

  function applyWatermark() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(STORE_WM) || '{}'); } catch {}
    if (v.on && v.text) {
      watermarkOverlay.textContent = v.text;
      watermarkOverlay.hidden = false;
    } else {
      watermarkOverlay.hidden = true;
    }
  }
  applyWatermark();

  $('#watermarkBtn')?.addEventListener('click', () => {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(STORE_WM) || '{}'); } catch {}
    $('#watermarkText').value = v.text || 'DRAFT';
    $('#watermarkOn').checked = !!v.on;
    openModal($('#watermarkModal'));
  });

  $('#saveWatermarkBtn').addEventListener('click', () => {
    const v = {
      text: $('#watermarkText').value.trim() || 'DRAFT',
      on: $('#watermarkOn').checked,
    };
    try { localStorage.setItem(STORE_WM, JSON.stringify(v)); } catch {}
    applyWatermark();
    closeModal($('#watermarkModal'));
  });

  // ============================================================
  // FEATURE: Readability stats (Flesch reading ease)
  // ============================================================
  function countSyllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!word) return 0;
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/g);
    return matches ? matches.length : 1;
  }

  function readabilityStats() {
    const text = (editor.innerText || '').trim();
    if (!text) return null;
    const words = text.split(/\s+/).filter(Boolean);
    const sentences = (text.match(/[.!?…]+(?=\s|$)/g) || []).length || 1;
    const syllables = words.reduce((s, w) => s + countSyllables(w), 0);
    const wpm = words.length / sentences;
    const spw = syllables / Math.max(1, words.length);
    const flesch = 206.835 - 1.015 * wpm - 84.6 * spw;
    const grade = 0.39 * wpm + 11.8 * spw - 15.59;
    return {
      flesch: flesch.toFixed(1),
      grade: grade.toFixed(1),
      sentences,
      words: words.length,
      syllables,
      avgWordsPerSentence: wpm.toFixed(1),
      avgSyllablesPerWord: spw.toFixed(2),
    };
  }

  function fleschLabel(score) {
    score = parseFloat(score);
    if (score >= 90) return 'Very easy (5th grade)';
    if (score >= 80) return 'Easy (6th)';
    if (score >= 70) return 'Fairly easy (7th)';
    if (score >= 60) return 'Standard (8–9th)';
    if (score >= 50) return 'Fairly difficult (10–12th)';
    if (score >= 30) return 'Difficult (college)';
    return 'Very difficult (graduate)';
  }

  // Extend the existing word-count modal with readability stats
  const origRenderCount = renderCountModal;
  renderCountModal = function () {
    origRenderCount();
    const r = readabilityStats();
    if (!r) return;
    const extra =
      '<hr style="margin:6px 0;border:none;border-top:1px solid var(--ribbon-border)"/>' +
      '<div class="row"><span>Avg. words / sentence</span><b>' + r.avgWordsPerSentence + '</b></div>' +
      '<div class="row"><span>Avg. syllables / word</span><b>' + r.avgSyllablesPerWord + '</b></div>' +
      '<div class="row"><span>Flesch reading ease</span><b>' + r.flesch + '<small style="color:var(--muted);font-weight:400"> &nbsp;' + fleschLabel(r.flesch) + '</small></b></div>' +
      '<div class="row"><span>Flesch-Kincaid grade</span><b>' + r.grade + '</b></div>';
    countBody.innerHTML += extra;
  };

  // ============================================================
  // FEATURE: Mail merge ({{Field}} + CSV)
  // ============================================================
  function parseCsv(txt) {
    const rows = [];
    let i = 0, cell = '', row = [], inQuote = false;
    while (i < txt.length) {
      const c = txt[i];
      if (inQuote) {
        if (c === '"' && txt[i + 1] === '"') { cell += '"'; i += 2; continue; }
        if (c === '"') { inQuote = false; i++; continue; }
        cell += c; i++; continue;
      }
      if (c === '"') { inQuote = true; i++; continue; }
      if (c === ',') { row.push(cell); cell = ''; i++; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      cell += c; i++;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  $('#runMergeBtn').addEventListener('click', () => {
    const csv = $('#mergeCsv').value;
    const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2) {
      $('#mergeStatus').textContent = 'CSV needs a header row and at least one data row.';
      return;
    }
    const headers = rows[0].map((h) => h.trim());
    const data = rows.slice(1);
    const tplHtml = editor.innerHTML;
    const tplTitle = docTitle.value || 'Document';

    // Combine into a single HTML file with one section per row
    let combined = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      escapeHtml(tplTitle) + ' (mail merge)</title>' +
      '<style>body{font-family:Calibri,Arial,sans-serif;max-width:8.5in;margin:1in auto;padding:0 1in;line-height:1.5}' +
      'h1,h2,h3{color:#2b579a}.merge-item{page-break-after:always}</style></head><body>';
    data.forEach((rowVals, idx) => {
      let out = tplHtml;
      headers.forEach((h, j) => {
        const re = new RegExp('\\{\\{\\s*' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\}\\}', 'g');
        out = out.replace(re, escapeHtml(rowVals[j] || ''));
      });
      combined += '<div class="merge-item">' + out + '</div>';
    });
    combined += '</body></html>';
    downloadBlob(combined, sanitizeFileName(tplTitle) + '_merged.html', 'text/html');
    $('#mergeStatus').textContent = 'Generated ' + data.length + ' documents (' + headers.length + ' fields).';
    toast('Mail merge: ' + data.length + ' documents created', 'success');
  });

  // ============================================================
  // FEATURE: Headers & footers (page-level)
  // ============================================================
  function focusEnd(el) {
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#insertHeaderBtn')?.addEventListener('click', () => focusEnd(docHeader));
  $('#insertFooterBtn')?.addEventListener('click', () => focusEnd(docFooter));

  // Insert field dropdown (works in body, header, or footer).
  $('#insertFieldSelect')?.addEventListener('change', (e) => {
    const name = e.target.value;
    e.target.value = '';
    if (!name) return;
    restoreSelection();
    const html = '<span data-field="' + escapeHtml(name) +
      '" contenteditable="false">…</span>';
    document.execCommand('insertHTML', false, html);
    // Refresh now so it shows the right value
    refreshFields();
    queueAutosave();
  });

  // Page-number field: a span that picks up its number from the print
  // stylesheet's CSS counters. In screen view it just shows "1".
  $('#insertPageNumBtn')?.addEventListener('click', () => {
    // If the cursor is in the header/footer, insert there. Otherwise,
    // tell the user where it makes sense.
    const sel = window.getSelection();
    let target = null;
    if (sel && sel.anchorNode) {
      if (docHeader && docHeader.contains(sel.anchorNode)) target = docHeader;
      else if (docFooter && docFooter.contains(sel.anchorNode)) target = docFooter;
    }
    if (!target) {
      toast('Click in the header or footer first', 'info');
      focusEnd(docFooter);
      return;
    }
    const span = '<span class="rwd-pagenum" data-field="page" contenteditable="false"></span>';
    document.execCommand('insertHTML', false, span);
    queueAutosave();
  });

  // Helpers used by exporters
  function getHeaderHtml() { return docHeader ? docHeader.innerHTML : ''; }
  function getFooterHtml() { return docFooter ? docFooter.innerHTML : ''; }
  function getHeaderText() { return docHeader ? (docHeader.innerText || '') : ''; }
  function getFooterText() { return docFooter ? (docFooter.innerText || '') : ''; }

  // Replace {page} / page-number markers with literal placeholders for print
  function footerForPrint() {
    if (!docFooter) return '';
    // Clone, replace .rwd-pagenum with the CSS counter() string
    const clone = docFooter.cloneNode(true);
    clone.querySelectorAll('.rwd-pagenum').forEach((s) => {
      s.outerHTML = '" counter(page) "';
    });
    return clone.textContent;
  }

  // ============================================================
  // FEATURE: Bookmarks (named anchors + jump menu)
  // ============================================================
  const bookmarkBtn = $('#bookmarkBtn');
  const bookmarksMenuBtn = $('#bookmarksMenuBtn');
  const bookmarksPopup = $('#bookmarksPopup');

  if (bookmarkBtn) {
    bookmarkBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || !editor.contains(sel.anchorNode)) {
        toast('Place the cursor in the document first', 'info');
        return;
      }
      const name = prompt('Bookmark name:');
      if (!name) return;
      const id = 'rwd-bm-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      // Remove any existing bookmark with the same id
      const old = document.getElementById(id);
      if (old && old.classList.contains('rwd-bookmark')) {
        const p = old.parentNode;
        while (old.firstChild) p.insertBefore(old.firstChild, old);
        p.removeChild(old);
      }
      const span = document.createElement('span');
      span.className = 'rwd-bookmark';
      span.id = id;
      span.dataset.name = name;
      span.textContent = name;
      const range = sel.getRangeAt(0);
      range.collapse(true);
      range.insertNode(span);
      // Caret after
      const r = document.createRange();
      r.setStartAfter(span);
      r.setEndAfter(span);
      sel.removeAllRanges();
      sel.addRange(r);
      queueAutosave();
      toast('Bookmark "' + name + '" added', 'success');
    });
  }

  if (bookmarksMenuBtn) {
    bookmarksMenuBtn.addEventListener('click', () => {
      const list = editor.querySelectorAll('.rwd-bookmark');
      bookmarksPopup.innerHTML = '';
      if (!list.length) {
        bookmarksPopup.innerHTML = '<div class="empty">No bookmarks yet</div>';
      } else {
        list.forEach((bm) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = bm.dataset.name || bm.id;
          b.addEventListener('click', () => {
            bm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const r = document.createRange();
            r.selectNodeContents(bm);
            r.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
            bookmarksPopup.hidden = true;
          });
          bookmarksPopup.appendChild(b);
        });
        const hr = document.createElement('hr');
        hr.style.cssText = 'border:none;border-top:1px solid var(--ribbon-border);margin:4px 0';
        bookmarksPopup.appendChild(hr);
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.textContent = '🗑 Remove all bookmarks';
        clear.addEventListener('click', () => {
          editor.querySelectorAll('.rwd-bookmark').forEach((b) => {
            const p = b.parentNode;
            while (b.firstChild) p.insertBefore(b.firstChild, b);
            p.removeChild(b);
          });
          queueAutosave();
          bookmarksPopup.hidden = true;
        });
        bookmarksPopup.appendChild(clear);
      }
      const r = bookmarksMenuBtn.getBoundingClientRect();
      bookmarksPopup.style.left = r.left + 'px';
      bookmarksPopup.style.top = (r.bottom + 4) + 'px';
      bookmarksPopup.hidden = false;
      setTimeout(() => {
        document.addEventListener('mousedown', (ev) => {
          if (!bookmarksPopup.contains(ev.target) && ev.target !== bookmarksMenuBtn) {
            bookmarksPopup.hidden = true;
          }
        }, { once: true });
      }, 0);
    });
  }

  // ============================================================
  // FEATURE: Pull quote
  // ============================================================
  $('#pullQuoteBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    let text = '';
    if (sel && !sel.isCollapsed) text = sel.toString();
    if (!text) text = prompt('Quote:', '') || '';
    if (!text) return;
    const author = prompt('Attribution (optional):', '') || '';
    const html = '<blockquote class="pull-quote">' + escapeHtml(text) +
      (author ? '<span class="attribution">— ' + escapeHtml(author) + '</span>' : '') +
      '</blockquote><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Code block with language
  // ============================================================
  $('#codeBlockBtn')?.addEventListener('click', () => {
    const lang = prompt('Language (e.g. js, python):', 'js') || 'text';
    const sel = window.getSelection();
    const code = sel && !sel.isCollapsed ? sel.toString() : '// your code here';
    const html = '<pre class="lang-block" data-lang="' + escapeHtml(lang) + '">' +
      escapeHtml(code) + '</pre><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Word art (decorative title)
  // ============================================================
  $('#wordArtBtn')?.addEventListener('click', () => {
    const sel = window.getSelection();
    let text = sel && !sel.isCollapsed ? sel.toString() : prompt('Title text:', '') || '';
    if (!text) return;
    const html = '<p class="word-art">' + escapeHtml(text) + '</p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // FEATURE: Sort selection (alphabetize lines / list items)
  // ============================================================
  function sortSelectedLines(reverse) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast('Select multiple lines or list items first', 'info');
      return;
    }
    const range = sel.getRangeAt(0);
    // Try to detect if all selected items are list items
    const items = [];
    const start = range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentElement;
    const startLi = start.closest('li');
    if (startLi && range.endContainer && editor.contains(range.endContainer)) {
      const endLi = (range.endContainer.nodeType === 1
        ? range.endContainer
        : range.endContainer.parentElement).closest('li');
      if (endLi && startLi.parentNode === endLi.parentNode) {
        let n = startLi;
        while (n) {
          items.push(n);
          if (n === endLi) break;
          n = n.nextElementSibling;
        }
        if (items.length >= 2) {
          const sorted = [...items].sort((a, b) => {
            const av = a.textContent.toLowerCase();
            const bv = b.textContent.toLowerCase();
            return reverse ? bv.localeCompare(av) : av.localeCompare(bv);
          });
          const parent = startLi.parentNode;
          sorted.forEach((li) => parent.appendChild(li));
          queueAutosave();
          return;
        }
      }
    }
    // Plain text: split by newline
    const text = sel.toString();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) { toast('Select multiple lines first', 'info'); return; }
    const sorted = lines.slice().sort((a, b) =>
      reverse ? b.localeCompare(a) : a.localeCompare(b)
    );
    document.execCommand('insertText', false, sorted.join('\n'));
    queueAutosave();
  }

  // ============================================================
  // IMPROVEMENT: Drop cap toggle on current paragraph
  // ============================================================
  const dropCapBtn = $('#dropCapBtn');
  if (dropCapBtn) {
    dropCapBtn.addEventListener('click', () => {
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode) return;
      let n = sel.anchorNode;
      if (n.nodeType !== 1) n = n.parentElement;
      const para = n.closest('p, blockquote, pre, h1, h2, h3, h4, li');
      if (!para) {
        toast('Place the cursor in a paragraph first', 'info');
        return;
      }
      para.classList.toggle('drop-cap');
      queueAutosave();
    });
  }

  // ============================================================
  // IMPROVEMENT: Auto-TOC inserted at cursor
  // ============================================================
  const insertTocBtn = $('#insertTocBtn');
  if (insertTocBtn) {
    insertTocBtn.addEventListener('click', () => {
      const headings = editor.querySelectorAll('h1, h2, h3');
      if (!headings.length) {
        toast('Add some headings first', 'info');
        return;
      }
      // Remove any prior TOC inserted by us
      const old = editor.querySelector('.rwd-toc');
      if (old) old.remove();
      let html = '<div class="rwd-toc"><h3>Table of contents</h3><ol>';
      headings.forEach((h, i) => {
        if (!h.id) h.id = 'rwd-h-' + i;
        html += '<li class="lvl-' + h.tagName.charAt(1) + '">' +
          '<a href="#' + h.id + '">' + escapeHtml(h.textContent || '') + '</a></li>';
      });
      html += '</ol></div><p><br/></p>';
      restoreSelection();
      document.execCommand('insertHTML', false, html);
      queueAutosave();
      toast('Inserted table of contents', 'success');
    });
  }

  // ============================================================
  // IMPROVEMENT: Footnotes (auto-numbered)
  // ============================================================
  const insertFootnoteBtn = $('#insertFootnoteBtn');
  if (insertFootnoteBtn) {
    insertFootnoteBtn.addEventListener('click', () => {
      const text = prompt('Footnote text:', '');
      if (!text) return;
      restoreSelection();
      // Determine next footnote number
      const existing = editor.querySelectorAll('.rwd-fn-ref');
      const num = existing.length + 1;
      // Ensure footnotes container exists at the end of the editor
      let container = editor.querySelector('.rwd-footnotes');
      if (!container) {
        container = document.createElement('div');
        container.className = 'rwd-footnotes';
        container.contentEditable = 'true';
        container.innerHTML = '<h4 contenteditable="false">Footnotes</h4><ol></ol>';
        editor.appendChild(container);
      }
      const ol = container.querySelector('ol');
      const id = 'rwd-fn-' + Date.now() + '-' + num;
      const li = document.createElement('li');
      li.id = id;
      li.textContent = text;
      ol.appendChild(li);
      const ref = '<sup class="rwd-fn-ref" title="' + escapeHtml(text) +
        '" data-fn="' + id + '">' + num + '</sup>';
      document.execCommand('insertHTML', false, ref);
      queueAutosave();
    });
  }

  // Click footnote ref → jump
  editor.addEventListener('click', (e) => {
    const sup = e.target.closest && e.target.closest('.rwd-fn-ref');
    if (!sup) return;
    const id = sup.dataset.fn;
    if (!id) return;
    const li = document.getElementById(id);
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ============================================================
  // FOUNDATION: Live-field engine ({page}, {pages}, {date}, …)
  // ============================================================
  // Each field is a span with data-field="<name>". On every editor
  // change (and on doc load) we walk all such spans and refresh their
  // text content. Most fields are global; the 'page' field counts
  // page-break HRs that precede the field in document order.
  const FIELDS = {
    page(el) {
      // Count <hr class="page-break"> and equivalent break elements
      // that come before this element in the document.
      let n = 1;
      const breaks = editor.querySelectorAll('hr.page-break, .rwd-section-break');
      breaks.forEach((b) => {
        if (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) n++;
      });
      // The header/footer are children of .page, not .editor — they
      // logically belong to "all pages", so for fields inside them
      // we'd want the rendered page number; on screen, that's "1".
      if (!editor.contains(el)) return '1';
      return String(n);
    },
    pages() {
      const breaks = editor.querySelectorAll('hr.page-break, .rwd-section-break');
      return String(breaks.length + 1);
    },
    date() { return new Date().toLocaleDateString(); },
    time() { return new Date().toLocaleTimeString(); },
    datetime() { return new Date().toLocaleString(); },
    docTitle() { return docTitle.value || 'Document'; },
    author() { return (docProps && docProps.author) || ''; },
    wordCount() {
      try { return calcStats().words.toLocaleString(); } catch { return '0'; }
    },
  };

  function refreshFields(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-field]').forEach((el) => {
      const name = el.dataset.field;
      const fn = FIELDS[name];
      if (fn) {
        try { el.textContent = fn(el); } catch {}
      }
    });
    renumberCaptions();
    refreshCrossRefs();
  }

  // Renumber every .rwd-caption span in document order, grouped by seq type
  function renumberCaptions() {
    const counters = {};
    editor.querySelectorAll('.rwd-caption').forEach((el) => {
      const seq = (el.dataset.seq || 'item').toLowerCase();
      counters[seq] = (counters[seq] || 0) + 1;
      const n = counters[seq];
      const label = (el.dataset.label || (seq.charAt(0).toUpperCase() + seq.slice(1)));
      const text = (el.dataset.text || '').trim();
      el.innerHTML = '<b>' + escapeHtml(label) + ' ' + n + '</b>' +
        (text ? ' — ' + escapeHtml(text) : '');
      // Auto-id for cross-refs that don't already have one
      if (!el.id) el.id = 'rwd-cap-' + seq + '-' + n;
      el.dataset.num = String(n);
    });
  }

  // Resolve every .rwd-xref to its current target text
  function refreshCrossRefs() {
    const targets = collectXrefTargets();
    editor.querySelectorAll('.rwd-xref').forEach((a) => {
      const id = a.dataset.target;
      const kind = a.dataset.kind || 'auto';
      const t = targets[id];
      if (!t) {
        a.textContent = '[broken reference]';
        return;
      }
      if (kind === 'page') a.textContent = String(t.page);
      else if (kind === 'number') a.textContent = String(t.number);
      else if (kind === 'text') a.textContent = t.text;
      else a.textContent = (t.number ? t.number + ' ' : '') + (t.text || '');
      a.title = 'Cross-reference to ' + (t.text || id);
    });
  }

  function collectXrefTargets() {
    const map = {};
    // Headings
    editor.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (!h.id) return;
      map[h.id] = {
        text: h.textContent.trim(),
        number: h.dataset.num || '',
        page: pageNumberOf(h),
      };
    });
    // Captions
    editor.querySelectorAll('.rwd-caption').forEach((c) => {
      if (!c.id) return;
      const label = c.dataset.label || (c.dataset.seq || 'Item');
      map[c.id] = {
        text: c.dataset.text || c.textContent.replace(/^\S+\s\d+\s*[—-]?\s*/, ''),
        number: (label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()) +
                ' ' + (c.dataset.num || ''),
        page: pageNumberOf(c),
      };
    });
    // Bookmarks
    editor.querySelectorAll('.rwd-bookmark').forEach((b) => {
      if (!b.id) return;
      map[b.id] = {
        text: b.dataset.name || b.textContent,
        number: '',
        page: pageNumberOf(b),
      };
    });
    return map;
  }

  function pageNumberOf(el) {
    let n = 1;
    editor.querySelectorAll('hr.page-break, .rwd-section-break').forEach((b) => {
      if (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) n++;
    });
    return n;
  }

  // Insert caption (after current paragraph)
  $('#captionBtn')?.addEventListener('click', () => {
    const seq = prompt('Caption type (figure / table / equation / item):', 'figure');
    if (!seq) return;
    const label = seq.charAt(0).toUpperCase() + seq.slice(1).toLowerCase();
    const text = prompt('Caption text (optional):', '') || '';
    const html = '<p class="rwd-caption" data-seq="' + escapeHtml(seq.toLowerCase()) +
      '" data-label="' + escapeHtml(label) + '" data-text="' +
      escapeHtml(text) + '"></p><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    refreshFields();
    queueAutosave();
  });

  // Insert cross-reference: pick from a list
  $('#crossRefBtn')?.addEventListener('click', () => {
    const targets = collectXrefTargets();
    const ids = Object.keys(targets);
    if (!ids.length) {
      toast('Add a heading, caption, or bookmark first', 'info');
      return;
    }
    const lines = ids.map((id, i) =>
      (i + 1) + '. ' + (targets[id].number || targets[id].text).slice(0, 60));
    const pick = prompt(
      'Reference target — type number:\n' + lines.join('\n'),
      '1'
    );
    const idx = parseInt(pick, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= ids.length) return;
    const kind = prompt(
      'Show as: auto / number / text / page (default: auto)',
      'auto'
    ) || 'auto';
    const id = ids[idx];
    const html = '<a class="rwd-xref" href="#' + escapeHtml(id) +
      '" data-target="' + escapeHtml(id) + '" data-kind="' +
      escapeHtml(kind) + '" contenteditable="false">…</a>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    refreshFields();
    queueAutosave();
  });

  // Click an xref to jump to its target
  editor.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.rwd-xref');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.target;
    const t = id && document.getElementById(id);
    if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // ============================================================
  // FEATURE: Custom paragraph styles (Tier 1, gap #5)
  // ============================================================
  const STORE_STYLES = 'rodmanword:styles';
  let customStyles = {};
  try { customStyles = JSON.parse(localStorage.getItem(STORE_STYLES) || '{}'); } catch {}

  function persistStyles() {
    try { localStorage.setItem(STORE_STYLES, JSON.stringify(customStyles)); } catch {}
  }

  function styleClassName(name) {
    return 'rwd-s-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function applyCustomStylesheet() {
    let style = document.getElementById('rwd-custom-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'rwd-custom-styles';
      document.head.appendChild(style);
    }
    let css = '';
    Object.keys(customStyles).forEach((name) => {
      const s = customStyles[name];
      css += '.editor .' + styleClassName(name) + ' { ' + s.css + ' }\n';
    });
    style.textContent = css;
    refreshCustomStylesDropdown();
    refreshStylesList();
  }

  function refreshCustomStylesDropdown() {
    const sel = $('#customStyleSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Custom style…</option>';
    Object.keys(customStyles).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    sel.value = cur;
  }

  function refreshStylesList() {
    const ul = $('#stylesList');
    if (!ul) return;
    ul.innerHTML = '';
    const names = Object.keys(customStyles);
    if (!names.length) {
      ul.innerHTML = '<li class="empty">No custom styles yet.</li>';
      return;
    }
    names.forEach((name) => {
      const s = customStyles[name];
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(name) +
        ' <small style="color:var(--muted)">&lt;' + escapeHtml(s.baseTag) +
        '&gt;</small></span>' +
        '<span class="actions">' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        delete customStyles[name];
        persistStyles();
        applyCustomStylesheet();
      });
      ul.appendChild(li);
    });
  }

  $('#manageStylesBtn')?.addEventListener('click', () => {
    refreshStylesList();
    openModal($('#stylesModal'));
  });

  $('#saveStyleBtn')?.addEventListener('click', () => {
    const name = $('#styleName').value.trim();
    const baseTag = $('#styleBaseTag').value;
    const css = $('#styleCss').value.trim();
    if (!name || !css) { toast('Name and CSS are required', 'error'); return; }
    customStyles[name] = { baseTag, css };
    persistStyles();
    applyCustomStylesheet();
    $('#styleName').value = '';
    $('#styleCss').value = '';
    toast('Style saved', 'success');
  });

  $('#customStyleSelect')?.addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) return;
    const s = customStyles[name];
    if (!s) return;
    // Apply to the current paragraph: change its tag if needed and add the class.
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li, div');
    if (!block || !editor.contains(block)) {
      toast('Place the cursor in a paragraph first', 'info');
      e.target.value = '';
      return;
    }
    // Convert tag if different from baseTag
    let target = block;
    if (block.tagName.toLowerCase() !== s.baseTag) {
      const newEl = document.createElement(s.baseTag);
      newEl.innerHTML = block.innerHTML;
      Array.from(block.attributes).forEach((a) =>
        newEl.setAttribute(a.name, a.value));
      block.parentNode.replaceChild(newEl, block);
      target = newEl;
    }
    // Strip any other rwd-s-* classes
    target.classList.forEach((c) => {
      if (c.indexOf('rwd-s-') === 0) target.classList.remove(c);
    });
    target.classList.add(styleClassName(name));
    e.target.value = '';
    queueAutosave();
  });

  applyCustomStylesheet();

  // ============================================================
  // FEATURE: Citations + bibliography (Tier 1, gap #8)
  // ============================================================
  const STORE_CITES = 'rodmanword:citations';
  let citations = {};
  try { citations = JSON.parse(localStorage.getItem(STORE_CITES) || '{}'); } catch {}
  function persistCites() {
    try { localStorage.setItem(STORE_CITES, JSON.stringify(citations)); } catch {}
  }

  function citationId(c) {
    return 'cit-' + (c.author || 'anon').toLowerCase().replace(/[^a-z0-9]/g, '') +
      '-' + (c.year || '');
  }

  function renderCitList() {
    const ul = $('#citList');
    if (!ul) return;
    ul.innerHTML = '';
    const ids = Object.keys(citations);
    if (!ids.length) {
      ul.innerHTML = '<li class="empty">No sources yet.</li>';
      return;
    }
    ids.forEach((id) => {
      const c = citations[id];
      const li = document.createElement('li');
      li.innerHTML =
        '<span class="name">' + escapeHtml(c.author || 'Anon') +
        ' (' + escapeHtml(c.year || 'n.d.') + '). ' +
        escapeHtml(c.title || 'Untitled') + '</span>' +
        '<span class="actions">' +
          '<button data-act="insert">Insert</button>' +
          '<button data-act="delete">Delete</button>' +
        '</span>';
      li.querySelector('[data-act="insert"]').addEventListener('click', () => {
        insertCitationRef(id);
        closeModal($('#citationModal'));
      });
      li.querySelector('[data-act="delete"]').addEventListener('click', () => {
        delete citations[id];
        persistCites();
        renderCitList();
      });
      ul.appendChild(li);
    });
  }

  function insertCitationRef(id) {
    const html = '<sup class="rwd-cite" data-cite="' + escapeHtml(id) +
      '" contenteditable="false">[?]</sup>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    refreshCitations();
    queueAutosave();
  }

  function refreshCitations() {
    // Number citations in document order by first occurrence
    const order = {};
    let nextNum = 1;
    editor.querySelectorAll('.rwd-cite').forEach((el) => {
      const id = el.dataset.cite;
      if (!id) return;
      if (!(id in order)) order[id] = nextNum++;
      el.textContent = '[' + order[id] + ']';
      const c = citations[id];
      el.title = c
        ? (c.author || 'Anon') + ' ' + (c.year || '') + ' — ' + (c.title || '')
        : '(missing source)';
    });
    // Auto-update any inserted bibliography to match the order
    editor.querySelectorAll('.rwd-bibliography').forEach((bib) => {
      bib.innerHTML = renderBibliographyHtml(order);
    });
    return order;
  }

  function renderBibliographyHtml(order) {
    const ids = Object.keys(order).sort((a, b) => order[a] - order[b]);
    let html = '<h2>Bibliography</h2><ol>';
    ids.forEach((id) => {
      const c = citations[id];
      const author = (c && c.author) || 'Anon';
      const year = (c && c.year) || 'n.d.';
      const title = (c && c.title) || 'Untitled';
      const source = (c && c.source) || '';
      html += '<li>' + escapeHtml(author) + ' (' + escapeHtml(year) + '). <i>' +
        escapeHtml(title) + '</i>' + (source ? '. ' + escapeHtml(source) : '') +
        '.</li>';
    });
    html += '</ol>';
    return html;
  }

  $('#citationBtn')?.addEventListener('click', () => {
    saveSelection();
    renderCitList();
    openModal($('#citationModal'));
  });

  $('#addSourceBtn')?.addEventListener('click', () => {
    const c = {
      author: $('#citAuthor').value.trim(),
      year: $('#citYear').value.trim(),
      title: $('#citTitle').value.trim(),
      source: $('#citSource').value.trim(),
    };
    if (!c.author && !c.title) {
      toast('Author or title is required', 'error');
      return;
    }
    const id = citationId(c);
    citations[id] = c;
    persistCites();
    $('#citAuthor').value = '';
    $('#citYear').value = '';
    $('#citTitle').value = '';
    $('#citSource').value = '';
    renderCitList();
    toast('Source added', 'success');
  });

  $('#bibliographyBtn')?.addEventListener('click', () => {
    // Replace any existing bibliography
    editor.querySelectorAll('.rwd-bibliography').forEach((b) => b.remove());
    const order = refreshCitations();
    const html = '<div class="rwd-bibliography">' +
      renderBibliographyHtml(order) + '</div><p><br/></p>';
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // Click a citation to view its source
  editor.addEventListener('click', (e) => {
    const sup = e.target.closest && e.target.closest('.rwd-cite');
    if (!sup) return;
    e.preventDefault();
    const c = citations[sup.dataset.cite];
    if (!c) { toast('Source not found in this browser', 'info'); return; }
    toast(c.author + ' (' + c.year + '). ' + c.title +
      (c.source ? ' — ' + c.source : ''), 'info', 4000);
  });

  // Hook citation refresh into the field engine
  const __origRefreshFields = refreshFields;
  refreshFields = function (root) {
    __origRefreshFields(root);
    refreshCitations();
  };

  // Click a caption to edit its text
  editor.addEventListener('dblclick', (e) => {
    const cap = e.target.closest && e.target.closest('.rwd-caption');
    if (!cap) return;
    e.preventDefault();
    const v = prompt('Caption text:', cap.dataset.text || '');
    if (v == null) return;
    cap.dataset.text = v;
    refreshFields();
    queueAutosave();
  });

  let __rwdFieldT;
  editor.addEventListener('input', () => {
    clearTimeout(__rwdFieldT);
    __rwdFieldT = setTimeout(refreshFields, 200);
  });
  // Also refresh after a short delay on init, so restored docs pick up.
  setTimeout(refreshFields, 80);

  // ============================================================
  // FEATURE: Equation editor (LaTeX-style → MathML)
  // ============================================================
  const GREEK_LETTERS = {
    alpha:'α', beta:'β', gamma:'γ', delta:'δ', epsilon:'ε', varepsilon:'ε',
    zeta:'ζ', eta:'η', theta:'θ', vartheta:'ϑ', iota:'ι', kappa:'κ',
    lambda:'λ', mu:'μ', nu:'ν', xi:'ξ', pi:'π', varpi:'ϖ',
    rho:'ρ', varrho:'ϱ', sigma:'σ', varsigma:'ς', tau:'τ', upsilon:'υ',
    phi:'φ', varphi:'ϕ', chi:'χ', psi:'ψ', omega:'ω',
    Gamma:'Γ', Delta:'Δ', Theta:'Θ', Lambda:'Λ', Xi:'Ξ', Pi:'Π',
    Sigma:'Σ', Upsilon:'Υ', Phi:'Φ', Psi:'Ψ', Omega:'Ω',
  };
  const MATH_OPS = {
    pm:'±', mp:'∓', times:'×', div:'÷', cdot:'⋅', ast:'∗', star:'⋆',
    le:'≤', leq:'≤', ge:'≥', geq:'≥', ne:'≠', neq:'≠',
    approx:'≈', equiv:'≡', sim:'∼', simeq:'≃', cong:'≅',
    propto:'∝', perp:'⊥', parallel:'∥',
    to:'→', rightarrow:'→', leftarrow:'←', leftrightarrow:'↔',
    Rightarrow:'⇒', Leftarrow:'⇐', Leftrightarrow:'⇔',
    infty:'∞', emptyset:'∅', forall:'∀', exists:'∃', neg:'¬',
    in:'∈', notin:'∉', subset:'⊂', supset:'⊃', subseteq:'⊆', supseteq:'⊇',
    cup:'∪', cap:'∩', setminus:'∖',
    sum:'∑', prod:'∏', coprod:'∐', int:'∫', oint:'∮', iint:'∬', iiint:'∭',
    partial:'∂', nabla:'∇', surd:'√',
    angle:'∠', triangle:'△', square:'□', diamond:'⋄',
    aleph:'ℵ', hbar:'ℏ', ell:'ℓ', Re:'ℜ', Im:'ℑ', wp:'℘',
    ldots:'…', cdots:'⋯', vdots:'⋮', ddots:'⋱',
    lfloor:'⌊', rfloor:'⌋', lceil:'⌈', rceil:'⌉',
    langle:'⟨', rangle:'⟩',
    cdot:'⋅', circ:'∘', bullet:'∙',
  };
  const MATH_FUNCTIONS = new Set([
    'sin','cos','tan','sec','csc','cot',
    'sinh','cosh','tanh',
    'arcsin','arccos','arctan',
    'log','ln','lg','exp',
    'min','max','sup','inf','lim','liminf','limsup',
    'det','dim','gcd','arg','deg','ker','hom',
  ]);

  function escMath(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function latexToMathML(input, displayMode) {
    if (!input || !input.trim()) return '';
    const src = String(input);
    let pos = 0;

    const peek = () => src[pos];
    const advance = () => src[pos++];
    const eatSpace = () => { while (pos < src.length && /\s/.test(src[pos])) pos++; };

    function parseExpr(stopAt) {
      eatSpace();
      const parts = [];
      while (pos < src.length) {
        const c = peek();
        if (stopAt && c === stopAt) break;
        if (c === '}') break;
        const atom = parseAtom();
        if (atom != null) parts.push(atom);
        eatSpace();
      }
      if (parts.length === 0) return '';
      if (parts.length === 1) return parts[0];
      return '<mrow>' + parts.join('') + '</mrow>';
    }

    function parseGroupArg() {
      eatSpace();
      if (peek() === '{') {
        advance();
        const inner = parseExpr();
        if (peek() === '}') advance();
        return inner || '<mrow></mrow>';
      }
      const a = parseAtom();
      return a || '<mrow></mrow>';
    }

    function attachScripts(base) {
      eatSpace();
      let sub = null, sup = null;
      while (peek() === '^' || peek() === '_') {
        const c = advance();
        const arg = parseGroupArg();
        if (c === '^') sup = arg;
        else sub = arg;
        eatSpace();
      }
      if (sub != null && sup != null) return '<msubsup>' + base + sub + sup + '</msubsup>';
      if (sub != null) return '<msub>' + base + sub + '</msub>';
      if (sup != null) return '<msup>' + base + sup + '</msup>';
      return base;
    }

    function parseNumber() {
      let s = '';
      while (pos < src.length && /[0-9.]/.test(src[pos])) s += src[pos++];
      return attachScripts('<mn>' + s + '</mn>');
    }

    function parseCommand() {
      advance(); // consume backslash
      let name = '';
      while (pos < src.length && /[a-zA-Z]/.test(src[pos])) name += src[pos++];
      if (!name) {
        // Escaped char (e.g. \{ \} \% \$ )
        if (pos < src.length) {
          const c = advance();
          return '<mo>' + escMath(c) + '</mo>';
        }
        return '';
      }
      if (name === 'frac' || name === 'tfrac' || name === 'dfrac') {
        const num = parseGroupArg();
        const den = parseGroupArg();
        return attachScripts('<mfrac>' + num + den + '</mfrac>');
      }
      if (name === 'binom' || name === 'choose') {
        const top = parseGroupArg();
        const bot = parseGroupArg();
        return attachScripts(
          '<mfenced open="(" close=")"><mfrac linethickness="0">' +
          top + bot + '</mfrac></mfenced>'
        );
      }
      if (name === 'sqrt') {
        eatSpace();
        let degree = null;
        if (peek() === '[') {
          advance();
          let body = '';
          while (pos < src.length && peek() !== ']') body += advance();
          if (peek() === ']') advance();
          degree = '<mn>' + escMath(body) + '</mn>';
        }
        const arg = parseGroupArg();
        if (degree) return attachScripts('<mroot>' + arg + degree + '</mroot>');
        return attachScripts('<msqrt>' + arg + '</msqrt>');
      }
      if (name === 'overline' || name === 'bar') {
        const arg = parseGroupArg();
        return attachScripts('<mover>' + arg + '<mo>‾</mo></mover>');
      }
      if (name === 'hat' || name === 'widehat') {
        const arg = parseGroupArg();
        return attachScripts('<mover>' + arg + '<mo>^</mo></mover>');
      }
      if (name === 'vec') {
        const arg = parseGroupArg();
        return attachScripts('<mover>' + arg + '<mo>→</mo></mover>');
      }
      if (name === 'underline') {
        const arg = parseGroupArg();
        return attachScripts('<munder>' + arg + '<mo>_</mo></munder>');
      }
      if (name === 'left') {
        eatSpace();
        const open = advance() || '';
        const inner = parseExpr();
        // expect \right<close>
        if (src.slice(pos, pos + 6) === '\\right') pos += 6;
        eatSpace();
        const close = peek() === '.' ? '' : (advance() || '');
        return attachScripts(
          '<mfenced open="' + escMath(open) + '" close="' + escMath(close) + '">' +
          inner + '</mfenced>'
        );
      }
      if (name === 'mathbb' || name === 'mathbf' || name === 'mathit' ||
          name === 'mathrm' || name === 'mathcal' || name === 'mathsf' ||
          name === 'mathtt' || name === 'boldsymbol' || name === 'text') {
        const arg = parseGroupArg();
        const styleMap = {
          mathbb: 'double-struck', mathbf: 'bold', mathit: 'italic',
          mathrm: 'normal', mathcal: 'script', mathsf: 'sans-serif',
          mathtt: 'monospace', boldsymbol: 'bold-italic', text: 'normal',
        };
        return '<mstyle mathvariant="' + styleMap[name] + '">' + arg + '</mstyle>';
      }
      if (GREEK_LETTERS[name]) {
        return attachScripts('<mi>' + GREEK_LETTERS[name] + '</mi>');
      }
      if (MATH_OPS[name]) {
        const op = '<mo>' + MATH_OPS[name] + '</mo>';
        // sum/int/prod with limits attach scripts as mover/munder if found
        if (['sum', 'prod', 'coprod', 'int', 'oint', 'lim', 'liminf', 'limsup'].includes(name)) {
          return parseLimits(op, /^(sum|prod|coprod|lim)/.test(name));
        }
        return op;
      }
      if (MATH_FUNCTIONS.has(name)) {
        return attachScripts('<mi mathvariant="normal">' + name + '</mi>');
      }
      // Unknown command: render as text
      return '<mi>' + escMath(name) + '</mi>';
    }

    function parseLimits(opHtml, useUnderOver) {
      eatSpace();
      let sub = null, sup = null;
      while (peek() === '^' || peek() === '_') {
        const c = advance();
        const arg = parseGroupArg();
        if (c === '^') sup = arg;
        else sub = arg;
        eatSpace();
      }
      if (sub != null && sup != null) {
        const tag = useUnderOver ? 'munderover' : 'msubsup';
        return '<' + tag + '>' + opHtml + sub + sup + '</' + tag + '>';
      }
      if (sub != null) {
        const tag = useUnderOver ? 'munder' : 'msub';
        return '<' + tag + '>' + opHtml + sub + '</' + tag + '>';
      }
      if (sup != null) {
        const tag = useUnderOver ? 'mover' : 'msup';
        return '<' + tag + '>' + opHtml + sup + '</' + tag + '>';
      }
      return opHtml;
    }

    function parseAtom() {
      eatSpace();
      if (pos >= src.length) return null;
      const c = peek();
      if (c === '{') {
        advance();
        const inner = parseExpr();
        if (peek() === '}') advance();
        return attachScripts(inner || '<mrow></mrow>');
      }
      if (c === '\\') return parseCommand();
      if (/[0-9]/.test(c)) return parseNumber();
      if (/[a-zA-Z]/.test(c)) {
        advance();
        return attachScripts('<mi>' + escMath(c) + '</mi>');
      }
      if (c === '(' || c === ')' || c === '[' || c === ']' || c === '|') {
        advance();
        return '<mo>' + escMath(c) + '</mo>';
      }
      if ('+-=*/<>,;:.!?'.includes(c)) {
        advance();
        return '<mo>' + escMath(c) + '</mo>';
      }
      // Unknown char; emit as text
      advance();
      return c.trim() ? '<mtext>' + escMath(c) + '</mtext>' : null;
    }

    let body;
    try { body = parseExpr(); } catch { body = ''; }
    if (!body) return '';
    return '<math xmlns="http://www.w3.org/1998/Math/MathML" display="' +
      (displayMode ? 'block' : 'inline') + '">' + body + '</math>';
  }

  // -------- Equation modal wiring --------
  const equationModal = $('#equationModal');
  const equationInput = $('#equationInput');
  const equationPreview = $('#equationPreview');
  const equationDisplay = $('#equationDisplay');
  const equationModalTitle = $('#equationModalTitle');
  const equationDeleteBtn = $('#equationDeleteBtn');
  const equationPalette = $('#equationPalette');
  let editingEquationSpan = null;

  const PALETTE_ITEMS = [
    { label: '𝛼', insert: '\\alpha ' },
    { label: '𝛽', insert: '\\beta ' },
    { label: '𝜋', insert: '\\pi ' },
    { label: '∞', insert: '\\infty ' },
    { label: '±', insert: '\\pm ' },
    { label: '≤', insert: '\\le ' },
    { label: '≥', insert: '\\ge ' },
    { label: '≠', insert: '\\ne ' },
    { label: '→', insert: '\\to ' },
    { label: 'ⁿ', insert: '^{}' , caretBack: 1 },
    { label: 'ₙ', insert: '_{}' , caretBack: 1 },
    { label: 'a/b', insert: '\\frac{}{}', caretBack: 3 },
    { label: '√', insert: '\\sqrt{}', caretBack: 1 },
    { label: 'ⁿ√', insert: '\\sqrt[]{}', caretBack: 3 },
    { label: '∑', insert: '\\sum_{i=1}^{n} ' },
    { label: '∫', insert: '\\int_{a}^{b} ' },
    { label: '∏', insert: '\\prod_{}^{} ', caretBack: 5 },
    { label: '𝑥̂', insert: '\\hat{x}', caretBack: 2 },
    { label: '𝑥̄', insert: '\\bar{x}', caretBack: 2 },
    { label: '⃗', insert: '\\vec{}', caretBack: 1 },
    { label: '(…)', insert: '\\left( \\right) ', caretBack: 9 },
  ];

  function buildPalette() {
    if (!equationPalette) return;
    equationPalette.innerHTML = '';
    PALETTE_ITEMS.forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.label;
      b.title = p.insert.trim();
      b.addEventListener('click', () => insertAtCursor(p.insert, p.caretBack || 0));
      equationPalette.appendChild(b);
    });
  }
  buildPalette();

  function insertAtCursor(text, caretBack) {
    const ta = equationInput;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    ta.value = before + text + after;
    const newPos = start + text.length - (caretBack || 0);
    ta.selectionStart = ta.selectionEnd = newPos;
    ta.focus();
    refreshPreview();
  }

  function refreshPreview() {
    const tex = equationInput.value;
    const display = equationDisplay.checked;
    if (!tex.trim()) {
      equationPreview.innerHTML =
        '<span class="muted">Preview will appear here</span>';
      return;
    }
    try {
      const mml = latexToMathML(tex, display);
      equationPreview.innerHTML = mml || '<span class="err">Empty</span>';
    } catch (err) {
      equationPreview.innerHTML = '<span class="err">' + escMath(err.message) + '</span>';
    }
  }

  equationInput?.addEventListener('input', refreshPreview);
  equationDisplay?.addEventListener('change', refreshPreview);

  function openEquationModalForNew() {
    editingEquationSpan = null;
    equationModalTitle.textContent = 'Insert equation';
    equationDeleteBtn.hidden = true;
    equationInput.value = '';
    equationDisplay.checked = false;
    refreshPreview();
    saveSelection();
    openModal(equationModal);
    setTimeout(() => equationInput.focus(), 50);
  }

  function openEquationModalForEdit(span) {
    editingEquationSpan = span;
    equationModalTitle.textContent = 'Edit equation';
    equationDeleteBtn.hidden = false;
    equationInput.value = span.dataset.tex || '';
    equationDisplay.checked = span.classList.contains('display');
    refreshPreview();
    openModal(equationModal);
    setTimeout(() => equationInput.focus(), 50);
  }

  $('#equationBtn')?.addEventListener('click', openEquationModalForNew);

  $('#equationInsertBtn')?.addEventListener('click', () => {
    const tex = equationInput.value.trim();
    if (!tex) { closeModal(equationModal); return; }
    const display = equationDisplay.checked;
    const mml = latexToMathML(tex, display);
    if (!mml) {
      toast('Could not render equation', 'error');
      return;
    }
    if (editingEquationSpan) {
      editingEquationSpan.dataset.tex = tex;
      editingEquationSpan.innerHTML = mml;
      editingEquationSpan.classList.toggle('display', display);
      editingEquationSpan = null;
      closeModal(equationModal);
      queueAutosave();
      return;
    }
    const cls = 'rwd-equation' + (display ? ' display' : '');
    const html = '<span class="' + cls + '" contenteditable="false" data-tex="' +
      escapeHtml(tex) + '">' + mml + '</span>' + (display ? '<p><br/></p>' : '');
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    closeModal(equationModal);
    queueAutosave();
  });

  equationDeleteBtn?.addEventListener('click', () => {
    if (!editingEquationSpan) return;
    editingEquationSpan.remove();
    editingEquationSpan = null;
    closeModal(equationModal);
    queueAutosave();
  });

  // Click an inserted equation to re-edit it
  editor.addEventListener('click', (e) => {
    const span = e.target.closest && e.target.closest('.rwd-equation');
    if (!span) return;
    e.preventDefault();
    openEquationModalForEdit(span);
  });

  // ============================================================
  // IMPROVEMENT: Inline math via $...$
  // ============================================================
  function processInlineMath() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const before = text.slice(0, offset - 1);
    const m = before.match(/\$([^$\n]{1,80})\$$/);
    if (!m) return;
    const start = offset - 1 - m[0].length;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset - 1);
    r.deleteContents();
    const span = document.createElement('span');
    span.className = 'rwd-math';
    span.textContent = m[1]
      .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β').replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ').replace(/\\theta/g, 'θ').replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'µ').replace(/\\pi/g, 'π').replace(/\\sigma/g, 'σ')
      .replace(/\\phi/g, 'φ').replace(/\\omega/g, 'ω').replace(/\\sum/g, '∑')
      .replace(/\\int/g, '∫').replace(/\\sqrt/g, '√').replace(/\\infty/g, '∞')
      .replace(/\\pm/g, '±').replace(/\\le/g, '≤').replace(/\\ge/g, '≥')
      .replace(/\\ne/g, '≠').replace(/\\to/g, '→');
    r.insertNode(span);
    placeCaretAfter(span);
  }
  editor.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && e.data === ' ') {
      processInlineMath();
    }
  });

  // ============================================================
  // IMPROVEMENT: Writing-goal completion celebration
  // ============================================================
  let goalCelebrated = false;
  const _origRefreshGoal = refreshGoal;
  refreshGoal = function () {
    _origRefreshGoal();
    if (writingGoal <= 0) { goalCelebrated = false; return; }
    const words = calcStats().words;
    if (words >= writingGoal && !goalCelebrated) {
      goalCelebrated = true;
      toast('🎉 Goal reached! ' + words + ' / ' + writingGoal + ' words', 'success', 4000);
      goalFill.classList.add('celebrate');
      setTimeout(() => goalFill.classList.remove('celebrate'), 4000);
    } else if (words < writingGoal) {
      goalCelebrated = false;
    }
  };

  // ============================================================
  // IMPROVEMENT: Print page numbers + date header (via @page rules)
  // ============================================================
  function preparePrint() {
    const pageEl = document.getElementById('page');
    if (!pageEl) return;
    const titleStr = (docTitle.value || 'Document').replace(/"/g, '\\"');
    const dateStr = new Date().toLocaleDateString().replace(/"/g, '\\"');
    pageEl.dataset.printTitle = titleStr;
    pageEl.dataset.printDate = dateStr;

    const headerText = getHeaderText().trim();
    const footerHasFields = docFooter && docFooter.querySelector('.rwd-pagenum');

    // Build @bottom-center / @top-center contributions from the
    // user-edited header and footer; fall back to title + page numbers.
    const old = document.getElementById('rwd-print-style');
    if (old) old.remove();
    const style = document.createElement('style');
    style.id = 'rwd-print-style';

    // The footer can include a page-number field; for that we need to
    // emit `counter(page)` in the content string (not the literal text).
    let bottomCenter;
    if (footerHasFields || (docFooter && docFooter.innerText.trim())) {
      const clone = docFooter.cloneNode(true);
      // Replace any .rwd-pagenum with a literal marker we can swap into a content string
      clone.querySelectorAll('.rwd-pagenum').forEach((s) => {
        s.replaceWith('PAGE');
      });
      const raw = clone.textContent;
      // Build content fragments split by the marker so we can interleave
      // counter(page) between them.
      const parts = raw.split('PAGE');
      const fragments = [];
      parts.forEach((p, i) => {
        if (p) fragments.push('"' + p.replace(/"/g, '\\"') + '"');
        if (i < parts.length - 1) fragments.push('counter(page)');
      });
      bottomCenter = fragments.join(' ');
    } else {
      bottomCenter = '"' + titleStr + '"';
    }

    let topCenter = '"' + titleStr + '"';
    if (headerText) topCenter = '"' + headerText.replace(/"/g, '\\"') + '"';

    style.textContent = '@page { ' +
      '@top-center { content: ' + topCenter +
      '; font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '@bottom-center { content: ' + bottomCenter +
      '; font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '@bottom-right { content: counter(page) " / " counter(pages); font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '@bottom-left { content: "' + dateStr + '"; font-family: sans-serif; font-size: 9pt; color: #666; } ' +
      '}';
    document.head.appendChild(style);
  }

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
  // IMPROVEMENT: Toast notifications
  // ============================================================
  const toastContainer = $('#toastContainer');
  function toast(msg, kind = 'info', durationMs = 2500) {
    if (!toastContainer) { flashStatus(msg); return; }
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => {
      t.style.opacity = 0;
      t.style.transition = 'opacity 0.3s';
      setTimeout(() => t.remove(), 300);
    }, durationMs);
  }

  // ============================================================
  // IMPROVEMENT: Custom confirm dialog
  // ============================================================
  const confirmModal = $('#confirmModal');
  function confirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
      $('#confirmTitle').textContent = title;
      $('#confirmMessage').textContent = message;
      confirmModal.hidden = false;
      const ok = $('#confirmOk');
      const cancel = $('#confirmCancel');
      function cleanup(result) {
        confirmModal.hidden = true;
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  // ============================================================
  // IMPROVEMENT: Link insertion modal (replaces prompt)
  // ============================================================
  const linkModal = $('#linkModal');
  function openLinkModal() {
    const sel = window.getSelection();
    const selText = sel && sel.toString() ? sel.toString() : '';
    saveSelection();
    $('#linkText').value = selText;
    $('#linkUrl').value = 'https://';
    linkModal.hidden = false;
    setTimeout(() => $('#linkUrl').focus(), 50);
  }
  $('#insertLinkConfirm').addEventListener('click', () => {
    const text = $('#linkText').value.trim();
    const url = $('#linkUrl').value.trim();
    if (!url) { closeModal(linkModal); return; }
    restoreSelection();
    if (text) {
      document.execCommand('insertHTML', false,
        '<a href="' + escapeHtml(url) + '">' + escapeHtml(text) + '</a>');
    } else {
      document.execCommand('createLink', false, url);
    }
    closeModal(linkModal);
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: Drag-and-drop file to open
  // ============================================================
  ['dragover', 'drop'].forEach((evt) => {
    document.addEventListener(evt, (e) => {
      if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
      }
    });
  });
  document.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const f = files[0];
    if (f.type.startsWith('image/')) return; // image-drop handled by editor listener
    if (!editor.contains(e.target) ||
        /\.(rwd|html?|txt|md|docx|pdf)$/i.test(f.name) ||
        f.type === 'application/json' ||
        f.type === 'application/pdf' ||
        f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      e.preventDefault();
      const dt = new DataTransfer();
      dt.items.add(f);
      const picker = $('#filePicker');
      picker.files = dt.files;
      picker.dispatchEvent(new Event('change'));
    }
  });

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
    const target = selectedImg.parentElement && selectedImg.parentElement.tagName === 'FIGURE'
      ? selectedImg.parentElement : selectedImg;

    if (a === 'small' || a === 'medium' || a === 'full') {
      selectedImg.classList.remove('rwd-img-small', 'rwd-img-medium', 'rwd-img-full');
      selectedImg.classList.add('rwd-img-' + a);
    } else if (a === 'align-left' || a === 'align-center' || a === 'align-right') {
      target.classList.remove('rwd-img-left', 'rwd-img-center', 'rwd-img-right');
      target.classList.add('rwd-img-' + a.replace('align-', ''));
    } else if (a === 'caption') {
      let figure = selectedImg.closest('figure');
      let cap = figure ? figure.querySelector('figcaption') : null;
      const current = cap ? cap.textContent : '';
      const v = prompt('Caption:', current);
      if (v === null) return;
      if (!figure && v.trim()) {
        figure = document.createElement('figure');
        const parent = selectedImg.parentNode;
        parent.insertBefore(figure, selectedImg);
        figure.appendChild(selectedImg);
      }
      if (figure) {
        cap = figure.querySelector('figcaption');
        if (!v.trim()) {
          if (cap) cap.remove();
          if (figure.children.length === 1) {
            figure.parentNode.insertBefore(figure.firstElementChild, figure);
            figure.remove();
          }
        } else {
          if (!cap) {
            cap = document.createElement('figcaption');
            figure.appendChild(cap);
          }
          cap.textContent = v;
        }
      }
    } else if (a === 'rotate-l' || a === 'rotate-r') {
      const cur = parseInt(selectedImg.dataset.rotate || '0', 10);
      const next = (cur + (a === 'rotate-r' ? 90 : -90)) % 360;
      const norm = (next + 360) % 360;
      selectedImg.dataset.rotate = norm;
      selectedImg.style.transform = 'rotate(' + norm + 'deg)';
    } else if (a === 'alt') {
      const v = prompt('Alt text:', selectedImg.alt || '');
      if (v !== null) selectedImg.alt = v;
    } else if (a === 'delete') {
      const fig = selectedImg.closest('figure');
      (fig || selectedImg).remove();
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
      // Count words from this heading until the next heading
      let wc = 0;
      let n = h.nextElementSibling;
      while (n && !/^H[1-6]$/.test(n.tagName)) {
        wc += (n.textContent || '').split(/\s+/).filter(Boolean).length;
        n = n.nextElementSibling;
      }
      li.innerHTML = '<span>' + escapeHtml(h.textContent || '(empty heading)') +
                     '</span><span class="wc">' + wc + 'w</span>';
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
    const oc = document.getElementById('outlineCount');
    if (oc) oc.textContent = headings.length + ' heading' + (headings.length === 1 ? '' : 's');
  }

  // ============================================================
  // IMPROVEMENT: Outline pane resize handle
  // ============================================================
  (function setupOutlineResize() {
    const handle = document.getElementById('outlineResize');
    if (!handle) return;
    let dragging = false;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.body.style.cursor = 'col-resize';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const next = Math.min(480, Math.max(160, e.clientX));
      outlinePane.style.width = next + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.cursor = '';
    });
  })();

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

      const tw = document.createElement('button');
      tw.className = 'focus-mode-exit';
      tw.style.right = '180px';
      tw.textContent = 'Typewriter mode';
      tw.addEventListener('click', () => {
        document.body.classList.toggle('typewriter');
        tw.textContent = document.body.classList.contains('typewriter')
          ? 'Standard view' : 'Typewriter mode';
        if (document.body.classList.contains('typewriter')) centerCurrentLine();
      });
      document.body.appendChild(tw);
    }
    editor.focus();
  }

  function centerCurrentLine() {
    if (!document.body.classList.contains('typewriter')) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getClientRects()[0];
    if (!rect) return;
    const ws = document.querySelector('.workspace-main');
    if (!ws) return;
    const target = rect.top + ws.scrollTop - window.innerHeight / 2;
    ws.scrollTo({ top: target, behavior: 'smooth' });
  }
  document.addEventListener('selectionchange', () => {
    if (document.body.classList.contains('typewriter')) {
      clearTimeout(window.__rwdTwT);
      window.__rwdTwT = setTimeout(centerCurrentLine, 80);
    }
  });

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
      smartLinkify();
      smartListConvert();
      smartMarkdownInline();
      smartCapitalize();
    } else if (e.inputType === 'insertText') {
      autoCorrectAtCursor();
    }
  });

  // ============================================================
  // IMPROVEMENT: Smart auto-format helpers
  // ============================================================
  function getCaretTextBefore() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    const node = range.startContainer;
    if (node.nodeType !== 3) return null;
    return { node, offset: range.startOffset, text: node.nodeValue };
  }

  function smartLinkify() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, offset, text } = ctx;
    // Look at the word just before the trailing space
    const before = text.slice(0, offset - 1);
    const m = before.match(/(\S+)$/);
    if (!m) return;
    const word = m[1];
    if (!/^https?:\/\/\S+$/i.test(word) && !/^www\.\S+\.\S+$/i.test(word)) return;
    const start = offset - 1 - word.length;
    const url = /^https?:/i.test(word) ? word : 'https://' + word;
    const r = document.createRange();
    r.setStart(node, start);
    r.setEnd(node, offset - 1);
    const a = document.createElement('a');
    a.href = url;
    a.textContent = word;
    r.deleteContents();
    r.insertNode(a);
    // Place caret after the inserted link + the trailing space
    const sel = window.getSelection();
    sel.removeAllRanges();
    const r2 = document.createRange();
    if (a.nextSibling) {
      r2.setStart(a.nextSibling, Math.min(1, a.nextSibling.nodeValue.length));
      r2.setEnd(a.nextSibling, Math.min(1, a.nextSibling.nodeValue.length));
    } else {
      r2.setStartAfter(a);
      r2.setEndAfter(a);
    }
    sel.addRange(r2);
  }

  function smartListConvert() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const lineStart = text.lastIndexOf('\n', offset - 2) + 1;
    const line = text.slice(lineStart, offset);
    let cmd = null;
    if (/^[-*]\s$/.test(line)) cmd = 'insertUnorderedList';
    else if (/^\d+\.\s$/.test(line)) cmd = 'insertOrderedList';
    if (!cmd) return;
    // Remove the marker text
    node.nodeValue = text.slice(0, lineStart) + text.slice(offset);
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(node, lineStart);
    r.setEnd(node, lineStart);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand(cmd);
  }

  function smartMarkdownInline() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const before = text.slice(0, offset - 1);

    // Bold: **word**
    const boldMatch = before.match(/\*\*([^*\n]+)\*\*$/);
    if (boldMatch) {
      const start = offset - 1 - boldMatch[0].length;
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset - 1);
      r.deleteContents();
      const b = document.createElement('strong');
      b.textContent = boldMatch[1];
      r.insertNode(b);
      placeCaretAfter(b);
      return;
    }
    // Italic: *word* (not at start of **)
    const italicMatch = before.match(/(?:^|[^*])\*([^*\n]+)\*$/);
    if (italicMatch) {
      const fragLen = italicMatch[1].length + 2; // *word*
      const start = offset - 1 - fragLen;
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset - 1);
      r.deleteContents();
      const em = document.createElement('em');
      em.textContent = italicMatch[1];
      r.insertNode(em);
      placeCaretAfter(em);
      return;
    }
    // Inline code: `word`
    const codeMatch = before.match(/`([^`\n]+)`$/);
    if (codeMatch) {
      const start = offset - 1 - codeMatch[0].length;
      const r = document.createRange();
      r.setStart(node, start);
      r.setEnd(node, offset - 1);
      r.deleteContents();
      const c = document.createElement('code');
      c.textContent = codeMatch[1];
      r.insertNode(c);
      placeCaretAfter(c);
    }
  }

  function placeCaretAfter(el) {
    const sel = window.getSelection();
    const space = document.createTextNode(' ');
    el.parentNode.insertBefore(space, el.nextSibling);
    const r = document.createRange();
    r.setStartAfter(space);
    r.setEndAfter(space);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function smartCapitalize() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    // After "<sentence end> <space>" capitalize next typed letter
    // Easier: scan for "[.!?]\s+([a-z])" and capitalize it (only at the very last sentence position)
    const m = text.slice(0, offset).match(/([.!?]\s+|^)([a-z])([^.!?]*)$/);
    if (!m) return;
    const startOf = offset - (m[2].length + (m[3] ? m[3].length : 0));
    if (text[startOf] !== m[2]) return;
    // Replace just the lower-case letter
    node.nodeValue =
      text.slice(0, startOf) + m[2].toUpperCase() + text.slice(startOf + 1);
  }

  // ============================================================
  // IMPROVEMENT: Move paragraph / line up & down (Alt+↑/↓ ; Alt+Shift+↑/↓)
  // ============================================================
  editor.addEventListener('keydown', (e) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) return;
    let n = sel.anchorNode;
    if (n.nodeType !== 1) n = n.parentElement;
    const block = n.closest('h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,div');
    if (!block || !block.parentNode || block === editor) return;
    e.preventDefault();
    const sib = e.key === 'ArrowUp' ? block.previousElementSibling : block.nextElementSibling;
    if (!sib) return;
    if (e.key === 'ArrowUp') sib.parentNode.insertBefore(block, sib);
    else block.parentNode.insertBefore(sib, block);
    // Restore caret to the moved block
    const r = document.createRange();
    r.selectNodeContents(block);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: TSV/CSV smart paste → table
  // ============================================================
  editor.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd) return;
    if (e.defaultPrevented) return;
    const txt = cd.getData('text/plain');
    if (!txt) return;
    // Heuristic: at least 2 lines, every line has the same separator (tab or comma) ≥ 2 occurrences
    const lines = txt.replace(/\r/g, '').split('\n').filter((l) => l.length);
    if (lines.length < 2) return;
    let sep = null;
    if (lines.every((l) => l.includes('\t'))) sep = '\t';
    else if (lines.every((l) => /,/.test(l)) && lines.every((l) => l.split(',').length >= 2)) sep = ',';
    if (!sep) return;
    const cells = lines.map((l) => l.split(sep));
    const cols = Math.max(...cells.map((r) => r.length));
    if (cols < 2) return;
    e.preventDefault();
    let html = '<table class="bordered"><tbody>';
    cells.forEach((row, idx) => {
      const tag = idx === 0 ? 'th' : 'td';
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        html += '<' + tag + '>' + escapeHtml(row[c] || '&nbsp;') + '</' + tag + '>';
      }
      html += '</tr>';
    });
    html += '</tbody></table><p><br/></p>';
    document.execCommand('insertHTML', false, html);
    queueAutosave();
  });

  // ============================================================
  // IMPROVEMENT: Inline symbol shortcuts (-->, (c), (r), (tm), <-, etc.)
  // ============================================================
  const SYMBOL_SHORTCUTS = [
    [/-->$/, '→'],
    [/<--$/, '←'],
    [/==>$/, '⇒'],
    [/<==$/, '⇐'],
    [/<->$/, '↔'],
    [/\(c\)$/i, '©'],
    [/\(r\)$/i, '®'],
    [/\(tm\)$/i, '™'],
    [/\+\-$/, '±'],
    [/!=$/, '≠'],
    [/<=$/, '≤'],
    [/>=$/, '≥'],
    [/\.\.\.$/, '…'],
  ];

  function applySymbolShortcuts() {
    if (!autoCorrectToggle.checked) return;
    const ctx = getCaretTextBefore();
    if (!ctx) return;
    const { node, text, offset } = ctx;
    const before = text.slice(0, offset - 1);
    for (const [re, sym] of SYMBOL_SHORTCUTS) {
      const m = before.match(re);
      if (m) {
        const start = offset - 1 - m[0].length;
        node.nodeValue = text.slice(0, start) + sym + text.slice(offset - 1);
        const newOffset = start + sym.length + 1; // include the trailing space
        const sel = window.getSelection();
        const r = document.createRange();
        r.setStart(node, newOffset);
        r.setEnd(node, newOffset);
        sel.removeAllRanges();
        sel.addRange(r);
        return;
      }
    }
  }

  // Hook into the existing input listener
  editor.addEventListener('input', (e) => {
    if (e.inputType === 'insertText' && (e.data === ' ' || e.data === '\n')) {
      applySymbolShortcuts();
    }
  });

  // Auto-pair brackets/quotes when text is selected
  editor.addEventListener('keydown', (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '<': '>' };
    const close = pairs[e.key];
    if (!close) return;
    e.preventDefault();
    const range = sel.getRangeAt(0);
    const text = range.toString();
    range.deleteContents();
    const replacement = e.key + text + close;
    const node = document.createTextNode(replacement);
    range.insertNode(node);
    // re-select the inner text
    const r = document.createRange();
    r.setStart(node, 1);
    r.setEnd(node, 1 + text.length);
    sel.removeAllRanges();
    sel.addRange(r);
    queueAutosave();
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
    buildReadingTOC();
  }
  function exitReadingMode() {
    document.body.classList.remove('reading-mode');
    editor.contentEditable = 'true';
    readingExitBtn.hidden = true;
    const toc = document.querySelector('.reading-toc');
    if (toc) toc.remove();
  }

  function buildReadingTOC() {
    const headings = editor.querySelectorAll('h1, h2, h3');
    if (!headings.length) return;
    const old = document.querySelector('.reading-toc');
    if (old) old.remove();
    const toc = document.createElement('div');
    toc.className = 'reading-toc';
    toc.innerHTML = '<h4>Contents</h4><ol></ol>';
    const ol = toc.querySelector('ol');
    headings.forEach((h, i) => {
      if (!h.id) h.id = 'rwd-h-' + i;
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);
      li.textContent = h.textContent || '(empty)';
      li.addEventListener('click', () => {
        h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      ol.appendChild(li);
    });
    document.body.appendChild(toc);
  }
  $('#readingModeBtn').addEventListener('click', enterReadingMode);
  readingExitBtn.addEventListener('click', exitReadingMode);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('reading-mode')) {
      exitReadingMode();
    }
  });

  // ============================================================
  // FEATURE: Threaded comments with @-mentions and resolve
  // ============================================================
  const STORE_THREADS = 'rodmanword:threads';
  const commentModal = $('#commentModal');
  const commentModalTitle = $('#commentModalTitle');
  const commentResolved = $('#commentResolved');
  const commentRepliesEl = $('#commentReplies');
  const deleteCommentBtn = $('#deleteCommentBtn');
  let pendingCommentRange = null;
  let editingCommentSpan = null;
  let editingThreadId = null;
  let threads = {};
  try { threads = JSON.parse(localStorage.getItem(STORE_THREADS) || '{}'); } catch {}

  function persistThreads() {
    try { localStorage.setItem(STORE_THREADS, JSON.stringify(threads)); } catch {}
  }

  function newThreadId() {
    return 'th-' + Date.now().toString(36) + '-' +
      Math.floor(Math.random() * 1e6).toString(36);
  }

  function currentAuthor() {
    return (docProps && docProps.author && docProps.author.trim()) || 'You';
  }

  function migrateLegacyComments() {
    // Convert any old-style <span class="rwd-comment" data-comment="text">
    // into the new threaded form. Each old comment becomes a single reply.
    let migrated = 0;
    editor.querySelectorAll('.rwd-comment').forEach((span) => {
      if (span.dataset.threadId) return;
      const id = newThreadId();
      span.dataset.threadId = id;
      const text = span.dataset.comment || span.title || '';
      threads[id] = {
        resolved: false,
        replies: text ? [{
          author: currentAuthor(),
          at: new Date().toISOString(),
          text,
        }] : [],
      };
      delete span.dataset.comment;
      span.title = text;
      migrated++;
    });
    if (migrated) persistThreads();
  }

  function escapeReplyHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function renderMentionsInText(s) {
    return escapeReplyHtml(s).replace(
      /(^|\s)@([\w][\w.-]{0,48})/g,
      (m, p, name) => p + '<span class="mention">@' + name + '</span>'
    );
  }

  function renderThread(id) {
    const t = threads[id] || { replies: [] };
    commentRepliesEl.innerHTML = '';
    if (!t.replies.length) {
      commentRepliesEl.innerHTML =
        '<p class="muted" style="font-style:italic">No replies yet — add the first one below.</p>';
      return;
    }
    t.replies.forEach((r, idx) => {
      const card = document.createElement('div');
      card.className = 'comment-reply';
      const dt = new Date(r.at);
      card.innerHTML =
        '<div class="meta"><span><b>' + escapeReplyHtml(r.author || 'Anonymous') +
        '</b> · ' + escapeReplyHtml(dt.toLocaleString()) + '</span>' +
        '<button class="delete-btn" data-idx="' + idx + '">Delete</button></div>' +
        '<div class="body">' + renderMentionsInText(r.text || '') + '</div>';
      card.querySelector('.delete-btn').addEventListener('click', () => {
        t.replies.splice(idx, 1);
        persistThreads();
        renderThread(id);
        rebuildCommentsPane();
        queueAutosave();
      });
      commentRepliesEl.appendChild(card);
    });
  }

  function openCommentModalForNew() {
    editingCommentSpan = null;
    editingThreadId = null;
    commentModalTitle.textContent = 'Add comment';
    deleteCommentBtn.hidden = true;
    commentResolved.checked = false;
    $('#commentSelectionPreview').textContent =
      '“' + pendingCommentRange.toString().slice(0, 80) +
      (pendingCommentRange.toString().length > 80 ? '…' : '') + '”';
    commentRepliesEl.innerHTML = '';
    $('#commentText').value = '';
    $('#saveCommentBtn').textContent = 'Add comment';
    openModal(commentModal);
    setTimeout(() => $('#commentText').focus(), 50);
  }

  function openCommentModalForEdit(span) {
    editingCommentSpan = span;
    pendingCommentRange = null;
    let id = span.dataset.threadId;
    if (!id) {
      // Legacy single-comment span; migrate now
      id = newThreadId();
      span.dataset.threadId = id;
      const text = span.dataset.comment || span.title || '';
      threads[id] = {
        resolved: false,
        replies: text ? [{
          author: currentAuthor(),
          at: new Date().toISOString(),
          text,
        }] : [],
      };
      delete span.dataset.comment;
      persistThreads();
    }
    editingThreadId = id;
    commentModalTitle.textContent = 'Comment thread';
    deleteCommentBtn.hidden = false;
    commentResolved.checked = !!(threads[id] && threads[id].resolved);
    $('#commentSelectionPreview').textContent =
      '“' + span.textContent.slice(0, 80) +
      (span.textContent.length > 80 ? '…' : '') + '”';
    renderThread(id);
    $('#commentText').value = '';
    $('#saveCommentBtn').textContent = 'Add reply';
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
    // Reply to existing thread
    if (editingThreadId && editingCommentSpan) {
      if (text) {
        threads[editingThreadId].replies.push({
          author: currentAuthor(),
          at: new Date().toISOString(),
          text,
        });
        const last = text.split('\n').slice(-1)[0];
        editingCommentSpan.title = last.slice(0, 200);
        persistThreads();
        renderThread(editingThreadId);
        $('#commentText').value = '';
        rebuildCommentsPane();
        queueAutosave();
      }
      return;
    }
    // New thread
    if (!text || !pendingCommentRange) {
      closeModal(commentModal);
      return;
    }
    const id = newThreadId();
    threads[id] = {
      resolved: false,
      replies: [{
        author: currentAuthor(),
        at: new Date().toISOString(),
        text,
      }],
    };
    persistThreads();
    const span = document.createElement('span');
    span.className = 'rwd-comment';
    span.dataset.threadId = id;
    span.title = text;
    try {
      span.appendChild(pendingCommentRange.extractContents());
      pendingCommentRange.insertNode(span);
    } catch {}
    pendingCommentRange = null;
    closeModal(commentModal);
    rebuildCommentsPane();
    queueAutosave();
  });

  commentResolved.addEventListener('change', () => {
    if (!editingThreadId) return;
    threads[editingThreadId].resolved = commentResolved.checked;
    if (editingCommentSpan) {
      editingCommentSpan.classList.toggle('resolved', commentResolved.checked);
    }
    persistThreads();
    rebuildCommentsPane();
    queueAutosave();
  });

  deleteCommentBtn.addEventListener('click', () => {
    if (!editingCommentSpan) return;
    const span = editingCommentSpan;
    const id = span.dataset.threadId;
    if (id) { delete threads[id]; persistThreads(); }
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    editingCommentSpan = null;
    editingThreadId = null;
    closeModal(commentModal);
    rebuildCommentsPane();
    queueAutosave();
  });

  // Click a comment to view/edit its thread
  editor.addEventListener('click', (e) => {
    const span = e.target.closest && e.target.closest('.rwd-comment');
    if (!span) return;
    e.preventDefault();
    openCommentModalForEdit(span);
  });

  // Re-apply .resolved class to comment spans on load
  function applyResolvedClasses() {
    editor.querySelectorAll('.rwd-comment').forEach((span) => {
      const id = span.dataset.threadId;
      if (id && threads[id] && threads[id].resolved) {
        span.classList.add('resolved');
      } else {
        span.classList.remove('resolved');
      }
    });
  }

  // ============================================================
  // FEATURE: Comments side panel
  // ============================================================
  const commentsPane = $('#commentsPane');
  const commentsPaneToggle = $('#commentsPaneToggle');
  const commentsList = $('#commentsList');
  const commentsCount = $('#commentsCount');
  const showResolvedComments = $('#showResolvedComments');

  function rebuildCommentsPane() {
    if (!commentsPane || commentsPane.hidden) return;
    const spans = Array.from(editor.querySelectorAll('.rwd-comment'));
    const showResolved = showResolvedComments && showResolvedComments.checked;
    commentsList.innerHTML = '';
    let visible = 0, total = 0;
    spans.forEach((span) => {
      const id = span.dataset.threadId;
      if (!id || !threads[id]) return;
      total++;
      const t = threads[id];
      if (t.resolved && !showResolved) return;
      visible++;
      const li = document.createElement('li');
      if (t.resolved) li.classList.add('resolved');
      const last = t.replies[t.replies.length - 1];
      const lastText = last ? last.text : '(empty)';
      const sel = span.textContent.trim().slice(0, 60);
      li.innerHTML =
        '<div class="selection-preview">“' + escapeReplyHtml(sel) +
        (span.textContent.length > 60 ? '…' : '') + '”</div>' +
        '<div class="last-reply"><b>' + escapeReplyHtml(last ? last.author : '—') +
        ':</b> ' + renderMentionsInText(lastText) +
        '<span class="reply-count">' + t.replies.length + '</span></div>';
      li.addEventListener('click', () => {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => openCommentModalForEdit(span), 200);
      });
      commentsList.appendChild(li);
    });
    if (!visible) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = total
        ? 'All ' + total + ' comments resolved.'
        : 'No comments yet.';
      commentsList.appendChild(li);
    }
    commentsCount.textContent = visible + ' of ' + total;
  }

  if (commentsPaneToggle) {
    commentsPaneToggle.addEventListener('change', () => {
      commentsPane.hidden = !commentsPaneToggle.checked;
      if (commentsPaneToggle.checked) rebuildCommentsPane();
    });
  }
  $('#commentsCloseBtn')?.addEventListener('click', () => {
    commentsPane.hidden = true;
    if (commentsPaneToggle) commentsPaneToggle.checked = false;
  });
  showResolvedComments?.addEventListener('change', rebuildCommentsPane);

  // Migrate legacy comments and apply resolved styling on init
  setTimeout(() => {
    migrateLegacyComments();
    applyResolvedClasses();
    rebuildCommentsPane();
  }, 50);
  // Re-render the panel whenever the editor changes
  editor.addEventListener('input', () => {
    clearTimeout(window.__rwdCmtT);
    window.__rwdCmtT = setTimeout(rebuildCommentsPane, 400);
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
