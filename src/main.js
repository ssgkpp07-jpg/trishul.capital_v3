import './style.css';
import Chart from 'chart.js/auto';

const API_BASE = (window.TRISHUL_API_URL || '').replace(/\/$/, '');
const TELEGRAM = 'https://t.me/Trishul_Capital_Bot';

const api = async (path, opts = {}) => {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || 'Request failed');
  return data;
};

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let publicPortfolioEvents=[];
let portfolioChart;
let portfolioRefreshTimer;

function Header(){
  const path = location.pathname.replace(/\/$/,'') || '/';
  const active = p => path === p ? 'active' : '';
  return `
    <header class="header">
      <a class="brand" href="/"><img src="/images/trident.png" alt="Trishul Capital"><span>TRISHUL <b>CAPITAL</b></span></a>
      <nav class="desktop-nav">
        <a class="${active('/')}" href="/">Home</a>
        <a class="${active('/portfolio')}" href="/portfolio">Portfolio</a>
        <a class="${active('/packages')}" href="/packages">Packages</a>
        <a class="${active('/performance')}" href="/performance">Performance</a>
      </nav>
      <div class="header-actions">
        <a class="gold-btn small" href="/packages">Choose Now</a>
        <button class="hamburger" type="button" aria-label="Open menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </header>
    <div class="side-menu-backdrop"></div>
    <aside class="side-menu" aria-label="Mobile navigation">
      <div class="side-menu-head">
        <div class="brand small-brand"><img src="/images/trident.png" alt="Trishul Capital"><span>TRISHUL <b>CAPITAL</b></span></div>
        <button class="menu-close" type="button" aria-label="Close menu">×</button>
      </div>
      <nav class="side-menu-nav">
        <a href="/">Home</a>
        <a href="/portfolio">Portfolio</a>
        <a href="/packages">Packages</a>
        <a href="/performance">Performance</a>
        <a href="/about-us">About Us</a>
        <a href="/contact">Contact Us</a>
        <a href="/contact-card">Contact Card</a>
        <a href="/terms-conditions">Terms &amp; Condition</a>
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/risk-policy">Risk Policy</a>
      </nav>
    </aside>
  `;
}

function Footer(){
  return `<footer>
    <div class="footer-brand"><img class="footer-logo" src="/images/trident.png" alt="Trishul Capital"><h3><span>TRISHUL</span> <b>CAPITAL</b></h3><p>Systematic automated trading solutions with transparent performance tracking.</p></div>
    <div><h4>Navigation</h4><a href="/">Home</a><a href="/packages">Packages</a><a href="/performance">Performance</a><a href="/portfolio">Portfolio</a><a href="/about-us">About Us</a><a href="/contact">Contact Us</a><a href="/contact-card">Contact Card</a><a href="/terms-conditions">Terms &amp; Condition</a><a href="/privacy-policy">Privacy Policy</a><a href="/risk-policy">Risk Policy</a></div>
    <div><h4>Connect</h4><div id="footerConnect" class="footer-connect"></div></div>
    <div class="footer-meta">
      <div class="copyright">© ${new Date().getFullYear()} Trishul Capital. All rights reserved.</div>
      <p class="footer-disclaimer">Trading in financial markets involves substantial risk. Past performance is not indicative of future results, and no guarantees are made for future outcomes.</p>
    </div>
  </footer>`;
}

function Hero(){
  return `<section class="hero">
    <div class="hero-copy">
      <span class="eyebrow">AUTOMATED • SYSTEMATIC • TRANSPARENT</span>
      <h1>Let Trishul Capital Trade <br><span>While You Live Your Life.</span></h1>
      <p className="mt-6 text-lg leading-relaxed text-gray-400">
            Built exclusively for XAUUSD, Trishul Capital combines automated gold
            trading, precision scalping execution, risk management, and VPS
            deployment.
          </p>
          <p class="small-note">
            Trishul Capital is a Account Management using Expert Advisor (EA) for MetaTrader 5 —
            automated trading software you install and run on your own account. We
            do manage funds, provide investment advice, or guarantee returns.
          </p>
      <div class="actions"><a class="gold-btn" href="/packages">Explore Packages</a><a class="outline-btn" href="/performance">View Performance</a></div>
    </div>
    <div class="hero-art"><div class="halo"></div><div class="hero-visuals"><img class="hero-visual hero-trident" src="/images/trident-gold.png" alt="Trishul Capital trident logo"></div></div>
  </section>
  <section class="ticker" aria-label="Trishul Capital highlights">
    <div class="ticker-track">
      <div>TRISHUL CAPITAL</div><div>ACCOUNT MANAGEMENT</div><div>VPS DEPLOYMENT</div><div>LIVE PERFORMANCE TRACKING</div><div>MT5 EXPERT ADVISORS</div><div>XAUUSD • NASDAQ 100 • BTCUSD</div>
      <div>TRISHUL CAPITAL</div><div>ACCOUNT MANAGEMENT</div><div>VPS DEPLOYMENT</div><div>LIVE PERFORMANCE TRACKING</div><div>MT5 EXPERT ADVISORS</div><div>XAUUSD • NASDAQ 100 • BTCUSD</div>
    </div>
  </section>`;
}

