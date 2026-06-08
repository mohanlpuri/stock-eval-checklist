// app.js — Stock Evaluation Checklist
// All data fetching goes through /netlify/functions/finnhub (server-side proxy)

// ─── State ────────────────────────────────────────────────────────────────
let stockData = null;
let moatScores = { brand: 0, switching: 0, network: 0, cost: 0, ip: 0, mgmt: 0, esg: 0, tailwind: 0 };

// ─── API helpers ──────────────────────────────────────────────────────────
async function finhub(endpoint, params = {}) {
  const res = await fetch('/.netlify/functions/finnhub', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, params }),
  });
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json();
}

// ─── Entry point ──────────────────────────────────────────────────────────
async function fetchStock() {
  const ticker = document.getElementById('tickerInput').value.trim().toUpperCase();
  if (!ticker) { setStatus('Please enter a ticker symbol', 'error'); return; }

  setBusy(true);
  setStatus(`Fetching data for ${ticker}...`, 'loading');
  document.getElementById('mainContent').innerHTML = loadingHTML(ticker);

  try {
    const [quote, profile, metrics, earnings, rec] = await Promise.all([
      finhub('/quote',                { symbol: ticker }),
      finhub('/stock/profile2',       { symbol: ticker }),
      finhub('/stock/metric',         { symbol: ticker, metric: 'all' }),
      finhub('/stock/earnings',       { symbol: ticker, limit: 4 }),
      finhub('/stock/recommendation', { symbol: ticker }).catch(() => []),
    ]);

    if (!profile || !profile.name) {
      setStatus(`Ticker "${ticker}" not found. Check spelling.`, 'error');
      document.getElementById('mainContent').innerHTML = emptyState();
      setBusy(false);
      return;
    }

    moatScores = { brand: 0, switching: 0, network: 0, cost: 0, ip: 0, mgmt: 0, esg: 0, tailwind: 0 };
    stockData = { ticker, quote, profile, metrics: metrics.metric || {}, earnings: earnings || [], rec: rec || [] };

    renderChecklist();
    setStatus(`✓ ${profile.name} (${ticker}) loaded · ${new Date().toLocaleTimeString()}`, 'success');
    document.getElementById('dlBtn').disabled = false;

  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    document.getElementById('mainContent').innerHTML = emptyState();
  }
  setBusy(false);
}

