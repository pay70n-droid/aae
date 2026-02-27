// new-routes.js - Lead Machine v2 Routes
// 
// HOW TO ADD TO server.js:
// Near the top of server.js, after 'const db = ...' line, add:
//   require('./new-routes')(app, db);
//
// NEW ENDPOINTS ADDED:
//   POST /api/score-rules        — Score all unscored leads with rule-based system
//   POST /api/fix-parse-errors   — Fix the 136 leads with "Could not parse score" 
//   GET  /api/dm-scripts         — Get DM scripts for hot leads (JSON)
//   GET  /dm-dashboard           — DM Scripts dashboard (HTML, open in browser)
//   POST /api/facebook-scrape    — Trigger Facebook group scraper
//   GET  /api/score-stats        — Get scoring statistics

const { scoreLeadByRules } = require('./rule-scorer');
const { generateOpeningDM, generateFollowupDM, detectLeadType, PRICING } = require('./dm-generator');

module.exports = function(app, db) {

  // ============================================================
  // ROUTE: Score all unscored leads (score=0) with rule-based system
  // Usage: POST /api/score-rules
  // ============================================================
  app.post('/api/score-rules', async (req, res) => {
    res.json({ message: 'Rule scoring started — check console for progress' });
    
    try {
      const leads = db.prepare('SELECT * FROM leads WHERE score = 0').all();
      console.log('\n🎯 Rule scorer: Processing ' + leads.length + ' unscored leads...');
      
      const upd = db.prepare('UPDATE leads SET score=?, score_reason=?, notes=? WHERE id=?');
      let scored = 0, hot = 0, warm = 0, cool = 0;
      
      for (const lead of leads) {
        const result = scoreLeadByRules(lead);
        if (result.score > 0) {
          upd.run(result.score, result.score_reason, result.notes, lead.id);
          scored++;
          if (result.score >= 70) hot++;
          else if (result.score >= 40) warm++;
          else cool++;
        }
      }
      
      console.log('✅ Rule scoring done: ' + scored + ' scored out of ' + leads.length);
      console.log('   🔥 HOT (70+): ' + hot);
      console.log('   🌡️ WARM (40-69): ' + warm);
      console.log('   ❄️ COOL (<40): ' + cool);
    } catch(e) {
      console.error('Rule scoring error:', e.message);
    }
  });

  // ============================================================
  // ROUTE: Fix leads with "Could not parse score" error
  // Usage: POST /api/fix-parse-errors
  // ============================================================
  app.post('/api/fix-parse-errors', async (req, res) => {
    res.json({ message: 'Fixing parse error leads — check console' });
    
    try {
      const leads = db.prepare("SELECT * FROM leads WHERE notes = 'Could not parse score'").all();
      console.log('\n🔧 Fixing ' + leads.length + ' parse-error leads...');
      
      const upd = db.prepare('UPDATE leads SET score=?, score_reason=?, notes=? WHERE id=?');
      let fixed = 0, rescored = 0;
      
      for (const lead of leads) {
        const result = scoreLeadByRules(lead);
        if (result.score > 0) {
          upd.run(result.score, result.score_reason, 'rescored-rules', lead.id);
          rescored++;
        } else {
          // Keep at 50 (AI selected for a reason) but fix the notes
          upd.run(50, 'AI selected - no rule match', 'ai-selected', lead.id);
        }
        fixed++;
      }
      
      console.log('✅ Fixed ' + fixed + ' leads (' + rescored + ' rescored with rules)');
    } catch(e) {
      console.error('Fix parse errors error:', e.message);
    }
  });

  // ============================================================
  // ROUTE: Get DM scripts as JSON
  // Usage: GET /api/dm-scripts?min_score=70&limit=100
  // ============================================================
  app.get('/api/dm-scripts', (req, res) => {
    try {
      const minScore = parseInt(req.query.min_score) || 70;
      const limit = parseInt(req.query.limit) || 100;
      
      const leads = db.prepare(
        'SELECT * FROM leads WHERE score >= ? ORDER BY score DESC LIMIT ?'
      ).all(minScore, limit);
      
      const result = leads.map(lead => ({
        id: lead.id,
        name: lead.name,
        score: lead.score,
        source: lead.source,
        message: (lead.message || '').substring(0, 200),
        contact: lead.contact,
        url: lead.url,
        lead_type: detectLeadType(lead),
        dm_opening: generateOpeningDM(lead),
        dm_followup: generateFollowupDM(lead),
        pricing: { single: PRICING.SINGLE, dual: PRICING.DUAL, dryer: PRICING.DRYER }
      }));
      
      res.json(result);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // ROUTE: DM Dashboard (HTML page — open in browser)
  // Usage: GET /dm-dashboard?min_score=70
  // ============================================================
  app.get('/dm-dashboard', (req, res) => {
    try {
      const minScore = parseInt(req.query.min_score) || 70;
      const P = PRICING;
      
      const leads = db.prepare(
        'SELECT * FROM leads WHERE score >= ? ORDER BY score DESC LIMIT 200'
      ).all(minScore);
      
      const cards = leads.map(lead => {
        const dm = generateOpeningDM(lead);
        const fu = generateFollowupDM(lead);
        const lt = detectLeadType(lead);
        const scoreColor = lead.score >= 85 ? '#00ff88' : lead.score >= 70 ? '#ffa500' : '#4a9eff';
        const typeColors = {
          DRYER_VENT: '#ff6b35', FURNACE: '#ffd700', DUCT_CLEANING: '#00bfff',
          HVAC_GENERAL: '#9d4edd', NEW_HOMEOWNER: '#06d6a0', AIR_QUALITY: '#ff4d6d',
          RECOMMENDATION: '#4cc9f0', GENERAL: '#888'
        };
        const typeColor = typeColors[lt] || '#888';
        
        const postLink = lead.contact || lead.url || '#';
        const msgPreview = (lead.message || '').substring(0, 100);
        
        return `
        <div class="card">
          <div class="card-header">
            <div>
              <span class="score" style="color:${scoreColor}">${lead.score}</span>
              <span class="source">${lead.source || 'Unknown'}</span>
              <span class="type-badge" style="border-color:${typeColor};color:${typeColor}">${lt}</span>
            </div>
            <a href="${postLink}" target="_blank" class="view-link">View Post →</a>
          </div>
          <div class="post-preview">📝 "${msgPreview}${msgPreview.length >= 100 ? '...' : ''}"</div>
          <div class="dm-section">
            <div class="dm-label">Opening DM — Copy & Send This First</div>
            <div class="dm-text" id="dm_${lead.id}">${dm}</div>
            <button class="copy-btn copy-primary" onclick="copyText('dm_${lead.id}', this)">📋 Copy Opening DM</button>
          </div>
          <div class="dm-section">
            <div class="dm-label">Follow-Up DM — Send if No Reply in 24-48hrs</div>
            <div class="dm-text dm-followup" id="fu_${lead.id}">${fu}</div>
            <button class="copy-btn copy-secondary" onclick="copyText('fu_${lead.id}', this)">📋 Copy Follow-Up</button>
          </div>
        </div>
        `;
      }).join('');
      
      const stats = {
        total: db.prepare('SELECT COUNT(*) as n FROM leads').get().n,
        hot: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score >= 70').get().n,
        warm: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score >= 40 AND score < 70').get().n,
        unscored: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score = 0').get().n,
      };
      
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DM Scripts — Lead Machine</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d1117; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; }
  h1 { color: #00ff88; font-size: 26px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
  .pricing-bar { display: flex; gap: 16px; flex-wrap: wrap; background: #1a1a2e; padding: 14px 18px; border-radius: 10px; margin-bottom: 18px; }
  .pitem .amt { font-size: 24px; font-weight: bold; color: #00ff88; }
  .pitem .lbl { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .stats-bar { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .stat { background: #1a1a2e; padding: 8px 14px; border-radius: 6px; font-size: 13px; }
  .stat span { font-weight: bold; color: #00ff88; }
  .filters { margin-bottom: 16px; }
  .filters a { color: #4a9eff; margin-right: 12px; text-decoration: none; font-size: 13px; padding: 5px 10px; background: #1a1a2e; border-radius: 5px; }
  .filters a:hover { background: #2a2a4e; }
  .card { background: #1a1a2e; border: 1px solid #2a2a4e; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 8px; }
  .score { font-size: 24px; font-weight: bold; margin-right: 8px; }
  .source { color: #666; font-size: 12px; margin-right: 8px; }
  .type-badge { border: 1px solid; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
  .view-link { color: #4a9eff; font-size: 12px; text-decoration: none; }
  .view-link:hover { text-decoration: underline; }
  .post-preview { color: #888; font-size: 12px; font-style: italic; margin-bottom: 12px; line-height: 1.4; }
  .dm-section { margin-bottom: 10px; }
  .dm-label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
  .dm-text { background: #0d1117; border: 1px solid #2a2a4e; padding: 12px; border-radius: 6px; font-size: 13px; line-height: 1.6; color: #e0e0e0; }
  .dm-followup { color: #aaa; }
  .copy-btn { margin-top: 6px; border: none; padding: 6px 14px; border-radius: 5px; cursor: pointer; font-size: 12px; font-weight: bold; }
  .copy-primary { background: #4a9eff; color: #000; }
  .copy-secondary { background: #2a2a4e; color: #ccc; border: 1px solid #444; }
  .copy-btn:hover { opacity: 0.85; }
  .empty { color: #666; text-align: center; padding: 40px; font-size: 14px; }
</style>
</head>
<body>
<h1>💬 DM Scripts — Appointment Bookers</h1>
<p class="subtitle">${leads.length} leads with score ≥ ${minScore} | Copy DM → Send on Reddit/Facebook → Book Appointment</p>

<div class="pricing-bar">
  <div class="pitem"><div class="amt">$${P.SINGLE}</div><div class="lbl">Single Furnace + All Vents</div></div>
  <div class="pitem"><div class="amt">$${P.DUAL}</div><div class="lbl">2-Furnace System + All Vents</div></div>
  <div class="pitem"><div class="amt">$${P.DRYER}</div><div class="lbl">Dryer Vent Only</div></div>
  <div class="pitem"><div class="amt">${P.PHONE}</div><div class="lbl">Book by Phone</div></div>
</div>

<div class="stats-bar">
  <div class="stat">Total: <span>${stats.total}</span></div>
  <div class="stat">🔥 Hot (70+): <span>${stats.hot}</span></div>
  <div class="stat">🌡️ Warm (40+): <span>${stats.warm}</span></div>
  <div class="stat">❓ Unscored: <span>${stats.unscored}</span></div>
</div>

<div class="filters">
  <a href="/dm-dashboard?min_score=85">⚡ Very Hot (85+)</a>
  <a href="/dm-dashboard?min_score=70">🔥 Hot (70+)</a>
  <a href="/dm-dashboard?min_score=50">🌡️ Warm (50+)</a>
  <a href="/dm-dashboard?min_score=40">All Scored</a>
</div>

${cards || '<div class="empty">No leads at this score threshold.<br>Run POST /api/score-rules first to score your leads.</div>'}

<script>
function copyText(id, btn) {
  const text = document.getElementById(id).innerText;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ Copied!';
    btn.style.background = '#00ff88';
    btn.style.color = '#000';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; btn.style.color = ''; }, 2000);
  });
}
</script>
</body>
</html>`);
    } catch(e) {
      res.status(500).send('<pre>Error: ' + e.message + '</pre>');
    }
  });

  // ============================================================
  // ROUTE: Score statistics
  // Usage: GET /api/score-stats
  // ============================================================
  app.get('/api/score-stats', (req, res) => {
    try {
      res.json({
        total: db.prepare('SELECT COUNT(*) as n FROM leads').get().n,
        scored: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score > 0').get().n,
        unscored: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score = 0').get().n,
        hot: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score >= 70').get().n,
        warm: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score >= 40 AND score < 70').get().n,
        cool: db.prepare('SELECT COUNT(*) as n FROM leads WHERE score > 0 AND score < 40').get().n,
        parseErrors: db.prepare("SELECT COUNT(*) as n FROM leads WHERE notes = 'Could not parse score'").get().n,
        bySource: db.prepare("SELECT source, COUNT(*) as count, AVG(score) as avg_score FROM leads WHERE score > 0 GROUP BY source ORDER BY avg_score DESC LIMIT 20").all()
      });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============================================================
  // ROUTE: Trigger Facebook group scraper
  // Usage: POST /api/facebook-scrape
  // Body: { "fb_email": "your@email.com", "fb_password": "yourpass" }
  // ============================================================
  app.post('/api/facebook-scrape', async (req, res) => {
    const { fb_email, fb_password } = req.body || {};
    
    if (!fb_email || !fb_password) {
      return res.status(400).json({ 
        error: 'Facebook credentials required',
        usage: 'POST /api/facebook-scrape with body: { fb_email, fb_password }'
      });
    }
    
    res.json({ message: 'Facebook group scraping started. Check console for progress.' });
    
    try {
      const { scrapeFacebookGroups } = require('./fb-scraper');
      const newLeads = await scrapeFacebookGroups(db, { fb_email, fb_password });
      console.log('\n✅ Facebook scrape complete: ' + newLeads + ' new leads added');
      
      // Auto-score the new Facebook leads
      if (newLeads > 0) {
        console.log('Auto-scoring new Facebook leads...');
        const newFbLeads = db.prepare("SELECT * FROM leads WHERE source LIKE 'Facebook%' AND score = 0").all();
        const upd = db.prepare('UPDATE leads SET score=?, score_reason=?, notes=? WHERE id=?');
        let autoScored = 0;
        for (const lead of newFbLeads) {
          const result = scoreLeadByRules(lead);
          if (result.score > 0) {
            upd.run(result.score, result.score_reason, result.notes, lead.id);
            autoScored++;
          }
        }
        console.log('Auto-scored ' + autoScored + ' Facebook leads');
      }
    } catch(e) {
      console.error('Facebook scrape error:', e.message);
    }
  });

  console.log('✅ Lead Machine v2 routes loaded:');
  console.log('   POST /api/score-rules       — Score unscored leads');
  console.log('   POST /api/fix-parse-errors  — Fix broken AI scores');
  console.log('   GET  /api/dm-scripts        — Get DM scripts (JSON)');
  console.log('   GET  /dm-dashboard          — DM Scripts dashboard');
  console.log('   POST /api/facebook-scrape   — Scrape Facebook groups');
  console.log('   GET  /api/score-stats       — Scoring statistics');
};