function SystemSection(){
  return `<section class="section dark system-section"><div class="split">
    <div class="section-copy"><span class="eyebrow">THE SYSTEM</span><h2>Built Around <span>Gold Trading</span></h2>
      <p><strong>Trishul Capital</strong> provides an automated Forex trading and account-management solution powered by a custom-built <strong>Expert Advisor (EA) for MetaTrader 5</strong>, developed from over <strong>5 years of trading experience</strong>. The system is designed to automate trade execution while incorporating predefined <strong>Stop Loss, Take Profit, and smart trailing-stop logic</strong> for systematic risk and profit management.</p>
      <div class="feature-pair"><div class="feature-box"><span>⚙️</span><b>Automated Execution</b></div><div class="feature-box"><span>☁️</span><b>VPS Deployment</b></div></div>
    </div>
    <div class="image-frame"><img src="/images/peacock-3.png" alt="Trishul Capital peacock"></div>
  </div></section>`;
}

function StepsSection(){
  const steps=[
    ['01','Get Trishul Capital','Select the Trishul Capital package that matches your trading goals and preferred level of support.'],
    ['02','Submit Trading Accounts','Add your MT5 Live account details through a support ticket on Telegram.'],
    ['03','Installation & VPS Setup','We activate your EA in your Trading Account and prepare your trading environment.'],
    ['04','Let Trishul Capital Trade','Once activated, Trishul Capital EA automatically trades XAUUSD/Triple Combo while you monitor everything from your MT5 Account on your Mobile Phone.']
  ];
  return `<section class="section dark steps-section"><div class="section-head centered"><h2>Start Trading Gold In <span>4 Simple Steps</span></h2></div><div class="split steps-wrap"><div class="image-frame large"><img src="/images/peacock-2.png" alt="Trishul Capital peacock"></div><div class="steps-grid">${steps.map(s=>`<article class="step-card"><span class="step-num">${s[0]}</span><h3>${s[1]}</h3><p>${s[2]}</p></article>`).join('')}</div></div></section>`;
}

