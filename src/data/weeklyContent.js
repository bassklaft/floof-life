// Weekly content pools for the checklist freshness engine.
//
// The engine (src/lib/weeklyFreshness.js) deterministically rotates
// ONE theme, ONE tip, and TWO spotlight tasks per pet per week — so
// the checklist visibly changes week to week instead of feeling
// static (and screenshot-and-cancel-able).
//
// All content is general care guidance — never diagnosis, never a
// substitute for a vet. Voice: warm, concrete, practical — matching
// RULES_OF_THUMB and the checklist `why` copy. The {pet} token is
// substituted with the pet's name by the engine.
//
// Applicability fields (all optional; omitted = applies to everyone):
//   species : array, e.g. ["dog"] or ["dog","cat"]
//   stage   : "senior" | "young" — life-stage gate

// ── Weekly themes ────────────────────────────────────────────────
// One is spotlighted each week as "This week's focus".
export const WEEKLY_THEMES = [
  {
    id: "dental",
    title: "Dental focus",
    blurb:
      "Periodontal disease affects most adult pets, and it's almost entirely preventable. Give {pet}'s teeth and gums a little extra attention this week.",
  },
  {
    id: "paws",
    title: "Paws & nails",
    blurb:
      "Pads, nails, and the fur between the toes take a lot of wear. A proper look this week catches cracks, grit, and overgrown nails before they hurt.",
  },
  {
    id: "mind",
    title: "Mind & enrichment",
    blurb:
      "A bored {pet} finds their own entertainment — usually the kind you'd rather they didn't. This week, lean into puzzles, sniffing, and play.",
  },
  {
    id: "coat",
    title: "Coat & skin",
    blurb:
      "Hands-on grooming is the best lump-and-bump early-warning system there is. Make a little time for it with {pet} this week.",
  },
  {
    id: "hydration",
    title: "Hydration check",
    blurb:
      "Steady water intake protects kidneys and joints for the long haul. This week, make it easier for {pet} to drink more.",
  },
  {
    id: "weight",
    title: "Weight & body condition",
    blurb:
      "Most pets carry a little more weight than ideal, and the change is gradual enough to miss. Check in on {pet}'s body condition this week.",
  },
  {
    id: "calm",
    title: "Calm & comfort",
    blurb:
      "Predictable routines and a quiet retreat lower a pet's baseline stress. This week, look at the day from {pet}'s point of view.",
  },
  {
    id: "safety",
    title: "Home safety sweep",
    blurb:
      "Pets explore with their mouths. A quick hazard sweep this week — plants, cords, small objects, latches — heads off an emergency.",
  },
  {
    id: "vetprep",
    title: "Vet-visit prep",
    blurb:
      "The best vet visits happen when you arrive organized. This week, get {pet}'s records, questions, and history in order.",
  },
  {
    id: "nutrition",
    title: "Food & feeding",
    blurb:
      "What and how {pet} eats shapes their health more than almost anything else. This week, take a fresh look at the bowl.",
  },
  {
    id: "senior",
    stage: "senior",
    title: "Senior watch",
    blurb:
      "Older pets change slowly. This week, pay attention to how {pet} moves, sleeps, and settles — small shifts are worth noting down.",
  },
  {
    id: "growing-up",
    stage: "young",
    title: "Growing up",
    blurb:
      "{pet} is in a window where every calm, positive new experience pays off for years. This week, focus on gentle exposure and handling.",
  },
];

