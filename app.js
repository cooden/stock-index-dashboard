// 纯前端版: 直连东方财富API, 无需后端
// CORS: push2.eastmoney.com 支持 Access-Control-Allow-Origin: *
const EM_BASE = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
const REFRESH_MS = 3000;

const $ = id => document.getElementById(id);
const fmt = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '--' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = n => (n > 0 ? '+' : '');
const cls = n => (n === null || n === 0 ? '' : n > 0 ? 'up' : 'down');
const bgcls = n => (n === null || n === 0 ? '' : n > 0 ? 'bg-up' : 'bg-down');
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
function pad2(n) { return String(n).padStart(2, '0'); }

// 6大指数(中证全指末尾)
const IDX_DEFS = [
  { code: 'sh000001', name: '上证指数', region: '中国大陆', bare: '000001', market: 'CN' },
  { code: 'sz399006', name: '创业板指', region: '中国大陆', bare: '399006', market: 'CN' },
  { code: 'sh000688', name: '科创50',   region: '中国大陆', bare: '000688', market: 'CN' },
  { code: 'N225',     name: '日经225',  region: '日本',     bare: 'N225',   market: 'JP' },
  { code: 'KS11',     name: '韩国综合', region: '韩国',     bare: 'KS11',   market: 'KR' },
  { code: 'sh000985', name: '中证全指', region: '中国大陆', bare: '000985', market: 'CN' }
];
const IDX_SECIDS = '1.000001,0.399006,1.000688,100.N225,100.KS11,1.000985';

// 12个A股排名指数(含中证2000)
const RANK_DEFS = [
  { code: 'sh000001', name: '上证指数', bare: '000001' },
  { code: 'sh000016', name: '上证50',   bare: '000016' },
  { code: 'sh000300', name: '沪深300', bare: '000300' },
  { code: 'sh000905', name: '中证500', bare: '000905' },
  { code: 'sh000852', name: '中证1000',bare: '000852' },
  { code: 'sh932000', name: '中证2000',bare: '932000' },
  { code: 'sh000985', name: '中证全指', bare: '000985' },
  { code: 'sh000688', name: '科创50',   bare: '000688' },
  { code: 'sh931643', name: '双创50',   bare: '931643' },
  { code: 'sz399001', name: '深证成指', bare: '399001' },
  { code: 'sz399006', name: '创业板指', bare: '399006' },
  { code: 'sz399102', name: '创业板综', bare: '399102' }
];
const RANK_SECIDS = '1.000001,1.000016,1.000300,1.000905,1.000852,2.932000,1.000985,1.000688,2.931643,0.399001,0.399006,0.399102';

// ============== 数据源注册表 ==============
const SOURCES = [
  { id: 'eastmoney', name: '东方财富', desc: '数据最全(全指数+日韩+涨跌家数+成交额),无需Referer' },
  { id: 'tencent',   name: '腾讯财经', desc: 'GBK行情,支持A股指数;日韩/涨跌家数自动回退东方财富' },
  { id: 'sina',      name: '新浪财经', desc: '经典行情源,需Referer;A股指数可用,日韩回退东方财富' }
];
let activeSource = 'eastmoney';
// 健康状态缓存
const sourceHealth = {};

// ---------- 东方财富直连 ----------
const EM_HOSTS = [
  'https://push2.eastmoney.com/api/qt/ulist.np/get',
  'https://push2his.eastmoney.com/api/qt/ulist.np/get',
  'https://82.push2.eastmoney.com/api/qt/ulist.np/get'
];
let _emHostIdx = 0;

