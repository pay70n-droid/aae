// database.js — SQLite database for leads, appointments, emails, activity logs
const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'agent.db');

let db;

function initDB() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    -- Leads table
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      source TEXT,          -- 'facebook', 'instagram', 'linkedin', 'twitter', 'manual'
      source_detail TEXT,   -- group name, page, etc.
      score INTEGER DEFAULT 0,
      status TEXT DEFAULT 'new', -- 'new', 'cold', 'warm', 'hot', 'booked', 'converted', 'dead'
      notes TEXT,
      last_action TEXT,
      next_action TEXT,
      city TEXT,
      state TEXT,
      scraped_data TEXT,    -- JSON blob of raw scraped info
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Appointments table
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      type TEXT DEFAULT 'Estimate',  -- 'Estimate', 'Service Call', 'Follow-Up'
      status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'completed', 'cancelled', 'no-show'
      gcal_event_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Email sequences
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      lead_id TEXT REFERENCES leads(id),
      to_email TEXT NOT NULL,
      subject TEXT,
      body TEXT,
      step INTEGER DEFAULT 1,
      status TEXT DEFAULT 'queued', -- 'queued', 'sent', 'opened', 'replied', 'bounced'
      gmail_message_id TEXT,
      sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Activity log
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'completed', -- 'completed', 'running', 'failed'
      metadata TEXT,  -- JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Workflow configs
    CREATE TABLE IF NOT EXISTS workflow_configs (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL,  -- JSON
      active INTEGER DEFAULT 0,
      last_run DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- OAuth tokens
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      provider TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expiry DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score DESC);
    CREATE INDEX IF NOT EXISTS idx_emails_lead ON emails(lead_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_lead ON appointments(lead_id);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
  `);

  // Seed default workflow configs if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM workflow_configs').get().c;
  if (count === 0) {
    const workflows = [
      { id: 'lead_scrape', config: {
        platforms: ['Facebook Groups', 'Instagram', 'Web Search'],
        // Facebook groups to target (search these names on FB)
        facebook_groups: [
          // Charlotte Metro Homeowner / Community Groups
          'Charlotte NC Homeowners',
          'Charlotte Homeowners Group',
          'New to Charlotte NC',
          'Charlotte NC Newcomers',
          'Moving to Charlotte NC',
          'Charlotte Area Moms',
          'Charlotte Moms Group',
          'Charlotte Moms Network',
          'Charlotte NC Recommendations',
          'Charlotte Recommendations & Reviews',
          'What\'s Happening in Charlotte',
          'Best of Charlotte NC',
          'Charlotte NC Community',
          // Neighborhood / Suburb Groups
          'Ballantyne Community',
          'Ballantyne Moms',
          'Ballantyne Neighborhood',
          'Ballantyne Bargains',
          'SouthPark Charlotte',
          'South Charlotte Community',
          'South Charlotte Moms',
          'Steele Creek Community',
          'Steele Creek Neighbors',
          'University City Charlotte',
          'NoDa Charlotte Community',
          'Plaza Midwood Neighbors',
          'Dilworth Charlotte',
          'Myers Park Charlotte',
          'Eastover Charlotte',
          'Mint Hill Community',
          'Mint Hill Neighbors',
          'Matthews NC Community',
          'Matthews NC Neighbors',
          'Indian Trail NC Community',
          'Stallings NC Community',
          'Waxhaw NC Community',
          'Weddington NC Community',
          'Marvin NC Community',
          // North Charlotte / Lake Norman
          'Huntersville NC Community',
          'Huntersville Neighbors',
          'Huntersville NO RULES Yard Sale',
          'Huntersville Moms',
          'Cornelius NC Community',
          'Davidson NC Community',
          'Mooresville NC Community',
          'Mooresville Neighbors',
          'Lake Norman Community',
          'Lake Norman Moms',
          'Lake Norman Area Chat',
          'Lake Norman Newcomers',
          // East / Northeast
          'Concord NC Community',
          'Concord NC Neighbors',
          'Harrisburg NC Community',
          'Kannapolis NC Community',
          // West / South
          'Gastonia NC Community',
          'Belmont NC Community',
          'Fort Mill SC Community',
          'Fort Mill Neighbors',
          'Tega Cay Community',
          'Indian Land SC Community',
          'Lake Wylie Community',
          // Buy/Sell/Trade (people post home service needs)
          'Charlotte Garage Sale',
          'Charlotte NC Online Yard Sale',
          'Charlotte Buy Sell Trade',
          'Mecklenburg County Yard Sale',
          'Union County NC Buy Sell Trade',
          'MICIT Charlotte',
          // Home Services / Real Estate
          'Charlotte Real Estate Investors',
          'Charlotte NC Real Estate',
          'Charlotte Home Improvement',
          'Charlotte NC Contractor Recommendations',
          'Charlotte Area Home Services',
          'Charlotte NC Handyman Recommendations',
          // Niche / High-Value
          'Charlotte Allergies & Asthma Support',
          'Charlotte Pet Owners',
          'Charlotte NC Renters',
          'First Time Home Buyers Charlotte NC',
          'Charlotte Area Property Managers',
        ],
        keywords: [
          'air duct', 'duct cleaning', 'HVAC', 'air quality', 'dusty vents',
          'dusty house', 'allergies', 'mold', 'musty smell', 'furnace',
          'air filter', 'dirty ducts', 'vent cleaning', 'dryer vent',
          'new home', 'just moved', 'new homeowner', 'bought a house',
          'home maintenance', 'HVAC recommendation', 'air duct recommendation',
          'cleaning service recommendation', 'home service recommendation',
        ],
        instagram_hashtags: [
          'charlottehomeowner', 'charlotterealestate', 'charlottehomes',
          'charlottenc', 'queencity', 'clthomes', 'huntersvillenc',
          'lakenorman', 'ballantynenc', 'charlottemoms',
          'newconstruction', 'firsttimehomebuyer', 'charlotteliving',
          'mooresvillenc', 'fortmillsc', 'airductcleaning',
          'hvacservice', 'indoorairquality', 'cleanair',
        ],
        nextdoor_search_terms: [
          'air duct cleaning recommendation Charlotte',
          'HVAC service recommendation Charlotte NC',
          'duct cleaning needed Charlotte',
          'dusty vents help Charlotte',
          'furnace cleaning Charlotte NC',
          'dryer vent cleaning Charlotte',
          'indoor air quality Charlotte',
        ],
        location: 'Charlotte NC',
        interval: '1 hour',
      }, active: 1 },
      { id: 'appt_booking', config: { availability: 'Mon-Sat 8am-6pm EST', meeting_duration: '30 min', buffer: '15 min', auto_book: true }, active: 1 },
      { id: 'email_sequence', config: { steps: 3, delay_days: 2, tone: 'Casual & friendly', template: 'Hi {name}, saw you in {source}! American Air Experts is running a special — $199 air duct cleaning for 1 furnace, all vents included. Want to book a time? Check us out at americanairexperts.us or just reply here!\n\n— American Air Experts\n980-635-8288 | americanairexperts.us' }, active: 1 },
      { id: 'lead_scorer', config: { hot_threshold: 75, auto_followup: true, notify: true }, active: 1 },
      { id: 'research', config: { depth: 'Quick scan', sources: ['Facebook', 'Company website'] }, active: 0 },
    ];
    const insert = db.prepare('INSERT INTO workflow_configs (id, config, active) VALUES (?, ?, ?)');
    for (const w of workflows) {
      insert.run(w.id, JSON.stringify(w.config), w.active);
    }
  }

  console.log('✅ Database initialized');
  return db;
}

// ========== LEAD HELPERS ==========

function addLead(data) {
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO leads (id, name, email, phone, company, source, source_detail, score, status, notes, city, state, scraped_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, data.name, data.email, data.phone, data.company, data.source, data.source_detail, data.score || 0, data.status || 'new', data.notes, data.city, data.state, data.scraped_data ? JSON.stringify(data.scraped_data) : null);
  logActivity('Lead Scraper', `New lead: ${data.name} from ${data.source}${data.source_detail ? ' (' + data.source_detail + ')' : ''}`);
  return id;
}

function getLeads(filters = {}) {
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.minScore) { sql += ' AND score >= ?'; params.push(filters.minScore); }
  if (filters.source) { sql += ' AND source = ?'; params.push(filters.source); }
  sql += ' ORDER BY score DESC, created_at DESC';
  if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
  return db.prepare(sql).all(...params);
}

function updateLead(id, data) {
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) { fields.push(`${key} = ?`); params.push(val); }
  }
  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  db.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

function scoreLead(id) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return 0;

  let score = 0;

  // Has email = +20
  if (lead.email) score += 20;
  // Has phone = +25
  if (lead.phone) score += 25;
  // Is homeowner keyword = +15
  if (lead.notes && /homeowner|home owner|new home|house/i.test(lead.notes)) score += 15;
  // In service area = +15
  if (lead.city && /charlotte|concord|gastonia|huntersville|mooresville|matthews|mint hill|indian trail/i.test(lead.city)) score += 15;
  // Has engaged (replied) = +25
  const replied = db.prepare("SELECT COUNT(*) as c FROM emails WHERE lead_id = ? AND status = 'replied'").get(id);
  if (replied && replied.c > 0) score += 25;
  // From Facebook group (higher intent) = +10
  if (lead.source === 'facebook') score += 10;

  score = Math.min(score, 100);
  updateLead(id, { score, status: score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cold' });
  return score;
}

// ========== APPOINTMENT HELPERS ==========

function addAppointment(data) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO appointments (id, lead_id, date, time, type, status, gcal_event_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.lead_id, data.date, data.time, data.type || 'Estimate', data.status || 'pending', data.gcal_event_id, data.notes);
  logActivity('Appointment Booker', `Booked ${data.type || 'Estimate'} for ${data.date} @ ${data.time}`);
  return id;
}

function getAppointments(filters = {}) {
  let sql = `
    SELECT a.*, l.name as lead_name, l.email as lead_email, l.phone as lead_phone
    FROM appointments a
    LEFT JOIN leads l ON a.lead_id = l.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.status) { sql += ' AND a.status = ?'; params.push(filters.status); }
  if (filters.upcoming) { sql += " AND a.date >= date('now')"; }
  sql += ' ORDER BY a.date ASC, a.time ASC';
  return db.prepare(sql).all(...params);
}

