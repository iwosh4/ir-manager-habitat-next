/**
 * Technical network (Habitat Studio 4.2) — pure logic, no three.js.
 *
 *   ROOM
 *    ├── physical objects (catalogue)      ← devices: every technical object has a stable `tech.deviceId`
 *    ├── assemblies → enclosures           ← enclosures are endpoints (instance id / object id)
 *    └── network
 *         ├── routes[]    typed connections port → port with editable waypoints (visible | in_wall | hidden)
 *         └── circuits[]  named groups (e.g. misting circuit 1: SOLENOID 1 → TERRARIUM 01…03)
 *
 * Ports are addressed by { owner, port }:
 *   owner = room object id (catalogue devices / enclosures) or enclosure INSTANCE id (custom enclosures and
 *           assembly members — the physical enclosure, independent of where it is placed)
 *   port  = stable port name on that owner ('MIST_IN', 'OUT_1', user ports 'P_xxx')
 * The global portId is `${deviceId}:${port}` — deviceId never changes, so an external system (IR Manager,
 * Home Assistant later) can bind to it. Nothing in this module is persisted except through RoomDocument.
 */
export const ROUTE_KINDS = {
  water: { label: 'Water', color: '#3aa0ff', layer: 'water', radius: 0.012 },
  mist: { label: 'Misting', color: '#34d6c9', layer: 'misting', radius: 0.006 },
  drain: { label: 'Drainage', color: '#d99a3e', layer: 'drainage', radius: 0.02 },
  power: { label: 'Electrical', color: '#f5d24a', layer: 'electrical', radius: 0.006 },
  signal: { label: 'Sensor / signal', color: '#c78bff', layer: 'sensors', radius: 0.004 },
};
export const ROUTE_MODES = { visible: 'Visible', in_wall: 'In wall', hidden: 'Hidden' };
export const TECH_LAYERS = {
  room: 'Room', enclosures: 'Enclosures', water: 'Water', misting: 'Misting', drainage: 'Drainage', electrical: 'Electrical', sensors: 'Sensors',
};

// port name → kind / direction / position on an enclosure (fractions of the logical box:
// x −0.5…0.5 (left→right), y 0…1 (bottom→top), z −0.5…0.5 (back→front))
export const ENCLOSURE_PORTS = {
  MIST_IN: { kind: 'mist', dir: 'in', at: [0, 1.0, -0.1], label: 'Misting in' },
  WATER_IN: { kind: 'water', dir: 'in', at: [0.3, 1.0, -0.35], label: 'Water in' },
  DRAIN_OUT: { kind: 'drain', dir: 'out', at: [0, 0.02, -0.45], label: 'Drain out' },
  OVERFLOW_OUT: { kind: 'drain', dir: 'out', at: [0.35, 0.55, -0.5], label: 'Overflow out' },
  POWER: { kind: 'power', dir: 'in', at: [-0.4, 0.92, -0.5], label: 'Power' },
  TEMP_SENSOR: { kind: 'signal', dir: 'out', at: [-0.3, 0.6, -0.45], label: 'Temperature sensor' },
  HUM_SENSOR: { kind: 'signal', dir: 'out', at: [-0.15, 0.6, -0.45], label: 'Humidity sensor' },
};
export const PORT_KINDS = Object.keys(ROUTE_KINDS);

