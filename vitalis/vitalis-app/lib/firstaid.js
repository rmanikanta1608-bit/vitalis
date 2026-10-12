'use strict';
// First-aid guidance for the minutes before help arrives.
// Have a doctor at your college review this wording before you launch.

module.exports = [
  {
    id: 'cpr',
    title: 'Not breathing or no pulse (hands-only CPR)',
    steps: [
      'Call 108 or ask someone else to call. Put the phone on speaker.',
      'Lay the person on their back on a firm surface.',
      'Place the heel of one hand on the centre of the chest, other hand on top.',
      'Push hard and fast, about 5 to 6 cm deep, 100 to 120 times a minute.',
      'Let the chest rise fully between pushes. Do not stop until help arrives or the person starts to breathe.',
    ],
    avoid: ['Do not stop to check for a pulse again and again.', 'Do not give water or food.'],
  },
  {
    id: 'bleeding',
    title: 'Heavy bleeding',
    steps: [
      'Press firmly on the wound with a clean cloth or your hand.',
      'If blood soaks through, add more cloth on top. Do not lift the first one.',
      'Raise the injured arm or leg above the heart if you can.',
      'Keep pressing until help arrives. Call 108.',
    ],
    avoid: ['Do not remove objects stuck in the wound.', 'Do not use a tourniquet unless you are trained and pressure has failed.'],
  },
  {
    id: 'burns',
    title: 'Burns',
    steps: [
      'Hold the burn under cool running water for 20 minutes.',
      'Take off rings, watches and tight clothing near the burn before it swells.',
      'Cover loosely with a clean, non-fluffy cloth or cling film.',
      'Go to a hospital for any large, deep, face, hand or genital burn.',
    ],
    avoid: ['Do not use ice, butter, toothpaste or oil.', 'Do not burst blisters.'],
  },
  {
    id: 'choking',
    title: 'Choking (adult or child over 1 year)',
    steps: [
      'Ask "Are you choking?" If they cannot speak or cough, act now.',
      'Give 5 firm blows between the shoulder blades with the heel of your hand.',
      'Then give 5 abdominal thrusts: fist above the navel, pull sharply in and up.',
      'Repeat 5 blows and 5 thrusts. Call 108 if it does not clear.',
    ],
    avoid: ['Do not poke your fingers into the mouth unless you can see the object.'],
  },
  {
    id: 'stroke',
    title: 'Stroke signs',
    steps: [
      'Check Face (drooping), Arm (weak or numb), Speech (slurred).',
      'If any one is present, call 108 immediately.',
      'Note the time the symptoms started and tell the hospital.',
      'Keep the person sitting or lying comfortably with the head slightly raised.',
    ],
    avoid: ['Do not give food, water or medicine.', 'Do not wait to see if it passes.'],
  },
  {
    id: 'seizure',
    title: 'Seizure or fits',
    steps: [
      'Move hard or sharp objects away. Cushion the head.',
      'Time the seizure. Call 108 if it lasts more than 5 minutes or repeats.',
      'When the jerking stops, turn the person onto their side.',
      'Stay until they are fully awake.',
    ],
    avoid: ['Do not put anything in the mouth.', 'Do not hold the person down.'],
  },
  {
    id: 'snakebite',
    title: 'Snake or scorpion bite',
    steps: [
      'Keep the person calm and still. Movement spreads venom faster.',
      'Remove rings, bangles and tight clothing near the bite.',
      'Keep the bitten limb still and at about heart level.',
      'Get to a hospital with antivenom immediately. Call 108.',
    ],
    avoid: ['Do not cut the bite, suck the venom, or apply ice.', 'Do not tie a tight band.', 'Do not try to catch the snake. A photo from a safe distance helps.'],
  },
  {
    id: 'heat',
    title: 'Heat stroke or very high fever',
    steps: [
      'Move the person to shade or a cool room.',
      'Remove extra clothing. Sponge with cool water and fan them.',
      'Give small sips of water only if they are fully awake.',
      'Call 108 if they are confused, very drowsy, or the temperature stays high.',
    ],
    avoid: ['Do not give anything by mouth to someone who is drowsy.'],
  },
  {
    id: 'fracture',
    title: 'Suspected broken bone',
    steps: [
      'Keep the injured part still in the position you found it.',
      'Support it with padding, or a folded cloth and a firm splint.',
      'Hold a cloth-wrapped ice pack on it to reduce swelling.',
      'Go to a hospital. Call 108 for a neck, back, hip or thigh injury.',
    ],
    avoid: ['Do not try to straighten the limb.', 'Do not move someone with a possible neck or back injury.'],
  },
];