// ─── Render ───────────────────────────────────────────────────────────────
function renderChecklist() {
  const { ticker, quote, profile, metrics: m, earnings, rec } = stockData;
  const price = quote.c;
  const w52h = m['52WeekHigh'];
  const w52l = m['52WeekLow'];
  const pct52 = (w52h && w52l && w52h !== w52l)
    ? ((price - w52l) / (w52h - w52l) * 100)
    : null;

  // Signals
  const [peSig, peCls]   = sig(m.peBasicExclExtraTTM,  15, 25,  true);
  const [pbSig, pbCls]   = sig(m.pb,                    1.5, 3,  true);
  const [deSig, deCls]   = sig(m.totalDebt2TotalEquityAnnual, 1, 2, true);
  const [crSig, crCls]   = sig(m.currentRatioAnnual,    2,  1.5, false);
  const [roeSig, roeCls] = sig(m.roeRfy,               15,   8,  false);
  const [roaSig, roaCls] = sig(m.roaRfy,                5,   2,  false);
  const [gmSig, gmCls]   = sig(m.grossMarginTTM,       40,  20,  false);
  const [nmSig, nmCls]   = sig(m.netProfitMarginTTM,   10,   5,  false);
  const [betaSig, betaCls] = sig(m.beta,                 1, 1.5,  true);
  const [epsg3Sig, epsg3Cls] = sig(m.epsGrowth3Y,      10,   0,  false);
  const [revg3Sig, revg3Cls] = sig(m.revenueGrowth3Y,   8,   0,  false);
  const [qrSig, qrCls]   = sig(m.quickRatioAnnual,      1, 0.7,  false);

  // Dividend
  const divY = m.dividendYieldIndicatedAnnual;
  const [divSig, divCls] = divY > 2 ? ['✓ High', 'sig-good']
    : divY > 0.3 ? ['~ Low', 'sig-warn'] : ['None', 'sig-info'];

  // Earnings surprise
  let surpriseTxt = '—', surpriseCls = 'sig-info';
  if (earnings.length) {
    const s = earnings[0].surprise;
    if (s > 0)      { surpriseTxt = `+${s.toFixed(2)} Beat`; surpriseCls = 'sig-good'; }
    else if (s < 0) { surpriseTxt = `${s.toFixed(2)} Miss`;  surpriseCls = 'sig-bad'; }
    else            { surpriseTxt = 'Met';                    surpriseCls = 'sig-warn'; }
  }

  // Analyst consensus
  let recTxt = '—', recCls = 'sig-info', recDetail = '—';
  if (rec.length) {
    const r = rec[0];
    const tot = r.buy + r.hold + r.sell + r.strongBuy + r.strongSell;
    if (tot > 0) {
      const bull = Math.round((r.buy + r.strongBuy) / tot * 100);
      recTxt = `${bull}% Buy`;
      recDetail = `Buy:${r.buy + r.strongBuy}  Hold:${r.hold}  Sell:${r.sell + r.strongSell}  (${tot} analysts)`;
      recCls = bull >= 60 ? 'sig-good' : bull >= 40 ? 'sig-warn' : 'sig-bad';
    }
  }

  const gaugePos = pct52 !== null ? Math.min(100, Math.max(0, pct52)).toFixed(1) : 50;
  const retPos = m['3MonthTotalReturn'] > 0 ? 'sig-good' : 'sig-bad';
  const retAnn = m['52WeekPriceReturnDaily'] > 0 ? 'sig-good' : 'sig-bad';

  document.getElementById('mainContent').innerHTML = `

  <!-- ① IDENTIFICATION -->
  <div class="section">
    <div class="section-header"><span class="section-num">①</span><span class="section-title">Basic Identification</span></div>
    <div class="section-body">
      <div class="grid-5">
        ${card('TICKER', ticker)}
        ${card('COMPANY', profile.name || '—')}
        ${card('SECTOR / INDUSTRY', profile.finnhubIndustry || '—')}
        ${card('EXCHANGE', profile.exchange || '—')}
        ${card('COUNTRY', profile.country || '—')}
      </div>
      <div class="divider"></div>
      <div class="grid-5">
        ${card('PRICE', fmt(price,'$','',2), '', '', `Change: ${fmt(quote.d,'$','',2)} (${fmt(quote.dp,'','%',2)})`)}
        ${card('OPEN', fmt(quote.o,'$','',2))}
        ${card("TODAY'S HIGH", fmt(quote.h,'$','',2))}
        ${card("TODAY'S LOW", fmt(quote.l,'$','',2))}
        ${card('MARKET CAP', fmtB(profile.marketCapitalization))}
      </div>
    </div>
  </div>

  <!-- ② VALUATION -->
  <div class="section">
    <div class="section-header"><span class="section-num">②</span><span class="section-title">Valuation Metrics</span></div>
    <div class="section-body">
      <div class="grid-4">
        ${card('P/E RATIO (TTM)', fmt(m.peBasicExclExtraTTM,'','x',1), peSig, peCls, 'S&P avg ~22x')}
        ${card('P/B RATIO', fmt(m.pb,'','x',2), pbSig, pbCls, 'Book/Share: '+fmt(m.bookValuePerShareAnnual,'$','',2))}
        ${card('P/S RATIO (TTM)', fmt(m.psTTM,'','x',2), '', 'sig-info')}
        ${card('EV/EBITDA', fmt(m.enterpriseValue2EbitdaTTM,'','x',1), '', 'sig-info', 'Good < 12x')}
      </div>
      <div class="divider"></div>
      <div class="grid-4">
        ${card('DIVIDEND YIELD', fmt(divY,'','%',2), divSig, divCls)}
        ${card('DIV/SHARE (ANN.)', fmt(m.dividendPerShareAnnual,'$','',2))}
        ${card('PAYOUT RATIO', fmt(m.payoutRatioTTM,'','%',1), '', 'sig-info', '< 75% preferred')}
        ${card('FCF / SHARE', fmt(m.freeCashFlowPerShareTTM,'$','',2), '', 'sig-info')}
      </div>
    </div>
  </div>

  <!-- ③ 52-WEEK GAUGE -->
  <div class="section">
    <div class="section-header"><span class="section-num">③</span><span class="section-title">52-Week Price Range</span></div>
    <div class="section-body">
      <div class="gauge-wrap">
        <div class="gauge-labels">
          <span>52W LOW &nbsp; ${fmt(w52l,'$','',2)}</span>
          <span style="color:var(--accent);font-weight:600">CURRENT &nbsp; ${fmt(price,'$','',2)} &nbsp; (${pct52 !== null ? pct52.toFixed(1)+'% of range' : '—'})</span>
          <span>52W HIGH &nbsp; ${fmt(w52h,'$','',2)}</span>
        </div>
        <div class="gauge-track">
          <div class="gauge-fill" style="width:${gaugePos}%"></div>
          <div class="gauge-dot"  style="left:${gaugePos}%"></div>
        </div>
        <div class="gauge-stats">
          <div><span>% FROM 52W LOW</span>${w52l ? '+'+((price-w52l)/w52l*100).toFixed(1)+'%' : '—'}</div>
          <div style="text-align:center"><span>52W MIDPOINT</span>${w52h&&w52l ? fmt((w52h+w52l)/2,'$','',2) : '—'}</div>
          <div style="text-align:right"><span>% FROM 52W HIGH</span>${w52h ? ((price-w52h)/w52h*100).toFixed(1)+'%' : '—'}</div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="grid-4">
        ${card('BETA', fmt(m.beta,'','',2), betaSig, betaCls, '< 1 = less volatile')}
        ${card('10-DAY AVG VOL', m['10DayAverageTradingVolume'] ? (m['10DayAverageTradingVolume']).toFixed(2)+'M' : '—')}
        ${card('3-MONTH RETURN', fmt(m['3MonthTotalReturn'],'','%',1), m['3MonthTotalReturn']>0?'✓ Positive':'✗ Negative', retPos)}
        ${card('1-YEAR RETURN',  fmt(m['52WeekPriceReturnDaily'],'','%',1), m['52WeekPriceReturnDaily']>0?'✓ Positive':'✗ Negative', retAnn)}
      </div>
    </div>
  </div>

  <!-- ④ FINANCIAL HEALTH -->
  <div class="section">
    <div class="section-header"><span class="section-num">④</span><span class="section-title">Financial Health & Quality</span></div>
    <div class="section-body">
      <div class="grid-4">
        ${card('DEBT / EQUITY',   fmt(m.totalDebt2TotalEquityAnnual,'','x',2), deSig, deCls, '< 1 preferred')}
        ${card('CURRENT RATIO',   fmt(m.currentRatioAnnual,'','x',2),  crSig, crCls, '> 1.5 preferred')}
        ${card('QUICK RATIO',     fmt(m.quickRatioAnnual,'','x',2),    qrSig, qrCls, '> 1 preferred')}
        ${card('INTEREST COVERAGE', fmt(m.netInterestCoverageAnnual,'','x',1), '', 'sig-info', '> 5 preferred')}
      </div>
      <div class="divider"></div>
      <div class="grid-4">
        ${card('GROSS MARGIN',      fmt(m.grossMarginTTM,'','%',1),        gmSig, gmCls)}
        ${card('NET PROFIT MARGIN', fmt(m.netProfitMarginTTM,'','%',1),    nmSig, nmCls)}
        ${card('ROE',               fmt(m.roeRfy,'','%',1),                roeSig, roeCls, '> 15% preferred')}
        ${card('ROA',               fmt(m.roaRfy,'','%',1),                roaSig, roaCls, '> 5% preferred')}
      </div>
      <div class="divider"></div>
      <div class="grid-4">
        ${card('EPS (TTM)',          fmt(m.epsBasicExclExtraItemsTTM,'$','',2), m.epsBasicExclExtraItemsTTM>0?'✓ Positive':'✗ Negative', m.epsBasicExclExtraItemsTTM>0?'sig-good':'sig-bad')}
        ${card('EPS GROWTH (3Y)',    fmt(m.epsGrowth3Y,'','%',1),               epsg3Sig, epsg3Cls)}
        ${card('REVENUE GROWTH (3Y)',fmt(m.revenueGrowth3Y,'','%',1),           revg3Sig, revg3Cls)}
        ${card('REVENUE / SHARE',    fmt(m.revenuePerShareTTM,'$','',2))}
      </div>
    </div>
  </div>

  <!-- ⑤ ANALYST & EARNINGS -->
  <div class="section">
    <div class="section-header"><span class="section-num">⑤</span><span class="section-title">Analyst Consensus & Earnings History</span></div>
    <div class="section-body">
      <div class="grid-4">
        ${card('ANALYST CONSENSUS', recTxt, recDetail !== '—' ? recDetail : '', recCls)}
        ${card('LAST EPS ACTUAL',   earnings.length ? fmt(earnings[0].actual,'$','',2)   : '—')}
        ${card('LAST EPS ESTIMATE', earnings.length ? fmt(earnings[0].estimate,'$','',2) : '—')}
        ${card('LAST SURPRISE',     earnings.length ? fmt(earnings[0].surprise,'$','',2) : '—', surpriseTxt, surpriseCls)}
      </div>
      ${earnings.length > 1 ? `
      <div class="divider"></div>
      <div class="grid-4">
        ${earnings.slice(0,4).map(e => {
          const s = e.surprise;
          const sc = s > 0 ? 'sig-good' : s < 0 ? 'sig-bad' : 'sig-warn';
          const st = s > 0 ? '✓ Beat' : s < 0 ? '✗ Miss' : '~ Met';
          return card('EPS ' + (e.period||''), fmt(e.actual,'$','',2), st, sc, 'Est: '+fmt(e.estimate,'$','',2));
        }).join('')}
      </div>` : ''}
    </div>
  </div>

  <!-- ⑥ MOAT -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">⑥</span>
      <span class="section-title">Moat & Qualitative Factors &nbsp;<span class="tag">click to score 1–5</span></span>
    </div>
    <div class="section-body">
      <div class="grid-2">
        <div>
          ${moatRow('brand',    'Brand / Pricing Power')}
          ${moatRow('switching','Switching Costs')}
          ${moatRow('network',  'Network Effects')}
          ${moatRow('cost',     'Cost Advantage / Scale')}
        </div>
        <div>
          ${moatRow('ip',       'IP / Patents / Regulatory Moat')}
          ${moatRow('mgmt',     'Management Quality')}
          ${moatRow('esg',      'ESG / Governance')}
          ${moatRow('tailwind', 'Industry Tailwinds')}
        </div>
      </div>
      <div class="divider"></div>
      <div id="moatSummary" style="font-family:var(--mono);font-size:13px;color:var(--muted)">
        Total Moat Score: <strong style="color:var(--text)" id="moatTotal">0</strong> / 40
        &nbsp;·&nbsp; <span id="moatVerdict">Score the factors above</span>
      </div>
    </div>
  </div>

  <!-- ⑦ RISK -->
  <div class="section">
    <div class="section-header"><span class="section-num">⑦</span><span class="section-title">Risk Assessment</span></div>
    <div class="section-body">
      <div class="grid-4">
        ${riskCard('Regulatory / Legal')}
        ${riskCard('Competition')}
        ${riskCard('Debt / Leverage')}
        ${riskCard('Currency / Macro')}
        ${riskCard('Key-Person Dependency')}
        ${riskCard('Dilution Risk')}
        ${riskCard('Dividend Cut Risk')}
        ${riskCard('Accounting / Fraud')}
      </div>
    </div>
  </div>

  <!-- ⑧ AI ANALYSIS -->
  <div class="section">
    <div class="section-header"><span class="section-num">⑧</span><span class="section-title">AI Investment Analysis</span></div>
    <div class="section-body">
      <div id="aiBox" class="ai-placeholder">
        <button class="ai-btn" onclick="runAI()">🤖 &nbsp;Get AI Analysis for ${profile.name}</button>
        <div style="font-size:12px;color:var(--muted);margin-top:10px;font-family:var(--mono)">
          Powered by Claude · Overview · Why invest · What to watch out for
        </div>
      </div>
    </div>
  </div>

  <!-- ⑨ VERDICT -->
  <div class="section">
    <div class="section-header"><span class="section-num">⑨</span><span class="section-title">Overall Investment Verdict</span></div>
    <div class="section-body">
      <div class="grid-2" style="gap:28px;align-items:start">
        <div>
          <div style="font-size:12px;color:var(--muted);font-family:var(--mono);margin-bottom:14px">
            Enter your scores per section, then click Recalculate
          </div>
          ${scoreBar('Valuation',   40)}
          ${scoreBar('Fin. Health', 25)}
          ${scoreBar('Growth',      20)}
          ${scoreBar('Moat',        15)}
          <div class="divider"></div>
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
            <span style="font-family:var(--mono);font-size:12px;color:var(--muted);width:120px">TOTAL SCORE</span>
            <span style="font-family:var(--display);font-size:30px;color:var(--accent)" id="totalScore">—</span>
            <span style="font-family:var(--mono);font-size:11px;color:var(--muted)">/100</span>
          </div>
          <button class="fetch-btn" onclick="calcVerdict()" style="width:100%">Recalculate Verdict</button>
        </div>
        <div id="verdictBox" class="verdict-box default">
          <div class="verdict-emoji">📋</div>
          <div class="verdict-text" style="color:var(--muted)">Pending</div>
          <div class="verdict-sub">Enter scores on the left</div>
        </div>
      </div>
      <div class="divider"></div>
      <div style="font-size:13px;color:var(--muted);font-weight:600;margin-bottom:8px">Investment Thesis / Notes</div>
      <textarea class="notes-area" id="investNotes"
        placeholder="Enter your investment thesis, key reasons for/against, price target, time horizon..."></textarea>
    </div>
  </div>`;
}

