import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Perspective camera with damped orbit / pan / zoom (OrbitControls) and animated transitions:
 * named view presets, focus-on-selection (frames the object's bounding sphere), reset.
 */
export class CameraRig {
  constructor(domElement, onChange) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.03, 200);
    this.controls = new OrbitControls(this.camera, domElement);
    const c = this.controls;
    c.enableDamping = true; c.dampingFactor = 0.085;
    c.rotateSpeed = 0.6; c.panSpeed = 0.9; c.zoomSpeed = 1.1;
    c.screenSpacePanning = true;
    c.minDistance = 0.35; c.maxDistance = 28;
    c.maxPolarAngle = Math.PI * 0.495;
    c.zoomToCursor = true;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.addEventListener('change', () => onChange && onChange());
    this.onChange = onChange;
    this.anim = null;
    this.room = { width: 5, depth: 4, height: 2.7 };
  }

  setRoom(room) { this.room = room; }

  /** View presets expressed relative to the room size. */
  /** Distance at which a w x h rectangle fills the view (with margin), for the current aspect. */
  fitDistance(w, h, margin = 1.18) {
    const t = Math.tan(THREE.MathUtils.degToRad(38) / 2);
    const aspect = this.camera.aspect || 1.6;
    return Math.max((h * margin) / 2 / t, (w * margin) / 2 / (t * aspect));
  }

  presetPose(name) {
    const { width: W, depth: D, height: H } = this.room;
    const R = Math.max(W, D);
    const T = 0.3; // wall thickness margin
    const tgt = new THREE.Vector3(0, H * 0.32, 0);
    switch (name) {
      case 'top': return { pos: new THREE.Vector3(0, this.fitDistance(W + T, D + T), 0.001), target: new THREE.Vector3(0, 0, 0), fov: 38 };
      case 'front': return { pos: new THREE.Vector3(0, H * 0.5, D / 2 + this.fitDistance(W + T, H + T, 1.12)), target: new THREE.Vector3(0, H * 0.45, 0), fov: 38 };
      case 'back': return { pos: new THREE.Vector3(0, H * 0.5, -D / 2 - this.fitDistance(W + T, H + T, 1.12)), target: new THREE.Vector3(0, H * 0.45, 0), fov: 38 };
      case 'left': return { pos: new THREE.Vector3(-W / 2 - this.fitDistance(D + T, H + T, 1.12), H * 0.5, 0), target: new THREE.Vector3(0, H * 0.45, 0), fov: 38 };
      case 'right': return { pos: new THREE.Vector3(W / 2 + this.fitDistance(D + T, H + T, 1.12), H * 0.5, 0), target: new THREE.Vector3(0, H * 0.45, 0), fov: 38 };
      case 'iso': return { pos: new THREE.Vector3(W * 0.95 + 1.2, H + R * 0.95, D * 1.05 + 1.6), target: tgt.clone().setY(H * 0.2), fov: 38 };
      case 'interior': return { pos: new THREE.Vector3(W * 0.36, 1.62, D * 0.43), target: new THREE.Vector3(-W * 0.12, 1.05, -D * 0.35), fov: 58 };
      case 'overview': return { pos: new THREE.Vector3(W * 0.62 + 0.8, H + R * 0.55, D * 0.62 + 1.4), target: new THREE.Vector3(-W * 0.05, H * 0.15, -D * 0.1), fov: 40 };
      case 'hero': default:
        // eye-level interior shot from the entrance corner towards the enclosure wall
        return { pos: new THREE.Vector3(W * 0.4, 1.72, D * 0.36), target: new THREE.Vector3(-W * 0.2, 1.0, -D * 0.42), fov: 56 };
    }
  }

  goTo(name, { duration = 900, instant = false } = {}) {
    const p = this.presetPose(name);
    this.animateTo(p.pos, p.target, p.fov, instant ? 0 : duration);
    this.view = name;
  }

  animateTo(pos, target, fov = this.camera.fov, duration = 900) {
    const cam = this.camera, c = this.controls;
    if (duration <= 0) {
      cam.position.copy(pos); c.target.copy(target); cam.fov = fov; cam.updateProjectionMatrix(); c.update(); this.onChange && this.onChange();
      return;
    }
    this.anim = {
      t0: performance.now(), duration,
      p0: cam.position.clone(), p1: pos.clone(), q0: c.target.clone(), q1: target.clone(), f0: cam.fov, f1: fov,
    };
  }

  /** Smoothly frame a Box3 (keeps the current viewing direction). */
  focusBox(box, { duration = 750, padding = 1.3, direction = null } = {}) {
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cam = this.camera;
    const dir = direction ? direction.clone().normalize() : cam.position.clone().sub(this.controls.target).normalize();
    if (dir.y > 0.92) dir.set(0.35, 0.8, 0.5).normalize();
    if (dir.y < 0.12) dir.y = 0.25, dir.normalize();
    const fov = THREE.MathUtils.degToRad(Math.min(cam.fov, 50));
    const dist = Math.max(0.6, (sphere.radius * padding) / Math.sin(fov / 2));
    this.animateTo(sphere.center.clone().addScaledVector(dir, dist), sphere.center, THREE.MathUtils.radToDeg(fov), duration);
  }

  get animating() { return !!this.anim; }

  update() {
    if (this.anim) {
      const a = this.anim, cam = this.camera, c = this.controls;
      const t = Math.min(1, (performance.now() - a.t0) / a.duration), k = ease(t);
      // arc slightly through a higher point for long moves
      cam.position.lerpVectors(a.p0, a.p1, k);
      const lift = Math.sin(Math.PI * k) * Math.min(1.2, a.p0.distanceTo(a.p1) * 0.08);
      cam.position.y += lift;
      c.target.lerpVectors(a.q0, a.q1, k);
      cam.fov = a.f0 + (a.f1 - a.f0) * k; cam.updateProjectionMatrix();
      if (t >= 1) this.anim = null;
      this.onChange && this.onChange();
    }
    this.controls.update();
    // keep the pivot within a sensible volume around the room
    const { width: W, depth: D, height: H } = this.room;
    const tg = this.controls.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -W, W); tg.z = THREE.MathUtils.clamp(tg.z, -D, D); tg.y = THREE.MathUtils.clamp(tg.y, 0, H * 1.5);
    if (this.camera.position.y < 0.08) this.camera.position.y = 0.08;
  }

  cancelAnimation() { this.anim = null; }

  getState() { return { pos: this.camera.position.toArray(), target: this.controls.target.toArray(), fov: this.camera.fov }; }
  setState(s) { if (!s) return; this.animateTo(new THREE.Vector3(...s.pos), new THREE.Vector3(...s.target), s.fov, 0); }
}