let seq = 0;
export const netId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}${(++seq).toString(36)}`;
const str = (v, d = '', max = 200) => (typeof v === 'string' ? v.slice(0, max) : d);
const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, list, d) => (list.includes(v) ? v : d);

// ------------------------------------------------------------------------------------ normalisation
export function normalizePortRef(p) {
  if (!p || typeof p !== 'object' || typeof p.owner !== 'string' || typeof p.port !== 'string') return null;
  return { owner: p.owner, port: p.port.slice(0, 40) };
}

export function normalizeRoute(r) {
  return {
    id: str(r.id) || netId('rt'),
    kind: pick(r.kind, PORT_KINDS, 'water'),
    name: str(r.name, '', 120),
    from: normalizePortRef(r.from),
    to: normalizePortRef(r.to),
    points: (Array.isArray(r.points) ? r.points : []).slice(0, 200).map((p) => ({ x: num(p?.x, 0, -5, 60), y: num(p?.y, 0, -1, 10), z: num(p?.z, 0, -5, 60) })),
    mode: pick(r.mode, Object.keys(ROUTE_MODES), 'visible'),
    circuitId: str(r.circuitId) || null,
    note: str(r.note, '', 1000),
    enabled: r.enabled !== false,
  };
}

export function normalizeCircuit(c) {
  return {
    id: str(c.id) || netId('cir'),
    code: str(c.code, 'C1', 16),
    name: str(c.name, 'Circuit', 120),
    kind: pick(c.kind, PORT_KINDS, 'mist'),
    source: normalizePortRef(c.source),
    destinations: [...new Set((Array.isArray(c.destinations) ? c.destinations : []).filter((d) => typeof d === 'string'))],
    note: str(c.note, '', 1000),
    enabled: c.enabled !== false,
  };
}

export function normalizeNetwork(n) {
  const uniq = (arr) => { const s = new Set(); return arr.filter((x) => (s.has(x.id) ? false : (s.add(x.id), true))); };
  const circuits = uniq((Array.isArray(n?.circuits) ? n.circuits : []).map(normalizeCircuit));
  const cids = new Set(circuits.map((c) => c.id));
  const routes = uniq((Array.isArray(n?.routes) ? n.routes : []).map(normalizeRoute)).map((r) => ({ ...r, circuitId: cids.has(r.circuitId) ? r.circuitId : null }));
  return { routes, circuits };
}

/** Device data of a room object ({ deviceId, ports: user-created ports }). Catalogue ports come from the type. */
export function normalizeTech(t, objectId) {
  const ports = (Array.isArray(t?.ports) ? t.ports : []).slice(0, 32).map((p, i) => ({
    id: str(p.id, `P_${i + 1}`, 40).replace(/[^A-Za-z0-9_]/g, '_') || `P_${i + 1}`,
    kind: pick(p.kind, PORT_KINDS, 'water'),
    dir: pick(p.dir, ['in', 'out', 'both'], 'both'),
    label: str(p.label, '', 60),
    at: Array.isArray(p.at) && p.at.length === 3 ? p.at.map((v, k) => num(v, 0, k === 1 ? 0 : -0.6, k === 1 ? 1.2 : 0.6)) : [0, 0.5, 0.5],
  }));
  const seen = new Set();
  return { deviceId: str(t?.deviceId) || `dev_${objectId}`, ports: ports.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))) };
}

// ------------------------------------------------------------------------------------ ports of owners
/**
 * All ports of all endpoints in a document, resolved to world-plan positions.
 * getType: catalogue lookup · lib: libraryIndex(doc) · layout: assemblyLayout(a, lib)
 * Returns Map(key "owner:port") → { owner, port, kind, dir, label, ownerName, ownerKind, deviceId, pos:{x,y,z} (plan metres, y up), normal }
 */
export function collectPorts(doc, { getType, lib, layout }) {
  const out = new Map();
  const add = (owner, name, spec, frame, meta) => {
    const pos = frame(spec.at);
    out.set(`${owner}:${name}`, { owner, port: name, kind: spec.kind, dir: spec.dir, label: spec.label || name, ...meta, pos, portId: `${meta.deviceId}:${name}` });
  };
  const frameOf = (o, local = null) => {
    const a = (o.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return (at, size = local?.size || o.size) => {
      const lx = at[0] * size.w + (local?.x || 0), ly = at[1] * size.h + (local?.y || 0), lz = at[2] * size.d + (local?.z || 0);
      // object local x axis in plan = (cos a, -sin a) ; local z (front) = (sin a, cos a)
      return { x: o.position.x + c * lx + s * lz, y: o.elevation + ly, z: o.position.z - s * lx + c * lz };
    };
  };
  for (const o of doc.objects) {
    const t = getType(o.type); if (!t) continue;
    const f = frameOf(o);
    if (o.type === 'assembly') {
      const a = lib.assemblies.get(o.ref?.assemblyId); if (!a) continue;
      const L = layout(a, lib);
      for (const p of L.parts) {
        if (p.kind !== 'enclosure' || !p.member?.instanceId) continue;
        const inst = lib.instances.get(p.member.instanceId); if (!inst) continue;
        const pf = frameOf(o, { x: p.local.x, y: p.local.y, z: p.local.z, size: p.size });
        for (const [name, spec] of Object.entries(ENCLOSURE_PORTS)) add(inst.id, name, spec, (at) => pf(at, p.size), { ownerName: inst.code, ownerKind: 'enclosure', deviceId: inst.id, objectId: o.id });
      }
      continue;
    }
    if (o.type === 'custom_enclosure') {
      const inst = lib.instances.get(o.ref?.instanceId); if (!inst) continue;
      for (const [name, spec] of Object.entries(ENCLOSURE_PORTS)) add(inst.id, name, spec, f, { ownerName: inst.code, ownerKind: 'enclosure', deviceId: inst.id, objectId: o.id });
      continue;
    }
    if (t.enclosure && t.enclosure !== 'incubator') {
      for (const [name, spec] of Object.entries(ENCLOSURE_PORTS)) add(o.id, name, spec, f, { ownerName: o.props?.animal?.code || o.name, ownerKind: 'enclosure', deviceId: o.tech?.deviceId || o.id, objectId: o.id });
    }
    const ports = { ...(t.ports || {}) };
    for (const p of o.tech?.ports || []) ports[p.id] = p;
    if (!Object.keys(ports).length) continue;
    const deviceId = o.tech?.deviceId || `dev_${o.id}`;
    for (const [name, spec] of Object.entries(ports)) add(o.id, name, spec, f, { ownerName: o.name, ownerKind: 'device', deviceId, objectId: o.id, custom: !(t.ports || {})[name] });
  }
  return out;
}

/** Endpoints that can be circuit destinations (enclosures), in reading order. */
export function enclosureEndpoints(ports) {
  const seen = new Map();
  for (const p of ports.values()) if (p.ownerKind === 'enclosure' && !seen.has(p.owner)) seen.set(p.owner, { owner: p.owner, name: p.ownerName, objectId: p.objectId });
  return [...seen.values()];
}

// ------------------------------------------------------------------------------------ geometry helpers
/** Full polyline of a route in plan coordinates: from-port · waypoints · to-port (missing ends skipped). */
export function routePath(route, ports) {
  const a = route.from && ports.get(`${route.from.owner}:${route.from.port}`);
  const b = route.to && ports.get(`${route.to.owner}:${route.to.port}`);
  const pts = [];
  if (a) pts.push({ ...a.pos });
  for (const p of route.points) pts.push({ ...p });
  if (b) pts.push({ ...b.pos });
  return pts;
}

export function pathLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z); return L; }

/** Nearest wall of a plan point: { wall, dist, t (along perimeter coordinate) }. */
function nearestWall(room, p) {
  const d = { north: p.z, south: room.depth - p.z, west: p.x, east: room.width - p.x };
  const wall = Object.keys(d).reduce((a, b) => (d[a] < d[b] ? a : b));
  return { wall, dist: d[wall] };
}
/** Perimeter coordinate (clockwise from the NW corner) of a point projected on a wall. */
function perim(room, wall, p) {
  const W = room.width, D = room.depth;
  if (wall === 'north') return Math.min(W, Math.max(0, p.x));
  if (wall === 'east') return W + Math.min(D, Math.max(0, p.z));
  if (wall === 'south') return W + D + (W - Math.min(W, Math.max(0, p.x)));
  return 2 * W + D + (D - Math.min(D, Math.max(0, p.z)));
}
/** Point on the perimeter line at coordinate s, offset `inset` from the interior face (negative = inside the wall). */
function perimPoint(room, s, inset) {
  const W = room.width, D = room.depth, P = 2 * (W + D);
  s = ((s % P) + P) % P;
  if (s <= W) return { x: s, z: inset };
  if (s <= W + D) return { x: W - inset, z: s - W };
  if (s <= 2 * W + D) return { x: W - (s - W - D), z: D - inset };
  return { x: inset, z: D - (s - 2 * W - D) };
}

/**
 * Automatic waypoints between two ports: rise/drop to the run height, travel along the walls (shortest way
 * round the perimeter, through the corners), then drop/rise to the destination. `mode === 'in_wall'` runs
 * inside the wall (half the wall thickness behind the interior face); otherwise 4 cm in front of it.
 */
export function autoRoute(room, a, b, { kind = 'water', mode = 'visible', height = null } = {}) {
  if (!a || !b) return [];
  const H = height ?? (kind === 'drain' ? 0.12 : kind === 'mist' ? Math.min(room.height - 0.15, 2.25) : kind === 'power' || kind === 'signal' ? Math.min(room.height - 0.2, 2.1) : 0.3);
  const inset = mode === 'in_wall' ? -room.wallThickness / 2 : 0.04;
  // short visible hop between neighbouring devices (e.g. pump → filter on the floor): direct orthogonal run
  if (mode !== 'in_wall' && Math.hypot(a.x - b.x, a.z - b.z) < 1.6 && Math.abs(a.y - b.y) < 0.8) {
    const h = r3(Math.max(a.y, b.y) + 0.06);
    const pts = [{ x: a.x, y: h, z: a.z }, { x: b.x, y: h, z: a.z }, { x: b.x, y: h, z: b.z }];
    return pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.005).map((p) => ({ x: r3(p.x), y: p.y, z: r3(p.z) }));
  }
  const wa = nearestWall(room, a), wb = nearestWall(room, b);
  const P = 2 * (room.width + room.depth);
  let s0 = perim(room, wa.wall, a), s1 = perim(room, wb.wall, b);
  const fwd = ((s1 - s0) % P + P) % P, back = P - fwd;
  const dir = fwd <= back ? 1 : -1, span = Math.min(fwd, back);
  const pts = [];
  const pa = perimPoint(room, s0, inset);
  pts.push({ x: a.x, y: H, z: a.z });                 // rise / drop above the source
  pts.push({ x: pa.x, y: H, z: pa.z });               // to the wall
  // corners passed on the way
  const corners = [0, room.width, room.width + room.depth, 2 * room.width + room.depth];
  const passed = [];
  for (const cs of corners) {
    const rel = dir > 0 ? ((cs - s0) % P + P) % P : ((s0 - cs) % P + P) % P;
    if (rel > 1e-4 && rel < span - 1e-4) passed.push({ rel, cs });
  }
  passed.sort((x, y) => x.rel - y.rel);
  for (const c of passed) { const q = perimPoint(room, c.cs, inset); pts.push({ x: q.x, y: H, z: q.z }); }
  const pb = perimPoint(room, s1, inset);
  pts.push({ x: pb.x, y: H, z: pb.z });
  pts.push({ x: b.x, y: H, z: b.z });                 // off the wall towards the destination
  // remove duplicates / zero-length legs
  const clean = [];
  for (const p of pts) { const q = clean[clean.length - 1]; if (!q || Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 0.005) clean.push({ x: r3(p.x), y: r3(p.y), z: r3(p.z) }); }
  return clean;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Snap a waypoint: to the nearest wall face / wall core, and axis-align with its neighbours. */
export function snapWaypoint(room, p, prev, next, { wall = true, axis = true, inWall = false, tol = 0.15 } = {}) {
  const q = { ...p };
  if (wall) {
    const w = nearestWall(room, q);
    if (w.dist < tol + (inWall ? room.wallThickness : 0)) {
      const off = inWall ? -room.wallThickness / 2 : 0.04;
      if (w.wall === 'north') q.z = off; if (w.wall === 'south') q.z = room.depth - off;
      if (w.wall === 'west') q.x = off; if (w.wall === 'east') q.x = room.width - off;
    }
  }
  if (axis) for (const n of [prev, next]) {
    if (!n) continue;
    if (Math.abs(q.x - n.x) < 0.08) q.x = n.x;
    if (Math.abs(q.z - n.z) < 0.08) q.z = n.z;
    if (Math.abs(q.y - n.y) < 0.05) q.y = n.y;
  }
  return { x: r3(q.x), y: r3(q.y), z: r3(q.z) };
}

/** Summary lines for the circuit diagram: SOURCE → device chain → destinations. */
export function circuitSummary(circuit, ports, routes) {
  const src = circuit.source && ports.get(`${circuit.source.owner}:${circuit.source.port}`);
  const names = new Map(); for (const p of ports.values()) if (!names.has(p.owner)) names.set(p.owner, p.ownerName);
  return {
    source: src ? `${src.ownerName} · ${circuit.source.port}` : '—',
    destinations: circuit.destinations.map((d) => names.get(d) || d),
    routes: routes.filter((r) => r.circuitId === circuit.id).length,
  };
}

/** Upstream chain of a port: follows routes backwards (device → device) until a source without inputs. */
export function upstream(ownerId, routes, max = 12) {
  const chain = [];
  let cur = ownerId;
  for (let i = 0; i < max; i++) {
    const r = routes.find((x) => x.to?.owner === cur && x.from);
    if (!r) break;
    chain.unshift(r.from.owner); cur = r.from.owner;
  }
  return chain;
}
