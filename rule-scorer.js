// rule-scorer.js - Rule-Based Lead Scorer v2
// Fixes broken AI score parser. Uses keyword matching for reliable scoring.
// Part of Lead Machine v2 upgrade

const DIRECT_KW = [
  'furnace clean','duct clean','air duct clean','dryer vent clean',
  'hvac clean','vent clean','furnace service','furnace repair',
  'ductwork clean','duct cleaning','furnace cleaning','dryer vent',
  'air duct','duct work','ductwork','need hvac','hvac recommend',
  'recommend hvac','furnace recommend','air duct recommend'
];

const STRONG_KW = [
  'hvac','air quality','musty smell','dusty','dirty vents',
  'furnace filter','air filter','heating system','cooling system',
  'heat pump','ac unit','dirty ducts','clean vents','ventilation',
  'indoor air','allergen','air purif','filter chang'
];

const SIGNAL_KW = [
  'just moved','just bought','new home','first home','new house',
  'moving in','renovation','remodel','musty','mold','mildew',
  'odor','smell','allergies','asthma','breathing problem',
  'pet dander','sneezing','coughing','stuffy','congestion'
];

const GEO_KW = [
  'charlotte','fort mill','rock hill','gastonia','huntersville',
  'matthews','mooresville','lake norman','cornelius','davidson',
  'ballantyne','steele creek','pineville','mint hill','indian trail',
  'monroe','stallings','waxhaw','concord','kannapolis','belmont'
];

const SRC_BONUS = {
  'Reddit r/Charlotte': 15,
  'Reddit r/hvacadvice': 10,
  'Reddit r/HVAC': 10,
  'Reddit r/Huntersville': 12,
  'Reddit r/LakeNorman': 12,
  'Reddit r/Matthews': 12,
  'Reddit r/Gastonia': 12,
  'Reddit r/Cornelius': 12,
  'Reddit r/homeowners': 8,
  'Reddit r/HomeImprovement': 8,
  'Reddit r/FirstTimeHomeBuyer': 8,
  'Reddit r/homebuying': 8,
  'Reddit r/Allergies': 5,
  'Reddit r/Asthma': 5,
  'Reddit r/NorthCarolina': 5,
  'Reddit r/SouthCarolina': 3,
  'Reddit r/moving': 5,
  'Reddit r/renting': 4,
  'Reddit r/Landlord': 4,
};

function scoreLeadByRules(lead) {
  const txt = ((lead.message || '') + ' ' + (lead.title || '')).toLowerCase();
  const src = lead.source || '';
  let baseScore = 0;
  let reasons = [];

  for (const kw of DIRECT_KW) {
    if (txt.includes(kw)) { baseScore = 85; reasons.push('Direct service: "' + kw + '"'); break; }
  }
  if (!baseScore) {
    for (const kw of STRONG_KW) {
      if (txt.includes(kw)) { baseScore = 65; reasons.push('Strong signal: "' + kw + '"'); break; }
    }
  }
  if (!baseScore) {
    for (const kw of SIGNAL_KW) {
      if (txt.includes(kw)) { baseScore = 42; reasons.push('Moderate signal: "' + kw + '"'); break; }
    }
  }

  if (!baseScore) return { score: 0, score_reason: 'No HVAC keywords found', notes: 'rule-scored' };

  let geoBonus = 0;
  for (const geo of GEO_KW) {
    if (txt.includes(geo) || src.toLowerCase().includes(geo)) {
      geoBonus = 12; reasons.push('Local geo: "' + geo + '"'); break;
    }
  }

  let srcBonus = 0;
  for (const [srcKey, bonus] of Object.entries(SRC_BONUS)) {
    if (src.includes(srcKey)) { srcBonus = bonus; reasons.push('Source: +' + bonus); break; }
  }
  if (src.toLowerCase().includes('facebook')) {
    srcBonus = Math.max(srcBonus, 15); reasons.push('Facebook: +15');
  }
  if (src.toLowerCase().includes('nextdoor')) {
    srcBonus = Math.max(srcBonus, 12); reasons.push('Nextdoor: +12');
  }

  const finalScore = Math.min(100, baseScore + geoBonus + srcBonus);
  return {
    score: finalScore,
    score_reason: reasons.join('. '),
    notes: 'rule-scored-v2'
  };
}

// Fixed AI score parser (replaces the broken one in server.js)
function parseAIScore(aiResponse) {
  if (!aiResponse) return null;
  const patterns = [
    /score[:\s]*([0-9]+)/i,
    /([0-9]+)\/100/,
    /([0-9]+)\s*out of\s*100/i,
    /rating[:\s]*([0-9]+)/i,
    /^([0-9]+)$/m,
    /\b([0-9]{1,3})\b/,
  ];
  for (const pattern of patterns) {
    const match = aiResponse.match(pattern);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 0 && score <= 100) return score;
    }
  }
  return null;
}

module.exports = { scoreLeadByRules, parseAIScore, SRC_BONUS, GEO_KW, DIRECT_KW };