// ─── AI Analysis ──────────────────────────────────────────────────────────
async function runAI() {
  if (!stockData) return;
  const box = document.getElementById('aiBox');
  box.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--accent);font-family:var(--mono);font-size:13px">
    <span class="spinner"></span> Claude is analyzing ${stockData.ticker}...
  </div>`;

  try {
    const res = await fetch('/.netlify/functions/ai-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker:      stockData.ticker,
        companyName: stockData.profile.name,
        metrics:     stockData.metrics,
        profile:     stockData.profile,
        earnings:    stockData.earnings,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Render markdown-like output
    const html = data.analysis
      .replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
      .replace(/^- (.+)$/gm,  '<div class="ai-bullet">$1</div>')
      .replace(/^\*(.+)\*$/gm,'<div class="ai-disclaimer">$1</div>')
      .replace(/---/g, '<hr style="border-color:var(--border);margin:12px 0">')
      .replace(/\n\n/g, '<br>');

    box.innerHTML = `<div class="ai-output">${html}</div>
      <button onclick="runAI()" style="margin-top:14px;background:transparent;border:1px solid var(--border);color:var(--muted);font-size:12px;padding:6px 14px;border-radius:6px;cursor:pointer;font-family:var(--mono)">↺ Refresh Analysis</button>`;

  } catch (err) {
    box.innerHTML = `<div style="color:var(--red);font-family:var(--mono);font-size:12px">
      ✗ AI Error: ${err.message}<br><br>
      <button class="ai-btn" onclick="runAI()">Try Again</button>
    </div>`;
  }
}

// ─── Moat ─────────────────────────────────────────────────────────────────
function moatRow(key, label) {
  const s = moatScores[key] || 0;
  const stars = [1,2,3,4,5].map(n =>
    `<div class="star${s>=n?' active':''}" onclick="setMoat('${key}',${n})">${n}</div>`
  ).join('');
  return `<div class="moat-row" id="moat-${key}">
    <div class="moat-label">${label}</div>
    <div class="moat-stars">${stars}</div>
    <div class="moat-badge" id="moat-badge-${key}">${s}/5</div>
  </div>`;
}

function setMoat(key, val) {
  moatScores[key] = val;
  const row = document.getElementById('moat-'+key);
  if (!row) return;
  row.querySelectorAll('.star').forEach((s,i) => s.classList.toggle('active', i < val));
  document.getElementById('moat-badge-'+key).textContent = val+'/5';
  const total = Object.values(moatScores).reduce((a,b)=>a+b, 0);
  document.getElementById('moatTotal').textContent = total;
  document.getElementById('moatVerdict').textContent =
    total >= 30 ? '✅ Strong Moat' : total >= 20 ? '⚠️ Moderate Moat' : '🔴 Weak / No Moat';
}

// ─── Risk cards ───────────────────────────────────────────────────────────
function riskCard(label) {
  const id = 'risk_' + label.replace(/[^a-z]/gi,'_');
  return `<div class="metric">
    <div class="metric-label">${label}</div>
    <select id="${id}" class="risk-select">
      <option value="">— Select —</option>
      <option value="Low">🟢 Low</option>
      <option value="Medium">🟡 Medium</option>
      <option value="High">🔴 High</option>
      <option value="N/A">⚪ N/A</option>
    </select>
  </div>`;
}

// ─── Score bars & verdict ─────────────────────────────────────────────────
function scoreBar(label, max) {
  const id = 'score_' + label.replace(/[^a-z]/gi,'_');
  return `<div class="score-row">
    <div class="score-label">${label} <span style="font-size:10px;color:var(--muted)">(/${max})</span></div>
    <div class="score-track"><div class="score-fill" id="${id}_fill" style="width:0%"></div></div>
    <div class="score-num">
      <input type="number" id="${id}" min="0" max="${max}" placeholder="0"
        style="background:transparent;border:none;color:var(--text);font-family:var(--mono);font-size:12px;width:36px;text-align:right;outline:none"
        oninput="updateBar('${id}',${max})"> /${max}
    </div>
  </div>`;
}

function updateBar(id, max) {
  const v = Math.min(max, parseFloat(document.getElementById(id).value) || 0);
  document.getElementById(id+'_fill').style.width = (v/max*100)+'%';
}

function calcVerdict() {
  const inputs = [
    { id: 'score_Valuation',   max: 40 },
    { id: 'score_Fin__Health', max: 25 },
    { id: 'score_Growth',      max: 20 },
    { id: 'score_Moat',        max: 15 },
  ];
  const total = inputs.reduce((sum, {id, max}) => {
    return sum + Math.min(max, parseFloat(document.getElementById(id)?.value)||0);
  }, 0);

  document.getElementById('totalScore').textContent = total;
  const box = document.getElementById('verdictBox');
  let cls, emoji, text, sub;
  if      (total >= 80) { cls='strong-buy'; emoji='🟢'; text='STRONG BUY';  sub='High conviction — fundamentals are solid'; }
  else if (total >= 65) { cls='buy';        emoji='🟡'; text='BUY';          sub='Favorable risk/reward at current price'; }
  else if (total >= 50) { cls='hold';       emoji='⚠️'; text='HOLD';         sub='Watch & wait — mixed signals'; }
  else                  { cls='avoid';      emoji='🔴'; text='AVOID';        sub='Does not meet investment criteria'; }

  box.className = `verdict-box ${cls}`;
  box.innerHTML = `<div class="verdict-emoji">${emoji}</div>
    <div class="verdict-text">${text}</div>
    <div class="verdict-sub">${sub} · Score: ${total}/100</div>`;
}

// ─── Excel Download ───────────────────────────────────────────────────────
function downloadExcel() {
  if (!stockData) return;
  const { ticker, quote, profile, metrics: m, earnings } = stockData;

  const rows = [
    ['STOCK EVALUATION CHECKLIST – ' + ticker, '', '', '', ''],
    ['Generated:', new Date().toLocaleString(), '', '', ''],
    ['', '', '', '', ''],
    ['SECTION', 'FIELD', 'VALUE', 'SIGNAL / NOTE', ''],
    // Identification
    ['① Identification', 'Ticker',        ticker,               '', ''],
    ['',                 'Company',        profile.name,         '', ''],
    ['',                 'Sector',         profile.finnhubIndustry, '', ''],
    ['',                 'Exchange',       profile.exchange,     '', ''],
    ['',                 'Country',        profile.country,      '', ''],
    ['',                 'Market Cap',     profile.marketCapitalization ? '$'+profile.marketCapitalization.toFixed(0)+'M' : '—', '', ''],
    // Valuation
    ['② Valuation',      'Price',           quote.c,             '', ''],
    ['',                 'P/E (TTM)',       m.peBasicExclExtraTTM,   m.peBasicExclExtraTTM < 15 ? 'Good' : m.peBasicExclExtraTTM < 25 ? 'Fair' : 'High', 'S&P avg ~22x'],
    ['',                 'P/B',             m.pb,                '', ''],
    ['',                 'Book Value/Share',m.bookValuePerShareAnnual, '', ''],
    ['',                 'P/S (TTM)',       m.psTTM,             '', ''],
    ['',                 'EV/EBITDA',       m.enterpriseValue2EbitdaTTM, '', '< 12 preferred'],
    ['',                 'Dividend Yield %',m.dividendYieldIndicatedAnnual, '', ''],
    ['',                 'Div/Share (Ann)', m.dividendPerShareAnnual, '', ''],
    ['',                 'Payout Ratio %',  m.payoutRatioTTM,    '', '< 75% preferred'],
    ['',                 'FCF/Share',       m.freeCashFlowPerShareTTM, '', ''],
    // 52-Week
    ['③ 52-Week Range',  '52W High',        m['52WeekHigh'],     '', ''],
    ['',                 '52W Low',         m['52WeekLow'],      '', ''],
    ['',                 'Current Price',   quote.c,             '', ''],
    ['',                 '% in Range',      m['52WeekHigh']&&m['52WeekLow'] ? ((quote.c-m['52WeekLow'])/(m['52WeekHigh']-m['52WeekLow'])*100).toFixed(1)+'%' : '—', '', ''],
    ['',                 '3-Month Return',  m['3MonthTotalReturn'], '', ''],
    ['',                 '1-Year Return',   m['52WeekPriceReturnDaily'], '', ''],
    ['',                 'Beta',            m.beta,              m.beta<1?'Low vol':m.beta<1.5?'Moderate':'High vol', ''],
    // Health
    ['④ Financial Health','Debt/Equity',    m.totalDebt2TotalEquityAnnual, '< 1 preferred', ''],
    ['',                 'Current Ratio',   m.currentRatioAnnual,'> 1.5 preferred',''],
    ['',                 'Quick Ratio',     m.quickRatioAnnual,  '> 1 preferred', ''],
    ['',                 'Gross Margin %',  m.grossMarginTTM,    '', ''],
    ['',                 'Net Margin %',    m.netProfitMarginTTM,'', ''],
    ['',                 'ROE %',           m.roeRfy,            '> 15% preferred', ''],
    ['',                 'ROA %',           m.roaRfy,            '> 5% preferred', ''],
    ['',                 'EPS (TTM)',        m.epsBasicExclExtraItemsTTM, '', ''],
    ['',                 'EPS Growth (3Y)', m.epsGrowth3Y,       '', ''],
    ['',                 'Revenue Growth (3Y)', m.revenueGrowth3Y, '', ''],
    // Analyst
    ['⑤ Analyst/Earnings','Last EPS Actual', earnings.length ? earnings[0].actual   : '—', '', ''],
    ['',                 'Last EPS Estimate',earnings.length ? earnings[0].estimate  : '—', '', ''],
    ['',                 'Last Surprise',    earnings.length ? earnings[0].surprise  : '—', earnings.length && earnings[0].surprise>0?'Beat':'Miss', ''],
    // Moat
    ['⑥ Moat Scores',   'Brand/Pricing',   moatScores.brand+'/5',    '', ''],
    ['',                 'Switching Costs', moatScores.switching+'/5','', ''],
    ['',                 'Network Effects', moatScores.network+'/5',  '', ''],
    ['',                 'Cost Advantage',  moatScores.cost+'/5',     '', ''],
    ['',                 'IP/Patents',      moatScores.ip+'/5',       '', ''],
    ['',                 'Management',      moatScores.mgmt+'/5',     '', ''],
    ['',                 'ESG/Governance',  moatScores.esg+'/5',      '', ''],
    ['',                 'Tailwinds',       moatScores.tailwind+'/5', '', ''],
    ['',                 'Total Moat',      Object.values(moatScores).reduce((a,b)=>a+b,0)+'/40', '', ''],
    // Notes
    ['⑨ Notes',          'Investment Thesis', document.getElementById('investNotes')?.value || '', '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:22},{wch:26},{wch:20},{wch:22},{wch:20}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ticker + ' Evaluation');
  XLSX.writeFile(wb, `${ticker}_Evaluation_${new Date().toISOString().slice(0,10)}.xlsx`);
  setStatus(`✓ Downloaded ${ticker} evaluation`, 'success');
}

// ─── Formatting helpers ───────────────────────────────────────────────────
function fmt(v, pre='', suf='', dec=2) {
  if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
  return pre + Number(v).toFixed(dec) + suf;
}
function fmtB(v) {
  if (!v) return '—';
  if (v >= 1000000) return '$' + (v/1000000).toFixed(2) + 'T';
  if (v >= 1000)    return '$' + (v/1000).toFixed(1) + 'B';
  return '$' + v.toFixed(0) + 'M';
}
function sig(v, goodThresh, warnThresh, lowerBetter=true) {
  if (v === null || v === undefined || isNaN(v)) return ['—', 'sig-info'];
  if (lowerBetter) {
    if (v <= goodThresh)  return ['✓ Good', 'sig-good'];
    if (v <= warnThresh)  return ['~ Fair', 'sig-warn'];
    return ['✗ High', 'sig-bad'];
  } else {
    if (v >= goodThresh)  return ['✓ Good', 'sig-good'];
    if (v >= warnThresh)  return ['~ Fair', 'sig-warn'];
    return ['✗ Low',  'sig-bad'];
  }
}

function card(label, value, sigText='', sigCls='', sub='') {
  return `<div class="metric">
    <div class="metric-label">${label}</div>
    <div class="metric-value">${value}</div>
    ${sigText ? `<div class="metric-signal ${sigCls}">${sigText}</div>` : ''}
    ${sub ? `<div class="metric-sub">${sub}</div>` : ''}
  </div>`;
}

// ─── UI helpers ───────────────────────────────────────────────────────────
function setStatus(msg, type='') {
  const s = document.getElementById('statusBar');
  s.textContent = msg;
  s.className = 'status-bar ' + type;
}
function setBusy(b) {
  document.getElementById('fetchBtn').disabled = b;
  if (b) document.getElementById('dlBtn').disabled = true;
}
function loadingHTML(ticker) {
  return `<div class="empty-state">
    <div class="empty-icon"><span class="spinner" style="width:40px;height:40px;border-width:3px"></span></div>
    <div class="empty-title" style="margin-top:20px">Loading ${ticker}...</div>
    <div class="empty-sub">Fetching quote · profile · metrics · earnings · analyst data</div>
  </div>`;
}
function emptyState() {
  return `<div class="empty-state">
    <div class="empty-icon">🔍</div>
    <div class="empty-title">Enter a ticker to begin</div>
    <div class="empty-sub">Try: AAPL · MSFT · RITM · RIVN · VZ · F · OMAH</div>
  </div>`;
}

// ─── Keyboard shortcut ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tickerInput')
    .addEventListener('keydown', e => { if (e.key === 'Enter') fetchStock(); });
});
