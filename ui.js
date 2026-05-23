/* =====================================================
   LinguaAI — ui.js
   UI logic: loading, toast, animations, theme, events
   ===================================================== */

const $ = id => document.getElementById(id);

// ---- THEME ----
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('lingua_theme', t);
  $('moonIco').classList.toggle('hidden', t === 'dark');
  $('sunIco').classList.toggle('hidden', t === 'light');
}

// ---- TABS ----
function switchTab(t) {
  $('pageTr').classList.toggle('hidden', t !== 'tr');
  $('pageOcr').classList.toggle('hidden', t !== 'ocr');
  $('tabTr').classList.toggle('active', t === 'tr');
  $('tabOcr').classList.toggle('active', t === 'ocr');
}

// ---- LOADING STATES ----
function setLoading(on) {
  $('trBtn').disabled = on;
  $('trBtn').classList.toggle('loading', on);
  $('outTxt').style.display = on ? 'none' : 'block';
  $('skelWrap').classList.toggle('show', on);
  $('typingDot').classList.remove('show');
  if (on) $('romajiBox').style.display = 'none';
}

function setLoadingAuto(on) {
  $('trBtn').classList.toggle('loading', on);
  if (on) {
    $('typingDot').classList.add('show');
    $('skelWrap').classList.remove('show');
    $('outTxt').style.display = 'block';
  } else {
    $('typingDot').classList.remove('show');
  }
}

// ---- SHOW RESULT WITH FADE ANIMATION ----
function showResult(result, romaji = '') {
  $('outTxt').classList.add('fading');
  setTimeout(() => {
    $('outTxt').value = result;
    $('outTxt').style.display = 'block';
    resize($('outTxt'));
    $('outTxt').classList.remove('fading');
    $('outTxt').classList.remove('result-appear');
    void $('outTxt').offsetWidth; // force reflow
    $('outTxt').classList.add('result-appear');
  }, 180);

  if (romaji) {
    $('romajiBox').textContent = romaji;
    $('romajiBox').style.display = 'block';
    $('romajiBox').classList.remove('result-appear');
    void $('romajiBox').offsetWidth;
    $('romajiBox').classList.add('result-appear');
  } else {
    $('romajiBox').style.display = 'none';
  }
}

// ---- TOAST ----
function toast(msg, type = 'default', duration = 2500) {
  const c = $('toasts');
  // Remove duplicate
  c.querySelectorAll('.toast').forEach(t => { if (t.textContent === msg) t.remove(); });
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 0.25s ease forwards';
    setTimeout(() => el.remove(), 250);
  }, duration);
}

// ---- UTILS ----
function resize(el) {
  el.style.height = 'auto';
  el.style.height = Math.max(140, el.scrollHeight) + 'px';
}