// ========== EMAIL HELPERS ==========

function addEmail(data) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO emails (id, lead_id, to_email, subject, body, step, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.lead_id, data.to_email, data.subject, data.body, data.step || 1, data.status || 'queued');
  return id;
}

function getEmails(filters = {}) {
  let sql = `
    SELECT e.*, l.name as lead_name
    FROM emails e
    LEFT JOIN leads l ON e.lead_id = l.id
    WHERE 1=1
  `;
  const params = [];
  if (filters.status) { sql += ' AND e.status = ?'; params.push(filters.status); }
  if (filters.lead_id) { sql += ' AND e.lead_id = ?'; params.push(filters.lead_id); }
  sql += ' ORDER BY e.created_at DESC';
  if (filters.limit) { sql += ' LIMIT ?'; params.push(filters.limit); }
  return db.prepare(sql).all(...params);
}

function updateEmail(id, data) {
  const fields = [];
  const params = [];
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) { fields.push(`${key} = ?`); params.push(val); }
  }
  params.push(id);
  db.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE id = ?`).run(...params);
}

// ========== ACTIVITY LOG ==========

function logActivity(workflow, message, status = 'completed', metadata = null) {
  db.prepare(`
    INSERT INTO activity_log (workflow, message, status, metadata)
    VALUES (?, ?, ?, ?)
  `).run(workflow, message, status, metadata ? JSON.stringify(metadata) : null);
}

function getActivityLog(limit = 50) {
  return db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?').all(limit);
}

// ========== WORKFLOW CONFIG ==========

function getWorkflowConfig(id) {
  const row = db.prepare('SELECT * FROM workflow_configs WHERE id = ?').get(id);
  if (row) row.config = JSON.parse(row.config);
  return row;
}

function updateWorkflowConfig(id, config, active) {
  db.prepare(`
    UPDATE workflow_configs SET config = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(JSON.stringify(config), active ? 1 : 0, id);
}

