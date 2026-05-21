// Mood catalog — drives the morning/night mood prompt and the per-mood
// guidance the app shows after a log. Each mood has:
//   id        — stable string key, written to the MoodLog record
//   label     — display name
//   emoji     — leading glyph
//   tone      — "positive" | "neutral" | "watch" — used by export view
//                to colorize entries and let the vet skim at a glance
//   blurb     — 1-line summary shown on the picker
//   guidance  — paragraph(s) shown after the user logs this mood. Mix
//                of "be-in-the-moment" affirmation and actionable
//                suggestions. NEVER medical advice — always framed as
//                "watch for / ask your vet / try this" so a friendly
//                read.
//
// Ordering: positive moods first, then neutral / quirky, then
// watch-list. Picker groups them visually by tone band.
export const MOODS = [
  {
    id: "happy",
    label: "Happy",
    emoji: "😊",
    tone: "positive",
    blurb: "Loose body, soft eyes, here for it",
    guidance:
      "Soak it in. A relaxed, happy floof is the whole point — meet them where they are. Belly rubs, a slow walk, or just sitting near them counts as enrichment when they're already content.",
  },
  {
    id: "silly",
    label: "Silly",
    emoji: "🤪",
    tone: "positive",
    blurb: "Zoomies, play bows, goofball energy",
    guidance:
      "Lean in! A few minutes of structured play (tug, fetch, snuffle game) channels the silly-bursts into something they can come down from. Avoid slippery floors — zoomie injuries are sneaky common.",
  },
  {
    id: "explorative",
    label: "Explorative",
    emoji: "🔎",
    tone: "positive",
    blurb: "Sniffing everything, ears forward, curious",
    guidance:
      "This is a sniffari day. Try a new route, a new park, or a scattered-treat search in the yard. Sniffing is more tiring than walking — 20 minutes of nose-work can settle a dog for hours.",
  },
  {
    id: "demanding",
    label: "Demanding",
    emoji: "🗣️",
    tone: "neutral",
    blurb: "Pawing, nudging, won't take 'wait' for an answer",
    guidance:
      "Run the checklist: water bowl, last potty break, last meal, recent movement. Met all those? Reward calm — wait for a quiet moment, then engage. Responding to the demand directly teaches them the demand works.",
  },
  {
    id: "bored",
    label: "Bored",
    emoji: "😑",
    tone: "neutral",
    blurb: "Listless, sighing, no spark today",
    guidance:
      "Try one of these — even 10 minutes counts:\n• A walk on a new street (smell-novelty > distance)\n• 5 minutes of training (sit, paw, find-it, name games)\n• A puzzle feeder or frozen Kong\n• Hide-and-seek with a high-value treat\nBoredom that lasts more than a few days, especially with reduced appetite, is worth mentioning to your vet.",
  },
  {
    id: "aloof",
    label: "Aloof",
    emoji: "😶",
    tone: "neutral",
    blurb: "Off in their own world, low engagement",
    guidance:
      "Some floofs are just independent — give them space without taking it personally. But if aloofness is a CHANGE from their usual baseline (especially with appetite or sleep changes), log it. Patterns matter more than single days.",
  },
  {
    id: "barking",
    label: "Barking",
    emoji: "🐕",
    tone: "neutral",
    blurb: "Vocal, alert, hard to settle",
    guidance:
      "First: is it alarm (window, doorbell), demand (you), or boredom? Each one has a different fix. Block the trigger if you can, redirect to a calm activity (lick mat, sniffing exercise), and mark/reward quiet moments. Persistent barking with no clear trigger can be pain — note it for your vet.",
  },
  {
    id: "restless",
    label: "Restless",
    emoji: "😣",
    tone: "watch",
    blurb: "Pacing, can't settle, looking for something",
    guidance:
      "Watch them today. Restlessness can be pre-storm anxiety, a bathroom emergency, mild GI upset, or pain. Look for: pacing in circles, repeated posture changes, panting at rest, repeatedly looking at their flank. If it lasts more than a few hours OR pairs with a skipped meal, call your vet.",
  },
  {
    id: "sad",
    label: "Sad",
    emoji: "🥺",
    tone: "watch",
    blurb: "Withdrawn, head low, less interested",
    guidance:
      "Pets pick up on changes — a household shift, a missing companion, weather, or YOUR mood. A quiet day or two is normal. But if sadness lasts 3+ days, especially with eating less, sleeping more, or hiding, it's worth a vet conversation. Pain often looks like sadness in dogs.",
  },
  {
    id: "frustrated",
    label: "Frustrated",
    emoji: "😤",
    tone: "watch",
    blurb: "Whining, snapping, can't get what they want",
    guidance:
      "Frustration is usually unmet need + no outlet. Slow down: figure out what they're trying to access, decide if it's something to grant, redirect, or wait out. Don't punish frustration — it teaches secrecy, not calm. If frustration → reactivity is escalating, a certified positive trainer is the right call.",
  },
  {
    id: "destructive",
    label: "Destructive",
    emoji: "🦴",
    tone: "watch",
    blurb: "Chewing, digging, shredding everything",
    guidance:
      "Destructive behavior is almost always: under-exercised, anxious, or teething (if young). Increase mental + physical work, give legal chew outlets (frozen carrots, antlers, lick mats), and crate-rest when you can't supervise. If it only happens when you're away, you may be looking at separation anxiety — that's a trainer + vet conversation.",
  },
];

export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m]));

// Slot decision: morning if local hour < 12, otherwise night. Used by
// the Home prompt to decide which slot is "due" for logging and by
// the mood-log list to label entries.
export function moodSlotFor(date = new Date()) {
  const h = new Date(date).getHours();
  return h < 12 ? "morning" : "night";
}
export const MOOD_SLOT_LABELS = { morning: "Morning", night: "Evening" };

// Render a YYYY-MM-DD key for a date, using local time. Used to dedupe
// logs per-day-per-slot.
export function moodDateKey(date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
