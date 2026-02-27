'use strict';
const https = require('https');
const http = require('http');
const { db } = require('./database');

const BUSINESS = 'forgeborn';

function httpGet(url, opts) {
  opts = opts || {};
  return new Promise(function(resolve, reject) {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
      },
      timeout: opts.timeout || 15000
    };
    const req = mod.request(options, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          httpGet(res.headers.location, opts).then(resolve).catch(reject);
        } else {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function stripTags(html) {
  let result = '';
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<') { inTag = true; continue; }
    if (html[i] === '>') { inTag = false; continue; }
    if (!inTag) result += html[i];
  }
  return result.trim();
}

function unesc(str) {
  return str.split('&amp;').join('&').split('&lt;').join('<').split('&gt;').join('>').split('&quot;').join('"').split('&#39;').join("'");
}

function insertLead(lead) {
  try {
    const stmt = db.prepare('INSERT OR IGNORE INTO leads (source, title, url, snippet, business, score) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(lead.source, lead.title, lead.url, lead.snippet, lead.business, lead.score || 0);
  } catch(e) {
    console.error('DB insert error:', e.message);
  }
}

async function scrapeReddit() {
  const subs = ['Charlotte','jewelry','jewelrymaking','DIY','metalworking','raleigh','weddingplanning','Watchmaking','3Dprinting','Triangle'];
  const kws = ['casting','silver','gold','ring','jewelry','jewellery','custom','mold','lost wax','pendant'];
  let count = 0;
  for (const sub of subs) {
    try {
      const url = 'https://www.reddit.com/r/' + sub + '/new.json?limit=50&t=month';
      const res = await httpGet(url, { timeout: 15000 });
      if (res.status !== 200) { await sleep(2000); continue; }
      const data = JSON.parse(res.body);
      const posts = (data.data && data.data.children) ? data.data.children : [];
      for (const p of posts) {
        const d = p.data;
        const text = ((d.title||'') + ' ' + (d.selftext||'')).toLowerCase();
        const match = kws.some(function(k) { return text.indexOf(k) >= 0; });
        if (match) {
          insertLead({ source: 'reddit_r_' + sub.toLowerCase(), title: d.title||'', url: 'https://reddit.com' + d.permalink, snippet: (d.selftext||'').substring(0,300), business: BUSINESS, score: 30 });
          count++;
        }
      }
      await sleep(1500);
    } catch(e) { console.error('Reddit ' + sub + ' error:', e.message); }
  }
  return count;
}

async function scrapeCraigslist() {
  const cities = ['charlotte','raleigh','greensboro'];
  const queries = ['jewelry casting','silver casting','custom jewelry'];
  let count = 0;
  for (const city of cities) {
    for (const q of queries) {
      try {
        const encoded = q.split(' ').join('+');
        const url = 'https://' + city + '.craigslist.org/search/jss?query=' + encoded + '&sort=date';
        const res = await httpGet(url, { timeout: 15000 });
        if (res.status !== 200) { await sleep(3000); continue; }
        const html = res.body;
        let pos = 0;
        let found = 0;
        while (found < 20) {
          const linkClass = 'cl-app-anchor';
          const idx = html.indexOf(linkClass, pos);
          if (idx < 0) break;
          const hrefIdx = html.lastIndexOf('href="', idx);
          if (hrefIdx < 0) { pos = idx + 1; continue; }
          const hrefEnd = html.indexOf('"', hrefIdx + 6);
          if (hrefEnd < 0) { pos = idx + 1; continue; }
          const href = html.substring(hrefIdx + 6, hrefEnd);
          pos = hrefEnd + 1;
          if (href.indexOf('http') !== 0) continue;
          const tStart = html.indexOf('>', idx + linkClass.length) + 1;
          const tEnd = html.indexOf('</a>', tStart);
          if (tStart < 1 || tEnd < 0) continue;
          const title = stripTags(html.substring(tStart, tEnd));
          if (!title || title.length < 5) continue;
          insertLead({ source: 'craigslist_' + city, title: unesc(title), url: href, snippet: q, business: BUSINESS, score: 40 });
          count++;
          found++;
        }
        await sleep(3000);
      } catch(e) { console.error('Craigslist error:', e.message); }
    }
  }
  return count;
}

async function scrapeSearch() {
  const queries = ['jewelry casting service Charlotte NC','custom silver casting Charlotte','lost wax casting jewelry NC','gold casting service near Charlotte'];
  let count = 0;
  for (const q of queries) {
    try {
      const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
      const res = await httpGet(url, { timeout: 15000 });
      if (res.status !== 200) { await sleep(4000); continue; }
      const html = res.body;
      const marker = 'result__a';
      let pos = 0;
      let found = 0;
      while (found < 10) {
        const idx = html.indexOf(marker, pos);
        if (idx < 0) break;
        const hrefIdx = html.lastIndexOf('href="', idx);
        if (hrefIdx < 0) { pos = idx + 1; continue; }
        const hrefEnd = html.indexOf('"', hrefIdx + 6);
        if (hrefEnd < 0) { pos = idx + 1; continue; }
        let href = html.substring(hrefIdx + 6, hrefEnd);
        const udIdx = href.indexOf('uddg=');
        if (udIdx >= 0) href = decodeURIComponent(href.substring(udIdx + 5));
        const tStart = html.indexOf('>', idx + marker.length) + 1;
        const tEnd = html.indexOf('</a>', tStart);
        if (tStart < 1 || tEnd < 0) { pos = idx + 1; continue; }
        const title = stripTags(html.substring(tStart, tEnd));
        pos = tEnd;
        found++;
        if (!href || href.indexOf('http') !== 0) continue;
        if (href.indexOf('reddit.com') >= 0) continue;
        insertLead({ source: 'search_ddg', title: unesc(title), url: href, snippet: q, business: BUSINESS, score: 35 });
        count++;
      }
      await sleep(4000);
    } catch(e) { console.error('DDG error:', e.message); }
  }
  return count;
}

async function scrapeAll() {
  console.log('Starting full scrape for ' + BUSINESS + '...');
  try { const r = await scrapeReddit(); console.log('Reddit: ' + r + ' leads'); } catch(e) { console.error('Reddit failed:', e.message); }
  try { const c = await scrapeCraigslist(); console.log('Craigslist: ' + c + ' leads'); } catch(e) { console.error('Craigslist failed:', e.message); }
  try { const s = await scrapeSearch(); console.log('Search/DDG: ' + s + ' leads'); } catch(e) { console.error('Search failed:', e.message); }
  console.log('Scrape complete.');
}

module.exports = { scrapeAll };
