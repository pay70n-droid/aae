// dm-generator.js - Appointment-Booking DM Script Generator
// Generates personalized DM scripts for Facebook Groups & Reddit leads
// Prices: $199 single furnace all vents | $349 dual furnace all vents | $125 dryer vent

const PRICING = {
  SINGLE: 199,   // Single furnace + ALL vents
  DUAL: 349,     // Two-furnace system + ALL vents  
  DRYER: 125,    // Dryer vent cleaning
  PHONE: '(980) 635-8288',
  WEB: 'queencityductcleaning.com',
  BIZ: 'American Air Experts',
  AREA: 'Charlotte'
};

function detectLeadType(lead) {
  const t = ((lead.message || '') + ' ' + (lead.title || '')).toLowerCase();
  if (/dryer.{0,10}vent/.test(t)) return 'DRYER_VENT';
  if (/furnace|heat.{0,8}system/.test(t)) return 'FURNACE';
  if (/air.{0,5}duct|duct.{0,10}clean|ductwork/.test(t)) return 'DUCT_CLEANING';
  if (/hvac|heat pump|air.{0,8}condition/.test(t)) return 'HVAC_GENERAL';
  if (/just moved|just bought|new home|new house|first home|moving in|just closed/.test(t)) return 'NEW_HOMEOWNER';
  if (/allergies|asthma|air quality|musty|mold|mildew|smell|odor|breathing|sneezing|dusty/.test(t)) return 'AIR_QUALITY';
  if (/recommend|who do you use|good company|reliable/.test(t)) return 'RECOMMENDATION';
  return 'GENERAL';
}

function getFirstName(lead) {
  const n = (lead.name || '').split(/[\s_.-]/)[0];
  return (n && n.length > 2 && n.length < 20) ? n : 'there';
}

const OPENING_SCRIPTS = {
  DRYER_VENT: (l) => {
    const n = getFirstName(l);
    const opts = [
      `Hey ${n}! Saw your post about the dryer vent — we specialize in exactly that. We're doing dryer vent cleanings for $${PRICING.DRYER} right now, includes full cleaning and inspection. Takes about 30 min and honestly it's a fire hazard when clogged (top cause of house fires). Are you in the Charlotte area? We have slots open this week.`,
      `Hey ${n}! Just saw your dryer vent post. We're a local Charlotte company and do these all the time — $${PRICING.DRYER} flat, full clean + inspection. We have openings this week. You still looking to get it done?`
    ];
    return opts[l.id % 2];
  },
  FURNACE: (l) => {
    const n = getFirstName(l);
    const opts = [
      `Hey ${n}! Caught your post about the furnace. We run a furnace cleaning special in Charlotte — $${PRICING.SINGLE} and that includes ALL vents in the house. Two-furnace home? It's $${PRICING.DUAL}, still all vents covered. Best time to get it done before summer. You local?`,
      `Hey ${n}! We're local to Charlotte and do furnace cleanings all day. $${PRICING.SINGLE} covers the full furnace + every vent in the house. $${PRICING.DUAL} if you have two systems. We're booking this week — want to grab a slot?`
    ];
    return opts[l.id % 2];
  },
  DUCT_CLEANING: (l) => {
    const n = getFirstName(l);
    return `Hey ${n}! Saw you're asking about duct/vent cleaning. We do this daily in Charlotte — $${PRICING.SINGLE} covers the full furnace + every vent in the home. Most homes that haven't had it done have years of dust, dander, and debris in there. Still looking? We have openings this week.`;
  },
  HVAC_GENERAL: (l) => {
    const n = getFirstName(l);
    return `Hey ${n}! Local air duct & furnace cleaning company here in Charlotte. Running a special — $${PRICING.SINGLE} furnace cleaning with all vents included, or $${PRICING.DRYER} if it's just the dryer vent. Great time of year to get it done. You in the Charlotte area?`;
  },
  NEW_HOMEOWNER: (l) => {
    const n = getFirstName(l);
    const opts = [
      `Hey ${n}! Congrats on the new place! Quick tip from someone who does this daily — get the ducts cleaned before you really settle in. Previous owners never clean them and you'd be breathing whatever's been in there for years. We do a full furnace + all vents cleaning for $${PRICING.SINGLE} in Charlotte. Worth a quick appointment!`,
      `Hey ${n}! New home tip: get the ducts and vents cleaned ASAP. You have no idea what's in there from the previous owners. We do it all day in Charlotte — $${PRICING.SINGLE} full furnace + every vent, or $${PRICING.DRYER} just the dryer vent. We have slots this week!`
    ];
    return opts[l.id % 2];
  },
  AIR_QUALITY: (l) => {
    const n = getFirstName(l);
    return `Hey ${n}! Saw your post — dirty air ducts are almost always the culprit. Dust, mold spores, pet dander all build up in the HVAC system and just recirculate through the house. We do a full furnace + all vents cleaning for $${PRICING.SINGLE} in Charlotte. Most people notice a real difference within days. Want to get on the schedule?`;
  },
  RECOMMENDATION: (l) => {
    const n = getFirstName(l);
    return `Hey ${n}! We're ${PRICING.BIZ}, a local Charlotte company. Furnace + all vents is $${PRICING.SINGLE} (single system) or $${PRICING.DUAL} (two systems). Dryer vent is $${PRICING.DRYER}. Local, reliable, in Charlotte daily. Happy to set something up if you're interested!`;
  },
  GENERAL: (l) => {
    const n = getFirstName(l);
    const opts = [
      `Hey ${n}! We're a local air duct and furnace cleaning company in Charlotte. Running specials right now — $${PRICING.SINGLE} for a full furnace clean with all vents, $${PRICING.DUAL} for two-furnace homes, and $${PRICING.DRYER} dryer vent cleaning. You in the area?`,
      `Hey ${n}! ${PRICING.BIZ} here — local Charlotte company doing air duct, furnace, and dryer vent cleanings. $${PRICING.SINGLE} all in for single furnace + all vents. Anything we can help with?`
    ];
    return opts[l.id % 2];
  }
};

const FOLLOWUP_SCRIPTS = {
  DRYER_VENT: (l) => `Just following up! We're in your area soon — dryer vent cleaning takes 30-45 min, $${PRICING.DRYER} flat. Want to lock in a time?`,
  FURNACE: (l) => `Hey just circling back! Furnace special is $${PRICING.SINGLE} all vents, $${PRICING.DUAL} for 2 furnaces. We have appointments this week — which day works for you?`,
  default: (l) => `Hey ${getFirstName(l)}! Just following up — we still have openings this week for the $${PRICING.SINGLE} furnace + all vents special. Takes about an hour. Want to grab a slot?`
};

function generateOpeningDM(lead) {
  const type = detectLeadType(lead);
  const fn = OPENING_SCRIPTS[type] || OPENING_SCRIPTS.GENERAL;
  return fn(lead);
}

function generateFollowupDM(lead) {
  const type = detectLeadType(lead);
  const fn = FOLLOWUP_SCRIPTS[type] || FOLLOWUP_SCRIPTS.default;
  return fn(lead);
}

function generateBookingConfirmation(lead, day, time) {
  const n = getFirstName(lead);
  return `Perfect ${n}! You're all set for ${day} at ${time}. Our tech will call you 30 min before arrival. If anything comes up, call ${PRICING.PHONE}. See you then!`;
}

module.exports = {
  generateOpeningDM,
  generateFollowupDM,
  generateBookingConfirmation,
  detectLeadType,
  PRICING
};