function fetchWithTimeout(url, ms) {
  if (typeof AbortController === 'undefined') {
    return fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .then(r => { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .catch(e => { clearTimeout(t); throw e; });
}

async function fetchEM(secids, fields) {
  let lastErr = null;
  for (let i = 0; i < EM_HOSTS.length; i++) {
    const hostIdx = (_emHostIdx + i) % EM_HOSTS.length;
    const url = `${EM_HOSTS[hostIdx]}?fields=${fields}&secids=${secids}&fltt=2`;
    try {
      const j = await fetchWithTimeout(url, 8000);
      if (j && j.data && j.data.diff) {
        _emHostIdx = hostIdx;
        return j.data.diff;
      }
      lastErr = new Error('返回数据为空');
    } catch (e) { lastErr = e; }
  }
  for (let i = 0; i < EM_HOSTS.length; i++) {
    const url = `${EM_HOSTS[i]}?fields=${fields}&secids=${secids}&fltt=2`;
    try {
      const j = await fetchXHR(url);
      if (j && j.data && j.data.diff) { _emHostIdx = i; return j.data.diff; }
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('所有数据源均失败');
}

function fetchXHR(url) {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 8000;
      xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(e); } };
      xhr.onerror = () => reject(new Error('XHR 网络错误'));
      xhr.ontimeout = () => reject(new Error('XHR 超时'));
      xhr.send();
    } catch (e) { reject(e); }
  });
}

// ---------- 腾讯财经 ----------
// qt.gtimg.cn 支持 CORS, 返回 GBK 编码的 JS 变量赋值: v_sh000001="..."
async function fetchTencent(codes) {
  const url = `https://qt.gtimg.cn/q=${codes.join(',')}`;
  let text;
  try {
    const resp = await fetchWithTimeoutArray(url, 8000);
    text = new TextDecoder('gbk').decode(resp);
  } catch (e) {
    // fallback XHR
    const buf = await fetchXHRArray(url);
    text = new TextDecoder('gbk').decode(buf);
  }
  const map = {};
  for (const line of text.split(';')) {
    const m = line.match(/v_(\w+)\s*=\s*"([^"]*)/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}
function fetchWithTimeoutArray(url, ms) {
  if (typeof AbortController === 'undefined') return fetch(url).then(r => r.arrayBuffer());
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .then(r => { clearTimeout(t); if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .catch(e => { clearTimeout(t); throw e; });
}
function fetchXHRArray(url) {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 8000;
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => resolve(xhr.response);
      xhr.onerror = () => reject(new Error('XHR 网络错误'));
      xhr.ontimeout = () => reject(new Error('XHR 超时'));
      xhr.send();
    } catch (e) { reject(e); }
  });
}

// ---------- 新浪财经 ----------
// hq.sinajs.cn 检查 Referer, 纯前端 fetch 会被拒; 用 script 标签(JSONP风格)加载
// 新浪返回: var hq_str_sh000001="..."
function fetchSina(codes) {
  return new Promise((resolve, reject) => {
    const url = `https://hq.sinajs.cn/list=${codes.join(',')}`;
    const s = document.createElement('script');
    let done = false;
    const cleanup = () => { if (s.parentNode) s.parentNode.removeChild(s); };
    const finish = () => {
      if (done) return;
      done = true;
      const map = {};
      for (const c of codes) {
        const v = window['hq_str_' + c];
        if (v) map[c] = v;
      }
      cleanup();
      if (Object.keys(map).length) resolve(map);
      else reject(new Error('新浪无数据(可能被Referer限制)'));
    };
    s.src = url;
    s.onload = finish;
    s.onerror = () => { done = true; cleanup(); reject(new Error('新浪加载失败')); };
    document.head.appendChild(s);
    setTimeout(finish, 8000);
  });
}