function getAllWorkflowConfigs() {
  return db.prepare('SELECT * FROM workflow_configs').all().map(r => ({ ...r, config: JSON.parse(r.config) }));
}

// ========== OAUTH TOKENS ==========

function saveToken(provider, tokens) {
  db.prepare(`
    INSERT OR REPLACE INTO oauth_tokens (provider, access_token, refresh_token, expiry, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(provider, tokens.access_token, tokens.refresh_token, tokens.expiry);
}

function getToken(provider) {
  return db.prepare('SELECT * FROM oauth_tokens WHERE provider = ?').get(provider);
}

// ========== STATS ==========

function getStats() {
  const totalLeads = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  const hotLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'hot'").get().c;
  const warmLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'warm'").get().c;
  const coldLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'cold'").get().c;
  const bookedAppts = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE status IN ('pending','confirmed')").get().c;
  const totalEmails = db.prepare('SELECT COUNT(*) as c FROM emails').get().c;
  const sentEmails = db.prepare("SELECT COUNT(*) as c FROM emails WHERE status = 'sent'").get().c;
  const repliedEmails = db.prepare("SELECT COUNT(*) as c FROM emails WHERE status = 'replied'").get().c;
  const openedEmails = db.prepare("SELECT COUNT(*) as c FROM emails WHERE status = 'opened'").get().c;

  // This week
  const weekLeads = db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now', '-7 days')").get().c;
  const weekAppts = db.prepare("SELECT COUNT(*) as c FROM appointments WHERE created_at >= date('now', '-7 days')").get().c;
  const weekEmails = db.prepare("SELECT COUNT(*) as c FROM emails WHERE created_at >= date('now', '-7 days')").get().c;

  return {
    totalLeads, hotLeads, warmLeads, coldLeads,
    bookedAppts, totalEmails, sentEmails, repliedEmails, openedEmails,
    weekLeads, weekAppts, weekEmails,
    replyRate: totalEmails > 0 ? Math.round((repliedEmails / totalEmails) * 100) : 0,
    openRate: totalEmails > 0 ? Math.round((openedEmails / totalEmails) * 100) : 0,
  };
}

module.exports = {
  initDB, getDB: () => db,
  addLead, getLeads, updateLead, scoreLead,
  addAppointment, getAppointments,
  addEmail, getEmails, updateEmail,
  logActivity, getActivityLog,
  getWorkflowConfig, updateWorkflowConfig, getAllWorkflowConfigs,
  saveToken, getToken,
  getStats,
};
