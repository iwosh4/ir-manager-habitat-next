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
 *   mounted  - hangs on a wall at an elevation (sockets, panels, AC units, wall shelves)
 *   opening  - cuts an opening in a wall (door, window); position is wall + offset
 *
 * Habitat Studio 4.2:
 *   parametric  the object is generated procedurally from its logical size + props in BOTH render modes
 *               (Planner and Showcase draw the same model — e.g. a window with blinds NONE never shows
 *               blinds anywhere)
 *   builder     procedural builder id (several catalogue entries share one builder with different props)
 *   options     properties panel schema: only what applies to the type is shown
 *   ports       technical ports { NAME: { kind, dir, at:[x,y,z] (fractions of the box), label } }
 *   device      the object is a technical device (stable tech.deviceId, user ports)
 *   tags        extra search words
 */
export const CATEGORIES = [
  { id: 'room', label: 'Room', chip: 'Room' },
  { id: 'doors', label: 'Doors', chip: 'Door' },
  { id: 'windows', label: 'Windows', chip: 'Window' },
  { id: 'furniture', label: 'Furniture', chip: 'Furniture' },
  { id: 'storage', label: 'Storage', chip: 'Storage' },
  { id: 'decor', label: 'Decor', chip: 'Decor' },
  { id: 'plants', label: 'Plants', chip: 'Plant' },
  { id: 'enclosures', label: 'Enclosures (starting templates)', chip: 'Enclosure' },
  { id: 'breeding', label: 'Breeding', chip: 'Breeding' },
  { id: 'water', label: 'Water', chip: 'Water' },
  { id: 'misting', label: 'Misting', chip: 'Misting' },
  { id: 'drainage', label: 'Drainage', chip: 'Drainage' },
  { id: 'electrical', label: 'Electrical', chip: 'Electrical' },
  { id: 'sensors', label: 'Sensors', chip: 'Sensor' },
];

const T = (def) => ({
  placement: 'floor', fit: 'stretch', stackable: false, supports: false, elevation: 0, resizable: true,
  enclosure: null, props: {}, ...def,
});
/** Procedural type (same model in Planner and Showcase). */
const P = (def) => T({ model: null, parametric: true, ...def });

// ------------------------------------------------------------------ shared option sets (properties panel)
export const DECORS = { black: 'Black', white: 'White', anthracite: 'Anthracite', grey: 'Grey', oak: 'Oak', light_oak: 'Light oak', dark_wood: 'Dark wood', walnut: 'Walnut', steel: 'Steel' };
const pickD = (...k) => Object.fromEntries(k.map((x) => [x, DECORS[x]]));
const O = {
  decor: (keys = ['black', 'white', 'anthracite', 'oak', 'dark_wood'], label = 'Colour / decor', key = 'props.decor') => ({ key, label, type: 'select', choices: pickD(...keys) }),
  potColor: { key: 'props.pot', label: 'Pot', type: 'select', choices: { black: 'Black', anthracite: 'Anthracite', white: 'White', terracotta: 'Terracotta' } },
  plantSize: (sizes) => ({ key: 'props.plantSize', label: 'Size', type: 'select', choices: { small: 'Small', medium: 'Medium', large: 'Large' }, sizes }),
  frame: { key: 'props.frame', label: 'Frame', type: 'select', choices: { white: 'White', black: 'Black', anthracite: 'Anthracite', wood: 'Wood', steel: 'Steel' } },
};
const DOOR_OPTIONS = [
  { key: 'props.style', label: 'Door type', type: 'select', choices: { interior: 'Classic interior', solid: 'Solid technical', steel: 'Steel · vision panel', glazed: 'Glazed', sliding: 'Sliding' } },
  O.decor(['white', 'black', 'anthracite', 'grey', 'oak', 'light_oak', 'dark_wood', 'walnut', 'steel'], 'Leaf colour / decor'),
  O.frame,
  { key: 'props.hinge', label: 'Hinge side', type: 'select', choices: { left: 'Left', right: 'Right' } },
  { key: 'props.open', label: 'Open', type: 'toggle', hint: 'show the leaf open' },
];
const WINDOW_OPTIONS = [
  { key: 'props.glass', label: 'Glass', type: 'select', choices: { clear: 'Clear', frosted: 'Frosted', tinted: 'Tinted' } },
  O.frame,
  { key: 'props.blinds', label: 'Blinds', type: 'select', choices: { none: 'None', venetian: 'Venetian (horizontal)', roller: 'Roller' } },
  { key: 'props.blindsEnabled', label: 'Blinds enabled', type: 'toggle', when: (p) => p.blinds !== 'none' },
  { key: 'props.blindsPos', label: 'Blinds position', type: 'select', choices: { top: 'Top', bottom: 'Bottom' }, when: (p) => p.blinds !== 'none' },
  { key: 'props.blindsOpen', label: 'Open amount', type: 'range', min: 0, max: 100, step: 5, unit: '%', when: (p) => p.blinds !== 'none' },
  { key: 'props.blindsAngle', label: 'Slat angle', type: 'range', min: -80, max: 80, step: 5, unit: '°', when: (p) => p.blinds === 'venetian' },
  { key: 'props.blindsMount', label: 'Mounting', type: 'select', choices: { inside: 'Inside (room side)', outside: 'Outside' }, when: (p) => p.blinds !== 'none' },
];
const DOOR_PROPS = { style: 'interior', decor: 'white', frame: 'white', hinge: 'right', open: false };
const WINDOW_PROPS = { glass: 'clear', frame: 'white', blinds: 'none', blindsEnabled: true, blindsPos: 'top', blindsOpen: 60, blindsAngle: 0, blindsMount: 'inside' };
const TABLE_OPTIONS = [O.decor(['black', 'white', 'anthracite', 'oak', 'dark_wood', 'walnut'], 'Top colour / decor'), O.decor(['black', 'white', 'anthracite', 'steel'], 'Legs / frame', 'props.frame')];
const CABINET_OPTIONS = [O.decor(['black', 'white', 'anthracite', 'grey', 'oak', 'dark_wood', 'walnut'])];
const SHELF_OPTIONS = [O.decor(['black', 'white', 'anthracite', 'oak', 'light_oak', 'dark_wood', 'walnut'], 'Board colour / decor'), { key: 'props.brackets', label: 'Brackets', type: 'select', choices: { black: 'Black', white: 'White', steel: 'Steel', hidden: 'Hidden' } }];
const DEV_COLOR = [O.decor(['white', 'black', 'anthracite', 'grey'], 'Housing colour')];

