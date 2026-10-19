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
  { code: 'sh000001', name: '上证指数', region: '中国大陆', bare: '000001', market: 'CN', secid: '1.000001' },
  { code: 'sz399006', name: '创业板指', region: '中国大陆', bare: '399006', market: 'CN', secid: '0.399006' },
  { code: 'sh000688', name: '科创50',   region: '中国大陆', bare: '000688', market: 'CN', secid: '1.000688' },
  { code: 'N225',     name: '日经225',  region: '日本',     bare: 'N225',   market: 'JP', secid: '100.N225' },
  { code: 'KS11',     name: '韩国综合', region: '韩国',     bare: 'KS11',   market: 'KR', secid: '100.KS11' },
  { code: 'sh000985', name: '中证全指', region: '中国大陆', bare: '000985', market: 'CN', secid: '1.000985' }
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
  { id: 'tencent',   name: '腾讯财经', desc: 'GBK行情,支持A股指数;日韩/涨跌家数自动回退东方财富' }
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
  // GitHub Pages 海外节点访问国内接口延迟高, 超时设12秒, 尝试2个域名
  for (let i = 0; i < Math.min(2, EM_HOSTS.length); i++) {
    const hostIdx = (_emHostIdx + i) % EM_HOSTS.length;
    const url = `${EM_HOSTS[hostIdx]}?fields=${fields}&secids=${secids}&fltt=2`;
    try {
      const j = await fetchWithTimeout(url, 12000);
      if (j && j.data && j.data.diff) {
        _emHostIdx = hostIdx;
        return j.data.diff;
      }
      lastErr = new Error('返回数据为空');
    } catch (e) { lastErr = e; }
  }
  // XHR 兜底(12秒超时)
  try {
    const url = `${EM_HOSTS[_emHostIdx]}?fields=${fields}&secids=${secids}&fltt=2`;
    const j = await fetchXHR(url);
    if (j && j.data && j.data.diff) return j.data.diff;
  } catch (e) { lastErr = e; }
  throw lastErr || new Error('东方财富请求失败');
}

function fetchXHR(url) {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 12000;
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
    const resp = await fetchWithTimeoutArray(url, 12000);
    text = new TextDecoder('gbk').decode(resp);
  } catch (e) {
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
      xhr.timeout = 12000;
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
// 合并为单个东方财富请求(指数+排名+涨跌家数+成交额), 减少并发避免超时
const ALL_SECIDS = '1.000001,0.399006,1.000688,100.N225,100.KS11,1.000985,1.000016,1.000300,1.000905,1.000852,2.932000,2.931643,0.399001,0.399102,0.399106';
const ALL_FIELDS = 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f104,f105,f106';

async function fetchSnapshot() {
  // 步骤1: 从选中的数据源获取6大指数
  let idxRaw = [];
  try {
    idxRaw = await fetchIndicesBySource(activeSource);
  } catch (e) {
    console.warn('main source failed, fallback eastmoney:', e.message);
    idxRaw = await fetchIndicesBySource('eastmoney');
  }

  // 步骤2: 单个东方财富请求获取排名+涨跌家数+成交额
  let allData = [];
  try {
    allData = await fetchEM(ALL_SECIDS, ALL_FIELDS);
  } catch (e) {
    console.warn('allData failed:', e.message);
  }

  // 非东方财富源: 日韩指数从 allData 补充
  if (activeSource !== 'eastmoney' && idxRaw.length) {
    for (const def of IDX_DEFS.filter(d => d.market !== 'CN')) {
      const row = allData.find(d => d.f12 === def.bare);
      if (row) {
        const idx = idxRaw.findIndex(d => d.code === def.code);
        if (idx >= 0) {
          idxRaw[idx] = {
            code: def.code, name: row.f14 || def.name, region: def.region,
            price: num(row.f2), pct: num(row.f3), change: num(row.f4),
            open: num(row.f17), high: num(row.f15), low: num(row.f16),
            prevClose: num(row.f2 - row.f4), available: num(row.f2) !== null,
            supplementSource: '东方财富'
          };
        }
      }
    }
  }

  // 排名
  const rankIndices = RANK_DEFS.map(def => {
    const row = allData.find(d => d.f12 === def.bare);
    if (!row) return { ...def, price: null, pct: null, available: false };
    return { code: def.code, name: row.f14 || def.name, price: num(row.f2), pct: num(row.f3), change: num(row.f4), available: num(row.f2) !== null };
  });

  // 涨跌家数 (1.000001 沪市 + 0.399106 深市)
  let advancing = 0, declining = 0, flat = 0;
  for (const d of allData) {
    if (d.f12 === '000001' || d.f12 === '399106') {
      advancing += parseInt(d.f104) || 0;
      declining += parseInt(d.f105) || 0;
      flat += parseInt(d.f106) || 0;
    }
  }
  const breadth = { advancing, declining, flat, total: advancing + declining + flat };

  // 成交额: 中证全指 f6
  let turnover = null;
  const tRow = allData.find(d => d.f12 === '000985');
  if (tRow) turnover = processTurnover(num(tRow.f6));

  if (!idxRaw.length) throw new Error('指数数据获取失败');
  return { indices: idxRaw, rankIndices, breadth, turnover };
}

// ---------- 成交额 + localStorage 历史 ----------
function processTurnover(amount) {
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

  // 非交易时段 f6 可能返回 0 或 null, 用当日最近一次有效样本兜底
  let effAmount = amount;
  if (!amount || amount <= 0) {
    const todayKeys = Object.keys(store.today.samples).sort();
    if (todayKeys.length) {
      effAmount = store.today.samples[todayKeys[todayKeys.length - 1]];
    }
  }
  if (effAmount === null || effAmount === undefined || effAmount <= 0) return null;

  store.today.samples[tk] = effAmount;
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
  return { amount: effAmount, yesterdayDate: yDate, yesterdayAmount: yAmount, diffPct: yAmount ? +((effAmount - yAmount) / yAmount * 100).toFixed(2) : null };
}

// ---------- 本地缓存(刷新页面时先显示旧数据,避免空白) ----------
const CACHE_KEY = 'snapshotCache_v1';
function saveCache(snap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), snap }));
  } catch {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && p.snap ? p : null;
  } catch { return null; }
}

