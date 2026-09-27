import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Final display-referred grade applied after tone mapping: gentle contrast curve, saturation,
 * optical vignette and a very fine film grain (also dithers gradients to hide 8-bit banding).
 */
export function createFinishPass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      vignette: { value: 0.28 },
      grain: { value: 0.018 },
      contrast: { value: 1.06 },
      saturation: { value: 1.04 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float vignette, grain, contrast, saturation, time;
      varying vec2 vUv;
      float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, saturation);
        col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
        vec2 d = vUv - 0.5; d.x *= 1.25;
        col *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(d, d) * 2.2);
        col += (hash(gl_FragCoord.xy + time) - 0.5) * grain;
        gl_FragColor = vec4(col, c.a);
      }`,
  });
  pass.name = 'FinishPass';
  return pass;
}
