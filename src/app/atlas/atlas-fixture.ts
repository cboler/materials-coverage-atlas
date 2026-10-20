import { Atlas } from './atlas-data';

// Shared unit-test fixture. Four materials: a stiff experimental oxide, a theoretical magnet, a PV semiconductor with no
// supply data, and an unclassified entry.
export const FIXTURE: Atlas = {
  meta: {
    source: 'test',
    database_version: '2025.01.01',
    fetched_at: '2025-01-02T00:00:00+00:00',
    generated_at: '2025-01-02T00:00:00+00:00',
    count: 4,
    sampled: false,
    coord_scale: 10000,
    categories: ['structural', 'energy', 'electronic_optical', 'magnetic', 'unclassified'],
    orderings: ['NM', 'FM', 'FiM', 'AFM', 'Unknown'],
    rules: { structural: 'stiff', priority: 'magnetic first' },
  },
  columns: {
    id: ['mp-1143', 'mp-13', 'mp-2534', 'mp-9'],
    formula: ['Al2O3', 'Fe', 'GaAs', 'Xx'],
    x: [0, 10000, 5000, 2000],
    y: [0, 4000, 8000, 1000],
    category: [0, 3, 1, 4],
    labels: [0b0001, 0b1001, 0b0110, 0],
    theoretical: [0, 1, 0, 1],
    band_gap: [5.9, 0, 1.4, null],
    formation_energy: [-3.4, 0, -0.4, null],
    e_above_hull: [0, 0, 0, 0.5],
    k_vrh: [232, 170, null, null],
    g_vrh: [147, 80, null, null],
    ordering: [0, 1, 0, 4],
    cost: [1.9, 0.4, null, 5e5],
    abundance: [82300, 56300, null, 0.005],
    scarcest: ['Al', 'Fe', null, 'Xx'],
  },
  anchors: [{ name: 'Corundum', material_id: 'mp-1143', index: 0, similar: [2, 1, 3] }],
};