// ── Spotlight tasks ──────────────────────────────────────────────
// Two fresh, genuinely actionable tasks surface each week, on top of
// the recurring core checklist. The engine shapes these into checklist
// items (week-stamped id, weekly cadence, "this week" category).
export const SPOTLIGHT_TASKS = [
  {
    id: "fresh-photo",
    title: "Take a fresh photo of {pet}",
    why: "A current photo helps enormously if they ever go missing — and side-by-side photos catch slow changes in weight or coat.",
  },
  {
    id: "id-tag",
    title: "Check {pet}'s ID tag is readable and the number is current",
    why: "A worn or out-of-date tag is the difference between a quick reunion and a long, frightening one.",
  },
  {
    id: "emergency-vet",
    title: "Save your nearest 24-hour emergency vet in your phone",
    why: "Most clinics close evenings and weekends. You don't want to be searching for one at 2 a.m.",
  },
  {
    id: "bowls-clean",
    title: "Scrub {pet}'s food and water bowls with hot, soapy water",
    why: "Bowls grow a slick biofilm fast — a real scrub, not just a rinse, keeps it down.",
  },
  {
    id: "meds-expiry",
    title: "Check the expiry dates on flea, tick, and heartworm preventatives",
    why: "Lapsed or expired preventatives leave a gap exactly when parasites are most active.",
  },
  {
    id: "lump-check",
    title: "Run your hands slowly over {pet}'s whole body, feeling for new lumps",
    why: "Hands find lumps weeks before eyes do. Note anything new to mention to your vet.",
  },
  {
    id: "bedding-wash",
    title: "Wash or rotate {pet}'s bedding",
    why: "Bedding collects dander, dust, and the odd flea egg. A wash resets it.",
  },
  {
    id: "recall-practice",
    species: ["dog"],
    title: "Practice {pet}'s recall somewhere quiet with a great reward",
    why: "A reliable recall is built in easy settings, long before you need it in a hard one.",
  },
  {
    id: "hazard-audit",
    title: "Pick one room and scan it at {pet}'s eye level for hazards",
    why: "Cords, small objects, and toxic plants look very different from down there.",
  },
  {
    id: "cue-refresher",
    species: ["dog"],
    title: "Run a five-minute refresher on one cue {pet} already knows",
    why: "Short, frequent practice keeps known cues sharp and keeps the two of you in sync.",
  },
  {
    id: "rest-spot",
    title: "Check {pet}'s favourite resting spot is clean, warm, and out of drafts",
    why: "Where a pet sleeps matters — a good spot supports their joints and lowers stress.",
  },
  {
    id: "nail-look",
    title: "Take a proper look at {pet}'s nails — any catching the floor or curling?",
    why: "Overgrown nails change how a pet stands and walks, and can grow into the pad.",
  },
  {
    id: "water-station",
    title: "Add or move a water bowl to a spot {pet} passes often",
    why: "More easy-to-reach water sources quietly nudge up daily intake — especially for cats.",
  },
  {
    id: "toy-rotate",
    title: "Rotate {pet}'s toys — put some away and bring others back out",
    why: "An old toy feels brand new again after a few weeks out of sight.",
  },
  {
    id: "scratch-check",
    species: ["cat"],
    title: "Check {pet}'s scratching posts are tall, sturdy, and well placed",
    why: "Cats scratch to stretch and mark. A wobbly post just gets ignored — for your furniture.",
  },
  {
    id: "car-kit",
    title: "Check what you keep in the car for {pet} — water, a spare leash, waste bags",
    why: "A small kit turns an unplanned stop or a long wait into a non-event.",
  },
  {
    id: "watch-normal",
    title: "Spend ten quiet minutes just watching {pet} — note what 'normal' looks like",
    why: "Knowing {pet}'s baseline posture and energy is what lets you spot 'off' early.",
  },
  {
    id: "vet-contact",
    title: "Save your regular vet's number and address into {pet}'s profile",
    why: "One tap to call or navigate beats hunting for it when you're stressed.",
  },
];

