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

// 6大指数(中证全指末尾)
const IDX_DEFS = [
  { code: 'sh000001', name: '上证指数', region: '中国大陆', bare: '000001' },
  { code: 'sz399006', name: '创业板指', region: '中国大陆', bare: '399006' },
  { code: 'sh000688', name: '科创50',   region: '中国大陆', bare: '000688' },
  { code: 'N225',     name: '日经225',  region: '日本',     bare: 'N225' },
  { code: 'KS11',     name: '韩国综合', region: '韩国',     bare: 'KS11' },
  { code: 'sh000985', name: '中证全指', region: '中国大陆', bare: '000985' }
];
const IDX_SECIDS = '1.000001,0.399006,1.000688,100.N225,100.KS11,1.000985';

// 11个A股排名指数
const RANK_DEFS = [
  { code: 'sh000001', name: '上证指数', bare: '000001' },
  { code: 'sh000016', name: '上证50',   bare: '000016' },
  { code: 'sh000300', name: '沪深300', bare: '000300' },
  { code: 'sh000905', name: '中证500', bare: '000905' },
  { code: 'sh000852', name: '中证1000',bare: '000852' },
  { code: 'sh000985', name: '中证全指', bare: '000985' },
  { code: 'sh000688', name: '科创50',   bare: '000688' },
  { code: 'sh931643', name: '双创50',   bare: '931643' },
  { code: 'sz399001', name: '深证成指', bare: '399001' },
  { code: 'sz399006', name: '创业板指', bare: '399006' },
  { code: 'sz399102', name: '创业板综', bare: '399102' }
];
const RANK_SECIDS = '1.000001,1.000016,1.000300,1.000905,1.000852,1.000985,1.000688,2.931643,0.399001,0.399006,0.399102';

// ---------- 东方财富直连 ----------
async function fetchEM(secids, fields) {
  const url = `${EM_BASE}?fields=${fields}&secids=${secids}&fltt=2`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('EM HTTP ' + r.status);
  const j = await r.json();
  return j?.data?.diff || [];
}

// ---------- 行情快照 ----------
async function fetchSnapshot() {
  const [idxList, rankList, brList] = await Promise.all([
    fetchEM(IDX_SECIDS, 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17'),
    fetchEM(RANK_SECIDS, 'f2,f3,f4,f12,f14'),
    fetchEM('1.000001,0.399106', 'f12,f14,f104,f105,f106')
  ]);

  const indices = IDX_DEFS.map(def => {
    const row = idxList.find(d => d.f12 === def.bare);
    if (!row) return { ...def, price: null, pct: null, change: null, prevClose: null, open: null, high: null, low: null, available: false };
    return {
      code: def.code, name: row.f14 || def.name, region: def.region,
      price: num(row.f2), pct: num(row.f3), change: num(row.f4),
      volume: num(row.f5), amount: num(row.f6), open: num(row.f17),
      high: num(row.f15), low: num(row.f16), prevClose: num(row.f2 - row.f4),
      available: num(row.f2) !== null
    };
  });

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

  // 成交额: 中证全指 f6, localStorage 持久化历史
  const tRow = idxList.find(d => d.f12 === '000985');
  const turnover = processTurnover(num(tRow?.f6));

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
    const unavail = idx.available === false ? `<div style="color:var(--txt-dim);font-size:12px;margin-top:8px">${idx.unavailableReason || '暂不可用'}</div>` : '';
    return `
      <div class="idx-card ${dir}">
        <span class="idx-region">${idx.region || ''}</span>
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

// ---------- 主循环 ----------
let _loopTimer = null;
async function refresh() {
  try {
    const snap = await fetchSnapshot();
    renderSnapshot(snap);
  } catch (e) {
    $('refreshBadge').textContent = '⚠ 获取失败';
  } finally {
    _loopTimer = setTimeout(refresh, REFRESH_MS);
  }
}
refresh();

// ---------- 事件绑定 ----------
$('grayBtn').addEventListener('click', () => applyGrayMode(!document.body.classList.contains('gray-mode')));