// ------------------------------------------------------------------ ports (technical network)
const port = (kind, dir, at, label) => ({ kind, dir, at, label });
const PORTS = {
  tank: { WATER_IN: port('water', 'in', [-0.2, 1, 0], 'Water in'), WATER_OUT: port('water', 'out', [0.3, 0.08, 0.5], 'Water out'), OVERFLOW_OUT: port('drain', 'out', [-0.4, 0.9, 0.5], 'Overflow') },
  pumpW: { WATER_IN: port('water', 'in', [-0.5, 0.35, 0], 'Suction'), WATER_OUT: port('water', 'out', [0.5, 0.6, 0], 'Pressure out'), POWER: port('power', 'in', [0, 0.5, -0.5], 'Power') },
  pumpM: { WATER_IN: port('water', 'in', [-0.5, 0.3, 0], 'Water in'), MIST_OUT: port('mist', 'out', [0.5, 0.6, 0], 'High-pressure out'), POWER: port('power', 'in', [0, 0.5, -0.5], 'Power') },
  inline: (kind) => ({ IN: port(kind, 'in', [-0.5, 0.5, 0], 'In'), OUT: port(kind, 'out', [0.5, 0.5, 0], 'Out') }),
  manifold: { IN: port('mist', 'in', [-0.5, 0.5, 0], 'In'), OUT_1: port('mist', 'out', [-0.3, 0, 0.3], 'Out 1'), OUT_2: port('mist', 'out', [-0.1, 0, 0.3], 'Out 2'), OUT_3: port('mist', 'out', [0.1, 0, 0.3], 'Out 3'), OUT_4: port('mist', 'out', [0.3, 0, 0.3], 'Out 4') },
  solenoid: { IN: port('mist', 'in', [-0.5, 0.4, 0], 'In'), OUT: port('mist', 'out', [0.5, 0.4, 0], 'Out'), POWER: port('power', 'in', [0, 1, 0], 'Coil power') },
  flow: { IN: port('water', 'in', [-0.5, 0.5, 0], 'In'), OUT: port('water', 'out', [0.5, 0.5, 0], 'Out'), SIGNAL: port('signal', 'out', [0, 1, 0], 'Pulse output') },
  drainIn: { DRAIN_IN: port('drain', 'in', [0, 0.5, 0], 'Drain in') },
  drainInline: { DRAIN_IN: port('drain', 'in', [-0.5, 0.5, 0], 'In'), DRAIN_OUT: port('drain', 'out', [0.5, 0.5, 0], 'Out') },
  panel: { POWER_OUT_1: port('power', 'out', [-0.3, 0, 0.3], 'Circuit 1'), POWER_OUT_2: port('power', 'out', [-0.1, 0, 0.3], 'Circuit 2'), POWER_OUT_3: port('power', 'out', [0.1, 0, 0.3], 'Circuit 3'), POWER_OUT_4: port('power', 'out', [0.3, 0, 0.3], 'Circuit 4') },
  outlet: { POWER_OUT_1: port('power', 'out', [-0.25, 0.5, 0.5], 'Socket 1'), POWER_OUT_2: port('power', 'out', [0.25, 0.5, 0.5], 'Socket 2') },
  strip: { POWER_IN: port('power', 'in', [-0.5, 0.5, 0], 'Mains in'), POWER_OUT_1: port('power', 'out', [-0.3, 1, 0], 'Out 1'), POWER_OUT_2: port('power', 'out', [-0.1, 1, 0], 'Out 2'), POWER_OUT_3: port('power', 'out', [0.1, 1, 0], 'Out 3'), POWER_OUT_4: port('power', 'out', [0.3, 1, 0], 'Out 4') },
  controller: { POWER_IN: port('power', 'in', [-0.5, 0.2, 0], 'Mains in'), POWER_OUT_1: port('power', 'out', [-0.3, 0, 0.3], 'Heat'), POWER_OUT_2: port('power', 'out', [-0.1, 0, 0.3], 'Light'), POWER_OUT_3: port('power', 'out', [0.1, 0, 0.3], 'Mist'), POWER_OUT_4: port('power', 'out', [0.3, 0, 0.3], 'Fan'), SENSOR_1: port('signal', 'in', [0.5, 0.3, 0], 'Sensor 1'), SENSOR_2: port('signal', 'in', [0.5, 0.6, 0], 'Sensor 2') },
  relay: { POWER_IN: port('power', 'in', [-0.5, 0.5, 0], 'Supply'), SIGNAL_IN: port('signal', 'in', [-0.5, 0.2, 0], 'Control in'), RELAY_1: port('power', 'out', [-0.3, 0, 0.3], 'Relay 1'), RELAY_2: port('power', 'out', [-0.1, 0, 0.3], 'Relay 2'), RELAY_3: port('power', 'out', [0.1, 0, 0.3], 'Relay 3'), RELAY_4: port('power', 'out', [0.3, 0, 0.3], 'Relay 4') },
  pi: { POWER_IN: port('power', 'in', [-0.5, 0.5, 0], 'USB-C power'), GPIO_1: port('signal', 'out', [0.5, 0.5, -0.2], 'GPIO 1'), GPIO_2: port('signal', 'out', [0.5, 0.5, 0], 'GPIO 2'), SENSOR_IN: port('signal', 'in', [0.5, 0.5, 0.2], 'Sensor bus (1-wire / I²C)') },
  sensor: (label = 'Signal') => ({ SIGNAL_OUT: port('signal', 'out', [0, 0, 0], label) }),
  appliance: { POWER: port('power', 'in', [0.4, 0.1, -0.5], 'Power'), TEMP_SENSOR: port('signal', 'out', [-0.4, 0.7, -0.5], 'Temperature sensor') },
  hvac: { POWER: port('power', 'in', [0.45, 0.5, -0.5], 'Power'), DRAIN_OUT: port('drain', 'out', [-0.45, 0.1, -0.3], 'Condensate') },
};

