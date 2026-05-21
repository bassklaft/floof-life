// Condition guides — supportive, vet-safe guidance for pet parents
// whose floof has been diagnosed with a chronic / lifelong condition.
//
// This is NOT medical advice and NOT a diagnosis tool. Every guide is
// written for an owner who ALREADY has a diagnosis from their vet, and
// frames everything as "here's how to care well + what to bring to
// your vet" — never treatment, dosing, or prognosis numbers.
//
// Content principles (per FloofLife house style):
//   - Serious + audit-quality — a vet could read it without wincing.
//   - Contested points get both sides (e.g. FIV cohabitation).
//   - Reassuring where reassurance is honest — a diagnosis is a reason
//     to care attentively, not to panic.
//
// Each guide has ordered `sections` ({ title, body }). Body is plain
// text; lines starting with "• " render as bullets in the UI.

export const CONDITIONS = [
  {
    id: "fiv",
    label: "FIV (Feline Immunodeficiency Virus)",
    shortLabel: "FIV",
    species: "cat",
    emoji: "🐈",
    oneLiner: "A lifelong but manageable virus. Most FIV+ cats live long, comfortable lives with steady day-to-day care.",
    sections: [
      {
        title: "What FIV is",
        body:
          "FIV is a cat-only retrovirus that slowly weakens the immune system over years. It cannot infect people or dogs — only cats.\n\n" +
          "Many FIV+ cats stay healthy and symptom-free for a long time, often a normal lifespan. The virus itself usually isn't what causes trouble — it's the secondary infections an under-defended immune system can't shrug off as easily. That's why attentive preventive care, more than anything else, is what keeps an FIV+ cat thriving.",
      },
      {
        title: "Living with other cats",
        body:
          "FIV spreads mainly through deep bite wounds — the kind from serious fights, not from everyday contact. Sharing food bowls, water, litter boxes, beds, and mutual grooming carry very low risk.\n\n" +
          "Two views are worth knowing:\n" +
          "• The cautious view: keep FIV+ and FIV- cats fully separated, removing any chance of transmission.\n" +
          "• The current consensus (American Association of Feline Practitioners): FIV+ and FIV- cats can usually share a home safely when the household is stable and the cats don't fight. Neutering and a calm, well-resourced home — enough litter boxes, feeding stations, and resting spots — make fighting unlikely.\n\n" +
          "Talk your specific household through with your vet; the right call depends on your cats' temperaments.",
      },
      {
        title: "Day-to-day care",
        body:
          "• Keep them indoors — it protects an FIV+ cat from infections outdoors and keeps the virus away from neighborhood cats.\n" +
          "• Feed a complete, balanced diet. Most vets advise against raw food for FIV+ cats, since a weakened immune system handles foodborne bacteria less well.\n" +
          "• Keep stress low — stress suppresses immune function. Predictable routines, hiding spots, and calm introductions all help.\n" +
          "• Stay current on flea, tick, and worm prevention — parasites add load to the immune system.\n" +
          "• Spay/neuter if not already done — it reduces roaming and the drive to fight.",
      },
      {
        title: "What to watch for",
        body:
          "FIV+ cats can go downhill faster than healthy cats when something is wrong, so it's worth calling the vet sooner rather than waiting it out. Reach out if you notice:\n" +
          "• Mouth trouble — drooling, bad breath, pawing at the mouth, or eating less. Gum inflammation is especially common with FIV.\n" +
          "• Weight loss, or a dull, poor coat.\n" +
          "• Persistent low energy, fever, or hiding more than usual.\n" +
          "• Infections that recur or are slow to heal — skin, eyes, ears, or respiratory.\n" +
          "• Swollen lymph nodes, chronic diarrhea, or changes in the eyes.\n\n" +
          "A minor symptom in an FIV+ cat deserves a quicker phone call than it would in a healthy cat.",
      },
      {
        title: "Vet rhythm",
        body:
          "Most vets recommend wellness visits every 6 months for FIV+ cats rather than once a year — twice-yearly check-ins catch problems while they're still small. Visits usually include a weight check, a thorough exam, and periodic bloodwork.\n\n" +
          "Dental care matters a lot here: FIV+ cats are prone to painful gum disease, so regular dental checks — and cleanings when your vet advises — are part of keeping them comfortable.\n\n" +
          "Vaccines are worth a specific conversation with your vet, who may tailor the schedule to your cat.",
      },
      {
        title: "The reassuring part",
        body:
          "FIV is not a death sentence, and it is nothing you or your other pets can catch. Plenty of FIV+ cats live full, happy lives and reach old age. What makes the difference is steady, attentive care: indoors, low stress, good food, and a vet who sees them twice a year.\n\n" +
          "FIV is also not the same as FeLV (Feline Leukemia). FeLV spreads more easily and tends to be more serious — the two are often tested together but are different conditions.",
      },
    ],
    resources: [
      "American Association of Feline Practitioners (AAFP) — retrovirus guidelines",
      "ASPCA — Feline Immunodeficiency Virus information",
      "Your veterinarian — the best source for your cat's specific situation",
    ],
  },
  {
    id: "felv",
    label: "FeLV (Feline Leukemia Virus)",
    shortLabel: "FeLV",
    species: "cat",
    emoji: "🐈",
    oneLiner: "A serious cat virus — but with attentive, low-stress care, many FeLV+ cats still have good quality of life.",
    sections: [
      {
        title: "What FeLV is",
        body:
          "FeLV is a cat-only retrovirus that affects the immune system and can lead to anemia, recurring infections, and certain cancers. It cannot infect people or dogs.\n\n" +
          "FeLV is generally more serious than FIV and spreads more easily. Some cats' immune systems fight it off; others become persistently infected. Your vet may repeat testing to confirm which category your cat is in, since that changes what to expect.",
      },
      {
        title: "Living with other cats",
        body:
          "FeLV spreads through saliva and close contact — mutual grooming, shared food and water bowls, bite wounds — and from a mother cat to her kittens. Because everyday contact can transmit it, most vets advise keeping FeLV+ cats separate from FeLV- cats.\n\n" +
          "Households where every cat is FeLV+, or where FeLV- cats are vaccinated and the owner accepts the residual risk, are sometimes an exception — but this is very much a household-specific decision to make with your vet.",
      },
      {
        title: "Day-to-day care",
        body:
          "• Keep them strictly indoors — for their protection and to prevent spread.\n" +
          "• Feed a complete, balanced diet; most vets advise against raw food.\n" +
          "• Keep stress low and routines predictable — stress is hard on the immune system.\n" +
          "• Stay current on parasite prevention.\n" +
          "• Spay/neuter if not already done.",
      },
      {
        title: "What to watch for",
        body:
          "Call your vet promptly if you notice:\n" +
          "• Pale gums, weakness, or fast breathing — these can point to anemia.\n" +
          "• Weight loss, poor appetite, or a dull coat.\n" +
          "• Persistent fever, lethargy, or hiding.\n" +
          "• Recurring or slow-to-heal infections.\n" +
          "• Swollen lymph nodes or any new lump.\n\n" +
          "As with FIV, a small symptom warrants a quicker call than it would in a healthy cat.",
      },
      {
        title: "Vet rhythm",
        body:
          "Wellness visits every 6 months are the usual recommendation, with bloodwork and a weight check at each. Dental health and prompt attention to any infection are key parts of keeping a FeLV+ cat comfortable.",
      },
      {
        title: "The reassuring part",
        body:
          "A FeLV diagnosis is hard news, but it is not an immediate emergency and not an automatic reason for euthanasia. Many FeLV+ cats enjoy months to years of good life with attentive care. Focus on comfort, low stress, and a vet who knows their history — and lean on that vet for the questions only they can answer for your cat.",
      },
    ],
    resources: [
      "American Association of Feline Practitioners (AAFP) — retrovirus guidelines",
      "ASPCA — Feline Leukemia Virus information",
      "Your veterinarian — the best source for your cat's specific situation",
    ],
  },
];

export const CONDITION_BY_ID = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));

// Catalog entries appropriate for a pet's species.
export function conditionsForSpecies(species) {
  const sp = (species || "").toLowerCase();
  return CONDITIONS.filter((c) => c.species === sp);
}
