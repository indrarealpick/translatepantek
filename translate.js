/* =====================================================
   LinguaAI — translate.js
   AI translation logic (Google AI Studio & OpenRouter)
   ===================================================== */

const LANG = {
  auto:'detected language', id:'Indonesian', en:'English',
  ja:'Japanese', ko:'Korean', zh:'Mandarin Chinese',
  ar:'Arabic', fr:'French', de:'German', es:'Spanish'
};

const PROVIDERS = {
  google: {
    defaultModel: 'gemini-2.0-flash',
    modelNote: 'Contoh: gemini-2.0-flash, gemini-1.5-flash',
    keyNote: 'Dari <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a> → Get API Key. Format: <code>AIzaSy...</code>'
  },
  openrouter: {
    defaultModel: 'openai/gpt-4o-mini',
    modelNote: 'Contoh: openai/gpt-4o-mini, mistralai/mistral-7b-instruct:free',
    keyNote: 'Dari <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>. Format: <code>sk-or-v1-...</code>'
  }
};

let cfg = { provider: 'google', key: '', model: 'gemini-2.0-flash' };
let hist = [], autoOn = true, busy = false;
let abortCtrl = null, lastTranslatedText = '', debounceTimer = null;

// ---- CONFIG ----
function loadCfg() {
  try { const s = localStorage.getItem('lingua_cfg'); if (s) cfg = { ...cfg, ...JSON.parse(s) }; } catch(e) {}
}
function saveCfg() { localStorage.setItem('lingua_cfg', JSON.stringify(cfg)); }
function updateBanner() { $('banner').classList.toggle('hidden', !!(cfg.key && cfg.key.length > 8)); }
function openCfg() {
  $('providerSel').value = cfg.provider || 'google';
  $('keyInp').value = cfg.key || '';
  $('modelInp').value = cfg.model || PROVIDERS[cfg.provider || 'google'].defaultModel;
  updateProviderUI();
  $('cfgModal').classList.add('open');
}
function closeCfg() { $('cfgModal').classList.remove('open'); }
function updateProviderUI() {
  const p = $('providerSel').value;
  $('providerNote').innerHTML = PROVIDERS[p].keyNote;
  $('modelNote').textContent = PROVIDERS[p].modelNote;
  if (!$('modelInp').value || Object.values(PROVIDERS).some(x => x.defaultModel === $('modelInp').value))
    $('modelInp').value = PROVIDERS[p].defaultModel;
}

