#!/usr/bin/env node
// patch.js - Lead Machine v2 Upgrade Script
// Adds: DM Scripts, Facebook Scraper, Rule-Based Scoring
//
// RUN ONCE: node patch.js
// Then restart: node server.js

const fs = require('fs');
const path = require('path');

console.log('');
console.log('╔══════════════════════════════════════╗');
console.log('║   Lead Machine v2 Patch Script       ║');
console.log('║   Facebook + DM + Rule Scorer        ║');
console.log('╚══════════════════════════════════════╝');
console.log('');

const dir = __dirname;

// Check all 4 new files exist
const requiredFiles = ['rule-scorer.js', 'dm-generator.js', 'fb-scraper.js', 'new-routes.js'];
const missing = requiredFiles.filter(f => !fs.existsSync(path.join(dir, f)));

if (missing.length > 0) {
  console.error('❌ Missing files:', missing.join(', '));
  console.error('   Make sure all files from the download are in:', dir);
  process.exit(1);
}

console.log('✅ All new files present');

// Patch server.js to include new-routes
const serverPath = path.join(dir, 'server.js');
if (!fs.existsSync(serverPath)) {
  console.error('❌ server.js not found at:', serverPath);
  process.exit(1);
}

let serverCode = fs.readFileSync(serverPath, 'utf8');

if (serverCode.includes("require('./new-routes')")) {
  console.log('⚡ server.js already patched — skipping patch');
} else {
  // Backup original
  const backupPath = serverPath + '.backup';
  fs.writeFileSync(backupPath, serverCode, 'utf8');
  console.log('✅ Backed up server.js → server.js.backup');
  
  // Inject new-routes after the db initialization
  const injectLine = "\n// Lead Machine v2 — DM Scripts + Facebook Scraper + Rule Scorer\nrequire('./new-routes')(app, db);\n";
  
  // Find good injection points (try multiple patterns)
  const patterns = [
    // After db setup
    { pattern: /const dbs*=s*[^;]+;/, desc: 'after db init' },
    { pattern: /Database([^)]+)[^;]*;/, desc: 'after Database()' },
    // Before first app.get/post
    { pattern: /app.(get|post)('/api/, desc: 'before first route' },
    // Before app.listen
    { pattern: /app.listen/, desc: 'before app.listen' },
  ];
  
  let patched = false;
  for (const { pattern, desc } of patterns) {
    const match = serverCode.match(pattern);
    if (match) {
      const idx = serverCode.indexOf(match[0]) + match[0].length;
      serverCode = serverCode.slice(0, idx) + injectLine + serverCode.slice(idx);
      console.log('✅ Injected new-routes (' + desc + ')');
      patched = true;
      break;
    }
  }
  
  if (!patched) {
    // Fallback: prepend to file
    serverCode = "// Lead Machine v2\nrequire('./new-routes')(app, db);\n" + serverCode;
    console.log('✅ Injected new-routes at file top (fallback)');
  }
  
  fs.writeFileSync(serverPath, serverCode, 'utf8');
  console.log('✅ server.js patched successfully');
}

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  🎉 PATCH COMPLETE! Follow these steps:              ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');
console.log('STEP 1 — Restart the server:');
console.log('  taskkill /f /im node.exe && node server.js');
console.log('');
console.log('STEP 2 — Score your 4,277 unscored leads (run once):');
console.log('  curl -X POST http://localhost:3000/api/score-rules');
console.log('');
console.log('STEP 3 — Fix the 136 parse-error leads (run once):');
console.log('  curl -X POST http://localhost:3000/api/fix-parse-errors');
console.log('');
console.log('STEP 4 — Open DM Scripts Dashboard:');
console.log('  http://localhost:3000/dm-dashboard');
console.log('  (Click any "Copy DM" button, paste into Reddit/Facebook DM)');
console.log('');
console.log('STEP 5 — Facebook Groups setup:');
console.log('  a) Join Charlotte-area Facebook groups');
console.log('  b) Open fb-scraper.js and paste group URLs into FB_GROUPS');
console.log('  c) Run: curl -X POST http://localhost:3000/api/facebook-scrape \\');
console.log('           -H "Content-Type: application/json" \\');
console.log('           -d "{\"fb_email\":\"your@email.com\",\"fb_password\":\"yourpass\"}"');
console.log('');
console.log('STEP 6 — Check stats:');
console.log('  http://localhost:3000/api/score-stats');
console.log('');
console.log('─────────────────────────────────────────────────────');
console.log('PRICING IN ALL DMs:');
console.log('  $199 — Single furnace + ALL vents');
console.log('  $349 — Two-furnace system + ALL vents');
console.log('  $125 — Dryer vent cleaning');
console.log('─────────────────────────────────────────────────────');
console.log('');