function WhySection(){
  const items=[
    ['⚙️','Automated Execution','Trishul Capital continuously monitors the market and executes trades automatically based on predefined trading logic.'],
    ['🏅','XAUUSD Focused','Built exclusively for Gold trading and optimized specifically for XAUUSD market conditions.'],
    ['🛡️','Risk Management','Integrated protection systems help manage exposure and maintain disciplined trading behavior,with strict Stop Loss and Take Profit in every order.'],
    ['☁️','VPS Deployment','Professional and Elite users receive a fully configured VPS environment ready for trading.(Charges Applicable)'],
    ['🔑','Account Management','We Manage trading accounts, downloads, and EA activation requests through your dedicated VPS.'],
    ['🎧','Dedicated Support','Access technical assistance, account support, and onboarding help whenever needed.']
  ];
  return `<section class="section dark why-section"><div class="section-head centered"><h2>Why Traders Choose <span>Trishul Capital</span></h2><p>A complete automated trading ecosystem built for consistent, disciplined performance in the gold market.</p></div><div class="why-grid">${items.map(x=>`<article class="why-card"><div class="icon-box">${x[0]}</div><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</div></section>`;
}

function StrategySection(){
  const items=[
    ['01','BUILT FOR BREAKOUT TRADING','Engineered specifically for XAU/USD, BTC/USD, and NASDAQ100 strategies.'],
    ['02','SMART RISK ENGINE','Adaptive lot sizing and drawdown protection built into every trade.'],
    ['03','BACKTESTED RESULTS','Over a decade of historical data validating consistent, repeatable performance.']
  ];
  return `<section class="section dark strategy-section"><div class="section-head centered compact"><span class="eyebrow">TRISHUL CAPITAL EA — TRADING STRATEGY</span></div><div class="strategy-grid">${items.map(x=>`<article class="strategy-card"><span class="step-num">${x[0]}</span><h3>${x[1]}</h3><p>${x[2]}</p></article>`).join('')}</div></section>`;
}

const packageData = [
 {
  name:'Gold EA',
  label:'PACKAGE 1',
  image:'/images/peacock-floating.png',
  features:['Gold EA Full Access','Trades XAUUSD (Gold)','Precision Scalping Engine','Optimized Settings','VPS Deployment Prepaid Charges','80-20% Profit Split']
 },
 {
  name:'Combo EA',
  label:'PACKAGE 2',
  image:'/images/peacock-2.png',
  features:['Combo EA Full Access','Trades XAUUSD (Gold)','Trades BTCUSD','Multi-Market Execution','Optimized Settings','VPS Deployment Prepaid Charges','80-20% Profit Split']
 }
];

function PackageCard(c, i){
 return `<article class="pricing-card ${i===1?'featured':''}">
   <div class="pricing-top"><span>${c.label}</span><span class="free-pill">FREE</span></div>
   <div class="package-visual"><img src="${c.image}" alt="${c.name}"></div>
   <h3>${c.name}</h3>
   <div class="package-price">Free</div>
   <ul class="package-features">${c.features.map(f=>`<li><span>✓</span>${f}</li>`).join('')}</ul>
   <div class="package-actions">
     <a class="package-order ${i===1?'gold-fill':''}" href="${TELEGRAM}" target="_blank" rel="noopener">Choose Now</a>
     <a class="read-terms" href="/terms-conditions">Read Terms &amp; Conditions</a>
   </div>
 </article>`;
}
function Packages(){
 return `<section class="section page-section packages-page"><div class="section-head"><span class="eyebrow">OUR SYSTEMS</span><h2>Choose your <span>automated edge.</span></h2><p>Both packages are currently available free of charge.</p></div><div class="pricing-grid">${packageData.map(PackageCard).join('')}</div></section>`;
}

function CopyField(label, value, copyable = true){
  const safeValue = String(value ?? '');
  const button = copyable ? `<button type="button" class="copy-btn" data-copy="${safeValue.replace(/"/g, '&quot;')}" aria-label="Copy ${esc(label)}" title="Copy">⧉</button>` : '';
  return `<div class="mt5-field"><label>${esc(label)}</label><div class="mt5-field-box"><span>${esc(safeValue)}</span>${button}</div></div>`;
}
async function PerformancePage(){
 let loginBoxes=[];
 let detailsError='';
 try{loginBoxes=(await api('/api/performance-details')).accounts||[]}
 catch(error){detailsError=error.message}
 const statusPanels = loginBoxes.map(box => {
  const status=String(box.status??'').trim()||'Online';
  const myfxbookLink=/^https:\/\/www\.myfxbook\.com(?:\/|$)/i.test(box.myfxbook_url||'')
   ?`<a class="status-results-btn" href="${esc(box.myfxbook_url)}" target="_blank" rel="noopener noreferrer">View ${esc(box.name)} on Myfxbook <span aria-hidden="true">↗</span></a>`
   :'';
  return `
   <div class="account-status-panel mt5-box">
       <div class="status-header-row">
       <strong>${esc(box.name)}</strong>
       <span class="online-status"><i></i>${esc(status)}</span>
       </div>
       <div class="mt5-login-fields">
        ${[
          ['Broker',box.broker,false],
          ['Account Number',box.account_number],
          ['Investor password (View Access Only)',box.investor_password],
          ['Server',box.server]
        ].map(([label,value,copyable=true])=>CopyField(label,value,copyable)).join('')}
       </div>
       ${myfxbookLink}
   </div>
 `;
 }).join('');
 return `<section class="section page-section"><div class="section-head"><span class="eyebrow">TRADING ACCOUNT ACCESS</span><h2>Your trading <span>accounts.</span></h2></div>${detailsError?`<p class="performance-load-error" role="alert">Account details could not be loaded: ${esc(detailsError)}</p>`:''}<div class="account-status-grid">${statusPanels}</div><aside class="mt5-help-panel" aria-labelledby="mt5-help-title"><div class="mt5-help-heading"><span class="eyebrow">QUICK GUIDE</span><h3 id="mt5-help-title">How to log in to MT5</h3></div><div class="mt5-help-devices"><section class="mt5-help-device"><h4>Android</h4><ol><li>Open the MetaTrader 5 app.</li><li>Tap <strong>Menu (☰)</strong> in the top-left, then <strong>Manage Accounts</strong>.</li><li>Tap <strong>+</strong>, search your broker (e.g., Exness, BlackBull, or FBS), and select it.</li><li>Select the exact server assigned to your account (live or demo).</li><li>Enter your account number (Login) and password, then tap <strong>Login</strong>.</li></ol></section><section class="mt5-help-device"><h4>iPhone / iPad</h4><ol><li>Open the MetaTrader 5 app and go to <strong>Settings</strong> in the bottom-right.</li><li>Tap <strong>New Account</strong> (or the arrow / <strong>+</strong> near your account name).</li><li>Search for your broker and select it.</li><li>Select the right server for your account (live or demo).</li><li>Enter your Login ID and password, then tap <strong>Sign In</strong>.</li></ol></section></div></aside></section>`;
}
const portfolioEventLabel=type=>({onboarded:'Onboarded',funds_added:'Funds added',offboarded:'Offboarded',profit_withdrawn:'Profit withdrawn'}[type]||type);
const fmtPortfolioMoney=value=>new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(value)||0);
function monthlyPortfolioActivity(events){if(events[0]?.onboardedCount!==undefined)return events;const months=new Map();for(const event of events){if(event.deleted_at)continue;const date=new Date(event.created_at);if(Number.isNaN(date.getTime()))continue;const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;if(!months.has(key))months.set(key,{key,onboardedClients:new Set(),offboardedClients:new Set(),fundsAdded:0,fundsWithdrawn:0});const month=months.get(key),client=String(event.client_name||'').trim().toLowerCase(),amount=Number(event.amount)||0;if(event.event_type==='onboarded')month.onboardedClients.add(client);if(event.event_type==='offboarded')month.offboardedClients.add(client);if(event.event_type==='onboarded'||event.event_type==='funds_added')month.fundsAdded+=amount;if(event.event_type==='offboarded')month.fundsWithdrawn+=amount}return [...months.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(month=>({...month,label:new Date(`${month.key}-01T00:00:00`).toLocaleDateString(undefined,{month:'short',year:'numeric'}),onboardedCount:month.onboardedClients.size,offboardedCount:month.offboardedClients.size}))}
function renderPortfolioChart(events){const canvas=document.querySelector('#portfolioMonthlyChart');if(!canvas)return;if(portfolioChart)portfolioChart.destroy();const months=monthlyPortfolioActivity(events),empty=canvas.parentElement.querySelector('.portfolio-chart-empty');if(!months.length){canvas.style.display='none';if(!empty)canvas.insertAdjacentHTML('afterend','<p class="portfolio-chart-empty">Monthly portfolio activity will appear here when entries are added.</p>');return}canvas.style.display='block';empty?.remove();const maxClients=Math.max(1,...months.flatMap(month=>[month.onboardedCount,month.offboardedCount])),maxFunds=Math.max(1,...months.flatMap(month=>[month.fundsAdded,month.fundsWithdrawn]));portfolioChart=new Chart(canvas,{type:'bar',data:{labels:months.map(month=>month.label),datasets:[{label:'Clients onboarded',data:months.map(month=>month.onboardedCount),backgroundColor:'#d6ad43',yAxisID:'clients'},{label:'Clients offboarded',data:months.map(month=>-month.offboardedCount),backgroundColor:'#c65f55',yAxisID:'clients'},{label:'Funds added (USD)',data:months.map(month=>month.fundsAdded),backgroundColor:'#68b978',yAxisID:'funds'},{label:'Funds withdrawn (USD)',data:months.map(month=>-month.fundsWithdrawn),backgroundColor:'#df8068',yAxisID:'funds'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:'#d8d1c0',usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{label:item=>item.dataset.yAxisID==='funds'?`${item.dataset.label}: ${fmtPortfolioMoney(Math.abs(item.raw))}`:`${item.dataset.label}: ${Math.abs(item.raw)}`}}},scales:{x:{grid:{display:false},ticks:{color:'#aaa'}},clients:{position:'left',min:-maxClients,max:maxClients,title:{display:true,text:'Clients',color:'#aaa'},ticks:{color:'#aaa',precision:0,callback:value=>Math.abs(value)},grid:{color:context=>context.tick.value===0?'#f4d47b':'rgba(255,255,255,.08)',lineWidth:context=>context.tick.value===0?2:1}},funds:{position:'right',min:-maxFunds,max:maxFunds,title:{display:true,text:'USD',color:'#aaa'},ticks:{color:'#aaa',callback:value=>`$${Math.abs(value).toLocaleString()}`},grid:{drawOnChartArea:false}}},datasets:{bar:{borderRadius:3,categoryPercentage:.72,barPercentage:.82}}}})}
function renderPortfolioChartMode(events){const canvas=document.querySelector('#portfolioMonthlyChart');if(!canvas)return;if(portfolioChart)portfolioChart.destroy();const months=monthlyPortfolioActivity(events),empty=canvas.parentElement.querySelector('.portfolio-chart-empty');if(!months.length){canvas.style.display='none';if(!empty)canvas.insertAdjacentHTML('afterend','<p class="portfolio-chart-empty">Monthly portfolio activity will appear here when entries are added.</p>');return}canvas.style.display='block';empty?.remove();const fundsMode=document.querySelector('#portfolioChartMode')?.value==='funds',maximum=Math.max(1,...months.flatMap(month=>fundsMode?[month.fundsAdded,month.fundsWithdrawn]:[month.onboardedCount,month.offboardedCount])),axis=fundsMode?'funds':'clients',datasets=fundsMode?[{label:'Funds added',data:months.map(month=>month.fundsAdded),backgroundColor:'#68b978',yAxisID:axis},{label:'Funds withdrawn',data:months.map(month=>-month.fundsWithdrawn),backgroundColor:'#df8068',yAxisID:axis}]:[{label:'Clients onboarded',data:months.map(month=>month.onboardedCount),backgroundColor:'#d6ad43',yAxisID:axis},{label:'Clients offboarded',data:months.map(month=>-month.offboardedCount),backgroundColor:'#c65f55',yAxisID:axis}],axisOptions={position:'left',min:-maximum,max:maximum,title:{display:true,text:fundsMode?'USD':'Clients',color:'#aaa'},ticks:{color:'#aaa',precision:fundsMode?undefined:0,callback:value=>fundsMode?`$${Math.abs(value).toLocaleString()}`:Math.abs(value)},grid:{color:context=>context.tick.value===0?'#f4d47b':'rgba(255,255,255,.08)',lineWidth:context=>context.tick.value===0?2:1}};portfolioChart=new Chart(canvas,{type:'bar',data:{labels:months.map(month=>month.label),datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom',labels:{color:'#d8d1c0',usePointStyle:true,boxWidth:8,padding:18}},tooltip:{callbacks:{label:item=>`${item.dataset.label}: ${fundsMode?fmtPortfolioMoney(Math.abs(item.raw)):Math.abs(item.raw)}`}}},scales:{x:{grid:{display:false},ticks:{color:'#aaa'}},[axis]:axisOptions},datasets:{bar:{borderRadius:3,categoryPercentage:.72,barPercentage:.82}}}})}
async function refreshPublicPortfolio(){if(!document.querySelector('#portfolioMonthlyChart'))return;try{const data=await api('/api/portfolio');publicPortfolioEvents=data.monthly||[];const summary=data.summary||{},values=[summary.onboarded_clients,summary.onboarded_accounts,fmtPortfolioMoney(summary.funds_managed),summary.offboarded_clients,summary.offboarded_accounts,fmtPortfolioMoney(summary.funds_withdrawn),fmtPortfolioMoney(summary.previous_week_profits_withdrawn),fmtPortfolioMoney(summary.previous_month_profits_withdrawn),fmtPortfolioMoney(summary.profits_withdrawn)];document.querySelectorAll('.portfolio-stat strong').forEach((element,index)=>{if(values[index]!==undefined)element.textContent=values[index]});renderPortfolioChartMode(publicPortfolioEvents)}catch{}}
async function PortfolioPage(){
 let data;
 try{data=await api('/api/portfolio')}catch(error){return `<section class="section page-section"><div class="section-head"><span class="eyebrow">PORTFOLIO</span><h2>Portfolio <span>overview.</span></h2><p class="portfolio-error" role="alert">Portfolio data is temporarily unavailable.</p></div></section>`}
 publicPortfolioEvents=data.monthly||[];
 const summary=data.summary||{},groups=[['Onboarded',[['Total clients',summary.onboarded_clients],['Total accounts',summary.onboarded_accounts],['Total funds managed',fmtPortfolioMoney(summary.funds_managed)]]],['Offboarded',[['Total clients',summary.offboarded_clients],['Total accounts',summary.offboarded_accounts],['Total funds withdrawn',fmtPortfolioMoney(summary.funds_withdrawn)]]],['Profits',[['Previous week profits withdrawn (Sunday-Saturday)',fmtPortfolioMoney(summary.previous_week_profits_withdrawn)],['Previous month withdrawal',fmtPortfolioMoney(summary.previous_month_profits_withdrawn)],['Lifetime withdrawal',fmtPortfolioMoney(summary.profits_withdrawn)]]]];
 return `<section class="section page-section portfolio-page"><div class="section-head"><span class="eyebrow">CLIENT PORTFOLIO</span><h2>Portfolio <span>at a glance.</span></h2></div><div class="portfolio-groups">${groups.map(([title,items])=>`<section class="portfolio-group"><h3>${title}</h3><div class="portfolio-stats">${items.map(([label,value])=>`<div class="portfolio-stat"><span>${label}</span><strong>${value??0}</strong></div>`).join('')}</div></section>`).join('')}</div><div class="portfolio-chart-heading"><div><span class="eyebrow">MONTHLY ACTIVITY</span><h3 id="portfolioChartTitle">Client onboarding</h3><p id="portfolioChartDescription">Clients onboarded appear above zero; offboarded clients appear below.</p></div><label class="portfolio-mode-label">View<select id="portfolioChartMode"><option value="onboarding">Onboarding &amp; offboarding</option><option value="funds">Funds added &amp; withdrawn</option></select></label></div><div class="portfolio-chart-wrap"><canvas id="portfolioMonthlyChart" aria-label="Monthly client onboarding and offboarding" role="img"></canvas></div></section>`;
}
async function ContactPage(){
 let c={};try{c=await api('/api/settings/contact')}catch{}
 const email = 'https://mail.google.com/mail/u/0/?fs=1&to=mailtotrishulcapital@gmail.com&su=Hi+Trishul+Capital&body=Hello+Trishul+Capital,%0A%0AI+am+interested+to+know+more+about+your+Forex+Account+Management+Services.&tf=cm';
 const whatsapp = 'https://wa.me/919787801006?text=Hi%20...%20I%27m%20interested%20to%20know%20more%20about%20your%20Forex%20Account%20Management%20Services...';
 const instagram = 'https://www.instagram.com/trishulcapital';
 const telegram = 'https://t.me/Trishul_Capital';
 const labels = [
   { key: 'Email', value: 'mailtotrishulcapital@gmail.com', href: email, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h12.5A2.75 2.75 0 0 1 21 6.75v10.5A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Zm2.2-.75 6.8 5.76 6.8-5.76H5.2Zm13.05 2.16-6.33 5.36a1 1 0 0 1-1.24 0L5.75 8.16v9.09c0 .41.34.75.75.75h10.99a.75.75 0 0 0 .75-.75V8.16Z" fill="currentColor"/></svg>' },
   { key: 'WhatsApp', value: '+91 (9787801006)', href: whatsapp, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.83 9.83 0 0 0-8.36 15.01L2.5 21.5l4.62-1.15A9.96 9.96 0 1 0 12.04 2Zm0 18.13a8.18 8.18 0 0 1-4.17-1.15l-.3-.18-2.74.69.73-2.66-.2-.31A8.17 8.17 0 1 1 12.04 20.13Zm4.48-6.13c-.25-.13-1.48-.73-1.71-.81-.23-.09-.4-.13-.57.13-.17.25-.65.81-.8.98-.15.17-.29.19-.54.06a6.68 6.68 0 0 1-1.96-1.21 7.36 7.36 0 0 1-1.36-1.69c-.14-.25-.02-.38.11-.51.12-.12.25-.29.37-.44.13-.15.17-.25.25-.42.09-.17.04-.31-.02-.44-.06-.13-.57-1.38-.78-1.89-.2-.49-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.28 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.48-.61 1.69-1.2.21-.59.21-1.1.15-1.2-.06-.11-.23-.17-.48-.29Z" fill="currentColor"/></svg>' },
   { key: 'Instagram', value: '@trishulcapital', href: instagram, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.37 2h9.26A5.38 5.38 0 0 1 22 7.37v9.26A5.38 5.38 0 0 1 16.63 22H7.37A5.38 5.38 0 0 1 2 16.63V7.37A5.38 5.38 0 0 1 7.37 2Zm-.2 1.81a3.35 3.35 0 0 0-3.36 3.36v9.66a3.35 3.35 0 0 0 3.36 3.36h9.66a3.35 3.35 0 0 0 3.36-3.36V7.17a3.35 3.35 0 0 0-3.36-3.36H7.17ZM17.59 5.17a1.21 1.21 0 1 1 0 2.42 1.21 1.21 0 0 1 0-2.42ZM12 6.89A5.11 5.11 0 1 1 6.89 12 5.11 5.11 0 0 1 12 6.89Zm0 1.81A3.3 3.3 0 1 0 15.3 12 3.3 3.3 0 0 0 12 8.7Z" fill="currentColor"/></svg>' },
   { key: 'Telegram', value: '@Trishul_Capital', href: telegram, icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 4.33a1.56 1.56 0 0 0-1.62-.22L2.47 10.8a1.1 1.1 0 0 0 .08 2.07l4.32 1.35 1.67 5.12a1.1 1.1 0 0 0 1.84.43l2.45-2.61 4.25 3.11a1.56 1.56 0 0 0 2.43-.92l2.22-13.48a1.56 1.56 0 0 0-.31-1.53ZM8.18 13.61l8.72-5.5-7.31 6.97-.29 2.28-1.12-3.43Z" fill="currentColor"/></svg>' }
 ];
 return `<section class="section page-section contact"><div><span class="eyebrow">CONTACT US</span><h2>Let’s build a <span>systematic approach.</span></h2><p>For EA access, account management enquiries or general questions, contact Trishul Capital.</p></div><div class="contact-card">${labels.map(item => `<p class="contact-row"><span class="contact-label"><span class="contact-icon">${item.icon}</span><b>${esc(item.key)}</b></span><br><a href="${esc(item.href)}" target="_blank" rel="noopener">${esc(item.value)}</a></p>`).join('')}</div></section>`;
}

async function ContactCardPage(){
 let data,profile;
 try{[data,profile]=await Promise.all([api('/api/contact-buttons'),api('/api/contact-card/profile')])}catch(error){return `<main class="qr-contact-page"><section class="qr-contact-card qr-contact-error" role="alert"><img src="/images/trident.png" alt=""><h1>Contact links unavailable</h1><p>Please try again shortly.</p></section></main>`}
 const buttons=Array.isArray(data.items)?data.items:[];
 const title=profile.title||'Trishul Capital';
 const logo=profile.logo||'/images/trident.png';
 const links=buttons.map(item=>{
  const icon=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.icon)
   ?`<img src="${esc(item.icon)}" alt="">`
   :`<span aria-hidden="true">${esc(item.icon)}</span>`;
  return `<a class="qr-contact-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span class="qr-contact-icon">${icon}</span><b>${esc(item.name)}</b><span class="qr-contact-arrow" aria-hidden="true">↗</span></a>`;
 }).join('');
 return `<main class="qr-contact-page"><article class="qr-contact-card"><header class="qr-contact-profile"><img class="qr-contact-logo" src="${esc(logo)}" alt="${esc(title)}"><h1>${esc(title)}</h1>${profile.subtitle?`<p>${esc(profile.subtitle)}</p>`:''}${profile.tagline?`<span class="qr-contact-tag">${esc(profile.tagline)}</span>`:''}</header><nav class="qr-contact-links" aria-label="Contact links">${links||'<p class="qr-contact-empty">Contact links will be added soon.</p>'}</nav><p class="qr-contact-location">${esc(title.toUpperCase())} · INDIA</p><p class="qr-contact-note">Trading involves risk. Past performance does not guarantee future results.</p></article></main>`;
}

function AboutUsPage(){
  return `<section class="section page-section about-page">
    <div class="section-head"><span class="eyebrow">ABOUT US</span><h2>Built by a <span>trader, for traders.</span></h2></div>
    <div class="about-wrap">
      <div class="about-profile">
        <div class="profile-frame">
          <img src="${esc(`${API_BASE}/api/about/founder-image`)}" alt="Trishul Capital founder" onerror="this.onerror=null;this.src='/images/trident.png'" />
        </div>
        <p class="founder-caption"><em><strong>Trishul (alias) Saran Santhan S S</strong></em><br><em><strong>Founder - Trishul Capital</strong></em><br><em><strong>India</strong></em></p>
      </div>
      <div class="about-copy">
        <p>Hi, I’m the founder of Trishul Capital. I built this system to bring disciplined, rule-based trading to people who want a more structured way to participate in the markets without constant manual monitoring.</p>
        <p>After more than <strong>5 years of experience in Forex trading</strong>, I created this automated system with one goal: <strong>Turn a disciplined trading strategy into a machine that can execute it consistently.</strong> It is designed to remove emotional interference, automate execution, manage positions and dynamically protect profits.</p>
        <p><strong>Not a magic machine. Not a guaranteed-money printer.</strong> It is a <strong>systematic trading machine built from experience, technology and automation</strong>, designed to pursue opportunities in the Forex market while maintaining predefined risk-management rules.</p>
        <p>My focus is simple: combine automated execution, smart risk protection, and transparent performance tracking into a framework that helps traders stay consistent and reduce emotional decision-making.</p>
        <p>Trishul Capital is designed for disciplined traders who value process, adaptability, and systematic execution. The goal is not to promise unrealistic returns, but to provide a practical, well-managed trading system backed by clear risk controls and transparency.</p>
      </div>
    </div>
  </section>`;
}

function PolicyPage(title, intro, items){
  return `<section class="section page-section legal-page">
    <div class="section-head"><span class="eyebrow">${title.toUpperCase()}</span><h2>${intro}</h2></div>
    <div class="legal-box">
      ${items.map(item => `<div class="legal-item${item.warning ? ' legal-item-warning' : ''}"><h3>${item.title}</h3><p>${item.text}</p></div>`).join('')}
    </div>
  </section>`;
}

function PrivacyPolicyPage(){
  const items=[
    {title:'Advanced Automated Trading', text:'Access professional Forex trading powered by a custom-built <strong>Expert Advisor (EA)</strong> designed and developed by me, with automated trade execution and systematic risk-management rules.'},
    {title:'Smart Risk Management', text:'The EA is designed with <strong>Stop Loss and Take Profit protection</strong> to help manage risk and automatically secure predefined trade targets without requiring constant manual monitoring.'},
    {title:'Smart Trailing Stop Logic', text:'Our EA also incorporates a <strong>smart trailing-stop system</strong> that dynamically adjusts the Stop Loss as the trade moves in a favorable direction. This is designed to protect accumulated profits while allowing profitable trades room to continue running.'},
    {title:'Account Management Service', text:'Your trading account can be managed using the automated strategy, allowing the system to monitor and execute trades according to its programmed trading conditions.'},
    {title:'Client Data Security', text:'The client&#39;s details are safe and secured.'}
  ];
  return PolicyPage('Privacy Policy', 'Your data and trading process are handled with care and transparency.', items);
}

function RiskPolicyPage(){
  const items=[
    {title:'Risk Disclosure', text:'<strong>Forex trading involves a high level of risk</strong>, and you can lose part or all of your invested capital. Returns are not guaranteed, and the stated <strong>20% monthly figure</strong> is a target rather than a guaranteed minimum. Market conditions can result in lower returns or losses. Only trade with capital you can afford to lose.'}
  ];
  return PolicyPage('Risk Policy', 'Trading involves risk and market conditions can change quickly.', items);
}

function TermsPage(){
  const items=[
    {title:'Start With a Small Capital', text:'You can get started with approximately <strong>$150</strong> (around <strong>₹15,000</strong>) as your initial trading capital. You remain responsible for your own trading account and capital.'},
    {title:'Performance Target', text:'The strategy is designed with a target of approximately <strong>20% monthly returns</strong>, depending on market conditions and trading performance. <strong>This is a target, not a guaranteed return.</strong> Some months may produce lower returns, no returns, or losses.'},
    {title:'Simple 80/20 Profit-Sharing Model', text:'When profits are generated, the agreed <strong>80/20 profit split</strong> applies bi weekly or monthly. The performance share is calculated <strong>only when profits are actually realized and withdrawn</strong>, rather than being charged on unrealized profits.'},
    {title:'No Realized Profit = No Performance Split', text:'If there is no realized profit available for withdrawal, <strong>no performance-based profit split is charged</strong>. This keeps the performance fee aligned with actual realized results.'},
    {title:'VPS Maintenance', text:'For reliable 24/7 automated execution, the EA operates through a VPS. A small VPS maintenance contribution of approximately <strong>$6</strong> (around <strong>₹600</strong>) per month is applicable for server hosting and maintenance.'},
    {title:'Fully Automated Execution', text:'Once configured, the EA can continuously monitor the market and execute trades according to its programmed strategy, reducing the need for manual intervention.'},
    {title:'Transparent Trading Approach', text:'The goal is to provide a systematic and transparent service where clients can monitor their account, trading activity, profits and losses.'},
    {title:'If Our System Fails', warning:true, text:'<ul class="legal-warning-list"><li><strong>Stated risk limit:</strong> The package is structured to risk up to $50 of your capital. Please confirm how this limit is monitored and enforced before starting.</li><li><strong>Withdrawal condition:</strong> If your account reaches $100, you may withdraw that amount and discontinue the package. This is a condition.</li></ul>'},
    {title:'Quick Summary', text:'<strong>Initial Capital:</strong> ~$150 / ₹15,000<br><strong>VPS Maintenance:</strong> ~$6 / ₹600 per month<br><strong>Profit Split:</strong> 80/20 on realized &amp; withdrawn profits<br><strong>Performance Target:</strong> ~20% monthly <em>(minimum)</em><br><strong>Risk Management:</strong> Stop Loss + Take Profit<br><strong>Profit Protection:</strong> Smart Trailing Stop Logic<br><strong>Trading:</strong> Automated through a custom Expert Advisor'}
  ];
  return PolicyPage('Terms &amp; Conditions', 'Simple rules for transparency, risk awareness, and performance sharing.', items);
}

async function Home(){
 return `${Hero()}${SystemSection()}${StepsSection()}${WhySection()}${StrategySection()}<section class="section home-cta"><div class="cta-card"><span class="eyebrow">READY TO BEGIN?</span><h2>Choose your <span>automated system.</span></h2><p>Explore the free Gold EA and Combo EA packages or view live account performance.</p><div class="actions"><a class="gold-btn" href="/packages">View Packages</a><a class="outline-btn" href="/performance">View Performance</a></div></div></section>`;
}

async function render(){
 const path=location.pathname.replace(/\/$/,'')||'/';
 let content='';
 if(path==='/') content=await Home();
 else if(path==='/packages') content=Packages();
 else if(path==='/performance') content=await PerformancePage();
 else if(path==='/portfolio') content=await PortfolioPage();
 else if(path==='/about-us') content=AboutUsPage();
 else if(path==='/contact') content=await ContactPage();
 else if(path==='/contact-card') content=await ContactCardPage();
 else if(path==='/privacy-policy') content=PrivacyPolicyPage();
 else if(path==='/risk-policy') content=RiskPolicyPage();
 else if(path==='/terms-conditions') content=TermsPage();
 else content=`<section class="section page-section"><div class="section-head"><span class="eyebrow">404</span><h2>Page <span>not found.</span></h2><a class="gold-btn" href="/">Back Home</a></div></section>`;
 const standaloneContactCard=path==='/contact-card';
 document.body.innerHTML=standaloneContactCard?content:Header()+`<main>${content}</main>`+Footer();
 document.body.classList.toggle('contact-card-body',standaloneContactCard);
 if(portfolioRefreshTimer)clearInterval(portfolioRefreshTimer);if(path==='/portfolio'){renderPortfolioChartMode(publicPortfolioEvents);portfolioRefreshTimer=setInterval(refreshPublicPortfolio,15000)}
 document.body.classList.remove('menu-open');
 if(!standaloneContactCard)try{
   const emailIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.75A2.75 2.75 0 0 1 5.75 4h12.5A2.75 2.75 0 0 1 21 6.75v10.5A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Zm2.2-.75 6.8 5.76 6.8-5.76H5.2Zm13.05 2.16-6.33 5.36a1 1 0 0 1-1.24 0L5.75 8.16v9.09c0 .41.34.75.75.75h10.99a.75.75 0 0 0 .75-.75V8.16Z" fill="currentColor"/></svg>';
   const whatsappIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.83 9.83 0 0 0-8.36 15.01L2.5 21.5l4.62-1.15A9.96 9.96 0 1 0 12.04 2Zm0 18.13a8.18 8.18 0 0 1-4.17-1.15l-.3-.18-2.74.69.73-2.66-.2-.31A8.17 8.17 0 1 1 12.04 20.13Zm4.48-6.13c-.25-.13-1.48-.73-1.71-.81-.23-.09-.4-.13-.57.13-.17.25-.65.81-.8.98-.15.17-.29.19-.54.06a6.68 6.68 0 0 1-1.96-1.21 7.36 7.36 0 0 1-1.36-1.69c-.14-.25-.02-.38.11-.51.12-.12.25-.29.37-.44.13-.15.17-.25.25-.42.09-.17.04-.31-.02-.44-.06-.13-.57-1.38-.78-1.89-.2-.49-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.28 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.48-.61 1.69-1.2.21-.59.21-1.1.15-1.2-.06-.11-.23-.17-.48-.29Z" fill="currentColor"/></svg>';
   const instagramIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.37 2h9.26A5.38 5.38 0 0 1 22 7.37v9.26A5.38 5.38 0 0 1 16.63 22H7.37A5.38 5.38 0 0 1 2 16.63V7.37A5.38 5.38 0 0 1 7.37 2Zm-.2 1.81a3.35 3.35 0 0 0-3.36 3.36v9.66a3.35 3.35 0 0 0 3.36 3.36h9.66a3.35 3.35 0 0 0 3.36-3.36V7.17a3.35 3.35 0 0 0-3.36-3.36H7.17ZM17.59 5.17a1.21 1.21 0 1 1 0 2.42 1.21 1.21 0 0 1 0-2.42ZM12 6.89A5.11 5.11 0 1 1 6.89 12 5.11 5.11 0 0 1 12 6.89Zm0 1.81A3.3 3.3 0 1 0 15.3 12 3.3 3.3 0 0 0 12 8.7Z" fill="currentColor"/></svg>';
   const telegramIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.42 4.33a1.56 1.56 0 0 0-1.62-.22L2.47 10.8a1.1 1.1 0 0 0 .08 2.07l4.32 1.35 1.67 5.12a1.1 1.1 0 0 0 1.84.43l2.45-2.61 4.25 3.11a1.56 1.56 0 0 0 2.43-.92l2.22-13.48a1.56 1.56 0 0 0-.31-1.53ZM8.18 13.61l8.72-5.5-7.31 6.97-.29 2.28-1.12-3.43Z" fill="currentColor"/></svg>';
   const footerLinks = [
     { label: 'Email', icon: emailIcon, url: 'https://mail.google.com/mail/u/0/?fs=1&to=mailtotrishulcapital@gmail.com&su=Hi+Trishul+Capital&body=Hello+Trishul+Capital,%0A%0AI+am+interested+to+know+more+about+your+Forex+Account+Management+Services.&tf=cm' },
     { label: 'WhatsApp', icon: whatsappIcon, url: 'https://wa.me/919787801006?text=Hi%20...%20I%27m%20interested%20to%20know%20more%20about%20your%20Forex%20Account%20Management%20Services...' },
     { label: 'Instagram', icon: instagramIcon, url: 'https://www.instagram.com/trishulcapital' },
     { label: 'Telegram', icon: telegramIcon, url: 'https://t.me/Trishul_Capital' }
   ];
   document.querySelector('#footerConnect').innerHTML = footerLinks.map(item => `<a class="connect-link" href="${esc(item.url)}" target="_blank" rel="noopener"><span class="connect-icon" aria-hidden="true">${item.icon}</span><span>${esc(item.label)}</span></a>`).join('');
 }catch{document.querySelector('#footerConnect').textContent='—';}
 window.scrollTo({top:0,left:0,behavior:'auto'});
}
history.scrollRestoration='manual';
window.addEventListener('popstate',render);
document.addEventListener('click',e=>{
  const copyBtn=e.target.closest('.copy-btn');
  if(copyBtn){
    const value = copyBtn.dataset.copy || '';
    const writeText = async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          const area = document.createElement('textarea');
          area.value = value;
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.focus();
          area.select();
          document.execCommand('copy');
          area.remove();
        }
        copyBtn.classList.add('copied');
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.textContent = '⧉';
        }, 1100);
      } catch (error) {
        copyBtn.textContent = '✕';
        setTimeout(() => { copyBtn.textContent = '⧉'; }, 1100);
      }
    };
    writeText();
    return;
  }
  const a=e.target.closest('a');
  if(e.target.closest('.hamburger')){
    document.body.classList.toggle('menu-open');
    const btn=e.target.closest('.hamburger');
    btn.setAttribute('aria-expanded', String(document.body.classList.contains('menu-open')));
    return;
  }
  if(e.target.closest('.menu-close') || e.target.closest('.side-menu-backdrop')){
    document.body.classList.remove('menu-open');
    const btn=document.querySelector('.hamburger');
    if(btn) btn.setAttribute('aria-expanded','false');
    return;
  }
  if(!a||a.target==='_blank'||!a.href.startsWith(location.origin))return;
  const u=new URL(a.href);
  if(u.pathname.startsWith('/api'))return;
  e.preventDefault();
  document.body.classList.remove('menu-open');
  history.pushState({},'',u.pathname + u.search + u.hash);
  render();
});
document.addEventListener('change',event=>{if(event.target.id==='portfolioChartMode'){const fundsMode=event.target.value==='funds';document.querySelector('#portfolioChartTitle').textContent=fundsMode?'Funds added & withdrawn':'Client onboarding';document.querySelector('#portfolioChartDescription').textContent=fundsMode?'Funds added appear above zero; funds withdrawn appear below.':'Clients onboarded appear above zero; offboarded clients appear below.';renderPortfolioChartMode(publicPortfolioEvents)}});
render();