// ---- TRANSLATE ----
async function translate() {
  const text = $('srcTxt').value.trim();
  if (!text) { $('outTxt').value = ''; $('romajiBox').style.display = 'none'; return; }
  if (!cfg.key || cfg.key.length < 8) { toast('Set API key dulu', 'error'); openCfg(); return; }
  if (text === lastTranslatedText && $('outTxt').value) return;
  if (abortCtrl) abortCtrl.abort();
  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;
  if (busy) return;
  const src = $('srcLang').value, tgt = $('tgtLang').value;
  if (src !== 'auto' && src === tgt) { toast('Bahasa sama', 'info'); return; }
  busy = true; setLoadingAuto(true);

  const needRomaji = (tgt === 'ja' || tgt === 'ko');
  const srcL = LANG[src] || src, tgtL = LANG[tgt] || tgt;

  const systemPrompt = `You are an elite professional translator.

Your task is to translate text naturally like a native speaker.

Rules:
- Prioritize meaning, tone, context, and emotion over literal translation
- Make outputs sound fluent, human, and conversational
- Adapt idioms and cultural expressions naturally
- Avoid robotic or textbook phrasing
- Preserve nuance, intent, and emotional tone
- Handle casual and formal language appropriately
- For Japanese: use casual speech (口語) for casual input, formal only when context requires
- For Indonesian: use natural modern Indonesian, avoid overly formal wording
- For English: use fluent modern English, avoid stiff phrasing
- For Korean: sound like real native conversation, not textbook Korean
- Never explain translations, never add commentary
- Output ONLY the translated text`;

  const prompt = needRomaji
    ? `${systemPrompt}\n\nTranslate from ${srcL} to ${tgtL}. Response format:\nTRANSLATION: [translated text]\nROMAJI: [romanized latin reading]\n\nText to translate:\n${text}`
    : `${systemPrompt}\n\nTranslate from ${srcL} to ${tgtL}:\n\n${text}`;

  try {
    let result = '', romaji = '';

    if (cfg.provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2000, temperature: 0.3 } }),
        signal
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`[${res.status}] ${e?.error?.message || 'Google API error'}`); }
      const d = await res.json();
      result = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } else {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.key}`, 'HTTP-Referer': location.href, 'X-Title': 'LinguaAI' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
        signal
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`[${res.status}] ${e?.error?.message || 'OpenRouter error'}`); }
      const d = await res.json();
      result = d?.choices?.[0]?.message?.content?.trim() || '';
    }

    if (!result) throw new Error('Respons kosong.');

    if (needRomaji && result.includes('TRANSLATION:')) {
      const tm = result.match(/TRANSLATION:\s*([\s\S]+?)(?=ROMAJI:|$)/);
      const rm = result.match(/ROMAJI:\s*([\s\S]+)/);
      if (tm) result = tm[1].trim();
      romaji = rm ? rm[1].trim() : '';
    }

    lastTranslatedText = text;
    showResult(result, romaji);
    addHist(text, result, src, tgt);
    saveLast(text, result);

  } catch(err) {
    if (err.name === 'AbortError') return;
    console.error(err);
    if (err.message && !err.message.includes('abort')) toast(err.message || 'Gagal', 'error');
  } finally {
    busy = false; setLoadingAuto(false);
  }
}

// ---- HISTORY ----
function addHist(s, t, sl, tl) {
  hist.unshift({ id: Date.now(), source: s.slice(0,200), target: t.slice(0,200), srcLang: sl, tgtLang: tl, time: new Date().toISOString() });
  if (hist.length > 30) hist = hist.slice(0, 30);
  localStorage.setItem('lingua_hist', JSON.stringify(hist));
  renderHist();
}
function loadHist() { try { hist = JSON.parse(localStorage.getItem('lingua_hist') || '[]'); } catch(e) { hist = []; } }
function renderHist() {
  const list = $('histList'), empty = $('histEmpty');
  const items = hist.filter(h => h && h.source);
  if (!items.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none'; list.innerHTML = ''; list.appendChild(empty);
  items.forEach(h => {
    const el = document.createElement('div'); el.className = 'hist-item';
    const sl = (LANG[h.srcLang] || h.srcLang || '').split(' ')[0];
    const tl = (LANG[h.tgtLang] || h.tgtLang || '').split(' ')[0];
    el.innerHTML = `<span class="hist-lang">${sl}→${tl}</span><div class="hist-texts"><div class="hist-src">${esc(h.source)}</div><div class="hist-tgt">${esc(h.target)}</div></div><span class="hist-time">${fmtTime(h.time)}</span>`;
    el.onclick = () => {
      $('srcTxt').value = h.source; $('outTxt').value = h.target || '';
      if (h.srcLang) $('srcLang').value = h.srcLang;
      if (h.tgtLang) $('tgtLang').value = h.tgtLang;
      resize($('srcTxt')); resize($('outTxt')); updateChar();
      $('histCard').classList.remove('show');
      toast('Dimuat', 'info'); window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    list.appendChild(el);
  });
}
function saveLast(s, t) {
  try { localStorage.setItem('lingua_last', JSON.stringify({ source: s, target: t, srcLang: $('srcLang').value, tgtLang: $('tgtLang').value })); } catch(e) {}
}
function loadLast() {
  try {
    const d = JSON.parse(localStorage.getItem('lingua_last') || '{}');
    if (d.source) {
      $('srcTxt').value = d.source; $('outTxt').value = d.target || '';
      if (d.srcLang) $('srcLang').value = d.srcLang;
      if (d.tgtLang) $('tgtLang').value = d.tgtLang;
      updateChar(); resize($('srcTxt')); if (d.target) resize($('outTxt'));
    }
  } catch(e) {}
}
