/**
 * Object catalogue: the *logical* definition of every placeable type.
 *
 * A type describes behaviour and default logical dimensions (the collision / footprint volume used by
 * the editor, snapping and export). The `model` is only a visual representation: it is fitted into the
 * logical box at runtime, so logical data never depends on mesh complexity.
 *
 * placement:
 *   floor    - stands on the floor (or on a supporting surface, see `stackable`)
 *   wall     - floor-standing but normally backed against a wall (auto wall snap + orientation)
 *   mounted  - hangs on a wall at an elevation (sockets, panels, AC units)
 *   opening  - cuts an opening in a wall (door, window); position is wall + offset
 */
export const CATEGORIES = [
  { id: 'enclosure', label: 'Enclosures' },
  { id: 'furniture', label: 'Furniture & work' },
  { id: 'opening', label: 'Doors & windows' },
  { id: 'technical', label: 'Technical' },
  { id: 'plant', label: 'Plants' },
];

const T = (def) => ({
  placement: 'floor', fit: 'stretch', stackable: false, supports: false, elevation: 0, resizable: true,
  enclosure: null, props: {}, ...def,
});

export const TYPES = {
  terrarium_arid: T({
    label: 'Glass terrarium', sub: 'Arid · sliding doors', category: 'enclosure', model: 'assets/models/terrarium_arid.glb',
    size: { w: 1.0, d: 0.5, h: 0.5 }, stackable: true, enclosure: 'glass',
    props: { occupied: true, lighting: true, animal: { species: 'Python regius', code: 'PR-01' } },
  }),
  terrarium_tropical: T({
    label: 'Tropical terrarium', sub: 'Bioactive · hinged doors', category: 'enclosure', model: 'assets/models/terrarium_tropical.glb',
    size: { w: 0.6, d: 0.45, h: 0.9 }, stackable: true, enclosure: 'tropical',
    props: { occupied: true, lighting: true, animal: { species: 'Correlophus ciliatus', code: 'CC-04' } },
  }),
  paludarium: T({
    label: 'Paludarium', sub: 'Rimless · on cabinet', category: 'enclosure', model: 'assets/models/paludarium.glb',
    size: { w: 1.2, d: 0.5, h: 1.4 }, placement: 'wall', enclosure: 'paludarium',
    props: { occupied: true, lighting: true, animal: { species: 'Dendrobates tinctorius', code: 'DT-02' } },
  }),
  rack_glass: T({
    label: 'Enclosure rack', sub: 'Steel · 6 glass tanks', category: 'enclosure', model: 'assets/models/rack_glass.glb',
    size: { w: 1.2, d: 0.5, h: 1.9 }, placement: 'wall', enclosure: 'rack',
    props: { occupied: true, lighting: true },
  }),
  rack_tubs: T({
    label: 'Tub rack system', sub: '14 tubs · heat tape', category: 'enclosure', model: 'assets/models/rack_tubs.glb',
    size: { w: 1.22, d: 0.62, h: 1.78 }, placement: 'wall', enclosure: 'tubs',
    props: { occupied: true, lighting: false, animal: { species: 'Python regius', code: 'Rack B' } },
  }),
  quarantine: T({
    label: 'Quarantine unit', sub: 'PVC · stainless trolley', category: 'enclosure', model: 'assets/models/quarantine.glb',
    size: { w: 0.9, d: 0.5, h: 1.14 }, enclosure: 'quarantine',
    props: { occupied: true, lighting: true, animal: { species: 'Python regius', code: 'Q-07' } },
  }),
  incubator: T({
    label: 'Incubator', sub: 'Cabinet · 4 shelves', category: 'enclosure', model: 'assets/models/incubator.glb',
    size: { w: 0.62, d: 0.6, h: 1.25 }, placement: 'wall', enclosure: 'incubator',
    props: { occupied: true, lighting: true, animal: { species: 'Clutch 2026-08', code: 'INC-1' } },
  }),
  stand_cabinet: T({
    label: 'Terrarium stand', sub: 'Cabinet · supports tanks', category: 'furniture', model: 'assets/models/stand_cabinet.glb',
    size: { w: 1.0, d: 0.5, h: 0.8 }, supports: true, placement: 'wall',
  }),
  workbench: T({
    label: 'Workbench', sub: 'Oak top · pegboard', category: 'furniture', model: 'assets/models/workbench.glb',
    size: { w: 1.8, d: 0.75, h: 1.95 }, placement: 'wall',
  }),
  sink_unit: T({
    label: 'Sink unit', sub: 'Stainless · splashback', category: 'furniture', model: 'assets/models/sink_unit.glb',
    size: { w: 0.9, d: 0.6, h: 0.9 }, placement: 'wall',
  }),
  shelving: T({
    label: 'Supply shelving', sub: 'Steel · 5 levels', category: 'furniture', model: 'assets/models/shelving.glb',
    size: { w: 1.2, d: 0.45, h: 1.9 }, placement: 'wall',
  }),
  storage_cabinet: T({
    label: 'Storage cabinet', sub: 'Steel · lockable', category: 'furniture', model: 'assets/models/storage_cabinet.glb',
    size: { w: 0.9, d: 0.5, h: 2.0 }, placement: 'wall',
  }),
  door: T({
    label: 'Door', sub: 'Steel · vision panel', category: 'opening', model: 'assets/models/door.glb',
    size: { w: 1.0, d: 0.14, h: 2.1 }, placement: 'opening', opening: { sill: 0 },
  }),
  window: T({
    label: 'Window', sub: 'Frosted · blinds', category: 'opening', model: 'assets/models/window_unit.glb',
    size: { w: 1.4, d: 0.14, h: 1.2 }, placement: 'opening', opening: { sill: 1.0 },
  }),
  control_panel: T({
    label: 'Control panel', sub: 'Distribution board', category: 'technical', model: 'assets/models/control_panel.glb',
    size: { w: 0.5, d: 0.16, h: 0.6 }, placement: 'mounted', elevation: 1.2,
  }),
  ac_unit: T({
    label: 'Air conditioner', sub: 'Split · wall unit', category: 'technical', model: 'assets/models/ac_unit.glb',
    size: { w: 0.9, d: 0.23, h: 0.3 }, placement: 'mounted', elevation: 2.25,
  }),
  dehumidifier: T({
    label: 'Dehumidifier', sub: 'Floor unit', category: 'technical', model: 'assets/models/dehumidifier.glb',
    size: { w: 0.4, d: 0.3, h: 0.62 },
  }),
  sensor: T({
    label: 'Climate sensor', sub: 'Temp / RH display', category: 'technical', model: 'assets/models/sensor.glb',
    size: { w: 0.1, d: 0.027, h: 0.1 }, placement: 'mounted', elevation: 1.5, resizable: false,
  }),
  outlet: T({
    label: 'Power outlet', sub: 'Double socket', category: 'technical', model: 'assets/models/outlet.glb',
    size: { w: 0.16, d: 0.015, h: 0.085 }, placement: 'mounted', elevation: 0.3, resizable: false,
  }),
  cable_tray: T({
    label: 'Cable tray', sub: 'Perforated · with drops', category: 'technical', model: 'assets/models/cable_tray.glb',
    size: { w: 3.8, d: 0.18, h: 0.06 }, placement: 'mounted', elevation: 2.35,
  }),
  info_board: T({
    label: 'Schedule board', sub: 'Husbandry whiteboard', category: 'technical', model: 'assets/models/info_board.glb',
    size: { w: 1.2, d: 0.02, h: 0.8 }, placement: 'mounted', elevation: 1.3,
  }),
  exit_sign: T({
    label: 'Exit sign', sub: 'Illuminated', category: 'technical', model: 'assets/models/exit_sign.glb',
    size: { w: 0.36, d: 0.05, h: 0.16 }, placement: 'mounted', elevation: 2.25, resizable: false,
  }),
  fire_extinguisher: T({
    label: 'Fire extinguisher', sub: 'CO₂ · wall bracket', category: 'technical', model: 'assets/models/fire_extinguisher.glb',
    size: { w: 0.16, d: 0.18, h: 0.6 }, placement: 'mounted', elevation: 0.5, resizable: false,
  }),
  plant_large: T({
    label: 'Philodendron', sub: 'Large planter', category: 'plant', model: 'assets/models/plant_large.glb',
    size: { w: 1.0, d: 1.03, h: 1.33 }, fit: 'uniform',
  }),
  plant_snake: T({
    label: 'Snake plant', sub: 'Tall planter', category: 'plant', model: 'assets/models/plant_snake.glb',
    size: { w: 0.45, d: 0.5, h: 1.0 }, fit: 'uniform',
  }),
  plant_fern: T({
    label: 'Fern', sub: 'Terracotta pot', category: 'plant', model: 'assets/models/plant_fern.glb',
    size: { w: 0.81, d: 0.92, h: 0.63 }, fit: 'uniform',
  }),
};

export function getType(id) { return TYPES[id] || null; }
export function typesByCategory(cat) { return Object.entries(TYPES).filter(([, t]) => t.category === cat).map(([id, t]) => ({ id, ...t })); }
