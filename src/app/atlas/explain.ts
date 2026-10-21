/**
 * Plain-language explanations for readers without a materials-science background.
 * One source for the guide, tooltips, detail card, legend and property-profile axes, so the
 * same term is always explained the same way. Reference values are rounded textbook figures.
 */

type Maybe<T> = T | null;

export interface Term {
  label: string;
  text: string;
}

export const TERMS = {
  band_gap: {
    label: 'Band gap',
    text:
      'How much energy it takes to free an electron so it can carry current. 0 eV: conducts like a ' +
      'metal. About 1–4 eV: a semiconductor (solar cells, LEDs, chips). Above 4 eV: an insulator ' +
      '(glass, ceramics). Computed gaps usually come out lower than lab measurements.',
  },
  formation_energy: {
    label: 'Formation energy',
    text:
      'Energy released when the compound forms from its pure elements, per atom. More negative ' +
      'means more strongly bonded and harder to break apart.',
  },
  e_above_hull: {
    label: 'Stability (energy above hull)',
    text:
      'How far the material sits above the most stable possible mix of the same elements. 0 means ' +
      'it is the most stable form; under about 0.05 eV/atom it can usually be made; above 0.1 it ' +
      'would tend to fall apart into other compounds.',
  },
  k_vrh: {
    label: 'Bulk modulus',
    text:
      'Resistance to being squeezed, in gigapascals (GPa). For scale: water about 2, aluminum 76, ' +
      'steel 160, diamond 440.',
  },
  g_vrh: {
    label: 'Shear modulus',
    text:
      'Resistance to being bent or twisted out of shape (GPa), the main measure of stiffness for ' +
      'anything that bears a load. For scale: aluminum about 26, steel 80, diamond 530.',
  },
  elastic: {
    label: 'Elastic data',
    text:
      'The bulk and shear moduli together, i.e. how stiff the material is. Materials Project has ' +
      'computed them for only a small fraction of materials, which is the biggest gap this atlas shows.',
  },
  theoretical: {
    label: 'Lab-made or predicted',
    text:
      '"Made in a lab" means its crystal structure matches one recorded experimentally (in the ' +
      'ICSD database). "Predicted only" means it exists so far only as a computer simulation.',
  },
  ordering: {
    label: 'Magnetic order',
    text:
      "How the atoms' tiny magnets line up. FM: all aligned, like a fridge magnet. FiM: partly " +
      'cancelling but still magnetic (ferrites). AFM: fully cancelling. NM: not magnetic.',
  },
  cost: {
    label: 'Element cost',
    text:
      'Raw price of the elements in 1 kg of the material, weighted by mass. It ignores mining and ' +
      'processing, so real products cost more.',
  },
  abundance: {
    label: 'Scarcest element',
    text:
      "How common the rarest element in the formula is in Earth's crust, in parts per million " +
      '(ppm). For scale: oxygen about 461,000, copper 60, gold 0.004.',
  },
  category: {
    label: 'Category',
    text:
      'A rough guess at what the material could be useful for, from simple rules on its computed ' +
      'properties. It is a screening hint, not a verdict; see "Category rules" below.',
  },
  structural_basis: {
    label: 'Structural basis',
    text:
      'Why a material counts as structural. "Verified": its computed stiffness passes the rule. ' +
      '"Inferred": it has no usable stiffness data (never calculated, or the calculation gave an ' +
      'impossible value), so it was judged from its composition and stability instead.',
  },
  structural_candidate: {
    label: 'Structural candidate',
    text:
      'Picked by a rule that never looks at stiffness: stable, made of common elements, and either ' +
      'a wide-gap oxide mineral or a metal such as iron, aluminum or titanium. Because stiffness ' +
      'plays no part, the share of candidates with stiffness data is a fair measure of coverage.',
  },
  unclassified_reason: {
    label: 'Why unclassified',
    text:
      'What keeps a material out of every category, closest to qualifying first: a missing ' +
      'stiffness calculation, stability alone, cost or scarcity alone, calculated as too soft, ' +
      'or more than one thing. See the breakdown under "Coverage by category".',
  },
} satisfies Record<string, Term>;

