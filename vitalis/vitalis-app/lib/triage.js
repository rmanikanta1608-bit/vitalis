'use strict';
// Rule-based triage. General guidance only, not a diagnosis.
// "red" symptoms always produce an emergency result.

const GROUPS = [
  { id: 'breathing', label: 'Breathing and chest' },
  { id: 'nerves', label: 'Head and nerves' },
  { id: 'injury', label: 'Injury, bleeding and burns' },
  { id: 'body', label: 'Fever and stomach' },
  { id: 'other', label: 'Other' },
];

const SYMPTOMS = [
  // Breathing and chest
  { id: 'chest_pain', label: 'Chest pain or pressure', group: 'breathing', weight: 60, red: true },
  { id: 'breathing', label: 'Struggling to breathe', group: 'breathing', weight: 60, red: true },
  { id: 'choking', label: 'Choking on food or an object', group: 'breathing', weight: 60, red: true, aid: ['choking'] },
  { id: 'wheeze', label: 'Wheezing or tight chest', group: 'breathing', weight: 35 },
  { id: 'cough', label: 'Cough for several days', group: 'breathing', weight: 12 },
  { id: 'sore_throat', label: 'Sore throat', group: 'breathing', weight: 8 },

  // Head and nerves
  { id: 'unresponsive', label: 'Fainted or not responding', group: 'nerves', weight: 60, red: true, aid: ['cpr'] },
  { id: 'stroke', label: 'Face drooping, arm weakness or slurred speech', group: 'nerves', weight: 60, red: true, aid: ['stroke'] },
  { id: 'seizure', label: 'Seizure or fits', group: 'nerves', weight: 60, red: true, aid: ['seizure'] },
  { id: 'thunder_headache', label: 'Sudden, very severe headache', group: 'nerves', weight: 50 },
  { id: 'headache', label: 'Headache', group: 'nerves', weight: 10 },
  { id: 'dizzy', label: 'Dizziness', group: 'nerves', weight: 15 },

  // Injury, bleeding and burns
  { id: 'bleeding', label: 'Heavy bleeding that will not stop', group: 'injury', weight: 60, red: true, aid: ['bleeding'] },
  { id: 'burn_large', label: 'Large or deep burn', group: 'injury', weight: 60, red: true, aid: ['burns'] },
  { id: 'burn_small', label: 'Small burn', group: 'injury', weight: 15, aid: ['burns'] },
  { id: 'head_injury', label: 'Blow to the head', group: 'injury', weight: 45 },
  { id: 'fracture', label: 'Suspected broken bone', group: 'injury', weight: 40, aid: ['fracture'] },
  { id: 'snakebite', label: 'Snake or scorpion bite', group: 'injury', weight: 60, red: true, aid: ['snakebite'] },

  // Fever and stomach
  { id: 'fever', label: 'Fever', group: 'body', weight: 15 },
  { id: 'high_fever', label: 'Fever above 39.5\u00B0C (103\u00B0F)', group: 'body', weight: 40, aid: ['heat'] },
  { id: 'vomiting', label: 'Vomiting', group: 'body', weight: 15 },
  { id: 'vomit_blood', label: 'Vomiting that will not stop, or blood in vomit', group: 'body', weight: 50 },
  { id: 'abdominal', label: 'Severe stomach pain', group: 'body', weight: 45 },
  { id: 'diarrhea', label: 'Loose motions', group: 'body', weight: 15 },
  { id: 'dehydration', label: 'Very dry mouth, little urine, extreme weakness', group: 'body', weight: 40 },
  { id: 'heat_illness', label: 'Overheated, dizzy, heavy sweating', group: 'body', weight: 40, aid: ['heat'] },

  // Other
  { id: 'allergy_severe', label: 'Swollen face or throat after a sting, food or medicine', group: 'other', weight: 60, red: true },
  { id: 'poison', label: 'Swallowed poison, overdose or chemicals', group: 'other', weight: 60, red: true },
  { id: 'pregnancy', label: 'Pregnant with bleeding or severe pain', group: 'other', weight: 65, red: true },
  { id: 'self_harm', label: 'Thoughts of harming myself', group: 'other', weight: 60, red: true },
  { id: 'rash', label: 'Rash or itching', group: 'other', weight: 10 },
  { id: 'urinary', label: 'Burning when passing urine', group: 'other', weight: 15 },
  { id: 'body_ache', label: 'Body ache or tiredness', group: 'other', weight: 8 },
];

