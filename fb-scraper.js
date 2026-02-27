// fb-scraper.js - Facebook Groups Lead Scraper
// Requires: npm install puppeteer
// Scrapes public Facebook groups for HVAC/furnace/duct cleaning leads in Charlotte area

// ================================================================
// SETUP INSTRUCTIONS:
// 1. Run: npm install puppeteer
// 2. Join your target Facebook groups (list below)
// 3. Add group URLs to FB_GROUPS array
// 4. Trigger via: POST /api/facebook-scrape with {fb_email, fb_password}
// ================================================================

// TARGET GROUPS — Add URLs after joining them
// Search Facebook for these and join, then paste the URL here:
// - "Charlotte Homeowners" 
// - "Charlotte NC Buy Sell Trade"
// - "Charlotte Home Improvement"
// - "Charlotte Recommends" (local recommendations group)
// - "Huntersville NC Community"
// - "Lake Norman NC Community"
// - "Matthews NC Neighbors"
// - "Fort Mill SC Community"
// - "Rock Hill SC Homeowners"
// - "NoDa / Plaza Midwood / Dilworth / Southpark neighborhood groups"
const FB_GROUPS = [
  // PASTE YOUR JOINED GROUP URLS HERE - example format:
  // 'https://www.facebook.com/groups/123456789',
  // 'https://www.facebook.com/groups/charlottehomeowners',
];

// Keywords that trigger lead capture
const FB_KEYWORDS = [
  // Direct HVAC intent
  'furnace','air duct','duct clean','dryer vent','hvac','vent clean',
  'air quality','dusty','musty','dirty ducts','heat pump','heating',
  // New homeowner signals  
  'just moved','new home','just bought','first home','moving in','new house','just closed',
  // Health/air quality signals
  'allergies','asthma','sneezing','breathing','mold','mildew','odor','smell',
  // Service request signals
  'renovation','remodel','contractor','recommend','who do you use',
  'good company','local company','reliable','need someone'
];

