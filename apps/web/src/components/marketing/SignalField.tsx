"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/lib/gsap";

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vLift;
  varying float vFade;
  varying float vSeed;

  void main() {
    vec3 p = position;
    float swell = sin(p.x * 0.38 + uTime * 0.5) * 0.38 + cos(p.z * 0.52 - uTime * 0.36 + p.x * 0.11) * 0.3;
    float chop = sin((p.x + p.z) * 0.95 + uTime * 0.9) * 0.05;
    vec2 pointer = uPointer * vec2(16.0, 5.0);
    float d = distance(p.xz, pointer);
    float ripple = exp(-d * 0.32) * sin(d * 2.1 - uTime * 3.2) * 0.42;
    p.y = swell + chop + ripple;

    vLift = smoothstep(0.12, 0.75, p.y);
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.4 + aSeed * 1.6 + vLift * 1.4) * uPixelRatio * (8.5 / -mv.z);
    vFade = smoothstep(27.0, 7.0, -mv.z) * smoothstep(0.5, 3.0, -mv.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uGlow;
  uniform float uTime;
  varying float vLift;
  varying float vFade;
  varying float vSeed;

  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, r);
    float twinkle = 0.65 + 0.35 * sin(uTime * 1.7 + vSeed * 50.0);
    vec3 color = mix(uBase, uGlow, vLift);
    float alpha = soft * vFade * mix(0.3, 0.85 * twinkle, vLift);
    gl_FragColor = vec4(color, alpha);
  }
`;

function Field({ pointer }: { pointer: React.RefObject<{ x: number; y: number }> }) {
  const smoothed = useRef(new THREE.Vector2());
  const _target = useRef(new THREE.Vector2());
  const { geometry, material } = useMemo(() => {
    const cols = 140;
    const rows = 54;
    const spacing = 0.21;
    const positions = new Float32Array(cols * rows * 3);
    const seeds = new Float32Array(cols * rows);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        positions[i * 3] = (c - cols / 2) * spacing;
        positions[i * 3 + 2] = (r - rows / 2) * spacing;
        seeds[i] = Math.random();
        i++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2() },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
        uBase: { value: new THREE.Color("#7fb2e5") },
        uGlow: { value: new THREE.Color("#0284c7") },
      },
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state, delta) => {
    const uniforms = material.uniforms as Record<string, THREE.IUniform>;
    uniforms.uTime!.value += Math.min(delta, 0.05);
    const target = pointer.current ?? { x: 0, y: 0 };
    _target.current.set(target.x, target.y);
    smoothed.current.lerp(_target.current, 0.05);
    (uniforms.uPointer!.value as THREE.Vector2).copy(smoothed.current);
    state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, smoothed.current.x * 1.2, 0.04);
    state.camera.lookAt(0, -0.4, 0);
  });

  return <points geometry={geometry} material={material} />;
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** A field of points rolling like a slow swell, lit green on the crests; the pointer drops ripples into it. */
export default function SignalField() {
  const host = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const [visible, setVisible] = useState(true);
  const [still] = useState(prefersReducedMotion);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      pointer.current = { x: (event.clientX / window.innerWidth) * 2 - 1, y: (event.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", move, { passive: true });
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    if (host.current) observer.observe(host.current);
    return () => {
      window.removeEventListener("pointermove", move);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={host} className="absolute inset-0">
      <Boundary>
        <Canvas
          dpr={[1, 1.5]}
          frameloop={still ? "demand" : visible ? "always" : "never"}
          camera={{ position: [0, 2.3, 8.5], fov: 50 }}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        >
          <Field pointer={pointer} />
        </Canvas>
      </Boundary>
    </div>
  );
}
