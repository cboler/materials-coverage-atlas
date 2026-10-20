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
} satisfies Record<string, Term>;

/** One-line, jargon-free meaning of each category (the technical rules are in the rules panel). */
export const CATEGORY_HELP: Record<string, string> = {
  structural:
    'Stiff enough to carry loads, or ("inferred") a stable, common-element mineral like those in cement and stone.',
  energy: 'Could store charge in a battery or absorb sunlight in a solar cell.',
  electronic_optical:
    'A semiconductor or transparent material: chips, LEDs, sensors, optical coatings.',
  magnetic: 'Keeps a net magnetic pull: candidates for magnets, motors and data storage.',
  unclassified:
    "Fits no rule: usually unstable, or missing the data needed to judge it. Not 'useless'.",
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
