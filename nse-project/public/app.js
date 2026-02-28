/* ═══════════════════════════════════════════
   NSE Stock Screener — app.js
   All data fetches go through /api/yahoo
   which is a Vercel serverless proxy.
   ═══════════════════════════════════════════ */

// ── STATE ──────────────────────────────────
let allStocks   = [];
let filtered    = [];
let currentPage = 1;
let pageSize    = 100;
let sortKey     = 'sym';
let sortDir     = 1;
let activeSer   = 'ALL';
let searchQuery = '';
let isLoading   = false;

// ── ICON PALETTE ───────────────────────────
const PALETTE = [
  ['#00f5c4','#002a23'],['#5b9aff','#001133'],['#ffe04b','#2a2000'],
  ['#ff5fd2','#2a0024'],['#ff7043','#2a0f00'],['#a29bfe','#100a2a'],
  ['#00cec9','#002827'],['#fd79a8','#2a0015'],['#fdcb6e','#2a1a00'],
  ['#81ecec','#002a2a'],['#74b9ff','#001a2a'],['#55efc4','#002a1a'],
];
function iconStyle(sym) {
  const [fg,bg] = PALETTE[sym.charCodeAt(0) % PALETTE.length];
  return `background:${bg};color:${fg};border:1px solid ${fg}33;`;
}

// ── SERIES BADGE ───────────────────────────
function serClass(s) {
  if (s==='EQ') return 'ser-EQ'; if (s==='BE') return 'ser-BE';
  if (s==='BL') return 'ser-BL'; if (['SM','SME'].includes(s)) return 'ser-SM';
  if (['ST','MT','TB','GS'].includes(s)) return 'ser-ST'; return 'ser-def';
}