// ---------- 渲染 ----------
function renderIndices(indices) {
  const grid = $('indexGrid');
  if (!indices || !indices.length) { return; }
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
        <div class="idx-chart-wrap"><canvas class="idx-chart" data-code="${idx.code}"></canvas></div>
        ${unavail}
      </div>`;
  }).join('');
  redrawAllCharts();
}

// ---------- 6大指数分时图 ----------
const TREND_HOSTS = [
  'https://82.push2.eastmoney.com/api/qt/stock/trends2/get',
  'https://push2.eastmoney.com/api/qt/stock/trends2/get',
  'https://push2his.eastmoney.com/api/qt/stock/trends2/get'
];
const KLINE_HOSTS = [
  'https://82.push2.eastmoney.com/api/qt/stock/kline/get',
  'https://push2his.eastmoney.com/api/qt/stock/kline/get',
  'https://push2.eastmoney.com/api/qt/stock/kline/get'
];
const CHART_TTL = 30000;
const trendCache = {};              // code -> { today, prev, ts }
const YESTERDAY_FULL_LS = 'idx_yesterday_full_v1'; // 完整分时缓存
const YESTERDAY_OHLC_LS = 'idx_yesterday_ohlc_v1'; // OHLC 缓存(兜底)

function hexA(hex, a) {
  const m = (hex || '').replace('#', '');
  if (m.length !== 6) return `rgba(234,57,67,${a})`;
  const r = parseInt(m.substr(0, 2), 16), g = parseInt(m.substr(2, 2), 16), b = parseInt(m.substr(4, 2), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function lsGet(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// 交易时间映射: 9:30-11:30 (120min) + 13:00-15:00 (120min) = 240min
// 返回该时间在全天的 [0,1] 偏移, 非交易时段返回 null
function tradeFrac(hhmm) {
  const h = parseInt(hhmm.substr(0, 2), 10), m = parseInt(hhmm.substr(3, 2), 10);
  const mins = h * 60 + m;
  // 上午 9:30 (570) - 11:30 (690)
  if (mins >= 570 && mins <= 690) return (mins - 570) / 240;
  // 下午 13:00 (780) - 15:00 (900)
  if (mins >= 780 && mins <= 900) return (mins - 570 - 90) / 240; // 减90分钟午休
  return null;
}

// 从 trends2 拉当天完整分时, 存 {frac, price} 时间偏移
async function fetchTodayTrend(def) {
  const q = `secid=${def.secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f53&iscr=0&ndays=1&_t=${Date.now()}`;
  for (const host of TREND_HOSTS) {
    try {
      const j = await fetchWithTimeout(`${host}?${q}`, 12000);
      const d = j && j.data;
      if (d && d.trends && d.trends.length) {
        const pts = [];
        for (const line of d.trends) {
          const [ts, price] = line.split(',');
          const p = parseFloat(price);
          if (!Number.isFinite(p)) continue;
          const hhmm = ts.substr(11, 5);
          const frac = tradeFrac(hhmm);
          if (frac !== null) pts.push({ frac, price: p });
        }
        if (pts.length) {
          return {
            date: d.trends[0].substr(0, 10),
            preClose: num(d.preClose) ?? pts[0].price,
            points: pts,          // [{frac, price}]
            rawPrices: pts.map(x => x.price) // 方便取最后一个
          };
        }
      }
    } catch {}
  }
  return null;
}

// 拉日线 OHLC: 东方财富 kline (多 host 轮询)
async function fetchPrevDayOHLC(def) {
  const today = new Date().toISOString().substr(0, 10);
  for (const host of KLINE_HOSTS) {
    try {
      const q = `secid=${def.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&lmt=3`;
      const j = await fetchWithTimeout(`${host}?${q}`, 8000);
      const d = j && j.data;
      if (d && d.klines && d.klines.length >= 1) {
        let prevLine = null;
        for (let i = d.klines.length - 1; i >= 0; i--) {
          if (!d.klines[i].startsWith(today)) { prevLine = d.klines[i]; break; }
        }
        if (!prevLine) prevLine = d.klines[0];
        const parts = prevLine.split(',');
        return {
          date: parts[0].substr(0, 10),
          open: parseFloat(parts[1]), close: parseFloat(parts[2]),
          high: parseFloat(parts[3]), low: parseFloat(parts[4])
        };
      }
    } catch {}
  }
  return null;
}

async function fetchTrend(def) {
  // 1. 拉今天完整分时
  let today = await fetchTodayTrend(def);

  // 2. 昨天: 优先 localStorage 缓存的完整分时, 兜底日线 OHLC 4 点
  let prev = null;
  const fullCache = lsGet(YESTERDAY_FULL_LS);
  const fc = fullCache[def.code];
  if (fc && fc.points && fc.points.length > 50) {
    prev = {
      date: fc.date,
      preClose: fc.preClose,
      points: fc.points,           // 已是 [{frac, price}]
      rawPrices: fc.points.map(x => x.price),
      isSimplified: false
    };
  } else {
    let ohlc = await fetchPrevDayOHLC(def);
    if (!ohlc || !Number.isFinite(ohlc.open)) {
      const ohlcCache = lsGet(YESTERDAY_OHLC_LS);
      ohlc = ohlcCache[def.code] || null;
    }
    if (ohlc && Number.isFinite(ohlc.open)) {
      // 4 点时间位置: open(9:30→0), high(10:30→0.25), low(14:00→0.75), close(15:00→1.0)
      prev = {
        date: ohlc.date,
        preClose: ohlc.open,
        points: [
          { frac: 0.0,  price: ohlc.open },
          { frac: 0.25, price: ohlc.high },
          { frac: 0.75, price: ohlc.low },
          { frac: 1.0,  price: ohlc.close }
        ],
        rawPrices: [ohlc.open, ohlc.high, ohlc.low, ohlc.close],
        isSimplified: true
      };
      const ohlcCache = lsGet(YESTERDAY_OHLC_LS);
      ohlcCache[def.code] = ohlc;
      lsSet(YESTERDAY_OHLC_LS, ohlcCache);
    }
  }

  // 3. 缓存今天数据(收盘后≥200点就存为明天的昨天)
  if (today && today.points.length >= 200) {
    const fc = lsGet(YESTERDAY_FULL_LS);
    fc[def.code] = { date: today.date, preClose: today.preClose, points: today.points, ts: Date.now() };
    lsSet(YESTERDAY_FULL_LS, fc);
  }

  if (!today && !prev) throw new Error('all fetch fail');
  trendCache[def.code] = { today, prev, ts: Date.now() };
}

function drawChart(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const { prev, today } = data;
  const left = prev, right = today;
  if (!left && !right) return;

  const styles = getComputedStyle(document.body);
  const upColor = (styles.getPropertyValue('--up').trim()) || '#ea3943';
  const downColor = (styles.getPropertyValue('--down').trim()) || '#16c784';
  const dimColor = 'rgba(139,148,158,.4)';

  const halfW = w / 2;

  // 时间轴刻度: 9:30 / 10:30 / 11:30-13:00午休 gap(中间0.5-0.625跳过) / 14:00 / 15:00
  // 但为了简洁, 只在 0.5 (午休起点) 和 0.625 (午休终点) 之间留白即可
  // 实际画 X 时, 用完整 0~1 frac 线性映射, 中间 0.5~0.625 午休区不画任何线

  const drawSide = (side, xOffset, width, label) => {
    if (!side) {
      ctx.fillStyle = 'rgba(139,148,158,.5)';
      ctx.font = '9px -apple-system,"Segoe UI",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('暂无数据', xOffset + width / 2, h / 2);
      return;
    }
    const { preClose, points, isSimplified } = side;
    const prices = points.map(p => p.price);
    let min = Math.min(preClose, ...prices);
    let max = Math.max(preClose, ...prices);
    const pad = (max - min) * 0.15 || Math.abs(preClose) * 0.002;
    min -= pad; max += pad;
    const yFn = p => h - ((p - min) / (max - min)) * h;
    const xFn = frac => xOffset + frac * width;

    // 画 preClose 基准线
    const yBase = yFn(preClose);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xOffset, yBase); ctx.lineTo(xOffset + width, yBase); ctx.stroke();
    ctx.setLineDash([]);

    // 画午休区空白背景 (0.5 ~ 0.625)
    // 不需要额外画, 因为没点就空着, 但可以画个浅色分割
    ctx.fillStyle = 'rgba(139,148,158,.06)';
    ctx.fillRect(xFn(0.5), 0, width * 0.125, h);

    const last = prices[prices.length - 1];
    const color = last >= preClose ? upColor : downColor;

    // 渐变填充(简化日不画)
    if (!isSimplified && points.length) {
      ctx.beginPath();
      ctx.moveTo(xFn(points[0].frac), yFn(points[0].price));
      for (let i = 1; i < points.length; i++) {
        // 如果 frac 跳过大 (>0.05) 说明是午休, 跳过连线
        if (points[i].frac - points[i - 1].frac > 0.1) {
          ctx.lineTo(xFn(0.5), yFn(points[i - 1].price));
          ctx.moveTo(xFn(0.625), yFn(points[i].price));
        } else {
          ctx.lineTo(xFn(points[i].frac), yFn(points[i].price));
        }
      }
      // 闭合到底部
      ctx.lineTo(xFn(Math.min(points[points.length - 1].frac, 1)), h);
      ctx.lineTo(xOffset, h);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, hexA(color, 0.22));
      grad.addColorStop(1, hexA(color, 0));
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 价格线(处理午休断裂)
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i++) {
      const fx = xFn(points[i].frac), fy = yFn(points[i].price);
      if (!started) { ctx.moveTo(fx, fy); started = true; }
      else {
        if (points[i].frac - points[i - 1].frac > 0.1) {
          // 午休 gap, 不连
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(fx, fy);
        } else {
          ctx.lineTo(fx, fy);
        }
      }
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = isSimplified ? 1 : 1.4;
    ctx.lineJoin = 'round';
    if (isSimplified) { ctx.setLineDash([3, 2]); }
    ctx.stroke();
    ctx.setLineDash([]);

    // 数据点
    if (isSimplified) {
      points.forEach(pt => {
        ctx.beginPath();
        ctx.arc(xFn(pt.frac), yFn(pt.price), 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    } else if (points.length) {
      ctx.beginPath();
      ctx.arc(xFn(points[points.length - 1].frac), yFn(last), 2.2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // 时间刻度线 (轻微)
    ctx.strokeStyle = 'rgba(139,148,158,.25)';
    ctx.lineWidth = 0.5;
    [0.25, 0.5, 0.625, 0.75].forEach(f => {
      ctx.beginPath();
      ctx.moveTo(xFn(f), 0); ctx.lineTo(xFn(f), h);
      ctx.stroke();
    });

    // 日期标注
    ctx.fillStyle = 'rgba(139,148,158,.7)';
    ctx.font = '9px -apple-system,"Segoe UI",sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(side.date.substr(5), xOffset + 3, 2);
    if (label) {
      ctx.textAlign = 'right';
      ctx.fillText(label, xOffset + width - 3, 2);
    }
  };

  // 左边: 昨天
  drawSide(left, 0, halfW, left ? '昨' : null);
  // 中间竖线
  ctx.strokeStyle = 'rgba(139,148,158,.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(halfW, 0); ctx.lineTo(halfW, h); ctx.stroke();
  ctx.setLineDash([]);
  // 右边: 今天
  drawSide(right, halfW, halfW, right ? '今' : null);
}

function redrawAllCharts() {
  document.querySelectorAll('canvas.idx-chart').forEach(cv => {
    const d = trendCache[cv.dataset.code];
    if (d) drawChart(cv, d);
  });
}

async function refreshAllCharts() {
  for (const def of IDX_DEFS) {
    try { await fetchTrend(def); } catch {}
    redrawAllCharts();
    await new Promise(r => setTimeout(r, 120)); // 顺序请求,避免并发限流
  }
}
let _chartTimer = setInterval(refreshAllCharts, CHART_TTL);
let _resizeTimer;
window.addEventListener('resize', () => { clearTimeout(_resizeTimer); _resizeTimer = setTimeout(redrawAllCharts, 200); });

function fmtAmount(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  const yi = n / 1e8;
  if (yi >= 10000) return (yi / 10000).toFixed(2) + '万亿';
  return yi.toFixed(2) + '亿';
}

function renderTurnover(to) {
  const el = $('turnover');
  if (!to) { return; }
  el.innerHTML = `
    <div class="to-row">
      <div class="to-main">
        <span class="to-val">${fmtAmount(to.amount)}</span>
        <span class="to-lbl">全A股(中证全指累计) · 今日</span>
      </div>
    </div>`;
}

function renderBreadth(b) {
  const bar = $('breadthBar');
  if (!bar) return;
  if (!b || !b.total) {
    bar.innerHTML = '<div class="bar-green" style="width:50%"></div><div class="bar-red" style="width:50%"></div>';
    return;
  }
  const advPct = (b.advancing / b.total * 100).toFixed(1);
  const decPct = ((b.declining + b.flat) / b.total * 100).toFixed(1);
  bar.innerHTML =
    `<div class="bar-green" style="width:${advPct}%" title="上涨 ${b.advancing}家">${b.advancing}</div>` +
    `<div class="bar-red" style="width:${decPct}%" title="下跌 ${b.declining}家 + 平盘 ${b.flat}家">${b.declining + b.flat}</div>`;
}

function renderRanking(indices) {
  const el = $('rankList');
  if (!indices || !indices.length) { return; }
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
  saveCache(snap);
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
let _refreshing = false; // 防堆积: 上一次未完成则跳过
async function refresh() {
  if (_refreshing) { _loopTimer = setTimeout(refresh, REFRESH_MS); return; }
  _refreshing = true;
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
      badge.title = `${e.message}\n如长期失败,可能是:\n1. 浏览器扩展(广告拦截/隐私)屏蔽了行情接口\n2. 当前网络限速(GitHub Pages海外节点访问国内接口延迟高)\n3. 浏览器过旧不支持 fetch/AbortController\n可尝试切换数据源或禁用扩展`;
    } else {
      badge.textContent = '● 重试中';
    }
  } finally {
    _refreshing = false;
    _loopTimer = setTimeout(refresh, REFRESH_MS);
  }
}

// ---------- 初始化 ----------
if ($('srcSelect')) initSourceSelect();
if ($('sourceBar')) renderSourceBar();
// 先读缓存立即渲染,避免接口失败时显示空白
(() => {
  const cached = loadCache();
  if (cached && cached.snap) {
    try { renderSnapshot(cached.snap); } catch {}
    const ageMin = cached.ts ? Math.floor((Date.now() - cached.ts) / 60000) : null;
    if (ageMin && ageMin > 1) {
      $('refreshBadge').textContent = `缓存 ${ageMin}分钟前`;
    }
  }
})();
refresh();
// 分时图: 卡片首次渲染后立即拉取一次(之后每30秒自动刷新)
setTimeout(refreshAllCharts, 100);

// ---------- 基金涨幅榜(近6月Top3, ETF去重同指数) ----------
// ETF名称去重: 去掉基金公司后缀(如"疫苗ETF嘉实"→"疫苗ETF"), 同指数只保留涨幅最高的
const FUND_COMPANIES = ['嘉实','国泰','富国','华夏','易方达','南方','广发','招商','博时','鹏华','汇添富','工银','建信','华泰柏瑞','银华','天弘','华安','平安','摩根','东财','民生加银','永赢','浦银','前海开源','景顺','泰康','中金','中信','国投瑞银','大成','长盛','银河','长城','长信','宝盈','信达澳亚','万家','金鹰','中海','申万菱信','华商','益民','东吴','诺安','兴业','天治','国海富兰克林','国联安','海富通','泰信','巨田','东方','国寿安保','英大','中加','西部利得','长安','富安达','德邦','汇丰晋信','上银','创金合信','红土创新','嘉合','中科沃土','北信瑞丰','金信','华宸未来','中原英石','新沃','中融','中邮','太平','中航','华宝','华富','华泰保兴','交银','金元顺安','景顺长城','九泰','凯石','诺德','平安大华','平安基金','浦银安盛','前海联合','乾道','融通','上投摩根','泰达宏利','新华','鑫元','信达澳银','兴业基金','兴证全球','兴全','圆信永丰','浙商','中金基金','中欧','中庚','中信建投','中信保诚','中银','中银国际','朱雀','华润元大','汇安','交银施罗德','新华基金','招商基金','朱雀基金'].sort((a,b)=>b.length-a.length);
function etfBaseName(name) {
  for (const c of FUND_COMPANIES) {
    if (name.endsWith(c)) return name.slice(0, -c.length).trim();
  }
  return name;
}
async function fetchFundRanking() {
  // 改用 push2.eastmoney.com (支持CORS, 无需Referer), fs=b:MK0021 为ETF基金, fid=f160 按近6月收益率排序
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&po=1&np=1&fltt=2&invt=2&fid=f160&fs=b:MK0021&fields=f2,f3,f12,f14,f160&_t=${Date.now()}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    const diff = (j && j.data && j.data.diff) || [];
    return diff.map(d => ({
      code: d.f12,
      name: d.f14,
      price: d.f2,
      dayPct: d.f3,
      sixMonthPct: d.f160
    })).filter(f => Number.isFinite(f.sixMonthPct));
  } catch { return []; }
}
function renderFundRanking(funds) {
  const el = $('fundList');
  if (!el) return;
  if (!funds || !funds.length) { el.innerHTML = '<div class="loading">暂无数据</div>'; return; }
  // 去重: 同指数ETF(去掉公司后缀)只保留近6月涨幅最高的一个
  const dedup = new Map();
  for (const f of funds) {
    const base = etfBaseName(f.name);
    if (!dedup.has(base) || f.sixMonthPct > dedup.get(base).sixMonthPct) {
      dedup.set(base, f);
    }
  }
  // 按近6月涨幅降序, 取前3名
  const top = [...dedup.values()].sort((a, b) => b.sixMonthPct - a.sixMonthPct).slice(0, 3);

  el.innerHTML = top.map((f, gi) => {
    const cls = f.sixMonthPct >= 0 ? 'up' : 'down';
    const displayName = etfBaseName(f.name);
    return `<div class="fund-group">
      <div class="fund-group-head"><span class="rank-idx">${gi + 1}</span>${displayName}<span class="rank-val ${cls}">${f.sixMonthPct >= 0 ? '+' : ''}${f.sixMonthPct.toFixed(2)}%</span></div>
      <div class="rank-item fund-item">
        <span class="rank-name" title="${f.code}">${f.code}</span>
        <span class="rank-val ${cls}">${f.dayPct !== null && f.dayPct !== undefined ? (f.dayPct >= 0 ? '+' : '') + f.dayPct.toFixed(2) + '%' : '--'}</span>
      </div>
    </div>`;
  }).join('') || '<div class="loading">暂无数据</div>';
}
async function refreshFunds() {
  try {
    const funds = await fetchFundRanking();
    renderFundRanking(funds);
  } catch {}
}
refreshFunds();

// ---------- 事件绑定 ----------
$('grayBtn')?.addEventListener('click', () => applyGrayMode(!document.body.classList.contains('gray-mode')));
$('healthBtn')?.addEventListener('click', probeAllSources);