// ---------- 按数据源获取6大指数 ----------
async function fetchIndicesBySource(sourceId) {
  if (sourceId === 'tencent') {
    const cnCodes = IDX_DEFS.filter(d => d.market === 'CN').map(d => d.code);
    const map = await fetchTencent(cnCodes);
    return IDX_DEFS.map(def => {
      if (def.market !== 'CN') {
        return { ...def, price: null, pct: null, change: null, prevClose: null, open: null, high: null, low: null, available: false, unavailableReason: '腾讯不支持海外指数' };
      }
      const raw = map[def.code];
      if (!raw) return { ...def, price: null, pct: null, change: null, available: false, unavailableReason: '无数据' };
      const f = raw.split('~');
      const current = num(f[3]), prevClose = num(f[4]);
      const change = (current !== null && prevClose !== null) ? +(current - prevClose).toFixed(4) : null;
      const pct = (change !== null && prevClose) ? +(change / prevClose * 100).toFixed(2) : null;
      return {
        code: def.code, name: f[1] || def.name, region: def.region,
        price: current, prevClose, open: num(f[5]),
        high: num(f[33]) || null, low: num(f[34]) || null,
        change, pct, available: current !== null
      };
    });
  }
  if (sourceId === 'sina') {
    const cnCodes = IDX_DEFS.filter(d => d.market === 'CN').map(d => d.code);
    const map = await fetchSina(cnCodes);
    return IDX_DEFS.map(def => {
      if (def.market !== 'CN') {
        return { ...def, price: null, pct: null, change: null, prevClose: null, open: null, high: null, low: null, available: false, unavailableReason: '新浪不支持海外指数' };
      }
      const raw = map[def.code];
      if (!raw) return { ...def, price: null, pct: null, change: null, available: false, unavailableReason: '无数据' };
      const f = raw.split(',');
      const prevClose = num(f[2]), current = num(f[3]);
      const change = (current !== null && prevClose !== null) ? +(current - prevClose).toFixed(4) : null;
      const pct = (change !== null && prevClose) ? +(change / prevClose * 100).toFixed(2) : null;
      return {
        code: def.code, name: f[0] || def.name, region: def.region,
        price: current, prevClose, open: num(f[1]), high: num(f[4]), low: num(f[5]),
        change, pct, available: current !== null
      };
    });
  }
  // 默认东方财富
  const list = await fetchEM(IDX_SECIDS, 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17');
  return IDX_DEFS.map(def => {
    const row = list.find(d => d.f12 === def.bare);
    if (!row) return { ...def, price: null, pct: null, change: null, prevClose: null, open: null, high: null, low: null, available: false };
    return {
      code: def.code, name: row.f14 || def.name, region: def.region,
      price: num(row.f2), pct: num(row.f3), change: num(row.f4),
      volume: num(row.f5), amount: num(row.f6), open: num(row.f17),
      high: num(row.f15), low: num(row.f16), prevClose: num(row.f2 - row.f4),
      available: num(row.f2) !== null
    };
  });
}

// 东方财富补充获取日韩指数(当主源不支持时)
async function fetchEMJapanKorea() {
  const list = await fetchEM('100.N225,100.KS11', 'f2,f3,f4,f12,f14,f15,f16,f17');
  const result = {};
  for (const def of IDX_DEFS.filter(d => d.market !== 'CN')) {
    const row = list.find(d => d.f12 === def.bare);
    if (row) result[def.code] = {
      code: def.code, name: row.f14 || def.name, region: def.region,
      price: num(row.f2), pct: num(row.f3), change: num(row.f4),
      open: num(row.f17), high: num(row.f15), low: num(row.f16),
      prevClose: num(row.f2 - row.f4), available: num(row.f2) !== null,
      supplementSource: '东方财富'
    };
  }
  return result;
}

// ---------- 行情快照 ----------
async function fetchSnapshot() {
  const [idxRaw, rankList, brList] = await Promise.all([
    fetchIndicesBySource(activeSource),
    fetchEM(RANK_SECIDS, 'f2,f3,f4,f12,f14'),
    fetchEM('1.000001,0.399106', 'f12,f14,f104,f105,f106')
  ]);

  // 非东方财富源: 日韩指数自动回退东方财富补充
  let indices = idxRaw;
  if (activeSource !== 'eastmoney') {
    try {
      const supplement = await fetchEMJapanKorea();
      indices = idxRaw.map(d => supplement[d.code] || d);
    } catch {}
  }

  const rankIndices = RANK_DEFS.map(def => {
    const row = rankList.find(d => d.f12 === def.bare);
    if (!row) return { ...def, price: null, pct: null, available: false };
    return { code: def.code, name: row.f14 || def.name, price: num(row.f2), pct: num(row.f3), change: num(row.f4), available: num(row.f2) !== null };
  });

  let advancing = 0, declining = 0, flat = 0;
  for (const d of brList) {
    advancing += parseInt(d.f104) || 0;
    declining += parseInt(d.f105) || 0;
    flat += parseInt(d.f106) || 0;
  }
  const breadth = { advancing, declining, flat, total: advancing + declining + flat };

  // 成交额: 始终东方财富(中证全指 f6)
  let turnover = null;
  try {
    const tList = await fetchEM('1.000985', 'f6,f12,f14');
    const tRow = tList.find(d => d.f12 === '000985');
    turnover = processTurnover(num(tRow?.f6));
  } catch {}

  return { indices, rankIndices, breadth, turnover };
}

// ---------- 成交额 + localStorage 历史 ----------
function pad2(n) { return String(n).padStart(2, '0'); }
function processTurnover(amount) {
  if (amount === null) return null;
  const now = new Date();
  const ds = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  const mm = Math.floor(now.getMinutes() / 5) * 5;
  const tk = `${pad2(now.getHours())}:${pad2(mm)}`;

  let store;
  try { store = JSON.parse(localStorage.getItem('turnover') || '{}'); } catch { store = {}; }

  if (store.today && store.today.date && store.today.date !== ds) {
    store.history = store.history || {};
    store.history[store.today.date] = store.today.samples || {};
    store.today = { date: ds, samples: {} };
  }
  store.today = store.today || { date: ds, samples: {} };
  store.today.samples = store.today.samples || {};
  store.today.samples[tk] = amount;
  try { localStorage.setItem('turnover', JSON.stringify(store)); } catch {}

  let yDate = null, yAmount = null;
  if (store.history) {
    const dates = Object.keys(store.history).sort().reverse();
    for (const d of dates) {
      const samples = store.history[d] || {};
      const keys = Object.keys(samples).filter(k => k <= tk).sort();
      if (keys.length) { yDate = d; yAmount = samples[keys[keys.length - 1]]; break; }
    }
  }
  return { amount, yesterdayDate: yDate, yesterdayAmount: yAmount, diffPct: yAmount ? +((amount - yAmount) / yAmount * 100).toFixed(2) : null };
}

// ---------- 渲染 ----------
function renderIndices(indices) {
  const grid = $('indexGrid');
  if (!indices || !indices.length) { grid.innerHTML = '<div class="loading">暂无数据</div>'; return; }
  grid.innerHTML = indices.map(idx => {
    const up = (idx.pct ?? 0) > 0, down = (idx.pct ?? 0) < 0;
    const dir = up ? 'up' : down ? 'down' : '';
    const supp = idx.supplementSource ? `<span class="supplement-tag" title="主源不支持,由${idx.supplementSource}补全">补充源</span>` : '';
    const unavail = idx.available === false ? `<div style="color:var(--txt-dim);font-size:12px;margin-top:8px">${idx.unavailableReason || '暂不可用'}</div>` : '';
    return `
      <div class="idx-card ${dir}">
        <span class="idx-region">${idx.region || ''}</span>
        ${supp}
        <div class="idx-name">${idx.name || ''}</div>
        <div class="idx-code">${idx.code || ''}</div>
        <div class="idx-price ${cls(idx.pct)}">${idx.price === null ? '--' : fmt(idx.price, 2)}</div>
        ${idx.change !== null ? `
        <div class="idx-change ${cls(idx.pct)}">
          <span class="chg-pill ${bgcls(idx.pct)}">${sign(idx.change)}${fmt(idx.change, 2)}</span>
          <span>${sign(idx.pct)}${fmt(idx.pct, 2)}%</span>
        </div>` : ''}
        <div class="idx-meta">
          ${idx.prevClose !== null ? `<span>昨收 <b>${fmt(idx.prevClose,2)}</b></span>`:''}
          ${idx.open !== null ? `<span>今开 <b>${fmt(idx.open,2)}</b></span>`:''}
          ${idx.high !== null ? `<span>高 <b>${fmt(idx.high,2)}</b></span>`:''}
          ${idx.low !== null ? `<span>低 <b>${fmt(idx.low,2)}</b></span>`:''}
        </div>
        ${unavail}
      </div>`;
  }).join('');
}

function fmtAmount(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  const yi = n / 1e8;
  if (yi >= 10000) return (yi / 10000).toFixed(2) + '万亿';
  return yi.toFixed(2) + '亿';
}

function renderTurnover(to) {
  const el = $('turnover');
  if (!to) { el.innerHTML = '<span class="meta-tip">暂无成交额数据</span>'; return; }
  const diffPct = to.diffPct;
  const yAmt = to.yesterdayAmount !== null ? fmtAmount(to.yesterdayAmount) : '--';
  const diffHtml = diffPct === null
    ? '<span class="meta-tip">较昨日此时:暂无历史(运行满1日后显示)</span>'
    : `<span class="${diffPct >= 0 ? 'up' : 'down'}">较昨日此时 ${diffPct >= 0 ? '+' : ''}${diffPct}%</span>`;
  el.innerHTML = `
    <div class="to-row">
      <div class="to-main">
        <span class="to-val">${fmtAmount(to.amount)}</span>
        <span class="to-lbl">今日累计</span>
      </div>
      <div class="to-compare">
        ${diffHtml}
        <span class="meta-tip">昨日同时点 ${yAmt}</span>
      </div>
    </div>`;
  $('turnoverTime').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN')}`;
}

function renderBreadth(b) {
  const bar = $('breadthBar');
  if (!bar) return;
  if (!b || !b.total) {
    bar.innerHTML = '<div class="bar-green" style="width:50%"></div><div class="bar-red" style="width:50%"></div>';
    return;
  }
  const advPct = (b.advancing / b.total * 100).toFixed(1);
  const decPct = (b.declining / b.total * 100).toFixed(1);
  bar.innerHTML =
    `<div class="bar-green" style="width:${advPct}%" title="上涨 ${b.advancing}家"></div>` +
    `<div class="bar-red" style="width:${decPct}%" title="下跌 ${b.declining}家"></div>`;
}

function renderRanking(indices) {
  const el = $('rankList');
  if (!indices || !indices.length) { el.innerHTML = '<div class="loading">暂无数据</div>'; return; }
  const list = indices.filter(i => i.available && i.pct !== null).slice().sort((a, b) => (b.pct || 0) - (a.pct || 0));
  el.innerHTML = list.map((i, idx) => {
    const dir = i.pct > 0 ? 'up' : i.pct < 0 ? 'down' : '';
    return `
    <div class="rank-item ${dir}">
      <span class="rank-no">${idx + 1}</span>
      <span class="rank-name">${i.name || ''}</span>
      <span class="rank-pct">${i.pct > 0 ? '+' : ''}${fmt(i.pct, 2)}%</span>
    </div>`;
  }).join('');
}

function renderSnapshot(snap) {
  renderIndices(snap.indices);
  renderRanking(snap.rankIndices || []);
  renderTurnover(snap.turnover);
  renderBreadth(snap.breadth);
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  $('idxTime').textContent = `行情日期 ${todayStr} · 更新于 ${now.toLocaleTimeString('zh-CN')}`;
  $('refreshBadge').textContent = '● 实时';
}

// ---------- 灰白模式 ----------
function applyGrayMode(on) {
  document.body.classList.toggle('gray-mode', on);
  const btn = $('grayBtn');
  if (btn) btn.textContent = on ? '☀ 彩色' : '🌙 灰白';
  try { localStorage.setItem('grayMode', on ? '1' : '0'); } catch {}
}
(function initGray() {
  let on = false;
  try { on = localStorage.getItem('grayMode') === '1'; } catch {}
  applyGrayMode(on);
})();

// ---------- 数据源 UI ----------
function initSourceSelect() {
  const sel = $('srcSelect');
  sel.innerHTML = SOURCES.map(s => `<option value="${s.id}" title="${s.desc}">${s.name}</option>`).join('');
  // 恢复上次选择
  try {
    const saved = localStorage.getItem('activeSource');
    if (saved && SOURCES.find(s => s.id === saved)) activeSource = saved;
  } catch {}
  sel.value = activeSource;
  sel.addEventListener('change', () => {
    activeSource = sel.value;
    try { localStorage.setItem('activeSource', activeSource); } catch {}
    renderSourceBar();
    // 立即刷新一次
    clearTimeout(_loopTimer);
    refresh();
  });
}

function renderSourceBar() {
  const bar = $('sourceBar');
  if (!bar) return;
  const cur = SOURCES.find(s => s.id === activeSource);
  const parts = SOURCES.map(s => {
    const h = sourceHealth[s.id];
    let dot = '○', cls2 = 'src-dim';
    if (h) {
      if (h.ok) { dot = '●'; cls2 = 'src-ok'; }
      else { dot = '●'; cls2 = 'src-err'; }
    }
    const active = s.id === activeSource ? ' src-active' : '';
    return `<span class="src-item ${cls2}${active}" title="${s.desc}">${dot} ${s.name}${h && h.latency ? ` ${h.latency}ms` : ''}</span>`;
  });
  bar.innerHTML = `<span class="src-cur">当前: <b>${cur.name}</b></span>` + parts.join('');
}

// 健康检测: 探测各数据源
async function probeAllSources() {
  const btn = $('healthBtn');
  if (btn) btn.textContent = '检测中…';
  const probes = SOURCES.map(async s => {
    const t0 = Date.now();
    try {
      if (s.id === 'eastmoney') {
        await fetchEM('1.000001', 'f2,f3');
      } else if (s.id === 'tencent') {
        await fetchTencent(['sh000001']);
      } else if (s.id === 'sina') {
        await fetchSina(['sh000001']);
      }
      sourceHealth[s.id] = { ok: true, latency: Date.now() - t0 };
    } catch (e) {
      sourceHealth[s.id] = { ok: false, latency: Date.now() - t0, err: e.message };
    }
  });
  await Promise.all(probes);
  renderSourceBar();
  if (btn) btn.textContent = '健康检测';
}

// ---------- 主循环 ----------
let _loopTimer = null;
let _failCount = 0;
async function refresh() {
  try {
    const snap = await fetchSnapshot();
    renderSnapshot(snap);
    _failCount = 0;
    $('refreshBadge').textContent = '● 实时';
    $('refreshBadge').classList.remove('badge-err');
  } catch (e) {
    _failCount++;
    const badge = $('refreshBadge');
    if (_failCount >= 2) {
      badge.textContent = '⚠ 获取失败';
      badge.classList.add('badge-err');
      badge.title = `${e.message}\n如长期失败,可能是:\n1. 浏览器扩展(广告拦截/隐私)屏蔽了行情接口\n2. 当前网络限速\n3. 浏览器过旧不支持 fetch/AbortController\n可尝试切换数据源或禁用扩展`;
    } else {
      badge.textContent = '● 重试中';
    }
  } finally {
    _loopTimer = setTimeout(refresh, REFRESH_MS);
  }
}

// ---------- 初始化 ----------
initSourceSelect();
renderSourceBar();
refresh();

// ---------- 事件绑定 ----------
$('grayBtn').addEventListener('click', () => applyGrayMode(!document.body.classList.contains('gray-mode')));
$('healthBtn').addEventListener('click', probeAllSources);