const BY_ID = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s]));
const AGE_FACTOR = { infant: 1.4, child: 1.15, adult: 1, senior: 1.25 };
const FEVER_IDS = ['fever', 'high_fever'];

const LEVELS = {
  emergency: {
    title: 'Call 108 now',
    headline: 'These symptoms can be life-threatening.',
    steps: [
      'Call 108 for an ambulance, or 112 for any emergency.',
      'Do not drive yourself if you feel faint or are in severe pain.',
      'Stay with the person. Keep them still, calm and warm.',
      'Follow the first-aid card below while you wait for help.',
    ],
  },
  urgent: {
    title: 'See a doctor today',
    headline: 'Go to a hospital casualty department within the next few hours.',
    steps: [
      'Go to the nearest hospital with a casualty or emergency department.',
      'Take someone with you. Do not travel alone if you feel unwell.',
      'Call 108 if symptoms get worse or you cannot get there safely.',
    ],
  },
  soon: {
    title: 'See a doctor in 1 to 2 days',
    headline: 'This needs a check-up, but it does not look like an emergency.',
    steps: [
      'Visit a clinic, primary health centre or your own doctor.',
      'Rest and drink plenty of fluids until then.',
      'Go to a hospital sooner if you get trouble breathing, confusion, or cannot keep fluids down.',
    ],
  },
  self: {
    title: 'Rest and keep watching',
    headline: 'Your symptoms look mild.',
    steps: [
      'Rest, drink fluids and eat light food.',
      'See a doctor if symptoms last more than 3 days or get worse.',
      'Call 108 if you develop chest pain, trouble breathing or confusion.',
    ],
  },
};

function levelFor(score, hasRed) {
  if (hasRed || score >= 75) return 'emergency';
  if (score >= 45) return 'urgent';
  if (score >= 22) return 'soon';
  return 'self';
}

const ORDER = ['self', 'soon', 'urgent', 'emergency'];

function assess({ symptoms, age }) {
  const ids = [...new Set(Array.isArray(symptoms) ? symptoms : [])].filter((id) => BY_ID[id]);
  if (!ids.length) {
    const err = new Error('Pick at least one symptom.');
    err.status = 400;
    throw err;
  }
  const ageKey = AGE_FACTOR[age] ? age : 'adult';
  const picked = ids.map((id) => BY_ID[id]);
  const raw = picked.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.min(100, Math.round(raw * AGE_FACTOR[ageKey]));
  const redFlags = picked.filter((s) => s.red);

  let level = levelFor(score, redFlags.length > 0);
  // A fever in a baby under 1 year should never be treated as "mild".
  if (ageKey === 'infant' && ids.some((id) => FEVER_IDS.includes(id)) && ORDER.indexOf(level) < ORDER.indexOf('urgent')) {
    level = 'urgent';
  }

  const base = LEVELS[level];
  const selfHarm = ids.includes('self_harm');
  return {
    level,
    score: level === 'emergency' ? Math.max(score, 80) : level === 'urgent' ? Math.max(score, 45) : score,
    title: base.title,
    headline: base.headline,
    steps: base.steps,
    callNow: level === 'emergency',
    warningSigns: redFlags.map((s) => s.label),
    firstAid: [...new Set(picked.flatMap((s) => s.aid || []))],
    support: selfHarm
      ? 'You are not alone. If you might act on these thoughts, call 108 or 112 now. You can also call Tele-MANAS on 14416 at any time. Stay with someone you trust.'
      : null,
    disclaimer: 'Vitalis gives general guidance, not a diagnosis. If you are worried, treat it as urgent.',
  };
}

module.exports = {
  assess,
  catalog: () => ({
    groups: GROUPS,
    symptoms: SYMPTOMS.map(({ id, label, group }) => ({ id, label, group })),
  }),
};
