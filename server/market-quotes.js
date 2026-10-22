const cacheDurationMs=15000;
let cachedQuotes;
let cachedAt=0;
let pendingRequest;

const quoteSources=[
  {
    symbol:'XAUUSD',
    url:'https://api.gold-api.com/price/XAU',
    provider:'Gold API',
    read:data=>({price:data.price,updatedAt:data.updatedAt})
  },
  {
    symbol:'XAGUSD',
    url:'https://api.gold-api.com/price/XAG',
    provider:'Gold API',
    read:data=>({price:data.price,updatedAt:data.updatedAt})
  },
  {
    symbol:'BTCUSD',
    url:'https://api.coinbase.com/v2/prices/BTC-USD/spot',
    provider:'Coinbase',
    read:data=>({price:data.data?.amount})
  },
  {
    symbol:'NAS100',
    url:'https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=1d&interval=1m',
    provider:'Yahoo Finance',
    read:data=>{
      const meta=data.chart?.result?.[0]?.meta;
      return {price:meta?.regularMarketPrice,updatedAt:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():undefined};
    }
  },
  {
    symbol:'US30',
    url:'https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?range=1d&interval=1m',
    provider:'Yahoo Finance',
    read:data=>{
      const meta=data.chart?.result?.[0]?.meta;
      return {price:meta?.regularMarketPrice,updatedAt:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():undefined};
    }
  },
  {
    symbol:'EURUSD',
    url:'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?range=1d&interval=1m',
    provider:'Yahoo Finance',
    read:data=>{
      const meta=data.chart?.result?.[0]?.meta;
      return {price:meta?.regularMarketPrice,updatedAt:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():undefined};
    }
  },
  {
    symbol:'GBPUSD',
    url:'https://query1.finance.yahoo.com/v8/finance/chart/GBPUSD=X?range=1d&interval=1m',
    provider:'Yahoo Finance',
    read:data=>{
      const meta=data.chart?.result?.[0]?.meta;
      return {price:meta?.regularMarketPrice,updatedAt:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():undefined};
    }
  }
];

async function fetchQuote(source){
  try{
    const response=await fetch(source.url,{signal:AbortSignal.timeout(8000),headers:{'User-Agent':'TrishulCapitalMarketTicker/1.0'}});
    if(!response.ok)throw new Error(`${source.provider} returned HTTP ${response.status}`);
    const data=await response.json();
    const quote=source.read(data);
    const price=Number(quote.price);
    if(!Number.isFinite(price))throw new Error(`${source.provider} returned an invalid ${source.symbol} price`);
    return {symbol:source.symbol,status:'ok',price,currency:'USD',updatedAt:quote.updatedAt||null};
  }catch(error){
    console.error(`Unable to load ${source.symbol} market quote from ${source.provider}`,error);
    return {symbol:source.symbol,status:'unavailable',price:null,currency:'USD',updatedAt:null};
  }
}

export async function getMarketQuotes(){
  if(cachedQuotes&&Date.now()-cachedAt<cacheDurationMs)return cachedQuotes;
  if(pendingRequest)return pendingRequest;
  pendingRequest=Promise.all(quoteSources.map(fetchQuote)).then(quotes=>{
    cachedQuotes={quotes,retrievedAt:new Date().toISOString()};
    cachedAt=Date.now();
    return cachedQuotes;
  }).finally(()=>{pendingRequest=null});
  return pendingRequest;
}