/** One-line, jargon-free meaning of each category (the technical rules are in the rules panel). */
export const CATEGORY_HELP: Record<string, string> = {
  structural:
    'Stiff enough to carry loads ("verified" by stiffness data), or ("inferred", no usable stiffness data) a stable, common-element mineral or metal like those in cement, stone and steel.',
  structural_metallic:
    'Metals and alloys (steel, aluminum, titanium, copper and their relatives) that are stiff enough to carry loads ("verified" by stiffness data) or, with no usable stiffness data, look like common structural alloys ("inferred"). All cost ≤ $100/kg and use common elements.',
  structural_ceramic:
    'Minerals and ceramics (oxides, silicates, carbonates, carbides) that are stiff enough to carry loads ("verified") or, with no usable stiffness data, are stable common-element oxides like those in cement and stone ("inferred"). All cost ≤ $100/kg and use common elements.',
  structural_candidate:
    'The fair structural population: stable oxides and metals made of common elements, picked without looking at stiffness.',
  energy: 'Could store charge in a battery or absorb sunlight in a solar cell.',
  electronic_optical:
    'A semiconductor or transparent material: chips, LEDs, sensors, optical coatings.',
  magnetic: 'Keeps a net magnetic pull: candidates for magnets, motors and data storage.',
  unclassified:
    "Fits no rule: usually unstable, or missing the data needed to judge it. Not 'useless'.",
};

/**
 * Why an unclassified material fits no rule, keyed like meta.unclassified_reasons and ordered from
 * closest to qualifying to farthest (pipeline/categories.py, unclassified_reasons).
 */
export const UNCLASSIFIED_REASON_TEXT: Record<string, Term> = {
  needs_stiffness: {
    label: 'One stiffness calculation away',
    text:
      'Stable, cheap and made of common elements, but its stiffness was never calculated (or the ' +
      'calculation failed). If it turns out stiff (shear 25 GPa or more), it counts as structural.',
  },
  stability_only: {
    label: 'Held back only by stability',
    text:
      'Would fit a category if it were more stable. As computed, it sits too far above the most ' +
      'stable mix of its elements to count.',
  },
  supply_only: {
    label: 'Held back only by cost or scarcity',
    text: "Stable, and would fit a category if its elements cost under $100/kg and none were rarer than 10 ppm in Earth's crust (or if the price or abundance were known). Many are stiff compounds of precious or rare-earth metals.",
  },
  too_soft: {
    label: 'Calculated, too soft',
    text: 'Stable and cheap, and its stiffness was calculated: too soft to carry loads (shear under 25 GPa).',
  },
  stable_no_rule: {
    label: 'Stable, but no single fix',
    text:
      'Stable, but more than one thing keeps it out, so no single change would make it fit. ' +
      'Mostly metals of costly or scarce elements with no stiffness data.',
  },
  unstable_no_rule: {
    label: 'Unstable, and fits no rule',
    text: 'Would tend to fall apart, and would fit no category even if it were stable (or its stability is unknown).',
  },
};

export function describeGap(gap: Maybe<number>): string {
  if (gap === null) return 'unknown';
  if (gap <= 0) return 'conducts like a metal';
  if (gap <= 4) return 'semiconductor';
  return 'insulator';
}

export function describeStability(eAboveHull: Maybe<number>): string {
  if (eAboveHull === null) return 'unknown';
  if (eAboveHull <= 0.001) return 'most stable form';
  if (eAboveHull <= 0.05) return 'likely makeable';
  if (eAboveHull <= 0.1) return 'borderline';
  return 'unstable: would tend to decompose';
}

/** Shear modulus compared with familiar metals; values outside physical bounds are flagged. */
export function describeStiffness(shear: Maybe<number>): string {
  if (shear === null) return 'not computed';
  if (shear <= 0 || shear > 600) return 'unphysical value (calculation problem)';
  if (shear < 26) return 'softer than aluminum';
  if (shear < 80) return 'between aluminum and steel';
  return 'stiffer than steel';
}

export function describeOrigin(theoretical: boolean): string {
  return theoretical ? 'Predicted only' : 'Made in a lab';
}