export const TYPES = {
  terrarium_arid: T({
    label: 'Glass terrarium', sub: 'Arid · sliding doors', category: 'enclosures', model: 'assets/models/terrarium_arid.glb',
    size: { w: 1.0, d: 0.5, h: 0.5 }, stackable: true, enclosure: 'glass',
    props: { occupied: true, lighting: true, animal: { species: 'Python regius', code: 'PR-01' } },
  }),
  terrarium_tropical: T({
    label: 'Tropical terrarium', sub: 'Bioactive · hinged doors', category: 'enclosures', model: 'assets/models/terrarium_tropical.glb',
    size: { w: 0.6, d: 0.45, h: 0.9 }, stackable: true, enclosure: 'tropical',
    props: { occupied: true, lighting: true, animal: { species: 'Correlophus ciliatus', code: 'CC-04' } },
  }),
  paludarium: T({
    label: 'Paludarium', sub: 'Rimless · on cabinet', category: 'enclosures', model: 'assets/models/paludarium.glb',
    size: { w: 1.2, d: 0.5, h: 1.4 }, placement: 'wall', enclosure: 'paludarium',
    props: { occupied: true, lighting: true, animal: { species: 'Dendrobates tinctorius', code: 'DT-02' } },
  }),
  rack_glass: T({
    label: 'Enclosure rack', sub: 'Steel · 6 glass tanks', category: 'enclosures', model: 'assets/models/rack_glass.glb',
    size: { w: 1.2, d: 0.5, h: 1.9 }, placement: 'wall', enclosure: 'rack',
    props: { occupied: true, lighting: true },
  }),
  rack_tubs: T({
    label: 'Tub rack system', sub: '14 tubs · heat tape', category: 'enclosures', model: 'assets/models/rack_tubs.glb',
    size: { w: 1.22, d: 0.62, h: 1.78 }, placement: 'wall', enclosure: 'tubs',
    props: { occupied: true, lighting: false, animal: { species: 'Python regius', code: 'Rack B' } },
  }),
  quarantine: T({
    label: 'Quarantine unit', sub: 'PVC · stainless trolley', category: 'enclosures', model: 'assets/models/quarantine.glb',
    size: { w: 0.9, d: 0.5, h: 1.14 }, enclosure: 'quarantine',
    props: { occupied: true, lighting: true, animal: { species: 'Python regius', code: 'Q-07' } },
  }),
  incubator: T({
    label: 'Incubator', sub: 'Cabinet · 4 shelves · white', category: 'breeding', model: 'assets/models/incubator.glb', parametric: true, builder: 'incubator',
    size: { w: 0.62, d: 0.6, h: 1.25 }, placement: 'wall', enclosure: 'incubator', device: true, ports: PORTS.appliance, tags: 'eggs clutch',
    props: { occupied: true, lighting: true, color: 'white', animal: { species: 'Clutch 2026-08', code: 'INC-1' } },
    options: [{ key: 'props.color', label: 'Housing', type: 'select', choices: { white: 'White', black: 'Black (premium)' } }],
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
    label: 'Supply shelving', sub: 'Steel · 5 levels', category: 'storage', model: 'assets/models/shelving.glb',
    size: { w: 1.2, d: 0.45, h: 1.9 }, placement: 'wall',
  }),
  storage_cabinet: T({
    label: 'Storage cabinet', sub: 'Steel · lockable', category: 'storage', model: 'assets/models/storage_cabinet.glb',
    size: { w: 0.9, d: 0.5, h: 2.0 }, placement: 'wall',
  }),
  door: T({
    label: 'Steel door', sub: 'Technical · vision panel', category: 'doors', model: 'assets/models/door.glb', parametric: true, builder: 'door',
    size: { w: 1.0, d: 0.14, h: 2.1 }, placement: 'opening', opening: { sill: 0 },
    props: { ...DOOR_PROPS, style: 'steel', decor: 'grey', frame: 'anthracite' }, options: DOOR_OPTIONS,
  }),
  window: T({
    label: 'Window', sub: 'Frosted · venetian blinds', category: 'windows', model: 'assets/models/window_unit.glb', parametric: true, builder: 'window',
    size: { w: 1.4, d: 0.14, h: 1.2 }, placement: 'opening', opening: { sill: 1.0 },
    props: { ...WINDOW_PROPS, glass: 'frosted', frame: 'steel', blinds: 'venetian', blindsOpen: 55 }, options: WINDOW_OPTIONS,
  }),
  control_panel: T({
    label: 'Electrical panel', sub: 'Distribution board', category: 'electrical', model: 'assets/models/control_panel.glb',
    size: { w: 0.5, d: 0.16, h: 0.6 }, placement: 'mounted', elevation: 1.2, device: true, ports: PORTS.panel, tags: 'breaker fuse board rozvaděč',
  }),
  ac_unit: T({
    label: 'Air conditioner', sub: 'Split · wall unit', category: 'room', model: 'assets/models/ac_unit.glb',
    size: { w: 0.9, d: 0.23, h: 0.3 }, placement: 'mounted', elevation: 2.25, device: true, ports: PORTS.hvac,
  }),
  dehumidifier: T({
    label: 'Dehumidifier', sub: 'Floor unit', category: 'room', model: 'assets/models/dehumidifier.glb',
    size: { w: 0.4, d: 0.3, h: 0.62 }, device: true, ports: PORTS.hvac,
  }),
  sensor: T({
    label: 'Climate sensor', sub: 'Temp / RH display', category: 'sensors', model: 'assets/models/sensor.glb',
    size: { w: 0.1, d: 0.027, h: 0.1 }, placement: 'mounted', elevation: 1.5, resizable: false, device: true, ports: { SIGNAL_OUT: port('signal', 'out', [0, 0, 0], 'Temp / RH'), POWER: port('power', 'in', [0, 0, -0.5], 'Power') },
  }),
  outlet: T({
    label: 'Power outlet', sub: 'Double socket', category: 'electrical', model: 'assets/models/outlet.glb',
    size: { w: 0.16, d: 0.015, h: 0.085 }, placement: 'mounted', elevation: 0.3, resizable: false, device: true, ports: PORTS.outlet, tags: 'socket zásuvka',
  }),
  cable_tray: T({
    label: 'Cable tray', sub: 'Perforated · with drops', category: 'electrical', model: 'assets/models/cable_tray.glb',
    size: { w: 3.8, d: 0.18, h: 0.06 }, placement: 'mounted', elevation: 2.35,
  }),
  info_board: T({
    label: 'Schedule board', sub: 'Husbandry whiteboard', category: 'decor', model: 'assets/models/info_board.glb',
    size: { w: 1.2, d: 0.02, h: 0.8 }, placement: 'mounted', elevation: 1.3,
  }),
  exit_sign: T({
    label: 'Exit sign', sub: 'Illuminated', category: 'decor', model: 'assets/models/exit_sign.glb',
    size: { w: 0.36, d: 0.05, h: 0.16 }, placement: 'mounted', elevation: 2.25, resizable: false,
  }),
  fire_extinguisher: T({
    label: 'Fire extinguisher', sub: 'CO₂ · wall bracket', category: 'decor', model: 'assets/models/fire_extinguisher.glb',
    size: { w: 0.16, d: 0.18, h: 0.6 }, placement: 'mounted', elevation: 0.5, resizable: false,
  }),
  plant_large: T({
    label: 'Philodendron', sub: 'Large planter', category: 'plants', model: 'assets/models/plant_large.glb',
    size: { w: 1.0, d: 1.03, h: 1.33 }, fit: 'uniform', props: { pot: 'black' }, options: [O.potColor], parametric: true,
  }),
  plant_snake: T({
    label: 'Sansevieria', sub: 'Snake plant · tall planter', category: 'plants', model: 'assets/models/plant_snake.glb',
    size: { w: 0.45, d: 0.5, h: 1.0 }, fit: 'uniform', props: { pot: 'white' }, options: [O.potColor], parametric: true, tags: 'snake plant tchýnin jazyk',
  }),
  plant_fern: T({
    label: 'Fern', sub: 'Terracotta pot', category: 'plants', model: 'assets/models/plant_fern.glb',
    size: { w: 0.81, d: 0.92, h: 0.63 }, fit: 'uniform', props: { pot: 'terracotta' }, options: [O.potColor], parametric: true, tags: 'kapradina',
  }),
};