// ── DATE FORMAT ────────────────────────────
function fmtDate(d) {
  if (!d) return '—'; d=d.trim();
  const months={jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
  const p=d.split('-'); if(p.length===3){const m=months[p[1].toLowerCase()]; return m?`${p[0]} ${m} ${p[2]}`:d;} return d;
}

// ── NUMBER FORMAT ──────────────────────────
function fmtCr(v) {
  if(!v||isNaN(v)) return '—'; v=parseFloat(v);
  if(v>=1e12) return (v/1e12).toFixed(2)+'L';
  if(v>=1e7)  return (v/1e7).toFixed(2)+'Cr';
  if(v>=1e5)  return (v/1e5).toFixed(2)+'L';
  return v.toLocaleString('en-IN');
}

// ═══════════════════════════════════════════
//  API CALLS — all via /api/yahoo proxy
// ═══════════════════════════════════════════
async function apiCall(params, timeout=15000) {
  const qs = new URLSearchParams(params).toString();
  try {
    const r = await fetch(`/api/yahoo?${qs}`, { signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type')||'';
    return ct.includes('application/json') ? await r.json() : await r.text();
  } catch(e) { return null; }
}

// ═══════════════════════════════════════════
//  LOAD NSE EQUITY LIST
// ═══════════════════════════════════════════
async function loadNSEData() {
  if (isLoading) return;
  isLoading = true; setRail(10);
  setStatus('loading','Fetching NSE equity list…');
  showState('loading');
  document.getElementById('refresh-btn').classList.add('spin');

  const csv = await apiCall({ type:'equitylist', symbol:'_' });
  setRail(60);

  if (csv && typeof csv === 'string' && csv.length > 500 && csv.includes(',')) {
    allStocks = parseNSECsv(csv);
    setStatus('live', `${allStocks.length.toLocaleString('en-IN')} stocks from NSE`);
    showToast(`✅ ${allStocks.length.toLocaleString('en-IN')} stocks loaded`);
  } else {
    allStocks = BUNDLED_STOCKS;
    setStatus('error','API offline — showing bundled 600+ stocks');
    showToast('⚠️ Using offline data. Deploy to Vercel for live data.');
  }

  setRail(100); isLoading = false;
  document.getElementById('refresh-btn').classList.remove('spin');
  updateOverview(); applyFilters();
}

// ── CSV PARSER ─────────────────────────────
function parseNSECsv(text) {
  const lines = text.trim().split('\n');
  const hdr   = lines[0].split(',').map(h=>h.trim().replace(/"/g,'').toUpperCase());
  const iSym  = hdr.findIndex(h=>h.includes('SYMBOL'));
  const iName = hdr.findIndex(h=>h.includes('NAME')||h.includes('COMPANY'));
  const iSer  = hdr.findIndex(h=>h.includes('SERIES'));
  const iDate = hdr.findIndex(h=>h.includes('DATE')&&h.includes('LIST'));
  const iFV   = hdr.findIndex(h=>h.includes('FACE')||h.includes('FACEVALUE'));
  const iISIN = hdr.findIndex(h=>h.includes('ISIN'));
  const iPaid = hdr.findIndex(h=>h.includes('PAID'));
  const iLot  = hdr.findIndex(h=>h.includes('LOT')||h.includes('MARKET'));
  const stocks=[];
  for(let i=1;i<lines.length;i++){
    const raw=lines[i]; if(!raw.trim()) continue;
    const cols=[]; let cur='',inQ=false;
    for(const ch of raw){ if(ch==='"'){inQ=!inQ;} else if(ch===','&&!inQ){cols.push(cur.trim());cur='';}else cur+=ch; }
    cols.push(cur.trim());
    const sym=(iSym>=0?(cols[iSym]||''):'').replace(/"/g,'').trim();
    if(!sym) continue;
    stocks.push({
      sym, name:(iName>=0?(cols[iName]||sym):'').replace(/"/g,'').trim()||sym,
      series:(iSer>=0?(cols[iSer]||''):'').replace(/"/g,'').trim().toUpperCase()||'—',
      date: (iDate>=0?(cols[iDate]||''):'').replace(/"/g,'').trim(),
      fv:   iFV  >=0?parseFloat(cols[iFV] ||0)||0:0,
      isin: (iISIN>=0?(cols[iISIN]||''):'').replace(/"/g,'').trim(),
      paid: iPaid>=0?parseFloat(cols[iPaid]||0)||0:0,
      lot:  iLot >=0?parseInt(cols[iLot] ||0)||1:1,
    });
  }
  return stocks;
}

// ═══════════════════════════════════════════
//  FILTER + SORT + SEARCH
// ═══════════════════════════════════════════
function applyFilters() {
  const q=searchQuery.toLowerCase();
  filtered=allStocks.filter(s=>{
    if(activeSer!=='ALL'&&s.series!==activeSer) return false;
    if(q) return s.sym.toLowerCase().includes(q)||s.name.toLowerCase().includes(q)||(s.isin&&s.isin.toLowerCase().includes(q));
    return true;
  });
  filtered.sort((a,b)=>{
    if(sortKey==='fv') return (a.fv-b.fv)*sortDir;
    const av=sortKey==='name'?a.name:sortKey==='date'?a.date||'':a.sym;
    const bv=sortKey==='name'?b.name:sortKey==='date'?b.date||'':b.sym;
    return av.localeCompare(bv)*sortDir;
  });
  currentPage=1;
  document.getElementById('pill-total').textContent=allStocks.length.toLocaleString('en-IN');
  document.getElementById('pill-filtered').textContent=filtered.length.toLocaleString('en-IN');
  renderTable();
}

function hl(text,q){ if(!q)return text; const i=text.toLowerCase().indexOf(q); if(i<0)return text; return text.slice(0,i)+'<mark>'+text.slice(i,i+q.length)+'</mark>'+text.slice(i+q.length); }

// ═══════════════════════════════════════════
//  RENDER TABLE
// ═══════════════════════════════════════════
function renderTable(){
  const start=(currentPage-1)*pageSize;
  const page=filtered.slice(start,start+pageSize);
  const q=searchQuery.toLowerCase(); const total=filtered.length;
  if(!total){
    document.getElementById('table-container').innerHTML=`<div class="state-box"><span class="state-icon">🔍</span><div class="state-title">No stocks found</div><div class="state-sub">No results for "<strong>${searchQuery}</strong>"</div></div>`;
    return;
  }
  let rows='';
  for(let i=0;i<page.length;i++){
    const s=page[i]; const rowN=start+i+1; const sc=serClass(s.series); const ico=iconStyle(s.sym);
    rows+=`<tr onclick="rowClick('${s.sym}','${s.name.replace(/'/g,"\\'")}')">
      <td class="row-num">${rowN}</td>
      <td><div class="sym-cell"><div class="sym-icon" style="${ico}">${s.sym.slice(0,3)}</div><div><div class="sym-text">${hl(s.sym,q)}</div><div class="sym-isin">${s.isin||'—'}</div></div></div></td>
      <td><div class="name-main">${hl(s.name,q)}</div></td>
      <td><span class="ser-badge ${sc}">${s.series}</span></td>
      <td class="date-cell">${fmtDate(s.date)}</td>
      <td class="fv-cell">₹${s.fv||'—'}</td>
      <td class="lot-cell">${s.lot>1?s.lot.toLocaleString('en-IN'):'1'}</td>
      <td class="cap-cell">${fmtCr(s.paid)}</td>
    </tr>`;
  }
  document.getElementById('table-container').innerHTML=`
    <table class="data-table">
      <thead><tr>
        <th class="row-num" style="cursor:default">#</th>
        <th class="${sortKey==='sym'?'sorted':''}" onclick="doSort('sym')">Symbol <span class="sort-arrow">${sortKey==='sym'?(sortDir>0?'▲':'▼'):'⇅'}</span></th>
        <th class="${sortKey==='name'?'sorted':''}" onclick="doSort('name')">Company Name <span class="sort-arrow">${sortKey==='name'?(sortDir>0?'▲':'▼'):'⇅'}</span></th>
        <th>Series</th>
        <th class="${sortKey==='date'?'sorted':''}" onclick="doSort('date')">Listed <span class="sort-arrow">${sortKey==='date'?(sortDir>0?'▲':'▼'):'⇅'}</span></th>
        <th class="${sortKey==='fv'?'sorted':''}" onclick="doSort('fv')">Face Val <span class="sort-arrow">${sortKey==='fv'?(sortDir>0?'▲':'▼'):'⇅'}</span></th>
        <th>Mkt Lot</th><th>Paid-up Cap</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="pag-bar">
      <div class="pag-info">Showing <strong>${(start+1).toLocaleString('en-IN')}–${Math.min(start+pageSize,total).toLocaleString('en-IN')}</strong> of <strong>${total.toLocaleString('en-IN')}</strong> stocks</div>
      ${renderPagination(total)}
    </div>`;
}

function renderPagination(total){
  const pages=Math.ceil(total/pageSize); if(pages<=1) return '';
  let nums=[];
  if(pages<=7){for(let i=1;i<=pages;i++) nums.push(i);}
  else{ nums=[1,2]; if(currentPage>4) nums.push('…'); for(let i=Math.max(3,currentPage-1);i<=Math.min(pages-2,currentPage+1);i++) nums.push(i); if(currentPage<pages-3) nums.push('…'); nums.push(pages-1,pages); }
  const btns=nums.map(n=>n==='…'?`<span class="pg-gap">…</span>`:`<button class="pg ${n===currentPage?'active':''}" onclick="goPage(${n})">${n}</button>`).join('');
  return `<div class="pag-btns"><button class="pg" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>${btns}<button class="pg" onclick="goPage(${currentPage+1})" ${currentPage===pages?'disabled':''}>›</button></div>`;
}

function goPage(p){ const pages=Math.ceil(filtered.length/pageSize); if(p<1||p>pages)return; currentPage=p; renderTable(); window.scrollTo({top:0,behavior:'smooth'}); }
function doSort(key){ if(sortKey===key) sortDir*=-1; else{sortKey=key;sortDir=1;} applyFilters(); }

function updateOverview(){
  const eq=allStocks.filter(s=>s.series==='EQ').length;
  const be=allStocks.filter(s=>s.series==='BE').length;
  const sme=allStocks.filter(s=>['SM','ST'].includes(s.series)).length;
  document.getElementById('ov-total').textContent=allStocks.length.toLocaleString('en-IN');
  document.getElementById('ov-eq').textContent=eq.toLocaleString('en-IN');
  document.getElementById('ov-be').textContent=be.toLocaleString('en-IN');
  document.getElementById('ov-sme').textContent=sme.toLocaleString('en-IN');
  document.getElementById('ov-other').textContent=(allStocks.length-eq-be-sme).toLocaleString('en-IN');
}

// ── UI HELPERS ─────────────────────────────
function setRail(pct){ const r=document.getElementById('load-rail'); r.style.width=pct+'%'; r.style.opacity='1'; if(pct>=100) setTimeout(()=>{r.style.opacity='0';},600); }
function setStatus(type,msg){ const c=document.getElementById('status-chip'); c.className='status-chip '+type; document.getElementById('status-text').textContent=msg; }
function showState(type){
  if(type==='loading') document.getElementById('table-container').innerHTML=`<div class="state-box"><div class="spinner-ring"></div><div class="state-title">Fetching NSE Equity List…</div><div class="state-sub">Loading all listed stocks via server proxy</div></div>`;
}
function showToast(msg,dur=3000){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),dur); }
function escHtml(s){ return s.replace(/'/g,"\\'").replace(/"/g,'&quot;'); }
function clearSearch(){ document.getElementById('search').value=''; searchQuery=''; document.getElementById('clear-btn').classList.remove('show'); document.getElementById('search-icon').style.display=''; applyFilters(); }
function exportCSV(){
  if(!filtered.length){showToast('No data');return;}
  const hdr=['Symbol','Name','Series','Listed Date','Face Value','ISIN','Market Lot','Paid-Up Capital'];
  const rows=filtered.map(s=>[s.sym,`"${s.name}"`,s.series,s.date,s.fv,s.isin,s.lot,s.paid].join(','));
  const blob=new Blob([[hdr.join(','),...rows].join('\n')],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`NSE_Equity_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  showToast(`✅ ${filtered.length.toLocaleString('en-IN')} stocks exported`);
}

// ── EVENTS ─────────────────────────────────
document.getElementById('sort-sel').addEventListener('change',e=>{
  const [k,d]=e.target.value.split('-'); sortKey=k; sortDir=d==='asc'?1:-1; applyFilters();
});
document.getElementById('pgsize-sel').addEventListener('change',e=>{ pageSize=parseInt(e.target.value); currentPage=1; renderTable(); });
let searchTimer;
document.getElementById('search').addEventListener('input',e=>{
  const v=e.target.value.trim();
  const cb=document.getElementById('clear-btn'), si=document.getElementById('search-icon');
  v?cb.classList.add('show'):cb.classList.remove('show');
  v?si.style.display='none':si.style.display='';
  clearTimeout(searchTimer); searchTimer=setTimeout(()=>{ searchQuery=v; applyFilters(); },180);
});
document.getElementById('search').addEventListener('keydown',e=>{ if(e.key==='Escape') clearSearch(); });
document.getElementById('ser-chips').addEventListener('click',e=>{
  const chip=e.target.closest('.sch'); if(!chip) return;
  document.querySelectorAll('.sch').forEach(c=>c.classList.remove('on'));
  chip.classList.add('on'); activeSer=chip.dataset.ser; applyFilters();
});

// ═══════════════════════════════════════════
//  STOCK MODAL
// ═══════════════════════════════════════════
let activeStockSym='', activeRange='1mo', candleData=[], currentPrice=0;

function rowClick(sym, name) {
  activeStockSym=sym; activeRange='1mo'; candleData=[];
  openModal(sym, name);
}

function openModal(sym, name) {
  document.getElementById('m-sym').textContent=sym+' · NSE';
  document.getElementById('m-name').innerHTML=name+' <span class="live-badge loading" id="m-live-badge"><div class="bd"></div><span id="m-live-txt">Loading…</span></span>';
  document.getElementById('m-price').textContent='—';
  document.getElementById('m-ohlc').textContent='Fetching live price…';
  document.getElementById('m-chg').textContent='—';
  document.getElementById('m-chg').className='mh-chg flat';
  document.getElementById('m-fund-grid').innerHTML=fundLoadingHTML();
  document.getElementById('m-info-row').innerHTML='';
  document.getElementById('w52-section').style.display='none';
  document.getElementById('m-analyst-section').style.display='none';
  document.getElementById('chart-loading').style.display='flex';
  document.getElementById('chart-loading').innerHTML='<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.1);border-top-color:#00f5c4;border-radius:50%;animation:rot .7s linear infinite"></div> Fetching chart…';
  document.getElementById('candle-canvas').style.display='none';
  document.getElementById('vol-canvas').style.display='none';
  document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active'));
  document.querySelector('.rtab').classList.add('active');
  document.getElementById('modal-backdrop').classList.add('open');
  document.body.style.overflow='hidden';
  fetchStockData();
}

function fundLoadingHTML(){ return Array(9).fill(0).map(()=>`<div class="fund-card" style="opacity:.4"><div class="fund-val" style="background:rgba(255,255,255,0.08);border-radius:4px;height:18px;width:70%;margin-bottom:5px"></div><div class="fund-lbl" style="background:rgba(255,255,255,0.05);border-radius:3px;height:10px;width:50%"></div></div>`).join(''); }
function closeModal(){ document.getElementById('modal-backdrop').classList.remove('open'); document.body.style.overflow=''; candleData=[]; }
function handleBackdropClick(e){ if(e.target===document.getElementById('modal-backdrop')) closeModal(); }
function setRange(range,btn){ activeRange=range; document.querySelectorAll('.rtab').forEach(t=>t.classList.remove('active')); btn.classList.add('active'); document.getElementById('chart-loading').style.display='flex'; document.getElementById('candle-canvas').style.display='none'; document.getElementById('vol-canvas').style.display='none'; fetchCandleData(); }

async function fetchStockData(){ await Promise.all([fetchQuoteAndFundamentals(), fetchCandleData()]); }

// ── Quote + Fundamentals ───────────────────
async function fetchQuoteAndFundamentals(){
  const data=await apiCall({type:'quote',symbol:activeStockSym});
  if(!data||data.error){ setBadge('sim','No Data'); showSimFunds(); return; }
  try{
    const res=data.quoteSummary?.result?.[0];
    const pr=res?.price, sd=res?.summaryDetail, fd=res?.financialData, ks=res?.defaultKeyStatistics, rt=res?.recommendationTrend;
    if(!pr?.regularMarketPrice?.raw){ setBadge('sim','No Data'); showSimFunds(); return; }
    currentPrice=pr.regularMarketPrice.raw;
    const pc=pr.regularMarketPreviousClose?.raw||currentPrice;
    const chgA=+(currentPrice-pc).toFixed(2), chgP=+((currentPrice-pc)/pc*100).toFixed(2);
    const up=currentPrice>=pc;
    document.getElementById('m-price').textContent='₹'+currentPrice.toLocaleString('en-IN',{maximumFractionDigits:2});
    const ce=document.getElementById('m-chg');
    ce.textContent=`${up?'+':''}${chgA} (${up?'+':''}${chgP}%)`;
    ce.className='mh-chg '+(up?'up':'dn');
    const o=pr.regularMarketOpen?.raw||0, h=pr.regularMarketDayHigh?.raw||0, l=pr.regularMarketDayLow?.raw||0;
    document.getElementById('m-ohlc').textContent=`O ₹${o.toFixed(1)}  H ₹${h.toFixed(1)}  L ₹${l.toFixed(1)}  Prev ₹${pc.toFixed(1)}  Vol ${fmtVol(pr.regularMarketVolume?.raw||0)}`;
    setBadge('live','LIVE');
    const hi52=ks?.fiftyTwoWeekHigh?.raw||sd?.fiftyTwoWeekHigh?.raw, lo52=ks?.fiftyTwoWeekLow?.raw||sd?.fiftyTwoWeekLow?.raw;
    if(hi52&&lo52){ document.getElementById('w52-section').style.display='block'; document.getElementById('w52-low').textContent='₹'+lo52.toLocaleString('en-IN',{maximumFractionDigits:0}); document.getElementById('w52-high').textContent='₹'+hi52.toLocaleString('en-IN',{maximumFractionDigits:0}); const pct=Math.min(100,Math.max(0,((currentPrice-lo52)/(hi52-lo52))*100)); document.getElementById('w52-fill').style.width=pct+'%'; document.getElementById('w52-marker').style.left=pct+'%'; }
    const mc=pr.marketCap?.raw||0, secName=pr.sector||'';
    document.getElementById('m-info-row').innerHTML=[mc?`<div class="info-chip">MC ₹${fmtMC(Math.round(mc/10000000))} Cr</div>`:'', secName?`<div class="info-chip">${secName}</div>`:'', `<div class="info-chip">NSE · INR</div>`, sd?.beta?.raw?`<div class="info-chip">β ${sd.beta.raw.toFixed(2)}</div>`:''].join('');
    const fmt=(v,s='')=>(v!=null&&!isNaN(v))?v.toFixed(2)+s:'—';
    const fmtP=v=>(v!=null&&!isNaN(v))?v.toFixed(1)+'%':'—';
    const funds=[
      {l:'P/E Ratio',v:fmt(sd?.trailingPE?.raw)},{l:'Forward P/E',v:fmt(sd?.forwardPE?.raw)},{l:'P/B Ratio',v:fmt(ks?.priceToBook?.raw)},
      {l:'EPS (TTM)',v:ks?.trailingEps?.raw?'₹'+ks.trailingEps.raw.toFixed(2):'—'},{l:'ROE',v:fmtP(fd?.returnOnEquity?.raw*100)},{l:'ROA',v:fmtP(fd?.returnOnAssets?.raw*100)},
      {l:'Revenue',v:fd?.totalRevenue?.raw?'₹'+fmtCr2(fd.totalRevenue.raw):'—'},{l:'Net Income',v:fd?.netIncomeToCommon?.raw?'₹'+fmtCr2(fd.netIncomeToCommon.raw):'—'},{l:'Profit Margin',v:fmtP(fd?.profitMargins?.raw*100)},
      {l:'Gross Margin',v:fmtP(fd?.grossMargins?.raw*100)},{l:'Debt/Equity',v:fmt(fd?.debtToEquity?.raw)},{l:'Current Ratio',v:fmt(fd?.currentRatio?.raw)},
      {l:'Div Yield',v:sd?.dividendYield?.raw?fmtP(sd.dividendYield.raw*100):'—'},{l:'Beta',v:fmt(sd?.beta?.raw)},{l:'Avg Volume',v:fmtVol(sd?.averageVolume?.raw||0)},
    ];
    document.getElementById('m-fund-grid').innerHTML=funds.map(f=>`<div class="fund-card"><div class="fund-val">${f.v}</div><div class="fund-lbl">${f.l}</div></div>`).join('');
    if(rt?.trend?.length){
      const t=rt.trend[0]; const buy=(t.strongBuy||0)+(t.buy||0), hold=t.hold||0, sell=(t.sell||0)+(t.strongSell||0), tot=buy+hold+sell||1;
      document.getElementById('m-analyst-section').style.display='block';
      document.getElementById('bsbar').innerHTML=`<div class="bar-buy" style="width:${(buy/tot*100).toFixed(0)}%"></div><div class="bar-hold" style="width:${(hold/tot*100).toFixed(0)}%"></div><div class="bar-sell" style="width:${(sell/tot*100).toFixed(0)}%"></div>`;
      document.getElementById('bl-buy').textContent=`Buy ${buy}`; document.getElementById('bl-hold').textContent=`Hold ${hold}`; document.getElementById('bl-sell').textContent=`Sell ${sell}`;
      const tgt=fd?.targetMeanPrice?.raw;
      if(tgt){ document.getElementById('tgt-price').textContent='₹'+tgt.toLocaleString('en-IN',{maximumFractionDigits:0}); const up2=tgt>=currentPrice; document.getElementById('tgt-upside').innerHTML=`<span style="color:${up2?'var(--up)':'var(--dn)'}">${up2?'▲':'▼'} ${Math.abs(((tgt-currentPrice)/currentPrice*100)).toFixed(1)}% upside</span>`; }
    }
  }catch(e){ setBadge('sim','Error'); showSimFunds(); }
}

function fmtVol(v){ if(!v)return '—'; if(v>=10000000)return (v/10000000).toFixed(2)+'Cr'; if(v>=100000)return (v/100000).toFixed(2)+'L'; if(v>=1000)return (v/1000).toFixed(0)+'K'; return v; }
function fmtMC(v){ if(v>=100000)return (v/100000).toFixed(2)+'L'; if(v>=1000)return (v/1000).toFixed(1)+'K'; return v; }
function fmtCr2(v){ if(v>=1e12)return (v/1e12).toFixed(2)+'L Cr'; if(v>=1e7)return (v/1e7).toFixed(2)+' Cr'; if(v>=1e5)return (v/1e5).toFixed(2)+'L'; return v.toLocaleString('en-IN'); }
function setBadge(type,txt){ const b=document.getElementById('m-live-badge'),t=document.getElementById('m-live-txt'); if(!b||!t)return; b.className='live-badge '+type; t.textContent=txt; }
function showSimFunds(){ document.getElementById('m-fund-grid').innerHTML=Array(15).fill(0).map((_,i)=>`<div class="fund-card"><div class="fund-val">—</div><div class="fund-lbl">${['P/E Ratio','Forward P/E','P/B Ratio','EPS (TTM)','ROE','ROA','Revenue','Net Income','Profit Margin','Gross Margin','Debt/Equity','Current Ratio','Div Yield','Beta','Avg Volume'][i]}</div></div>`).join(''); document.getElementById('m-ohlc').textContent='Deploy to Vercel to load live data'; }

// ── Candlestick Fetch ──────────────────────
async function fetchCandleData(){
  const rangeMap={'1mo':{range:'1mo',interval:'1d'},'3mo':{range:'3mo',interval:'1d'},'6mo':{range:'6mo',interval:'1d'},'1y':{range:'1y',interval:'1wk'},'2y':{range:'2y',interval:'1wk'},'5y':{range:'5y',interval:'1mo'}};
  const {range,interval}=rangeMap[activeRange]||rangeMap['1mo'];
  const data=await apiCall({type:'chart',symbol:activeStockSym,range,interval});
  if(!data||data.error){showChartError();return;}
  try{
    const r=data?.chart?.result?.[0]; if(!r){showChartError();return;}
    const ts=r.timestamp||[], q=r.indicators?.quote?.[0]||{};
    candleData=ts.map((t,i)=>({t,date:new Date(t*1000),o:q.open?.[i],h:q.high?.[i],l:q.low?.[i],c:q.close?.[i],v:q.volume?.[i]})).filter(d=>d.o&&d.h&&d.l&&d.c);
    if(candleData.length<2){showChartError();return;}
    drawCandleChart();
    document.getElementById('chart-status').textContent=`Yahoo Finance · ${candleData.length} candles`;
  }catch(e){showChartError();}
}

function showChartError(){ const cl=document.getElementById('chart-loading'); cl.style.display='flex'; cl.innerHTML='<span style="color:var(--muted)">⚠️ Chart data unavailable for this symbol</span>'; }

// ── Canvas Candlestick Renderer ────────────
function drawCandleChart(){
  const canvas=document.getElementById('candle-canvas'), vcanvas=document.getElementById('vol-canvas'), loading=document.getElementById('chart-loading');
  loading.style.display='none'; canvas.style.display='block'; vcanvas.style.display='block';
  const dpr=window.devicePixelRatio||1, W=canvas.offsetWidth, H=240, VH=55;
  canvas.width=W*dpr; canvas.height=H*dpr; vcanvas.width=W*dpr; vcanvas.height=VH*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px'; vcanvas.style.width=W+'px'; vcanvas.style.height=VH+'px';
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const vctx=vcanvas.getContext('2d'); vctx.scale(dpr,dpr);
  const PAD={t:16,b:28,l:10,r:62}, CW=W-PAD.l-PAD.r, CH=H-PAD.t-PAD.b, n=candleData.length;
  let pMin=Math.min(...candleData.map(d=>d.l)), pMax=Math.max(...candleData.map(d=>d.h));
  const pad=(pMax-pMin)*0.06; pMin-=pad; pMax+=pad;
  const toY=p=>PAD.t+CH-((p-pMin)/(pMax-pMin))*CH;
  const toX=i=>PAD.l+(i+0.5)*(CW/n);
  const cw=Math.max(1,(CW/n)*0.72);
  ctx.clearRect(0,0,W,H);
  // Grid
  ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
  for(let g=0;g<5;g++){ const y=PAD.t+(CH/4)*g; ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(W-PAD.r,y); ctx.stroke(); const price=pMax-((pMax-pMin)/4)*g; ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='9px Fira Code,monospace'; ctx.textAlign='left'; ctx.fillText('₹'+price.toLocaleString('en-IN',{maximumFractionDigits:0}),W-PAD.r+4,y+4); }
  // MA20
  ctx.strokeStyle='rgba(255,224,75,0.65)'; ctx.lineWidth=1.5; ctx.beginPath(); let ms=false;
  for(let i=19;i<n;i++){ const avg=candleData.slice(i-19,i+1).reduce((s,d)=>s+d.c,0)/20; const x=toX(i),y=toY(avg); if(!ms){ctx.moveTo(x,y);ms=true;}else ctx.lineTo(x,y); } ctx.stroke();
  // Candles
  candleData.forEach((d,i)=>{ const x=toX(i),isUp=d.c>=d.o,col=isUp?'#00e676':'#ff4d6d',wk=isUp?'rgba(0,230,118,0.6)':'rgba(255,77,109,0.6)'; ctx.fillStyle=col; ctx.strokeStyle=wk; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(x,toY(d.h)); ctx.lineTo(x,toY(d.l)); ctx.stroke(); const yO=toY(d.o),yC=toY(d.c),bH=Math.max(1,Math.abs(yO-yC)),bY=Math.min(yO,yC); ctx.beginPath(); ctx.rect(x-cw/2,bY,cw,bH); ctx.fill(); });
  // X-axis
  ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='9px Fira Code,monospace'; ctx.textAlign='center';
  const step=Math.max(1,Math.floor(n/6));
  for(let i=0;i<n;i+=step){ const d=candleData[i].date; ctx.fillText(d.toLocaleDateString('en-IN',{month:'short',day:'numeric'}),toX(i),H-PAD.b+14); }
  // Volume
  const maxVol=Math.max(...candleData.map(d=>d.v||0));
  vctx.clearRect(0,0,W,VH);
  candleData.forEach((d,i)=>{ const x=toX(i),bh=((d.v||0)/maxVol)*(VH-8),isUp=d.c>=d.o; vctx.fillStyle=isUp?'rgba(0,230,118,0.4)':'rgba(255,77,109,0.4)'; vctx.fillRect(x-cw/2,VH-6-bh,cw,bh); });
  vctx.fillStyle='rgba(255,255,255,0.25)'; vctx.font='8px Fira Code,monospace'; vctx.textAlign='left'; vctx.fillText('VOL',4,VH-2);
  // Tooltip
  canvas.onmousemove=canvas.ontouchmove=function(e){ const rect=canvas.getBoundingClientRect(),cx=e.touches?e.touches[0].clientX:e.clientX,mx=cx-rect.left; const idx=Math.min(n-1,Math.max(0,Math.floor((mx-PAD.l)/(CW/n)))); const d=candleData[idx]; if(!d)return; const tt=document.getElementById('chart-tooltip'); tt.classList.add('show'); document.getElementById('tt-date').textContent=d.date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); document.getElementById('tt-o').textContent='₹'+d.o.toFixed(1); document.getElementById('tt-h').textContent='₹'+d.h.toFixed(1); document.getElementById('tt-l').textContent='₹'+d.l.toFixed(1); document.getElementById('tt-c').textContent='₹'+d.c.toFixed(1); };
  canvas.onmouseleave=canvas.ontouchend=function(){ document.getElementById('chart-tooltip').classList.remove('show'); };
}

window.addEventListener('resize',()=>{ if(candleData.length&&document.getElementById('modal-backdrop').classList.contains('open')) drawCandleChart(); });

// ── BUNDLED FALLBACK DATA ───────────────────
const BUNDLED_STOCKS = `20MICRONS,20 Microns Limited,EQ,06-10-2008,5,INE171H01012
ADANIENT,Adani Enterprises Limited,EQ,04-06-1997,1,INE423A01024
ADANIGREEN,Adani Green Energy,EQ,18-06-2018,10,INE364U01010
ADANIPORTS,Adani Ports & SEZ,EQ,27-11-2007,2,INE742F01042
ADANIPOWER,Adani Power Limited,EQ,20-08-2009,10,INE814H01011
ANGELONE,Angel One Limited,EQ,01-10-2010,10,INE732I01013
APOLLOHOSP,Apollo Hospitals,EQ,01-01-2000,5,INE437A01024
APOLLOTYRE,Apollo Tyres,EQ,01-01-2000,1,INE438A01022
ASIANPAINT,Asian Paints,EQ,01-01-2000,1,INE021A01026
ATGL,Adani Total Gas,EQ,27-11-2018,10,INE399L01023
AUBANK,AU Small Finance Bank,EQ,10-07-2017,10,INE949L01017
AUROPHARMA,Aurobindo Pharma,EQ,01-01-2000,1,INE406A01037
AXISBANK,Axis Bank,EQ,01-01-2000,2,INE238A01034
BAJAJ-AUTO,Bajaj Auto,EQ,26-05-2008,10,INE917I01010
BAJAJFINSV,Bajaj Finserv,EQ,26-05-2008,1,INE918I01026
BAJAJHFL,Bajaj Housing Finance,EQ,16-09-2024,10,INE377Y01014
BAJFINANCE,Bajaj Finance,EQ,01-04-2008,2,INE296A01024
BANDHANBNK,Bandhan Bank,EQ,27-03-2018,10,INE545U01014
BANKBARODA,Bank of Baroda,EQ,01-01-2000,2,INE028A01039
BANKINDIA,Bank of India,EQ,01-01-2000,10,INE084A01016
BATAINDIA,Bata India,EQ,01-01-2000,5,INE176A01028
BEL,Bharat Electronics,EQ,01-01-2001,1,INE263A01024
BHARATFORG,Bharat Forge,EQ,01-01-2000,2,INE465A01025
BHARTIARTL,Bharti Airtel,EQ,15-02-2002,5,INE397D01024
BHEL,Bharat Heavy Electricals,EQ,01-01-2000,2,INE257A01026
BIKAJI,Bikaji Foods,EQ,07-11-2022,1,INE098V01014
BPCL,Bharat Petroleum,EQ,01-01-2000,10,INE029A01011
BRITANNIA,Britannia Industries,EQ,01-01-2000,1,INE216A01030
BSE,BSE Limited,EQ,03-02-2017,2,INE118H01025
CANBK,Canara Bank,EQ,01-01-2000,10,INE476A01014
CGPOWER,CG Power,EQ,01-01-2000,2,INE067A01029
CHOLAFIN,Cholamandalam Investment,EQ,22-04-2002,2,INE121A01024
CIPLA,Cipla,EQ,01-01-2000,2,INE059A01026
COALINDIA,Coal India,EQ,04-11-2010,10,INE522F01014
COFORGE,Coforge,EQ,30-08-2004,10,INE591G01017
COLPAL,Colgate-Palmolive India,EQ,01-01-2000,1,INE259A01022
CONCOR,Container Corp of India,EQ,01-01-2000,5,INE111A01025
CSBBANK,CSB Bank,EQ,04-12-2019,10,INE679A01013
CUMMINSIND,Cummins India,EQ,01-01-2000,2,INE298A01020
CYIENT,Cyient,EQ,01-03-1998,5,INE136B01020
DEEPAKNTR,Deepak Nitrite,EQ,01-01-2000,2,INE288B01029
DELHIVERY,Delhivery,EQ,24-05-2022,1,INE148O01028
DLF,DLF,EQ,05-07-2007,2,INE271C01023
DMART,Avenue Supermarts,EQ,21-03-2017,10,INE584S01010
DRREDDY,Dr. Reddys Laboratories,EQ,01-01-2000,5,INE089A01023
EASEMYTRIP,Easy Trip Planners,EQ,19-03-2021,2,INE0J8E01018
EICHERMOT,Eicher Motors,EQ,01-01-2000,1,INE066A01021
FEDERALBNK,Federal Bank,EQ,01-01-2000,2,INE171A01029
GAIL,GAIL India,EQ,01-01-2000,10,INE129A01019
GLENMARK,Glenmark Pharmaceuticals,EQ,17-02-2000,1,INE935A01035
GODREJCP,Godrej Consumer Products,EQ,01-06-2001,1,INE102D01028
GODREJPROP,Godrej Properties,EQ,05-01-2010,5,INE484J01027
GRANULES,Granules India,EQ,09-12-2005,1,INE101D01020
GRASIM,Grasim Industries,EQ,01-01-2000,2,INE047A01021
GRSE,Garden Reach Shipbuilders,EQ,10-10-2018,10,INE382Z01011
GSPL,Gujarat State Petronet,EQ,16-02-2006,2,INE246F01010
HCLTECH,HCL Technologies,EQ,06-01-2000,2,INE860A01027
HDFCAMC,HDFC Asset Management,EQ,06-08-2018,5,INE127D01025
HDFCBANK,HDFC Bank,EQ,01-01-2000,1,INE040A01034
HDFCLIFE,HDFC Life Insurance,EQ,17-11-2017,10,INE795G01014
HEROMOTOCO,Hero MotoCorp,EQ,14-02-2000,2,INE158A01026
HEXAWARE,Hexaware Technologies,EQ,12-02-2025,10,INE0XIH01016
HINDPETRO,Hindustan Petroleum,EQ,01-01-2000,10,INE094A01015
HINDUNILVR,Hindustan Unilever,EQ,01-01-2000,1,INE030A01027
HINDZINC,Hindustan Zinc,EQ,22-11-2002,2,INE267A01025
HONASA,Honasa Consumer,EQ,07-11-2023,10,INE0LYJ01010
HYUNDAI,Hyundai Motor India,EQ,22-10-2024,10,INE0S8E01014
ICICIBANK,ICICI Bank,EQ,01-01-2000,2,INE090A01021
ICICIGI,ICICI Lombard General Ins,EQ,27-09-2017,10,INE765G01017
ICICIPRULI,ICICI Prudential Life Ins,EQ,29-09-2016,10,INE726G01019
IDFCFIRSTB,IDFC First Bank,EQ,01-10-2015,10,INE092T01019
IGL,Indraprastha Gas,EQ,26-12-2003,2,INE203G01027
INFY,Infosys,EQ,08-02-1993,5,INE009A01021
IOB,Indian Overseas Bank,EQ,01-01-2000,10,INE565A01014
IOC,Indian Oil Corporation,EQ,01-01-2000,10,INE242A01010
IPCALAB,Ipca Laboratories,EQ,01-01-2000,2,INE571A01020
IRCTC,Indian Railway Catering,EQ,14-10-2019,10,INE335Y01012
IREDA,Indian Renewable Energy,EQ,29-11-2023,10,INE202S01012
IRFC,Indian Railway Finance Corp,EQ,29-01-2021,10,INE053F01010
JSWENERGY,JSW Energy,EQ,04-01-2010,10,INE121E01018
JSWINFRA,JSW Infrastructure,EQ,25-09-2023,2,INE0DSI01016
JSWSTEEL,JSW Steel,EQ,14-03-2005,1,INE019A01038
JUBLFOOD,Jubilant FoodWorks,EQ,08-02-2010,10,INE797F01020
KALYANKJIL,Kalyan Jewellers,EQ,26-03-2021,10,INE303R01014
KOTAKBANK,Kotak Mahindra Bank,EQ,01-01-2000,5,INE237A01028
KPITTECH,KPIT Technologies,EQ,10-05-2002,10,INE549I01026
LAURUSLABS,Laurus Labs,EQ,19-12-2016,2,INE947Q01028
LICHSGFIN,LIC Housing Finance,EQ,01-01-2000,2,INE115A01026
LICI,Life Insurance Corp of India,EQ,17-05-2022,10,INE0J1Y01017
LT,Larsen & Toubro,EQ,01-01-2000,2,INE018A01030
LTIM,LTIMindtree,EQ,21-09-2016,1,INE214T01019
LTTS,L&T Technology Services,EQ,23-07-2016,2,INE010V01017
LUPIN,Lupin,EQ,01-01-2000,2,INE326A01037
M&M,Mahindra & Mahindra,EQ,01-01-2000,5,INE101A01026
M&MFIN,Mahindra Financial,EQ,01-01-2003,2,INE774D01024
MANKIND,Mankind Pharma,EQ,09-05-2023,1,INE0CP401017
MARICO,Marico,EQ,14-03-1996,1,INE196A01026
MARUTI,Maruti Suzuki India,EQ,09-07-2003,5,INE585B01010
MAXHEALTH,Max Healthcare,EQ,21-08-2020,10,INE027H01010
MAZDOCK,Mazagon Dock Shipbuilders,EQ,12-10-2020,10,INE249Z01012
MCX,Multi Commodity Exchange,EQ,09-03-2012,10,INE745G01035
MEDANTA,Global Health,EQ,07-11-2022,10,INE0GJ501018
MGL,Mahanagar Gas,EQ,01-07-2016,10,INE002S01010
MOTHERSON,Samvardhana Motherson,EQ,01-01-2000,1,INE775A01035
MPHASIS,Mphasis,EQ,01-01-2000,10,INE356A01018
MRF,MRF,EQ,01-01-2000,10,INE883A01011
MUTHOOTFIN,Muthoot Finance,EQ,06-05-2011,10,INE414G01012
NESTLEIND,Nestle India,EQ,13-09-2000,1,INE239A01024
NHPC,NHPC,EQ,01-09-2009,10,INE848E01016
NMDC,NMDC,EQ,03-03-2008,1,INE584A01023
NTPC,NTPC,EQ,05-11-2004,10,INE733E01010
NUVOCO,Nuvoco Vistas,EQ,23-08-2021,10,INE118N01020
NYKAA,FSN E-Commerce,EQ,10-11-2021,1,INE388Y01029
OBEROIRLTY,Oberoi Realty,EQ,20-10-2010,10,INE093I01010
OFSS,Oracle Financial Services,EQ,29-01-2002,5,INE881D01027
OIL,Oil India,EQ,30-09-2009,10,INE274J01014
ONGC,Oil & Natural Gas Corp,EQ,19-03-2004,5,INE213A01029
PAYTM,One97 Communications,EQ,18-11-2021,1,INE982J01020
PERSISTENT,Persistent Systems,EQ,06-04-2010,10,INE262H01021
PETRONET,Petronet LNG,EQ,26-03-2004,10,INE347G01014
PFC,Power Finance Corp,EQ,23-02-2007,10,INE134E01011
PIDILITIND,Pidilite Industries,EQ,01-01-2000,1,INE318A01026
PIIND,PI Industries,EQ,01-01-2000,1,INE603J01030
POLYCAB,Polycab India,EQ,16-04-2019,10,INE455K01017
POWERGRID,Power Grid Corp,EQ,05-10-2007,10,INE752E01010
PRESTIGE,Prestige Estates,EQ,27-10-2010,10,INE811K01011
PVRINOX,PVR INOX,EQ,26-01-2006,10,INE191H01014
RBLBANK,RBL Bank,EQ,31-08-2016,10,INE976G01028
RECLTD,REC Limited,EQ,12-03-2008,10,INE020B01018
RELIANCE,Reliance Industries,EQ,01-01-2000,10,INE002A01018
RITES,RITES,EQ,02-07-2018,10,INE320J01023
RVNL,Rail Vikas Nigam,EQ,11-04-2019,10,INE415G01027
SBICARD,SBI Cards,EQ,16-03-2020,10,INE018E01016
SBILIFE,SBI Life Insurance,EQ,03-10-2017,10,INE123W01016
SBIN,State Bank of India,EQ,01-01-2000,1,INE062A01020
SHREECEM,Shree Cement,EQ,01-01-2000,10,INE070A01015
SHRIRAMFIN,Shriram Finance,EQ,01-01-2000,10,INE721A01013
SIEMENS,Siemens,EQ,01-01-2000,2,INE003A01024
SONACOMS,Sona BLW Precision,EQ,24-06-2021,10,INE073K01018
SUNPHARMA,Sun Pharmaceutical,EQ,25-08-1994,1,INE044A01036
SUNTV,Sun TV Network,EQ,30-04-1999,5,INE424H01027
SUPREME,Supreme Industries,EQ,01-01-2000,2,INE406A01029
TATACHEMICALS,Tata Chemicals,EQ,01-01-2000,10,INE092A01019
TATACONSUM,Tata Consumer Products,EQ,01-01-2000,1,INE192A01025
TATAMOTORS,Tata Motors,EQ,01-01-2000,2,INE155A01022
TATAPOWER,Tata Power,EQ,01-01-2000,1,INE245A01021
TATASTEEL,Tata Steel,EQ,01-01-2000,1,INE081A01020
TCS,Tata Consultancy Services,EQ,25-08-2004,1,INE467B01029
TECHM,Tech Mahindra,EQ,28-08-2006,5,INE669C01036
TITAN,Titan Company,EQ,23-05-1994,1,INE280A01028
TORNTPHARM,Torrent Pharmaceuticals,EQ,01-01-2000,5,INE685A01028
TORNTPOWER,Torrent Power,EQ,28-11-2006,10,INE813H01021
TRENT,Trent,EQ,11-08-2000,1,INE849A01020
TRIDENT,Trident,EQ,01-01-2000,1,INE064C01022
TVSMOTOR,TVS Motor Company,EQ,01-01-2000,1,INE494B01023
UCO,UCO Bank,EQ,01-01-2000,10,INE691A01018
ULTRACEMCO,UltraTech Cement,EQ,01-01-2000,10,INE481G01011
UNIONBANK,Union Bank of India,EQ,01-01-2000,10,INE692A01016
UPL,UPL,EQ,01-01-2000,2,INE628A01036
VEDL,Vedanta,EQ,01-01-2000,1,INE205A01025
VOLTAS,Voltas,EQ,01-01-2000,1,INE226A01021
WIPRO,Wipro,EQ,01-01-2000,2,INE075A01022
YESBANK,Yes Bank,EQ,12-07-2005,2,INE528G01035
ZEEL,Zee Entertainment,EQ,01-01-2000,1,INE256A01028
ZOMATO,Zomato,EQ,23-07-2021,1,INE758T01015
ZYDUSLIFE,Zydus Lifesciences,EQ,01-07-2022,1,INE010B01027`.trim().split('\n').filter(Boolean).map(line=>{
  const [sym,name,series,date,fv,isin]=line.split(',');
  return {sym,name,series,date,fv:parseFloat(fv)||0,isin:isin||'',paid:0,lot:1};
});

// ── INIT ───────────────────────────────────
window.addEventListener('DOMContentLoaded', loadNSEData);
