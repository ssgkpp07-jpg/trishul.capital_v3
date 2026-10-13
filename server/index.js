import express from 'express';import cors from 'cors';import dotenv from 'dotenv';import jwt from 'jsonwebtoken';import Database from 'better-sqlite3';import path from 'node:path';import fs from 'node:fs';import crypto from 'node:crypto';import {summarizePortfolio,summarizePortfolioMonths,buildPortfolioWorkbook,filterPortfolioEventsByDate} from '../portfolio.js';dotenv.config();
const databasePath=process.env.DATABASE_PATH||'trishul.db',databaseDirectory=path.dirname(databasePath);if(databaseDirectory!=='.')fs.mkdirSync(databaseDirectory,{recursive:true});
const app=express(),db=new Database(databasePath),allowedOrigins=(process.env.FRONTEND_URL||'').split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean);app.use(cors({origin:(origin,cb)=>{if(!origin||!allowedOrigins.length||allowedOrigins.includes(origin))return cb(null,true);cb(new Error('Origin not allowed by CORS'))}}));app.use(express.json({limit:'8mb'}));app.use(express.static('dist'));app.use('/assets',express.static('public'));fs.mkdirSync('public/uploads',{recursive:true});
db.exec(`CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,name TEXT NOT NULL,package_name TEXT,myfxbook_url TEXT NOT NULL,active INTEGER DEFAULT 1,created_at TEXT DEFAULT CURRENT_TIMESTAMP,last_sync TEXT);CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,account_id INTEGER,captured_at TEXT DEFAULT CURRENT_TIMESTAMP,gain REAL,daily REAL,monthly REAL,yearly REAL,drawdown REAL,balance REAL,equity REAL,profit REAL,pips REAL,trades INTEGER,win_rate REAL,profit_factor REAL,FOREIGN KEY(account_id) REFERENCES accounts(id));CREATE TABLE IF NOT EXISTS socials(id INTEGER PRIMARY KEY AUTOINCREMENT,platform TEXT,url TEXT,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS pages(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT UNIQUE,title TEXT,body TEXT,active INTEGER DEFAULT 1);CREATE TABLE IF NOT EXISTS portfolio_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL CHECK(event_type IN ('onboarded','offboarded','profit_withdrawn')),client_name TEXT NOT NULL,account_number TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
db.exec(`CREATE TABLE IF NOT EXISTS portfolio_clients(client_id TEXT PRIMARY KEY,first_name TEXT NOT NULL,second_name TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',whatsapp_number TEXT NOT NULL DEFAULT '',national_id TEXT NOT NULL,address_line1 TEXT NOT NULL,address_line2 TEXT NOT NULL DEFAULT '',city TEXT NOT NULL,state TEXT NOT NULL,country TEXT NOT NULL,pincode TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT);`);
if(!db.prepare('PRAGMA table_info(portfolio_clients)').all().some(column=>column.name==='email'))db.exec("ALTER TABLE portfolio_clients ADD COLUMN email TEXT NOT NULL DEFAULT ''");
if(!db.prepare('PRAGMA table_info(portfolio_clients)').all().some(column=>column.name==='whatsapp_number'))db.exec("ALTER TABLE portfolio_clients ADD COLUMN whatsapp_number TEXT NOT NULL DEFAULT ''");
const portfolioSchema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='portfolio_events'").get()?.sql||'';
if(!portfolioSchema.includes("'funds_added'")){
 const migratePortfolio=db.transaction(()=>{
  db.exec('DROP INDEX IF EXISTS portfolio_events_account_created_idx');
  db.exec('ALTER TABLE portfolio_events RENAME TO portfolio_events_legacy');
  db.exec(`CREATE TABLE portfolio_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_type TEXT NOT NULL CHECK(event_type IN ('onboarded','funds_added','offboarded','profit_withdrawn')),client_name TEXT NOT NULL,account_number TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>0),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT)`);
  db.exec('INSERT INTO portfolio_events(id,event_type,client_name,account_number,amount,created_at) SELECT id,event_type,client_name,account_number,amount,created_at FROM portfolio_events_legacy');
  db.exec('DROP TABLE portfolio_events_legacy');
 });
 migratePortfolio();
}
if(!db.prepare('PRAGMA table_info(portfolio_events)').all().some(column=>column.name==='deleted_at'))db.exec('ALTER TABLE portfolio_events ADD COLUMN deleted_at TEXT');
if(!db.prepare('PRAGMA table_info(portfolio_events)').all().some(column=>column.name==='client_id'))db.exec('ALTER TABLE portfolio_events ADD COLUMN client_id TEXT');
db.exec('CREATE INDEX IF NOT EXISTS portfolio_events_account_created_idx ON portfolio_events(account_number,created_at DESC)');
try{db.exec('ALTER TABLE accounts ADD COLUMN portfolio_image TEXT')}catch{}
for(const [k,v] of [['contact_email','contact@trishulcapital.com'],['contact_whatsapp',''],['contact_telegram','https://t.me/Trishul_Capital_Bot']])db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k,v);if(!db.prepare('SELECT COUNT(*) c FROM socials').get().c)for(const x of [['Instagram',''],['WhatsApp',''],['Telegram','https://t.me/Trishul_Capital_Bot']])db.prepare('INSERT INTO socials(platform,url) VALUES(?,?)').run(...x);
const contactCardProfileDefaults={title:'Trishul Capital',subtitle:'Account Management & Expert Advisor Services',tagline:'AUTOMATED · SYSTEMATIC · TRANSPARENT',logo:'/images/trident.png'};
for(const [field,value] of Object.entries(contactCardProfileDefaults))db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(`contact_card_${field}`,value);
db.exec('CREATE TABLE IF NOT EXISTS contact_buttons(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,url TEXT NOT NULL,icon TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0)');
if(!db.prepare("SELECT value FROM settings WHERE key='contact_buttons_seeded'").get()){
 const seedContactButtons=db.transaction(()=>{
  if(!db.prepare('SELECT COUNT(*) c FROM contact_buttons').get().c){
   const insert=db.prepare('INSERT INTO contact_buttons(name,url,icon,position) VALUES(?,?,?,?)');
   for(const [position,button] of [
    ['Visit Trishul Capital','/','🌐'],
    ['Instagram','https://www.instagram.com/trishulcapital','◎'],
    ['Trishul Capital on Telegram','https://t.me/Trishul_Capital','➤'],
    ['Email Trishul Capital','mailto:mailtotrishulcapital@gmail.com','✉']
   ].entries())insert.run(button[0],button[1],button[2],position);
  }
  db.prepare("INSERT INTO settings(key,value) VALUES('contact_buttons_seeded','1')").run();
 });
 seedContactButtons();
}
const defaultPerformanceAccounts=[
 {id:'gold',name:'Gold EA',status:'Online',broker:'GlobalPrime or FMGP Trading Group Pty Ltd',account_number:'5013649',investor_password:'*wgR7D21K6',server:'GlobalPrime-Trade',myfxbook_url:'https://www.myfxbook.com/portfolio/moon-ea/12175434'},
 {id:'combo',name:'Combo EA',status:'Online',broker:'TickMill Ltd',account_number:'55924704',investor_password:'2+fH>0nD&mQ4',server:'TickMill - Live',myfxbook_url:'https://www.myfxbook.com/portfolio/tirplet-combo/12171732'}
];
db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run('performance_accounts',JSON.stringify(defaultPerformanceAccounts));
const getPerformanceAccounts=()=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('performance_accounts').value);
const setPerformanceAccounts=accounts=>db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('performance_accounts',JSON.stringify(accounts));
const comboAccountUrl='https://www.myfxbook.com/members/JFT1177/tirplet-combo/12171732';if(!db.prepare("SELECT COUNT(*) c FROM accounts WHERE kind='performance'").get().c)db.prepare("INSERT INTO accounts(kind,name,package_name,myfxbook_url) VALUES(?,?,?,?)").run('performance','Combo EA','Combo EA',comboAccountUrl);db.prepare("UPDATE accounts SET name='Combo EA',package_name='Combo EA' WHERE kind='performance' AND name='Triplet Combo EA'").run();
const ADMIN_USER=(process.env.ADMIN_USERNAME||'admin@trishulcapital.com').trim().toLowerCase(),ADMIN_PASS=process.env.ADMIN_PASSWORD||'TC-ChangeThisPassword',SECRET=process.env.JWT_SECRET||'change-this-secret';
if(process.env.NODE_ENV==='production'&&SECRET==='change-this-secret')throw new Error('JWT_SECRET must be set in production');
if(process.env.NODE_ENV==='production'&&ADMIN_PASS==='TC-ChangeThisPassword')console.warn('WARNING: Replace the temporary ADMIN_PASSWORD before production use.');
const auth=(req,res,next)=>{try{req.user=jwt.verify((req.headers.authorization||'').replace('Bearer ',''),SECRET);next()}catch{res.status(401).json({message:'Unauthorized'})}};
const getPortfolio=()=>summarizePortfolio(db.prepare('SELECT * FROM portfolio_events ORDER BY created_at DESC,id DESC').all());
const getPortfolioClients=()=>db.prepare('SELECT * FROM portfolio_clients ORDER BY created_at DESC,client_id').all();
const portfolioClientName=client=>`${client.first_name} ${client.second_name}`.trim();
const defaultPortfolioMessageTemplates={
 onboarded:'Hello {{client_name}},\n\nWelcome to Trishul Capital. Your account has been onboarded successfully.\n\nClient ID: {{client_id}}\nAccount number: {{account_number}}\nFunds recorded: {{amount}}\nDate: {{date}}\n\nPlease contact us if you have any questions.\n\n— Trishul Capital',
 offboarded:'Hello {{client_name}},\n\nYour account has been offboarded from our active portfolio records.\n\nClient ID: {{client_id}}\nAccount number: {{account_number}}\nFunds withdrawn: {{amount}}\nDate: {{date}}\n\nThank you for being with Trishul Capital.\n\n— Trishul Capital',
 profit_withdrawn:'Hello {{client_name}},\n\nYour profit withdrawal has been recorded successfully.\n\nClient ID: {{client_id}}\nAccount number: {{account_number}}\nProfit withdrawn: {{amount}}\nDate: {{date}}\n\nPlease contact us if you have any questions.\n\n— Trishul Capital'
};
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store, max-age=0');next()});app.get('/api/health',(req,res)=>res.json({ok:true,service:'trishul-capital-api'}));
const founderImageKey='about_founder_image',maxFounderImageBytes=5*1024*1024;
const founderImageTypes={
 'image/jpeg':buffer=>buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff,
 'image/png':buffer=>buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
 'image/webp':buffer=>buffer.length>=12&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'
};
const contactButtonIcons=new Set(['🌐','◎','➤','✉','☎','f','▶','in','✦']);
const maxContactButtonIconBytes=512*1024;
function isValidContactButtonIcon(icon){
 if(typeof icon!=='string')return false;
 if(contactButtonIcons.has(icon))return true;
 const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(icon);
 if(!match)return false;
 const buffer=Buffer.from(match[2],'base64');
 return buffer.length>0&&buffer.length<=maxContactButtonIconBytes&&buffer.toString('base64')===match[2]&&founderImageTypes[match[1]](buffer);
}
function validateContactButton({name,url,icon}){
 const cleanName=typeof name==='string'?name.trim():'';
 const cleanUrl=typeof url==='string'?url.trim():'';
 if(!cleanName||cleanName.length>48)return {error:'Button name must be between 1 and 48 characters'};
 if(!cleanUrl||cleanUrl.length>2048||/[\u0000-\u001f]/.test(cleanUrl))return {error:'Enter a valid hyperlink'};
 const relativeUrl=cleanUrl.startsWith('/')&&!cleanUrl.startsWith('//')&&!cleanUrl.includes('\\');
 const absoluteUrl=/^(https?:\/\/|mailto:|tel:)/i.test(cleanUrl);
 if(!relativeUrl&&!absoluteUrl)return {error:'Use an https, http, mailto, tel, or same-site path URL'};
 if(absoluteUrl&&/^(https?:\/\/)/i.test(cleanUrl)){
  try{new URL(cleanUrl)}catch{return {error:'Enter a valid hyperlink'}}
 }
 if(!isValidContactButtonIcon(icon))return {error:'Choose a listed icon or upload a valid PNG, JPEG, or WebP icon (512 KB maximum)'};
 return {value:{name:cleanName,url:cleanUrl,icon}};
}
app.get('/api/about/founder-image',(req,res)=>{
 const image=db.prepare('SELECT value FROM settings WHERE key=?').get(founderImageKey)?.value;
 if(!image)return res.status(404).json({message:'No founder image has been uploaded'});
 const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
 if(!match)return res.status(500).json({message:'The saved founder image is invalid'});
 const buffer=Buffer.from(match[2],'base64');
 if(!founderImageTypes[match[1]](buffer))return res.status(500).json({message:'The saved founder image is invalid'});
 res.set('Content-Type',match[1]).set('X-Content-Type-Options','nosniff').send(buffer);
});
app.put('/api/admin/about/founder-image',auth,(req,res)=>{
 const image=req.body?.image;
 const match=typeof image==='string'&&/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
 if(!match)return res.status(400).json({message:'Upload a valid JPEG, PNG, or WebP image'});
 const buffer=Buffer.from(match[2],'base64');
 if(!buffer.length||buffer.length>maxFounderImageBytes)return res.status(400).json({message:'Founder images must be 5 MB or smaller'});
 if(buffer.toString('base64')!==match[2]||!founderImageTypes[match[1]](buffer))return res.status(400).json({message:'The uploaded file is not a valid JPEG, PNG, or WebP image'});
 db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(founderImageKey,image);
 res.json({ok:true});
});
app.delete('/api/admin/about/founder-image',auth,(req,res)=>{
 db.prepare('DELETE FROM settings WHERE key=?').run(founderImageKey);
 res.json({ok:true});
});
app.post('/api/admin/login',(req,res)=>{const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');if(username!==ADMIN_USER||password!==ADMIN_PASS)return res.status(401).json({message:'Invalid credentials'});res.json({token:jwt.sign({sub:ADMIN_USER},SECRET,{expiresIn:'12h'})})});

app.get('/api/portfolio',(req,res)=>{const portfolio=getPortfolio();res.json({summary:portfolio.summary,monthly:summarizePortfolioMonths(portfolio.events)})});
app.get('/api/performance-details',(req,res)=>res.json({accounts:getPerformanceAccounts()}));
app.get('/api/settings/contact',(req,res)=>res.json({email:db.prepare('SELECT value FROM settings WHERE key=?').get('contact_email')?.value,whatsapp:db.prepare('SELECT value FROM settings WHERE key=?').get('contact_whatsapp')?.value,telegram:db.prepare('SELECT value FROM settings WHERE key=?').get('contact_telegram')?.value}));app.get('/api/settings/socials',(req,res)=>res.json({items:db.prepare('SELECT * FROM socials WHERE active=1 ORDER BY id').all()}));
function getContactCardProfile(){return Object.fromEntries(Object.keys(contactCardProfileDefaults).map(field=>[field,db.prepare('SELECT value FROM settings WHERE key=?').get(`contact_card_${field}`)?.value??contactCardProfileDefaults[field]]))}
app.get('/api/contact-card/profile',(req,res)=>res.json(getContactCardProfile()));
app.get('/api/admin/contact-card/profile',auth,(req,res)=>res.json(getContactCardProfile()));
app.put('/api/admin/contact-card/profile',auth,(req,res)=>{
 const body=req.body||{},title=typeof body.title==='string'?body.title.trim():'',subtitle=typeof body.subtitle==='string'?body.subtitle.trim():'',tagline=typeof body.tagline==='string'?body.tagline.trim():'',logo=body.logo;
 if(!title||title.length>80)return res.status(400).json({message:'Title must be between 1 and 80 characters'});
 if(subtitle.length>160)return res.status(400).json({message:'Subtitle must be 160 characters or fewer'});
 if(tagline.length>100)return res.status(400).json({message:'Tagline must be 100 characters or fewer'});
 let validLogo=logo==='/images/trident.png';
 if(typeof logo==='string'){
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(logo);
  if(match){
   const buffer=Buffer.from(match[2],'base64');
   validLogo=buffer.length>0&&buffer.length<=3*1024*1024&&buffer.toString('base64')===match[2]&&founderImageTypes[match[1]](buffer);
  }
 }
 if(!validLogo)return res.status(400).json({message:'Upload a valid JPEG, PNG, or WebP logo (3 MB maximum)'});
 const update=db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
 const save=db.transaction(()=>{for(const [field,value] of Object.entries({title,subtitle,tagline,logo}))update.run(`contact_card_${field}`,value)});
 save();
 res.json({ok:true});
});
app.get('/api/contact-buttons',(req,res)=>res.json({items:db.prepare('SELECT id,name,url,icon FROM contact_buttons ORDER BY position,id').all()}));
app.get('/api/admin/contact-buttons',auth,(req,res)=>res.json({items:db.prepare('SELECT id,name,url,icon,position FROM contact_buttons ORDER BY position,id').all()}));
app.post('/api/admin/contact-buttons',auth,(req,res)=>{
 const checked=validateContactButton(req.body||{});
 if(checked.error)return res.status(400).json({message:checked.error});
 const position=db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS next FROM contact_buttons').get().next;
 const result=db.prepare('INSERT INTO contact_buttons(name,url,icon,position) VALUES(?,?,?,?)').run(checked.value.name,checked.value.url,checked.value.icon,position);
 res.status(201).json({ok:true,id:result.lastInsertRowid});
});
app.put('/api/admin/contact-buttons/:id',auth,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'Invalid contact button id'});
 const checked=validateContactButton(req.body||{});
 if(checked.error)return res.status(400).json({message:checked.error});
 const result=db.prepare('UPDATE contact_buttons SET name=?,url=?,icon=? WHERE id=?').run(checked.value.name,checked.value.url,checked.value.icon,id);
 if(!result.changes)return res.status(404).json({message:'Contact button not found'});
 res.json({ok:true});
});
app.delete('/api/admin/contact-buttons/:id',auth,(req,res)=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({message:'Invalid contact button id'});
 const result=db.prepare('DELETE FROM contact_buttons WHERE id=?').run(id);
 if(!result.changes)return res.status(404).json({message:'Contact button not found'});
 res.json({ok:true});
});
app.get('/api/admin/performance-details',auth,(req,res)=>res.json({accounts:getPerformanceAccounts()}));
app.put('/api/admin/performance-details',auth,(req,res)=>{
 const {accounts}=req.body||{};
 const current=getPerformanceAccounts();
 if(!Array.isArray(accounts))return res.status(400).json({message:'Performance accounts must be a list'});
 const updated=[];
 const ids=new Set();
 for(const account of accounts){
    const existing=current.find(item=>item.id===account?.id);
    if(typeof account?.id!=='string'||!account.id.trim()||ids.has(account.id))return res.status(400).json({message:'Each performance account must have a unique ID'});
    ids.add(account.id);
    const next={...(existing||{}),id:account.id};
    if(typeof account.name!=='string'||!account.name.trim())return res.status(400).json({message:'EA display name is required'});
    next.name=account.name.trim();
  for(const field of ['broker','account_number','investor_password','server','myfxbook_url']){
   if(typeof account[field]!=='string'||!account[field].trim())return res.status(400).json({message:`${existing.name}: ${field.replace(/_/g,' ')} is required`});
   next[field]=account[field].trim();
  }
  let url;
  try{url=new URL(next.myfxbook_url)}catch{return res.status(400).json({message:`${existing.name}: enter a valid Myfxbook URL`})}
  if(url.protocol!=='https:'||url.hostname!=='www.myfxbook.com')return res.status(400).json({message:`${existing.name}: Myfxbook URL must use https://www.myfxbook.com`});
  updated.push(next);
 }
 if(new Set(updated.map(account=>account.name.toLowerCase())).size!==updated.length)return res.status(400).json({message:'EA display names must be unique'});
 const saveDetails=db.transaction(()=>{
  setPerformanceAccounts(updated);
    const updatedIds=new Set(updated.map(account=>account.id));
    for(const previous of current){
     if(!updatedIds.has(previous.id))db.prepare('UPDATE accounts SET active=0 WHERE kind=? AND (name=? OR myfxbook_url=?)').run('performance',previous.name,previous.myfxbook_url);
    }
    for(const account of updated){
     const previous=current.find(item=>item.id===account.id);
     const result=previous&&db.prepare('UPDATE accounts SET name=?,package_name=?,myfxbook_url=?,active=1 WHERE kind=? AND (name=? OR myfxbook_url=?)').run(account.name,account.name,account.myfxbook_url,'performance',previous.name,previous.myfxbook_url);
     if(!result?.changes)db.prepare('INSERT INTO accounts(kind,name,package_name,myfxbook_url) VALUES(?,?,?,?)').run('performance',account.name,account.name,account.myfxbook_url);
  }
 });
 saveDetails();
 res.json({ok:true,accounts:updated});
});
app.get('/api/admin/portfolio',auth,(req,res)=>res.json(getPortfolio()));
app.get('/api/admin/message-templates',auth,(req,res)=>{
 const row=db.prepare('SELECT value FROM settings WHERE key=?').get('portfolio_message_templates');
 if(!row?.value)return res.json({templates:defaultPortfolioMessageTemplates});
 try{
  const templates=JSON.parse(row.value);
  return res.json({templates:Object.fromEntries(Object.keys(defaultPortfolioMessageTemplates).map(key=>[key,typeof templates?.[key]==='string'?templates[key]:defaultPortfolioMessageTemplates[key]]))});
 }catch{
  return res.status(500).json({message:'Saved portfolio message templates are not valid JSON. Re-save them from the admin page.'});
 }
});
app.put('/api/admin/message-templates',auth,(req,res)=>{
 const templates=req.body?.templates;
 if(!templates||typeof templates!=='object'||Array.isArray(templates))return res.status(400).json({message:'Provide onboarded, offboarded, and profit_withdrawn message templates.'});
 for(const key of Object.keys(defaultPortfolioMessageTemplates)){
  if(typeof templates[key]!=='string'||!templates[key].trim())return res.status(400).json({message:`The ${key.replace(/_/g,' ')} message cannot be empty.`});
  if(templates[key].length>5000)return res.status(400).json({message:`The ${key.replace(/_/g,' ')} message must be 5,000 characters or fewer.`});
 }
 db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('portfolio_message_templates',JSON.stringify(templates));
 return res.json({ok:true});
});
app.get('/api/admin/portfolio/clients',auth,(req,res)=>res.json({clients:getPortfolioClients()}));
app.put('/api/admin/portfolio/clients/:clientId',auth,(req,res)=>{
 const clientId=String(req.params.clientId||'').trim().toUpperCase(),input=req.body||{},client={
  first_name:String(input.first_name||'').trim(),second_name:String(input.second_name||'').trim(),
  email:String(input.email||'').trim().toLowerCase(),whatsapp_number:String(input.whatsapp_number||'').trim(),
  national_id:String(input.national_id||'').trim(),address_line1:String(input.address_line1||'').trim(),
  address_line2:String(input.address_line2||'').trim(),city:String(input.city||'').trim(),
  state:String(input.state||'').trim(),country:String(input.country||'').trim(),pincode:String(input.pincode||'').trim()
 };
 if(!clientId)return res.status(400).json({message:'Client ID is required'});
 if(Object.entries(client).some(([field,value])=>!['address_line2','email','whatsapp_number'].includes(field)&&!value))return res.status(400).json({message:'Complete all required client information fields'});
 if(client.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email))return res.status(400).json({message:'Enter a valid client email address or leave it blank'});
 if(client.whatsapp_number&&!/^\+[1-9]\d{7,14}$/.test(client.whatsapp_number))return res.status(400).json({message:'Enter the WhatsApp number in international format, e.g. +14155552671, or leave it blank'});
 const result=db.prepare('UPDATE portfolio_clients SET first_name=?,second_name=?,email=?,whatsapp_number=?,national_id=?,address_line1=?,address_line2=?,city=?,state=?,country=?,pincode=? WHERE client_id=?').run(client.first_name,client.second_name,client.email,client.whatsapp_number,client.national_id,client.address_line1,client.address_line2,client.city,client.state,client.country,client.pincode,clientId);
 if(!result.changes)return res.status(404).json({message:'Registered client not found'});
 res.json({client:db.prepare('SELECT * FROM portfolio_clients WHERE client_id=?').get(clientId)});
});
app.post('/api/admin/portfolio/clients',auth,(req,res)=>{
 const input=req.body||{},client={
  client_id:String(input.client_id||'').trim().toUpperCase(),
  first_name:String(input.first_name||'').trim(),second_name:String(input.second_name||'').trim(),
  email:String(input.email||'').trim().toLowerCase(),whatsapp_number:String(input.whatsapp_number||'').trim(),
  national_id:String(input.national_id||'').trim(),address_line1:String(input.address_line1||'').trim(),address_line2:String(input.address_line2||'').trim(),
  city:String(input.city||'').trim(),state:String(input.state||'').trim(),country:String(input.country||'').trim(),pincode:String(input.pincode||'').trim()
 };
 if(Object.entries(client).some(([field,value])=>field!=='address_line2'&&!value))return res.status(400).json({message:'Complete all required client registration fields'});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client.email))return res.status(400).json({message:'Enter a valid client email address'});
 if(!/^\+[1-9]\d{7,14}$/.test(client.whatsapp_number))return res.status(400).json({message:'Enter the WhatsApp number in international format, e.g. +14155552671'});
 try{db.prepare('INSERT INTO portfolio_clients(client_id,first_name,second_name,email,whatsapp_number,national_id,address_line1,address_line2,city,state,country,pincode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(client.client_id,client.first_name,client.second_name,client.email,client.whatsapp_number,client.national_id,client.address_line1,client.address_line2,client.city,client.state,client.country,client.pincode)}catch(error){if(error.code==='SQLITE_CONSTRAINT_PRIMARYKEY'||error.code==='SQLITE_CONSTRAINT_UNIQUE')return res.status(409).json({message:'That Client ID is already registered'});throw error}
 res.status(201).json({clients:getPortfolioClients()});
});
app.delete('/api/admin/portfolio/clients/:clientId/permanent',auth,(req,res)=>{
 const clientId=String(req.params.clientId||'').trim().toUpperCase();
 const client=db.prepare('SELECT deleted_at FROM portfolio_clients WHERE client_id=?').get(clientId);
 if(!client)return res.status(404).json({message:'Registered client not found'});
 if(!client.deleted_at)return res.status(409).json({message:'Remove the client first before permanent deletion'});
 const removeClient=db.transaction(()=>{db.prepare('DELETE FROM portfolio_events WHERE client_id=?').run(clientId);return db.prepare('DELETE FROM portfolio_clients WHERE client_id=?').run(clientId).changes});
 if(!removeClient())return res.status(404).json({message:'Registered client not found'});
 res.json({clients:getPortfolioClients(),portfolio:getPortfolio()});
});
app.delete('/api/admin/portfolio/clients/:clientId',auth,(req,res)=>{
 const clientId=String(req.params.clientId||'').trim().toUpperCase(),result=db.prepare('UPDATE portfolio_clients SET deleted_at=? WHERE client_id=? AND deleted_at IS NULL').run(new Date().toISOString(),clientId);
 if(!result.changes)return res.status(404).json({message:'Active registered client not found'});
 res.json({clients:getPortfolioClients()});
});
app.get('/api/admin/portfolio/export',auth,async(req,res)=>{
 let events;
 try{events=filterPortfolioEventsByDate(db.prepare('SELECT * FROM portfolio_events ORDER BY created_at,id').all(),req.query.from||'',req.query.to||'')}catch(error){return res.status(400).json({message:error.message})}
 const workbook=await buildPortfolioWorkbook(events);
 res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
 res.set('Content-Disposition','attachment; filename="portfolio-ledger.xlsx"');
 res.send(Buffer.from(workbook));
});
app.delete('/api/admin/portfolio/event/:id/permanent',auth,(req,res)=>{
 const eventId=Number(req.params.id);
 if(!Number.isInteger(eventId)||eventId<=0)return res.status(400).json({message:'Invalid portfolio event ID'});
 const event=db.prepare('SELECT deleted_at FROM portfolio_events WHERE id=?').get(eventId);
 if(!event)return res.status(404).json({message:'Portfolio entry not found'});
 if(!event.deleted_at)return res.status(409).json({message:'Delete the entry first before permanent deletion'});
 const result=db.prepare('DELETE FROM portfolio_events WHERE id=?').run(eventId);
 if(!result.changes)return res.status(404).json({message:'Portfolio entry not found'});
 res.json(getPortfolio());
});
app.delete('/api/admin/portfolio/event/:id',auth,(req,res)=>{
 const eventId=Number(req.params.id);
 if(!Number.isInteger(eventId)||eventId<=0)return res.status(400).json({message:'Invalid portfolio event ID'});
 const result=db.prepare('UPDATE portfolio_events SET deleted_at=? WHERE id=? AND deleted_at IS NULL').run(new Date().toISOString(),eventId);
 if(!result.changes)return res.status(404).json({message:'Active portfolio entry not found'});
 res.json(getPortfolio());
});
app.post('/api/admin/portfolio',auth,(req,res)=>{
 const type=req.body?.type,clientId=String(req.body?.client_id||'').trim().toUpperCase(),accountNumber=String(req.body?.account_number||'').trim(),amount=Number(req.body?.amount);
 const createdAt=req.body?.created_at?new Date(req.body.created_at):new Date();
 if(!['onboarded','profit_withdrawn'].includes(type))return res.status(400).json({message:'Choose onboarding or profit withdrawal'});
 if(!clientId||!accountNumber)return res.status(400).json({message:'Client ID and account number are required'});
 if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:'Enter an amount greater than zero'});
 if(Number.isNaN(createdAt.getTime()))return res.status(400).json({message:'Enter a valid date and time'});
 const client=db.prepare('SELECT * FROM portfolio_clients WHERE client_id=? AND deleted_at IS NULL').get(clientId);
 if(!client)return res.status(404).json({message:'Register this client before adding a portfolio entry'});
 const portfolio=getPortfolio(),active=portfolio.active_accounts.find(account=>account.account_number===accountNumber);
 if(active&&active.client_id!==clientId)return res.status(409).json({message:'This account number belongs to a different Client ID'});
 if(type==='profit_withdrawn'&&(!active||active.client_id!==clientId))return res.status(400).json({message:'Profit withdrawals require an active account for this Client ID'});
 const eventType=type==='onboarded'&&active?'funds_added':type;
 db.prepare('INSERT INTO portfolio_events(event_type,client_id,client_name,account_number,amount,created_at) VALUES(?,?,?,?,?,?)').run(eventType,clientId,portfolioClientName(client),accountNumber,amount,createdAt.toISOString());
 res.status(201).json(getPortfolio());
});
app.delete('/api/admin/portfolio/:accountNumber',auth,(req,res)=>{
 const accountNumber=String(req.params.accountNumber||'').trim(),active=getPortfolio().active_accounts.find(account=>account.account_number===accountNumber);
 if(!active)return res.status(404).json({message:'Active portfolio account not found'});
 db.prepare("INSERT INTO portfolio_events(event_type,client_id,client_name,account_number,amount) VALUES('offboarded',?,?,?,?)").run(active.client_id,active.client_name,active.account_number,active.funds_managed);
 res.json(getPortfolio());
});
app.get('/api/admin/accounts',auth,(req,res)=>res.json({accounts:db.prepare('SELECT * FROM accounts ORDER BY id DESC').all()}));app.post('/api/admin/accounts',auth,(req,res)=>{let {kind='client',name,package_name='',myfxbook_url}=req.body;if(!name||!myfxbook_url)return res.status(400).json({message:'Name and Myfxbook URL are required'});let r=db.prepare('INSERT INTO accounts(kind,name,package_name,myfxbook_url) VALUES(?,?,?,?)').run(kind,name,package_name,myfxbook_url);res.json({ok:true,id:r.lastInsertRowid})});app.delete('/api/admin/accounts/:id',auth,(req,res)=>{db.prepare('UPDATE accounts SET active=0 WHERE id=?').run(req.params.id);res.json({ok:true})});app.get('/api/admin/socials',auth,(req,res)=>res.json({items:db.prepare('SELECT * FROM socials ORDER BY id').all()}));app.post('/api/admin/socials',auth,(req,res)=>{db.prepare('INSERT INTO socials(platform,url) VALUES(?,?)').run(req.body.platform,req.body.url);res.json({ok:true})});app.put('/api/admin/settings',auth,(req,res)=>{db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(req.body.key,req.body.value);res.json({ok:true})});app.get('/api/admin/pages',auth,(req,res)=>res.json({pages:db.prepare('SELECT * FROM pages ORDER BY id DESC').all()}));app.post('/api/admin/pages',auth,(req,res)=>{db.prepare('INSERT INTO pages(slug,title,body) VALUES(?,?,?)').run(req.body.slug,req.body.title,req.body.body);res.json({ok:true})});
app.get('/admin/login',(req,res)=>res.sendFile(path.join(process.cwd(),'public','admin','login','index.html')));app.get('/admin/message-templates.html',(req,res)=>res.sendFile(path.join(process.cwd(),'public','admin','message-templates.html')));app.get('*',(req,res)=>res.sendFile(process.cwd()+'/dist/index.html'));app.listen(process.env.PORT||8787,()=>console.log('Trishul Capital running'));