// ── Freshness tips ───────────────────────────────────────────────
// "Did you know" pool. The engine merges this with RULES_OF_THUMB
// (src/data/rulesOfThumb.js) so the combined corpus is large enough
// not to repeat for months. Same shape as RULES_OF_THUMB.
export const FRESHNESS_TIPS = [
  {
    id: "chip-number",
    species: ["dog", "cat"],
    title: "A microchip only works with a current phone number",
    body: "A chip is useless if the registry has a number that no longer rings. Updating it after a move takes two minutes online — and it's the single most-skipped step in pet recovery.",
  },
  {
    id: "treats-are-calories",
    species: ["dog", "cat"],
    title: "Treats count as calories",
    body: "Training treats and table scraps can quietly add 20%+ to a day's calories. Pull treats from the daily food measure, or use part of the kibble ration as rewards.",
  },
  {
    id: "sniffari",
    species: ["dog"],
    title: "Sniffing is a dog's idea of a good walk",
    body: "A walk where your dog gets to stop and sniff is far more satisfying to them than a faster, longer march. Let the nose lead sometimes — it tires a dog out mentally.",
  },
  {
    id: "food-water-apart",
    species: ["cat"],
    title: "Cats prefer their food and water apart",
    body: "In the wild, cats don't drink where they eat. Moving the water bowl away from the food — even to the next room — often noticeably increases how much a cat drinks.",
  },
  {
    id: "soft-eyes",
    species: ["dog", "cat"],
    title: "Learn what 'calm' looks like on your pet",
    body: "A relaxed pet has loose ears, a soft mouth, and easy eyes. Knowing your pet's calm baseline is what makes early tension — the stiff, still, wide-eyed look — easy to catch.",
  },
  {
    id: "permanent-teeth",
    species: ["dog"],
    title: "Puppy teeth fall out — adult teeth don't",
    body: "Dogs lose their baby teeth by around six months. After that, every chip or fracture is permanent, so match chew toys to the strength of the teeth (your thumbnail should dent it).",
  },
  {
    id: "vet-fund",
    species: ["dog", "cat"],
    title: "Budget for the vet before you need to",
    body: "Emergency care can run into the thousands. A dedicated savings buffer or pet insurance — set up before a crisis — keeps medical decisions from becoming money decisions.",
  },
  {
    id: "slow-food-switch",
    species: ["dog", "cat"],
    title: "New foods get introduced slowly",
    body: "Switch foods over about a week, mixing in a growing share of the new with the old. An abrupt change is one of the most common causes of an upset stomach.",
  },
  {
    id: "vertical-space",
    species: ["cat"],
    title: "Vertical space matters to cats",
    body: "Cats feel safest with a high vantage point. A cat tree or a cleared shelf gives them somewhere to retreat to and survey from — especially valuable in a busy household.",
  },
  {
    id: "flat-face-heat",
    species: ["dog"],
    title: "Heat hits flat-faced breeds fast",
    body: "Brachycephalic dogs (Pugs, Bulldogs, Frenchies, Boxers) overheat far quicker than other breeds. On warm days, exercise early or late, and watch their breathing closely.",
  },
  {
    id: "brushing-beats-chews",
    species: ["dog", "cat"],
    title: "Dental chews help — brushing helps more",
    body: "Dental chews and water additives reduce plaque, but daily brushing with pet-safe toothpaste is what genuinely protects the gums. Even a few times a week beats none.",
  },
  {
    id: "routine-anchors",
    species: ["dog", "cat"],
    title: "Pets read your routine",
    body: "Pets thrive on predictable rhythms — meals, walks, and bedtime around the same times each day. A steady routine lowers anxiety, especially for a rescue still settling in.",
  },
  {
    id: "exercise-to-breed",
    species: ["dog"],
    title: "Match exercise to the breed, not the calendar",
    body: "A working breed and a companion breed have very different needs. An under-exercised high-energy dog often looks like a 'behaviour problem' that's really an unmet need.",
  },
  {
    id: "litter-box-math",
    species: ["cat"],
    title: "Litter boxes: one per cat, plus one",
    body: "The rule of thumb is one litter box per cat plus a spare, in separate quiet spots. Too few boxes is a leading reason cats start going outside the box.",
  },
];
