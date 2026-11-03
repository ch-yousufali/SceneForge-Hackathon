"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { SceneData, SceneObject } from "@/lib/scene";

export interface SceneViewerHandle {
  /** Returns a PNG data URL of the current view. */
  capture: () => string | null;
  /** Re-frames the camera on the scene. */
  resetCamera: () => void;
  /** Exports the blockout (ground + objects, no lights) as a binary glTF (.glb). */
  exportGLB: () => Promise<ArrayBuffer | null>;
}

interface SceneViewerProps {
  scene: SceneData | null;
  showGrid?: boolean;
  handleRef?: RefObject<SceneViewerHandle | null>;
}

const BG = "#0b0e14";
const MAX_GLOW_LIGHTS = 6;

function meshFor(obj: SceneObject): THREE.Mesh {
  const [x, y, z] = obj.scale;
  let geometry: THREE.BufferGeometry;
  let meshScale: [number, number, number] = [1, 1, 1];
  let flat = false;

  switch (obj.shape) {
    case "cylinder":
      geometry = new THREE.CylinderGeometry(x, x, y, 24);
      break;
    case "cone":
      geometry = new THREE.ConeGeometry(x, y, 24);
      break;
    case "sphere":
      geometry = new THREE.SphereGeometry(1, 24, 16);
      meshScale = [x, y, z];
      break;
    case "plane":
      geometry = new THREE.PlaneGeometry(x, z);
      flat = true;
      break;
    default:
      geometry = new THREE.BoxGeometry(x, y, z);
  }

  const opacity = obj.opacity ?? 1;
  const material = new THREE.MeshStandardMaterial({
    color: obj.color,
    transparent: opacity < 1,
    opacity,
    roughness: obj.emissive ? 0.4 : 0.85,
    flatShading: !obj.emissive,
    emissive: obj.emissive ? new THREE.Color(obj.color) : new THREE.Color("#000000"),
    emissiveIntensity: obj.emissive ? 1.2 : 0,
    side: flat ? THREE.DoubleSide : THREE.FrontSide,
    // Planes sit just above the ground — pull them forward in depth to avoid z-fighting.
    polygonOffset: flat,
    polygonOffsetFactor: flat ? -2 : 0,
    polygonOffsetUnits: flat ? -2 : 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...obj.position);
  if (obj.rotation) mesh.rotation.set(...obj.rotation);
  if (flat) mesh.rotateX(-Math.PI / 2);
  mesh.scale.set(...meshScale);
  mesh.castShadow = !flat && opacity > 0.5;
  mesh.receiveShadow = true;
  mesh.userData.name = obj.name;
  mesh.name = obj.name;
  return mesh;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

interface ViewerState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  content: THREE.Group;
  grid: THREE.GridHelper;
}

export default function SceneViewer({ scene, showGrid = true, handleRef }: SceneViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<ViewerState | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [hovered, setHovered] = useState<{ name: string; x: number; y: number } | null>(null);

  // One-time renderer setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      // WebGL availability is only knowable at runtime; this fires at most once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    mount.appendChild(renderer.domElement);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(BG);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    camera.position.set(14, 10, 16);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.target.set(0, 1, 0);
    controls.minDistance = 2;
    controls.maxDistance = 120;

    const ambient = new THREE.AmbientLight("#ffffff", 0.5);
    const hemi = new THREE.HemisphereLight("#ffffff", "#222222", 0.7);
    const sun = new THREE.DirectionalLight("#ffffff", 1.5);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    threeScene.add(ambient, hemi, sun);

    const grid = new THREE.GridHelper(60, 60, "#ffffff", "#ffffff");
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.07;
    gridMat.depthWrite = false;
    grid.position.y = 0.01;
    threeScene.add(grid);

    const content = new THREE.Group();
    threeScene.add(content);

    const state: ViewerState = { renderer, scene: threeScene, camera, controls, ambient, hemi, sun, content, grid };
    stateRef.current = state;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    // Hover labels
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(content.children, false)[0];
      const name = hit?.object.userData.name as string | undefined;
      setHovered(name ? { name, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    };
    const onLeave = () => setHovered(null);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const t = clock.getElapsedTime();
      // Gentle flicker on glow lights so emissive sources feel alive
      for (const child of content.children) {
        if (child instanceof THREE.PointLight) {
          const base = child.userData.baseIntensity as number;
          child.intensity = base * (0.85 + 0.15 * Math.sin(t * 3 + child.id));
        }
      }
      controls.update();
      renderer.render(threeScene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      disposeObject(threeScene);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, []);

  // Frame the camera on the scene's objects (not the ground disc, which would dominate the bounds)
  const frameCamera = () => {
    const state = stateRef.current;
    if (!state) return;
    const box = new THREE.Box3();
    for (const child of state.content.children) {
      if (child instanceof THREE.Mesh && !child.userData.isGround) box.expandByObject(child);
    }
    if (box.isEmpty()) {
      state.camera.position.set(14, 10, 16);
      state.controls.target.set(0, 1, 0);
      return;
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.z, size.y * 1.2, 6) * 0.68;
    const dist = radius / Math.tan(THREE.MathUtils.degToRad(state.camera.fov / 2));
    const dir = new THREE.Vector3(0.75, 0.55, 0.9).normalize();
    state.controls.target.set(center.x, Math.min(center.y, size.y * 0.35 + box.min.y), center.z);
    state.camera.position.copy(state.controls.target).addScaledVector(dir, dist);
    state.camera.updateProjectionMatrix();
  };

  // Imperative handle for the page (screenshot / reset view)
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      capture: () => {
        const state = stateRef.current;
        if (!state) return null;
        state.renderer.render(state.scene, state.camera);
        return state.renderer.domElement.toDataURL("image/png");
      },
      resetCamera: frameCamera,
      exportGLB: async () => {
        const state = stateRef.current;
        if (!state) return null;
        const root = new THREE.Group();
        root.name = "SceneForge Blockout";
        for (const child of state.content.children) {
          if (!(child instanceof THREE.Mesh)) continue;
          if (child.userData.isGround) {
            // The on-screen ground is a huge disc for the horizon fade; export a sane 30×30 floor.
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), child.material);
            floor.rotation.x = -Math.PI / 2;
            floor.name = "ground";
            root.add(floor);
          } else {
            root.add(child.clone());
          }
        }
        const result = await new GLTFExporter().parseAsync(root, { binary: true });
        return result as ArrayBuffer;
      },
    };
    return () => {
      handleRef.current = null;
    };
  });

  useEffect(() => {
    if (stateRef.current) stateRef.current.grid.visible = showGrid;
  }, [showGrid]);

  // Rebuild scene contents when the data changes
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;

    for (const child of [...state.content.children]) {
      disposeObject(child);
      state.content.remove(child);
    }

    if (!scene) {
      state.scene.fog = null;
      state.scene.background = new THREE.Color(BG);
      return;
    }

    const style = scene.style;

    // Always fog toward the horizon so the ground fades out instead of ending in a hard edge.
    // Without an explicit fog, derive a sky tone from the ambient light so moods read at a glance.
    const skyColor =
      style.fogColor && style.fogDensity
        ? new THREE.Color(style.fogColor)
        : new THREE.Color(BG).lerp(new THREE.Color(style.ambientLightColor), 0.28);
    const density = style.fogColor && style.fogDensity ? Math.min(style.fogDensity, 0.045) : 0.012;
    state.scene.fog = new THREE.FogExp2(skyColor, density);
    state.scene.background = skyColor;

    // Keep a readable light floor: blockouts are for judging layout, so never let them go black.
    state.ambient.color.set(style.ambientLightColor);
    state.ambient.intensity = Math.max(style.ambientIntensity, 0.45);
    state.hemi.color.set(style.ambientLightColor);
    state.hemi.groundColor.set(style.groundColor);
    state.sun.color.set(style.sunLightColor);
    state.sun.intensity = Math.max(style.sunIntensity, 0.8);

    // Low sun for sunsets, high for midday
    const mood = style.lightingMood.toLowerCase();
    if (mood.includes("sunset") || mood.includes("warm")) state.sun.position.set(18, 6, 4);
    else if (mood.includes("night") || mood.includes("moon")) state.sun.position.set(-8, 16, -10);
    else state.sun.position.set(10, 18, 8);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(80, 64),
      new THREE.MeshStandardMaterial({ color: style.groundColor, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    state.content.add(ground);

    let glowCount = 0;
    for (const obj of scene.objects) {
      state.content.add(meshFor(obj));
      if (obj.emissive && glowCount < MAX_GLOW_LIGHTS) {
        const light = new THREE.PointLight(obj.color, 8, 10, 2);
        light.position.set(obj.position[0], obj.position[1] + 0.3, obj.position[2]);
        light.userData.baseIntensity = 8;
        state.content.add(light);
        glowCount++;
      }
    }

    frameCamera();
  }, [scene]);

  if (webglFailed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xl">
          🧊
        </div>
        <p className="max-w-sm text-sm text-zinc-400">
          The 3D view needs WebGL, but your browser/environment has it disabled.
        </p>
        <p className="max-w-sm text-xs text-zinc-600">
          Enable hardware acceleration or switch to a browser with WebGL support (Chrome, Edge,
          Firefox) to see the blockout.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="h-full w-full" />
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-xs font-medium text-white shadow-lg backdrop-blur"
          style={{ left: hovered.x + 12, top: hovered.y + 12 }}
        >
          {hovered.name}
        </div>
      )}
    </div>
  );
}