function updateChar() {
  const l = $('srcTxt').value.length;
  $('charCnt').textContent = l > 0 ? l + ' / 5000' : '';
  $('clearBtn').classList.toggle('show', l > 0);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function fmtTime(iso) {
  try {
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 60000) return 'Baru saja';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' mnt lalu';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' jam lalu';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch(e) { return ''; }
}

// ---- MAIN EVENT BINDINGS ----
function bindEvents() {
  // Theme
  $('themeBtn').onclick = () => applyTheme(
    document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  );

  // Translate button
  $('trBtn').onclick = translate;

  // Ctrl+Enter shortcut
  $('srcTxt').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); translate(); }
  });

  // Auto translate with debounce + abort
  $('srcTxt').addEventListener('input', () => {
    updateChar(); resize($('srcTxt'));
    if (autoOn) {
      clearTimeout(debounceTimer);
      if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; busy = false; }
      const txt = $('srcTxt').value.trim();
      if (!txt) {
        $('outTxt').value = '';
        $('romajiBox').style.display = 'none';
        $('typingDot').classList.remove('show');
        return;
      }
      $('typingDot').classList.add('show');
      debounceTimer = setTimeout(() => {
        if ($('srcTxt').value.trim().length > 1) translate();
        else $('typingDot').classList.remove('show');
      }, 700);
    }
  });

  // Clear
  $('clearBtn').onclick = () => {
    $('srcTxt').value = ''; $('outTxt').value = '';
    $('romajiBox').style.display = 'none';
    lastTranslatedText = '';
    if (abortCtrl) { abortCtrl.abort(); abortCtrl = null; busy = false; }
    $('typingDot').classList.remove('show');
    updateChar(); resize($('srcTxt'));
  };

  // Copy
  $('copyBtn').onclick = async () => {
    const t = $('outTxt').value.trim();
    if (!t) { toast('Tidak ada teks', 'info'); return; }
    try { await navigator.clipboard.writeText(t); }
    catch(e) {
      const el = document.createElement('textarea');
      el.value = t; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    toast('Disalin!', 'success');
  };

  // Share
  $('shareBtn').onclick = () => {
    const t = $('outTxt').value.trim();
    if (!t) { toast('Tidak ada teks', 'info'); return; }
    if (navigator.share) navigator.share({ text: t }).catch(() => {});
    else navigator.clipboard.writeText(t).then(() => toast('Disalin untuk dibagikan', 'success'));
  };

  // Swap with spin animation
  $('swapBtn').onclick = () => {
    const sv = $('srcLang').value;
    if (sv === 'auto') { toast('Tidak bisa swap saat Deteksi Otomatis', 'info'); return; }
    $('swapBtn').classList.add('spinning');
    setTimeout(() => $('swapBtn').classList.remove('spinning'), 320);
    const tv = $('tgtLang').value;
    $('srcLang').value = tv; $('tgtLang').value = sv;
    const st = $('srcTxt').value;
    $('srcTxt').value = $('outTxt').value; $('outTxt').value = st;
    updateChar(); resize($('srcTxt')); resize($('outTxt'));
  };

  // Auto toggle
  $('autoTgl').onclick = () => {
    autoOn = !autoOn;
    $('autoTgl').classList.toggle('on', autoOn);
    toast(autoOn ? 'Auto aktif' : 'Auto nonaktif', 'info');
  };

  // History
  $('histBtn').onclick = () => $('histCard').classList.toggle('show');
  $('clrHistBtn').onclick = () => {
    hist = []; localStorage.removeItem('lingua_hist');
    renderHist(); toast('Riwayat dihapus', 'info');
  };

  // Config modal
  $('cfgBtn').onclick = openCfg;
  $('bannerBtn').onclick = openCfg;
  $('closeCfg').onclick = closeCfg;
  $('cfgCancel').onclick = closeCfg;
  $('cfgModal').onclick = e => { if (e.target === $('cfgModal')) closeCfg(); };
  $('providerSel').onchange = updateProviderUI;

  $('saveBtn').onclick = () => {
    const k = $('keyInp').value.trim();
    if (!k) { toast('API key kosong', 'error'); return; }
    cfg.provider = $('providerSel').value;
    cfg.key = k;
    cfg.model = $('modelInp').value.trim() || PROVIDERS[cfg.provider].defaultModel;
    saveCfg(); updateBanner(); closeCfg();
    toast('Tersimpan ✓', 'success');
  };

  $('resetBtn').onclick = () => {
    if (confirm('Hapus semua data?')) {
      localStorage.removeItem('lingua_cfg');
      localStorage.removeItem('lingua_hist');
      localStorage.removeItem('lingua_last');
      cfg = { provider: 'google', key: '', model: 'gemini-2.0-flash' };
      hist = []; renderHist(); updateBanner(); closeCfg();
      toast('Reset selesai', 'info');
    }
  };

  // Escape closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCfg(); closeCam(); }
  });

  // OCR events (defined in ocr.js)
  bindOCREvents();
}

// ---- INIT ----
function init() {
  loadCfg(); loadHist(); loadLast();
  updateBanner(); renderHist(); bindEvents();
  applyTheme(localStorage.getItem('lingua_theme') || 'light');
}

document.addEventListener('DOMContentLoaded', init);