// =================================================================================== Habitat Studio 4.2
// All new types are procedural (parametric) — identical in Planner and Showcase, sized by their logical box.
const plant = (label, sub, size, pot, tags) => P({
  label, sub, category: 'plants', size, fit: 'uniform', props: { pot, plantSize: 'medium' }, tags,
  options: [O.plantSize({ small: 0.6, medium: 1, large: 1.45 }), O.potColor],
});
Object.assign(TYPES, {
  // ------------------------------------------------------------------ doors
  door_interior: P({ label: 'Interior door', sub: 'Classic · white', category: 'doors', builder: 'door', size: { w: 0.9, d: 0.14, h: 2.05 }, placement: 'opening', opening: { sill: 0 }, props: { ...DOOR_PROPS }, options: DOOR_OPTIONS, tags: 'dveře' }),
  door_solid: P({ label: 'Solid technical door', sub: 'Anthracite · no glass', category: 'doors', builder: 'door', size: { w: 1.0, d: 0.14, h: 2.1 }, placement: 'opening', opening: { sill: 0 }, props: { ...DOOR_PROPS, style: 'solid', decor: 'anthracite', frame: 'black' }, options: DOOR_OPTIONS, tags: 'dveře black' }),
  door_black: P({ label: 'Black door', sub: 'Interior · black', category: 'doors', builder: 'door', size: { w: 0.9, d: 0.14, h: 2.05 }, placement: 'opening', opening: { sill: 0 }, props: { ...DOOR_PROPS, decor: 'black', frame: 'black' }, options: DOOR_OPTIONS, tags: 'dveře' }),
  door_wood: P({ label: 'Wooden door', sub: 'Oak decor', category: 'doors', builder: 'door', size: { w: 0.9, d: 0.14, h: 2.05 }, placement: 'opening', opening: { sill: 0 }, props: { ...DOOR_PROPS, decor: 'oak', frame: 'wood' }, options: DOOR_OPTIONS, tags: 'dveře dřevo' }),
  door_glazed: P({ label: 'Glazed door', sub: 'Full glass panel', category: 'doors', builder: 'door', size: { w: 0.9, d: 0.14, h: 2.05 }, placement: 'opening', opening: { sill: 0 }, props: { ...DOOR_PROPS, style: 'glazed', decor: 'black', frame: 'black' }, options: DOOR_OPTIONS, tags: 'dveře glass' }),
  door_sliding: P({ label: 'Sliding door', sub: 'Surface-mounted rail', category: 'doors', builder: 'door', size: { w: 1.0, d: 0.14, h: 2.1 }, placement: 'opening', opening: { sill: 0 }, props: { ...DOOR_PROPS, style: 'sliding', decor: 'oak', frame: 'black' }, options: DOOR_OPTIONS, tags: 'dveře posuvné' }),
  // ------------------------------------------------------------------ windows
  window_clear: P({ label: 'Window', sub: 'Clear glass · no blinds', category: 'windows', builder: 'window', size: { w: 1.2, d: 0.14, h: 1.3 }, placement: 'opening', opening: { sill: 0.9 }, props: { ...WINDOW_PROPS }, options: WINDOW_OPTIONS, tags: 'okno' }),
  window_roller: P({ label: 'Window with roller blind', sub: 'Anthracite frame', category: 'windows', builder: 'window', size: { w: 1.2, d: 0.14, h: 1.3 }, placement: 'opening', opening: { sill: 0.9 }, props: { ...WINDOW_PROPS, frame: 'anthracite', blinds: 'roller', blindsOpen: 40 }, options: WINDOW_OPTIONS, tags: 'okno roleta black' }),
  window_tall: P({ label: 'Tall window', sub: 'Black frame · tinted', category: 'windows', builder: 'window', size: { w: 0.9, d: 0.14, h: 1.9 }, placement: 'opening', opening: { sill: 0.5 }, props: { ...WINDOW_PROPS, frame: 'black', glass: 'tinted' }, options: WINDOW_OPTIONS, tags: 'okno black' }),
  // ------------------------------------------------------------------ furniture (tables)
  table_straight: P({ label: 'Table', sub: 'Straight · 4 legs', category: 'furniture', builder: 'table', size: { w: 1.4, d: 0.7, h: 0.75 }, placement: 'wall', supports: true, props: { decor: 'oak', frame: 'black' }, options: TABLE_OPTIONS, tags: 'stůl desk' }),
  table_long: P({ label: 'Long table', sub: '2.4 m · 6 legs', category: 'furniture', builder: 'table', size: { w: 2.4, d: 0.7, h: 0.75 }, placement: 'wall', supports: true, props: { decor: 'white', frame: 'anthracite' }, options: TABLE_OPTIONS, tags: 'stůl' }),
  table_tech: P({ label: 'Technical table', sub: 'Steel frame · lower shelf', category: 'furniture', builder: 'table', size: { w: 1.6, d: 0.8, h: 0.9 }, placement: 'wall', supports: true, props: { decor: 'anthracite', frame: 'steel', shelf: true }, options: [...TABLE_OPTIONS, { key: 'props.shelf', label: 'Lower shelf', type: 'toggle' }], tags: 'stůl workbench black' }),
  table_corner: P({ label: 'Corner table (L)', sub: 'Two editable arms', category: 'furniture', builder: 'table_corner', size: { w: 1.8, d: 1.4, h: 0.75 }, placement: 'wall', supports: false, props: { decor: 'oak', frame: 'black', armA: 0.7, armB: 0.6 },
    options: [...TABLE_OPTIONS, { key: 'props.armA', label: 'Arm A depth (along W)', type: 'num', unit: 'cm', scale: 100, min: 30, max: 150, step: 5 }, { key: 'props.armB', label: 'Arm B width (along D)', type: 'num', unit: 'cm', scale: 100, min: 30, max: 150, step: 5 }], tags: 'rohový stůl L desk' }),
  desk_cabinet: P({ label: 'Desk with cabinet', sub: 'Drawer pedestal', category: 'furniture', builder: 'desk', size: { w: 1.4, d: 0.7, h: 0.75 }, placement: 'wall', supports: true, props: { decor: 'white', frame: 'white', side: 'right' },
    options: [...TABLE_OPTIONS, { key: 'props.side', label: 'Cabinet side', type: 'select', choices: { left: 'Left', right: 'Right' } }], tags: 'stůl psací' }),
  // ------------------------------------------------------------------ storage
  shelf_single: P({ label: 'Wall shelf', sub: 'Single board', category: 'storage', builder: 'shelf', size: { w: 0.9, d: 0.25, h: 0.04 }, placement: 'mounted', elevation: 1.5, supports: true, props: { decor: 'oak', brackets: 'black', tiers: 1 }, options: SHELF_OPTIONS, tags: 'police' }),
  shelf_double: P({ label: 'Double wall shelf', sub: 'Two boards', category: 'storage', builder: 'shelf', size: { w: 0.9, d: 0.25, h: 0.4 }, placement: 'mounted', elevation: 1.3, props: { decor: 'black', brackets: 'black', tiers: 2 }, options: [...SHELF_OPTIONS, { key: 'props.tiers', label: 'Boards', type: 'num', min: 1, max: 6, step: 1 }], tags: 'police' }),
  shelf_multi: P({ label: 'Multi-tier wall shelf', sub: '4 boards · rails', category: 'storage', builder: 'shelf', size: { w: 1.0, d: 0.3, h: 1.2 }, placement: 'mounted', elevation: 0.8, props: { decor: 'white', brackets: 'steel', tiers: 4 }, options: [...SHELF_OPTIONS, { key: 'props.tiers', label: 'Boards', type: 'num', min: 2, max: 8, step: 1 }], tags: 'police regál' }),
  shelf_desk: P({ label: 'Shelf above desk', sub: 'Wall · with LED strip', category: 'storage', builder: 'shelf', size: { w: 1.2, d: 0.28, h: 0.05 }, placement: 'mounted', elevation: 1.25, supports: true, props: { decor: 'oak', brackets: 'hidden', tiers: 1, led: true }, options: [...SHELF_OPTIONS, { key: 'props.led', label: 'LED under-light', type: 'toggle' }], tags: 'police stůl' }),
  cabinet_hanging: P({ label: 'Hanging cabinet', sub: 'Wall · 2 doors', category: 'storage', builder: 'cabinet', size: { w: 0.8, d: 0.35, h: 0.6 }, placement: 'mounted', elevation: 1.5, props: { decor: 'white', doors: 2 }, options: CABINET_OPTIONS, tags: 'skříňka' }),
  cabinet_tall: P({ label: 'Tall cabinet', sub: '2 doors · 5 shelves', category: 'storage', builder: 'cabinet', size: { w: 0.8, d: 0.45, h: 2.0 }, placement: 'wall', props: { decor: 'anthracite', doors: 2 }, options: CABINET_OPTIONS, tags: 'skříň black' }),
  cabinet_low: P({ label: 'Low cabinet', sub: 'Sideboard · supports tanks', category: 'storage', builder: 'cabinet', size: { w: 1.2, d: 0.45, h: 0.8 }, placement: 'wall', supports: true, props: { decor: 'black', doors: 3 }, options: CABINET_OPTIONS, tags: 'komoda black' }),
  cabinet_tech: P({ label: 'Technical cabinet', sub: 'Vented · cable glands', category: 'storage', builder: 'cabinet', size: { w: 0.6, d: 0.4, h: 1.6 }, placement: 'wall', device: true, props: { decor: 'black', doors: 1, vented: true }, options: CABINET_OPTIONS, ports: { POWER_IN: port('power', 'in', [0.3, 1, -0.3], 'Mains in') }, tags: 'rozvaděč black technical' }),
  // ------------------------------------------------------------------ decor
  decor_frame: P({ label: 'Wall picture', sub: 'Framed print', category: 'decor', builder: 'picture', size: { w: 0.7, d: 0.03, h: 0.5 }, placement: 'mounted', elevation: 1.4, props: { decor: 'black' }, options: [O.decor(['black', 'white', 'oak'], 'Frame')], tags: 'obraz' }),
  decor_clock: P({ label: 'Wall clock', sub: 'Ø 30 cm', category: 'decor', builder: 'clock', size: { w: 0.3, d: 0.04, h: 0.3 }, placement: 'mounted', elevation: 2.0, resizable: false, props: { decor: 'black' }, options: [O.decor(['black', 'white'], 'Colour')], tags: 'hodiny' }),
  // ------------------------------------------------------------------ plants
  plant_monstera: plant('Monstera', 'Split leaves', { w: 0.8, d: 0.8, h: 1.2 }, 'anthracite', 'monstera deliciosa'),
  plant_pothos: plant('Pothos', 'Trailing · hanging pot', { w: 0.5, d: 0.5, h: 0.55 }, 'white', 'epipremnum šplhavnice'),
  plant_philodendron: plant('Philodendron', 'Heart leaves · medium', { w: 0.6, d: 0.6, h: 0.8 }, 'black', 'filodendron'),
  plant_ficus: plant('Ficus', 'Small tree', { w: 0.7, d: 0.7, h: 1.6 }, 'white', 'fíkus lyrata'),
  plant_palm: plant('Palm', 'Areca · fronds', { w: 0.9, d: 0.9, h: 1.7 }, 'terracotta', 'palma'),
  plant_fern_small: plant('Boston fern', 'Bushy fronds', { w: 0.6, d: 0.6, h: 0.55 }, 'black', 'kapradina fern'),
  plant_sansevieria: plant('Sansevieria', 'Compact', { w: 0.35, d: 0.35, h: 0.65 }, 'black', 'snake plant'),
  plant_table: plant('Table plant', 'Small · desk', { w: 0.2, d: 0.2, h: 0.28 }, 'white', 'stolní květina small'),
  // ------------------------------------------------------------------ breeding
  incubator_black: P({ label: 'Incubator BLACK', sub: 'Premium · glass door', category: 'breeding', builder: 'incubator', size: { w: 0.62, d: 0.6, h: 1.25 }, placement: 'wall', enclosure: 'incubator', device: true, ports: PORTS.appliance,
    props: { occupied: true, lighting: true, color: 'black', animal: { species: 'Clutch', code: 'INC-2' } }, options: [{ key: 'props.color', label: 'Housing', type: 'select', choices: { white: 'White', black: 'Black (premium)' } }], tags: 'inkubátor black eggs' }),
  wintering: P({ label: 'Wintering chamber BLACK', sub: 'Zimoviště · premium', category: 'breeding', builder: 'wintering', size: { w: 0.7, d: 0.65, h: 1.8 }, placement: 'wall', device: true, ports: PORTS.appliance, props: { color: 'black', glass: true },
    options: [{ key: 'props.color', label: 'Housing', type: 'select', choices: { black: 'Black (premium)', white: 'White' } }, { key: 'props.glass', label: 'Glass door', type: 'toggle' }], tags: 'zimoviště hibernation brumation black' }),
  wintering_white: P({ label: 'Wintering chamber', sub: 'Zimoviště · white', category: 'breeding', builder: 'wintering', size: { w: 0.6, d: 0.6, h: 1.45 }, placement: 'wall', device: true, ports: PORTS.appliance, props: { color: 'white', glass: false },
    options: [{ key: 'props.color', label: 'Housing', type: 'select', choices: { black: 'Black (premium)', white: 'White' } }, { key: 'props.glass', label: 'Glass door', type: 'toggle' }], tags: 'zimoviště hibernation' }),
  wintering_fridge: P({ label: 'Wintering fridge', sub: 'Fridge-style · thermostat', category: 'breeding', builder: 'fridge', size: { w: 0.55, d: 0.58, h: 0.85 }, placement: 'wall', device: true, ports: PORTS.appliance, props: { color: 'black', freezer: false }, options: [O.decor(['black', 'white', 'steel'], 'Housing', 'props.color')], tags: 'zimoviště lednice black' }),
  fridge_freezer: P({ label: 'Fridge / freezer', sub: 'Feeder storage', category: 'breeding', builder: 'fridge', size: { w: 0.6, d: 0.65, h: 1.85 }, placement: 'wall', device: true, ports: PORTS.appliance, props: { color: 'white', freezer: true }, options: [O.decor(['black', 'white', 'steel'], 'Housing', 'props.color')], tags: 'lednice mrazák feeders' }),
  // ------------------------------------------------------------------ water
  ro_tank: P({ label: 'RO tank', sub: 'Reverse osmosis · 12 l', category: 'water', builder: 'tank', size: { w: 0.28, d: 0.28, h: 0.42 }, device: true, ports: PORTS.tank, props: { shape: 'round', color: 'white' }, options: DEV_COLOR, tags: 'osmóza reverse osmosis' }),
  water_barrel: P({ label: 'Storage barrel', sub: '60 l · blue', category: 'water', builder: 'tank', size: { w: 0.42, d: 0.42, h: 0.7 }, device: true, ports: PORTS.tank, props: { shape: 'barrel', color: 'blue' }, tags: 'sud barel' }),
  water_tank: P({ label: 'Water tank', sub: '120 l · rectangular', category: 'water', builder: 'tank', size: { w: 0.8, d: 0.45, h: 0.55 }, placement: 'wall', device: true, ports: PORTS.tank, props: { shape: 'box', color: 'black' }, options: DEV_COLOR, tags: 'nádrž black' }),
  pump: P({ label: 'Water pump', sub: 'Transfer · 230 V', category: 'water', builder: 'pump', size: { w: 0.26, d: 0.16, h: 0.18 }, device: true, ports: PORTS.pumpW, props: { color: 'black' }, options: DEV_COLOR, tags: 'čerpadlo' }),
  filter: P({ label: 'Filter', sub: 'Inline cartridge', category: 'water', builder: 'filter', size: { w: 0.12, d: 0.12, h: 0.32 }, device: true, ports: PORTS.inline('water'), tags: 'filtr' }),
  pressure_regulator: P({ label: 'Pressure regulator', sub: 'With gauge', category: 'water', builder: 'regulator', size: { w: 0.12, d: 0.08, h: 0.12 }, device: true, ports: PORTS.inline('water'), tags: 'regulátor tlaku' }),
  flow_meter: P({ label: 'Flow meter', sub: 'Hall sensor · pulse', category: 'water', builder: 'inline', size: { w: 0.1, d: 0.05, h: 0.06 }, device: true, ports: PORTS.flow, tags: 'průtokoměr' }),
  // ------------------------------------------------------------------ misting
  misting_pump: P({ label: 'Misting pump', sub: 'High pressure · 24 V', category: 'misting', builder: 'pump', size: { w: 0.3, d: 0.18, h: 0.2 }, device: true, ports: PORTS.pumpM, props: { color: 'black', misting: true }, options: DEV_COLOR, tags: 'mlžení pump rain' }),
  mist_filter: P({ label: 'Misting filter', sub: 'Pre-filter 5 µm', category: 'misting', builder: 'filter', size: { w: 0.1, d: 0.1, h: 0.26 }, device: true, ports: PORTS.inline('mist'), tags: 'filtr' }),
  mist_regulator: P({ label: 'Misting pressure regulator', sub: 'Gauge 0–16 bar', category: 'misting', builder: 'regulator', size: { w: 0.12, d: 0.08, h: 0.12 }, device: true, ports: PORTS.inline('mist'), tags: 'regulátor tlaku' }),
  manifold: P({ label: 'Manifold', sub: '4 outputs', category: 'misting', builder: 'manifold', size: { w: 0.3, d: 0.06, h: 0.08 }, placement: 'mounted', elevation: 1.9, device: true, ports: PORTS.manifold, tags: 'rozdělovač' }),
  solenoid_valve: P({ label: 'Solenoid valve', sub: '24 V · NC', category: 'misting', builder: 'solenoid', size: { w: 0.08, d: 0.05, h: 0.09 }, placement: 'mounted', elevation: 1.9, device: true, ports: PORTS.solenoid, tags: 'ventil elektromagnetický' }),
  mist_nozzle: P({ label: 'Misting nozzle', sub: 'Room / enclosure top', category: 'misting', builder: 'nozzle', size: { w: 0.04, d: 0.04, h: 0.06 }, resizable: false, device: true, ports: { MIST_IN: port('mist', 'in', [0, 1, 0], 'Mist in') }, tags: 'tryska' }),
  // ------------------------------------------------------------------ drainage
  drain_point: P({ label: 'Drain point', sub: 'Wall outlet Ø 50', category: 'drainage', builder: 'drain_point', size: { w: 0.12, d: 0.08, h: 0.12 }, placement: 'mounted', elevation: 0.3, device: true, ports: PORTS.drainIn, tags: 'odpad kanalizace' }),
  drain_pipe: P({ label: 'Drain pipe', sub: 'Ø 40 · wall run', category: 'drainage', builder: 'pipe', size: { w: 1.0, d: 0.05, h: 0.05 }, placement: 'mounted', elevation: 0.25, device: true, ports: PORTS.drainInline, tags: 'trubka odpad' }),
  overflow: P({ label: 'Overflow', sub: 'Tank overflow fitting', category: 'drainage', builder: 'inline', size: { w: 0.08, d: 0.06, h: 0.1 }, device: true, ports: PORTS.drainInline, tags: 'přepad' }),
  trap: P({ label: 'Trap (siphon)', sub: 'Odour trap', category: 'drainage', builder: 'trap', size: { w: 0.12, d: 0.08, h: 0.22 }, device: true, ports: PORTS.drainInline, tags: 'sifon' }),
  floor_drain: P({ label: 'Floor drain', sub: 'Stainless grate', category: 'drainage', builder: 'floor_drain', size: { w: 0.2, d: 0.2, h: 0.01 }, resizable: false, device: true, ports: PORTS.drainIn, tags: 'vpust' }),
  // ------------------------------------------------------------------ electrical
  power_strip: P({ label: 'Power strip', sub: '5 sockets · switch', category: 'electrical', builder: 'strip', size: { w: 0.35, d: 0.06, h: 0.045 }, device: true, ports: PORTS.strip, props: { color: 'black' }, options: DEV_COLOR, tags: 'prodlužovačka' }),
  controller: P({ label: 'Controller', sub: 'Thermostat / timer', category: 'electrical', builder: 'box_device', size: { w: 0.2, d: 0.08, h: 0.25 }, placement: 'mounted', elevation: 1.3, device: true, ports: PORTS.controller, props: { color: 'black', screen: true }, options: DEV_COLOR, tags: 'termostat řídící jednotka' }),
  relay_module: P({ label: 'Relay module', sub: '4 channels · DIN', category: 'electrical', builder: 'box_device', size: { w: 0.14, d: 0.06, h: 0.09 }, placement: 'mounted', elevation: 1.3, device: true, ports: PORTS.relay, props: { color: 'grey' }, tags: 'relé' }),
  raspberry_pi: P({ label: 'Raspberry Pi / controller', sub: 'Generic automation board', category: 'electrical', builder: 'box_device', size: { w: 0.1, d: 0.035, h: 0.07 }, placement: 'mounted', elevation: 1.3, device: true, ports: PORTS.pi, props: { color: 'black', board: true }, tags: 'rpi esp home assistant' }),
  // ------------------------------------------------------------------ sensors
  temp_probe: P({ label: 'Temperature probe', sub: 'DS18B20 · cable', category: 'sensors', builder: 'probe', size: { w: 0.03, d: 0.03, h: 0.08 }, resizable: false, device: true, ports: PORTS.sensor('Temperature'), tags: 'teplota' }),
  hum_probe: P({ label: 'Humidity probe', sub: 'Capacitive RH', category: 'sensors', builder: 'probe', size: { w: 0.03, d: 0.03, h: 0.08 }, resizable: false, device: true, ports: PORTS.sensor('Humidity'), props: { hum: true }, tags: 'vlhkost' }),
  th_sensor: P({ label: 'Temp / humidity sensor', sub: 'Wall · display', category: 'sensors', builder: 'box_device', size: { w: 0.07, d: 0.025, h: 0.07 }, placement: 'mounted', elevation: 1.5, resizable: false, device: true, ports: PORTS.sensor('Temp / RH'), props: { color: 'white', screen: true }, tags: 'teplota vlhkost' }),
  water_level: P({ label: 'Water level sensor', sub: 'Float switch', category: 'sensors', builder: 'probe', size: { w: 0.04, d: 0.04, h: 0.1 }, resizable: false, device: true, ports: PORTS.sensor('Level'), props: { float: true }, tags: 'hladina' }),
  leak_sensor: P({ label: 'Leak sensor', sub: 'Floor puck', category: 'sensors', builder: 'puck', size: { w: 0.06, d: 0.06, h: 0.02 }, resizable: false, device: true, ports: PORTS.sensor('Leak alarm'), tags: 'únik vody zaplavení' }),
});