async function scrapeFacebookGroups(db, credentials) {
  let puppeteer;
  try { 
    puppeteer = require('puppeteer'); 
  } catch(e) { 
    console.error('ERROR: Puppeteer not installed. Run: npm install puppeteer');
    return 0; 
  }
  
  if (!FB_GROUPS || FB_GROUPS.length === 0) {
    console.log('INFO: No Facebook groups configured in FB_GROUPS. Add group URLs to fb-scraper.js');
    return 0;
  }
  
  if (!credentials || !credentials.fb_email || !credentials.fb_password) {
    console.error('ERROR: Facebook credentials required');
    return 0;
  }
  
  console.log('=== Facebook Group Scraper Starting (' + FB_GROUPS.length + ' groups) ===');
  let totalNew = 0;
  
  const browser = await puppeteer.launch({
    headless: false, // Keep visible so you can handle any 2FA prompts
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 }
  });
  
  const page = await browser.newPage();
  
  // Set realistic user agent
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  
  try {
    // === STEP 1: Login to Facebook ===
    console.log('Navigating to Facebook login...');
    await page.goto('https://www.facebook.com/login', { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    await page.waitForSelector('#email', { timeout: 10000 });
    await page.type('#email', credentials.fb_email, { delay: 80 });
    await page.type('#pass', credentials.fb_password, { delay: 80 });
    await new Promise(r => setTimeout(r, 500));
    await page.click('[name=login]');
    
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
    
    const currentUrl = page.url();
    if (currentUrl.includes('checkpoint') || currentUrl.includes('login')) {
      console.error('Facebook login requires verification (2FA or security check).');
      console.error('Please check the browser window and complete verification manually.');
      // Wait up to 60 seconds for manual completion
      await new Promise(r => setTimeout(r, 60000));
    }
    
    console.log('Facebook login complete. URL:', page.url().substring(0, 60));
    await new Promise(r => setTimeout(r, 3000));
    
    // === STEP 2: Scrape each group ===
    for (const groupUrl of FB_GROUPS) {
      try {
        console.log('\nScraping group:', groupUrl);
        
        await page.goto(groupUrl, { 
          waitUntil: 'networkidle2', 
          timeout: 30000 
        });
        await new Promise(r => setTimeout(r, 3000));
        
        // Scroll to load more posts
        for (let scroll = 0; scroll < 5; scroll++) {
          await page.evaluate(() => window.scrollBy(0, 2500));
          await new Promise(r => setTimeout(r, 2000));
        }
        
        // Extract matching posts
        const posts = await page.evaluate((keywords) => {
          const results = [];
          
          // Try multiple selectors for post articles
          const selectors = [
            '[role="article"]',
            '[data-pagelet*="FeedUnit"]',
            '[class*="userContentWrapper"]'
          ];
          
          let articles = [];
          for (const sel of selectors) {
            const found = document.querySelectorAll(sel);
            if (found.length > 0) { articles = found; break; }
          }
          
          articles.forEach(el => {
            try {
              const fullText = (el.innerText || '').substring(0, 1500);
              const textLower = fullText.toLowerCase();
              
              // Check if post matches any keyword
              const matched = keywords.some(kw => textLower.includes(kw));
              if (!matched) return;
              
              // Skip very short posts (likely just reactions/comments)
              if (fullText.length < 30) return;
              
              // Get author name
              const authorEls = el.querySelectorAll(
                'a[href*="/user/"] strong, h2 a, h3 a, [class*="actor"] a'
              );
              const author = authorEls[0] ? authorEls[0].innerText.trim() : '';
              if (!author) return;
              
              // Get post permalink
              const timeLinks = el.querySelectorAll(
                'a[href*="/groups/"][href*="/posts/"], a[href*="permalink"], abbr[data-utime]'
              );
              const postLink = timeLinks[0] ? (timeLinks[0].href || '') : '';
              
              // Get best message text
              const textDivs = el.querySelectorAll('[dir="auto"], [data-ad-preview]');
              let message = '';
              textDivs.forEach(div => {
                if (div.innerText && div.innerText.length > message.length) {
                  message = div.innerText;
                }
              });
              if (!message) message = fullText;
              
              results.push({
                author: author.trim(),
                message: message.substring(0, 600).trim(),
                link: postLink
              });
              
            } catch(e) {}
          });
          
          // Deduplicate by author+message snippet
          const seen = new Set();
          return results.filter(p => {
            const key = p.author + p.message.substring(0, 50);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
        }, FB_KEYWORDS);
        
        const groupName = 'Facebook: ' + (groupUrl.split('/groups/')[1] || 'group').split('/')[0];
        console.log('Found ' + posts.length + ' matching posts in ' + groupName);
        
        // Insert into database
        for (const post of posts) {
          try {
            const contactKey = post.link || (groupUrl + '_' + post.author);
            
            // Skip if already in DB
            const existing = db.prepare('SELECT id FROM leads WHERE contact = ?').get(contactKey);
            if (existing) continue;
            
            db.prepare(
              `INSERT OR IGNORE INTO leads 
               (name, contact, source, message, score, status, business, location, created_at, url)
               VALUES (?, ?, ?, ?, 0, 'new', 'american_air_experts', 'Charlotte, NC', datetime('now'), ?)`
            ).run(post.author, contactKey, groupName, post.message.substring(0, 500), post.link || '');
            
            totalNew++;
          } catch(e) { 
            console.error('DB insert error:', e.message); 
          }
        }
        
        // Polite delay between groups (3-6 seconds random)
        const delay = 3000 + Math.floor(Math.random() * 3000);
        console.log('Waiting ' + delay + 'ms before next group...');
        await new Promise(r => setTimeout(r, delay));
        
      } catch(e) {
        console.error('Error scraping ' + groupUrl + ':', e.message);
      }
    }
    
  } catch(e) {
    console.error('Fatal Facebook scraper error:', e.message);
  } finally {
    await browser.close();
  }
  
  console.log('\n=== Facebook Scraper Done. Total new leads: ' + totalNew + ' ===');
  return totalNew;
}

module.exports = { scrapeFacebookGroups, FB_GROUPS, FB_KEYWORDS };