// ---- library-backed types (not listed as starting templates; size comes from the definition)
TYPES.custom_enclosure = T({
  label: 'Enclosure', sub: 'From MY ENCLOSURES', category: 'enclosures', model: null, parametric: true, hidden: true,
  size: { w: 0.6, d: 0.45, h: 0.6 }, stackable: true, resizable: false, enclosure: 'custom',
});
TYPES.assembly = T({
  label: 'Assembly', sub: 'From MY ASSEMBLIES', category: 'enclosures', model: null, parametric: true, hidden: true,
  size: { w: 1.2, d: 0.5, h: 1.8 }, placement: 'wall', resizable: false, enclosure: 'assembly',
});

export function getType(id) { return TYPES[id] || null; }
export function typesByCategory(cat) { return Object.entries(TYPES).filter(([, t]) => t.category === cat && !t.hidden).map(([id, t]) => ({ id, ...t })); }

/** Props with the type defaults underneath (old documents without the 4.2 props keep their 4.1 look). */
export function propsOf(obj) { const t = getType(obj.type); return { ...(t?.props || {}), ...(obj.props || {}) }; }
/** Procedural builder id of a type. */
export const builderOf = (id) => TYPES[id]?.builder || id;
/** Full-text search over label, sub, category and tags ("pump", "black", "zimoviště"…). */
export function searchText(id) {
  const t = TYPES[id]; const c = CATEGORIES.find((x) => x.id === t.category);
  return `${id} ${t.label} ${t.sub} ${c?.label || ''} ${t.tags || ''} ${Object.values(t.props || {}).filter((v) => typeof v === 'string').join(' ')}`.toLowerCase();
}
