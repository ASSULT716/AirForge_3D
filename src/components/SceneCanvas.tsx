import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, RapierRigidBody } from '@react-three/rapier';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  StructureState,
  NodePoint,
  BeamMember,
  CadMaterial,
  CameraControlState,
  SolidPrimitive,
} from '../types/cad';
import { getKdsLoadRange } from '../utils/buildingEstimator';

interface Props {
  structure: StructureState;
  onUpdateStress: (updatedBeams: StructureState['beams']) => void;
}

const WHITE_SAFE = new THREE.Color('#ffffff');
const WARN_AMBER = new THREE.Color('#f59e0b');
const DANGER_RED = new THREE.Color('#ff1e42');
const FIXED_AMBER = new THREE.Color('#ff9900');
const UP_VEC = new THREE.Vector3(0, 1, 0);

const MATERIAL_SPECS: Record<
  CadMaterial,
  { defaultHex: string; metalness: number; roughness: number; emissiveIntensity: number; transparent?: boolean; opacity?: number }
> = {
  hologram: { defaultHex: '#00f3ff', metalness: 0.1, roughness: 0.2, emissiveIntensity: 0.9, transparent: true, opacity: 0.55 },
  steel: { defaultHex: '#e2e8f0', metalness: 0.92, roughness: 0.18, emissiveIntensity: 0.05 },
  titanium: { defaultHex: '#64748b', metalness: 0.95, roughness: 0.25, emissiveIntensity: 0.06 },
  carbon: { defaultHex: '#1e293b', metalness: 0.15, roughness: 0.78, emissiveIntensity: 0.02 },
  gold: { defaultHex: '#fbbf24', metalness: 0.98, roughness: 0.12, emissiveIntensity: 0.14 },
};

// 0.0(여유) -> 하얀색(#ffffff), 0.65(법정최대 근접) -> 주황(#f59e0b), 1.0+(위험) -> 빨간색(#ff1e42)
function computeWhiteToRedColor(ratio: number): THREE.Color {
  const clamped = THREE.MathUtils.clamp(ratio, 0, 1.15);
  if (clamped <= 0.65) {
    return WHITE_SAFE.clone().lerp(WARN_AMBER, clamped / 0.65);
  }
  return WARN_AMBER.clone().lerp(DANGER_RED, Math.min(1, (clamped - 0.65) / 0.45));
}

function computeBeamTransform(p1: THREE.Vector3, p2: THREE.Vector3) {
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const diff = new THREE.Vector3().subVectors(p2, p1);
  const length = Math.max(0.005, diff.length());
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, diff.clone().normalize());
  return { mid, length, quat };
}

function StudioReflectionEnv() {
  const { scene } = useThree();

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, '#cbd5e1');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(0.75, '#38bdf8');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    scene.environment = tex;

    return () => {
      scene.environment = null;
      tex.dispose();
    };
  }, [scene]);

  return null;
}

function SolidShapeGeometry({ shape }: { shape: SolidPrimitive['shape'] }) {
  if (shape === 'sphere') return <sphereGeometry args={[0.8, 36, 36]} />;
  if (shape === 'cone') return <coneGeometry args={[0.8, 1.4, 24]} />;
  if (shape === 'cylinder') return <cylinderGeometry args={[0.7, 0.7, 1.2, 32]} />;
  if (shape === 'torus') return <torusGeometry args={[0.7, 0.25, 24, 48]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

function SolidMeshView({
  solid,
  defaultMaterial,
  defaultColor,
  xrayUnitMode,
  heatmapRatio,
}: {
  solid: SolidPrimitive;
  defaultMaterial: CadMaterial;
  defaultColor: string;
  xrayUnitMode: boolean;
  heatmapRatio: number | null;
}) {
  const matKey = solid.material ?? defaultMaterial ?? 'hologram';
  const spec = MATERIAL_SPECS[matKey];
  const baseHex = solid.color ?? defaultColor ?? spec.defaultHex;

  // 하중 히트맵 모드: 반투명 하얀색 -> 빨간색 그라데이션
  if (heatmapRatio !== null) {
    const heatColor = computeWhiteToRedColor(heatmapRatio);
    return (
      <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
        <mesh>
          <SolidShapeGeometry shape={solid.shape} />
          <meshStandardMaterial
            color={heatColor}
            emissive={heatColor}
            emissiveIntensity={0.25 + Math.min(0.8, heatmapRatio * 0.6)}
            metalness={0.15}
            roughness={0.35}
            transparent
            opacity={0.38}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.003, 1.003, 1.003]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color={heatColor} wireframe transparent opacity={0.55} />
        </mesh>
      </group>
    );
  }

  // 방 유형 투시 모드: 건물 전체를 반투명 X-Ray로 표시해 내부 방 배치를 선명하게 노출
  if (xrayUnitMode) {
    return (
      <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
        <mesh>
          <SolidShapeGeometry shape={solid.shape} />
          <meshStandardMaterial
            color="#94a3b8"
            metalness={0.2}
            roughness={0.4}
            transparent
            opacity={0.13}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.003, 1.003, 1.003]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color="#38bdf8" wireframe transparent opacity={0.26} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
      <mesh>
        <SolidShapeGeometry shape={solid.shape} />
        <meshStandardMaterial
          color={baseHex}
          emissive={baseHex}
          emissiveIntensity={spec.emissiveIntensity}
          metalness={spec.metalness}
          roughness={spec.roughness}
          transparent={Boolean(spec.transparent)}
          opacity={spec.opacity ?? 1}
        />
      </mesh>
      {matKey === 'hologram' && (
        <mesh scale={[1.005, 1.005, 1.005]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color="#00f3ff" wireframe transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

function CameraController({
  control = { mode: 'free' },
  shiftRightForPlan,
}: {
  control?: CameraControlState;
  shiftRightForPlan: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const animState = useRef({
    yawRemaining: 0,
    pitchRemaining: 0,
    speed: 1.0,
  });

  // 중앙 평면도가 열리면 건물이 우측 뷰포트에 깔끔하게 보이도록 카메라 주시점 오프셋
  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.target.set(shiftRightForPlan ? -1.45 : 0, 1.2, 0);
    ctrl.update();
  }, [shiftRightForPlan]);

  useEffect(() => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    if (control.mode === 'preset') {
      animState.current.yawRemaining = 0;
      animState.current.pitchRemaining = 0;
      if (control.preset === 'front') {
        camera.position.set(0, 1.5, 5.5);
        ctrl.target.set(0, 1, 0);
      } else if (control.preset === 'top') {
        camera.position.set(0, 6.5, 0.1);
        ctrl.target.set(0, 0, 0);
      } else {
        camera.position.set(3.8, 3.0, 4.8);
        ctrl.target.set(0, 1, 0);
      }
      ctrl.update();
      return;
    }

    if (control.mode === 'step_rotate') {
      animState.current.yawRemaining = THREE.MathUtils.degToRad(control.yawDeg ?? 0);
      animState.current.pitchRemaining = THREE.MathUtils.degToRad(control.pitchDeg ?? 0);
      animState.current.speed = Math.max(0.15, control.speed ?? 1.0);
    } else {
      animState.current.yawRemaining = 0;
      animState.current.pitchRemaining = 0;
    }

    if (control.zoomFactor && Math.abs(control.zoomFactor - 1.0) > 0.02) {
      const mag = Math.max(0.35, Math.min(2.8, control.zoomFactor));
      const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target);
      offset.divideScalar(mag);
      const clampedDist = THREE.MathUtils.clamp(offset.length(), 1.2, 18.0);
      offset.setLength(clampedDist);
      camera.position.copy(ctrl.target).add(offset);
      ctrl.update();
    }
  }, [
    control.commandId,
    control.mode,
    control.preset,
    control.yawDeg,
    control.pitchDeg,
    control.speed,
    control.zoomFactor,
    camera,
  ]);

  useFrame((_, delta) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const { yawRemaining, pitchRemaining, speed } = animState.current;
    if (Math.abs(yawRemaining) < 0.002 && Math.abs(pitchRemaining) < 0.002) return;

    const dt = Math.min(delta, 0.05);
    const stepRate = 1.6 * speed * dt;

    const dYaw =
      Math.abs(yawRemaining) <= stepRate ? yawRemaining : Math.sign(yawRemaining) * stepRate;
    const dPitch =
      Math.abs(pitchRemaining) <= stepRate * 0.7
        ? pitchRemaining
        : Math.sign(pitchRemaining) * stepRate * 0.7;

    animState.current.yawRemaining -= dYaw;
    animState.current.pitchRemaining -= dPitch;

    const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += dYaw;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - dPitch, 0.15, Math.PI / 2 - 0.04);
    offset.setFromSpherical(spherical);
    camera.position.copy(ctrl.target).add(offset);
    ctrl.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      autoRotate={control.mode === 'auto_rotate'}
      autoRotateSpeed={(control.speed ?? 1.0) * 2.0}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  );
}

function StaticStructure({ structure }: { structure: StructureState }) {
  const nodeMap = useMemo(() => {
    const map = new Map<string, NodePoint>();
    structure.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [structure.nodes]);

  const spec = structure.buildingSpec;
  const selectedUnitType = useMemo(
    () => spec?.unitTypes?.find((u) => u.id === structure.selectedUnitTypeId) ?? null,
    [spec?.unitTypes, structure.selectedUnitTypeId]
  );

  const isHeatmap = Boolean(structure.isLoadHeatmapActive && spec);
  const kdsRange = spec ? getKdsLoadRange(spec.usageType) : null;

  // 높이 Y 좌표를 기준으로 해당 위치의 층 번호 및 KDS 하중 부담률(0~1+) 계산
  const getHeatmapRatioAtY = (yPos: number, isVerticalColumn = false): number | null => {
    if (!isHeatmap || !spec || !kdsRange) return null;
    const maxY = Math.max(2.0, ...((structure.solids ?? []).map((s) => s.position[1] + s.scale[1] * 0.5)));
    const floors = Math.max(1, spec.floors);
    const floorIdx = Math.min(floors, Math.max(1, Math.ceil((Math.max(0.05, yPos) / maxY) * floors)));
    const floorLoad = spec.floorLoadsKn?.[floorIdx] ?? kdsRange.legalBaseKn;

    // 수직 기둥은 상층부 하중까지 누적 부담
    if (isVerticalColumn) {
      let upperSum = 0;
      let upperCount = 0;
      for (let f = floorIdx; f <= floors; f++) {
        upperSum += spec.floorLoadsKn?.[f] ?? kdsRange.legalBaseKn;
        upperCount += 1;
      }
      const cumulativeAvg = upperSum / Math.max(1, upperCount);
      const heightFactor = 1 + ((floors - floorIdx + 1) / floors) * 0.25;
      return (cumulativeAvg * heightFactor) / kdsRange.legalMaxKn;
    }

    return floorLoad / kdsRange.legalMaxKn;
  };

  return (
    <group>
      {/* 메인 건물/구조물 솔리드 */}
      {(structure.solids ?? []).map((solid) => (
        <SolidMeshView
          key={solid.id}
          solid={solid}
          defaultMaterial={structure.activeMaterial}
          defaultColor={structure.activeColor}
          xrayUnitMode={Boolean(selectedUnitType)}
          heatmapRatio={getHeatmapRatioAtY(solid.position[1], false)}
        />
      ))}

      {/* 선택된 방 유형의 건물 내부 3D 배치 하이라이트 블록 */}
      {selectedUnitType &&
        selectedUnitType.placements.map((pl, idx) => (
          <group key={`unit_pl_${idx}`} position={pl.position} scale={pl.scale}>
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={selectedUnitType.color}
                emissive={selectedUnitType.color}
                emissiveIntensity={0.85}
                transparent
                opacity={0.78}
              />
            </mesh>
            <mesh scale={[1.01, 1.01, 1.01]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.7} />
            </mesh>
          </group>
        ))}

      {/* 조인트 노드 */}
      {structure.nodes.map((node) => {
        const isGrounded = node.isFixed;
        const heatRatio = getHeatmapRatioAtY(node.position[1], true);
        const nodeColor =
          heatRatio !== null
            ? computeWhiteToRedColor(heatRatio)
            : isGrounded
            ? FIXED_AMBER
            : structure.activeColor;

        return (
          <mesh key={node.id} position={node.position}>
            {isGrounded ? (
              <boxGeometry args={[0.16, 0.16, 0.16]} />
            ) : (
              <sphereGeometry args={[0.075, 16, 16]} />
            )}
            <meshStandardMaterial
              color={nodeColor}
              emissive={nodeColor}
              emissiveIntensity={heatRatio !== null ? 0.6 : structure.activeMaterial === 'hologram' ? 1.1 : 0.2}
              metalness={0.5}
              roughness={0.25}
              transparent={Boolean(selectedUnitType)}
              opacity={selectedUnitType ? 0.25 : 1}
            />
          </mesh>
        );
      })}

      {/* 구조 기둥 & 보 부재 */}
      {structure.beams.map((beam) => {
        const n1 = nodeMap.get(beam.startNodeId);
        const n2 = nodeMap.get(beam.endNodeId);
        if (!n1 || !n2) return null;

        const p1 = new THREE.Vector3(...n1.position);
        const p2 = new THREE.Vector3(...n2.position);
        const { mid, length, quat } = computeBeamTransform(p1, p2);

        const isVertical = Math.abs(p2.y - p1.y) > Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const heatRatio = getHeatmapRatioAtY(mid.y, isVertical);

        const matKey = beam.material ?? structure.activeMaterial ?? 'hologram';
        const specMat = MATERIAL_SPECS[matKey];
        const baseColor = new THREE.Color(beam.color ?? specMat.defaultHex);
        const stressBlend = Math.max(0, (beam.stress - 0.45) * 1.8);
        const finalColor =
          heatRatio !== null
            ? computeWhiteToRedColor(heatRatio)
            : baseColor.clone().lerp(DANGER_RED, Math.min(1, stressBlend));
        const radius = beam.radius ?? 0.04;

        return (
          <mesh key={beam.id} position={mid} quaternion={quat} scale={[1, length, 1]}>
            <cylinderGeometry args={[radius, radius, 1, 16]} />
            <meshStandardMaterial
              color={finalColor}
              emissive={finalColor}
              emissiveIntensity={heatRatio !== null ? 0.45 : specMat.emissiveIntensity + stressBlend * 1.1}
              metalness={heatRatio !== null ? 0.2 : specMat.metalness}
              roughness={heatRatio !== null ? 0.35 : specMat.roughness}
              transparent={Boolean(selectedUnitType || heatRatio !== null)}
              opacity={selectedUnitType ? 0.25 : heatRatio !== null ? 0.72 : 1}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function DynamicPhysicsStructure({
  structure,
  onUpdateStress,
}: {
  structure: StructureState;
  onUpdateStress: (updatedBeams: StructureState['beams']) => void;
}) {
  const bodyRefs = useRef<Record<string, RapierRigidBody | null>>({});
  const beamMeshRefs = useRef<Record<string, THREE.Mesh | null>>({});
  const beamMatRefs = useRef<Record<string, THREE.MeshStandardMaterial | null>>({});
  const latestStressRef = useRef<Record<string, number>>({});
  const lastSyncTimeRef = useRef<number>(0);

  const { initialPosMap, restLengthMap, unfixedCount, isPlanarSketch } = useMemo(() => {
    const posMap = new Map<string, THREE.Vector3>();
    let unfixed = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;

    structure.nodes.forEach((n) => {
      posMap.set(n.id, new THREE.Vector3(...n.position));
      if (!n.isFixed) unfixed += 1;
      minZ = Math.min(minZ, n.position[2]);
      maxZ = Math.max(maxZ, n.position[2]);
    });

    const lenMap = new Map<string, number>();
    structure.beams.forEach((b) => {
      const p1 = posMap.get(b.startNodeId);
      const p2 = posMap.get(b.endNodeId);
      if (p1 && p2) {
        lenMap.set(b.id, Math.max(0.08, p1.distanceTo(p2)));
      }
    });

    return {
      initialPosMap: posMap,
      restLengthMap: lenMap,
      unfixedCount: Math.max(1, unfixed),
      isPlanarSketch: maxZ - minZ < 0.15,
    };
  }, [structure.nodes, structure.beams.length]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.016);
    const loadForcePerNode = Math.min(28, (structure.targetLoadKg / unfixedCount) * 0.35);
    const springK = 52.0;
    const dampingC = 14.0;

    structure.nodes.forEach((node) => {
      if (node.isFixed) return;
      const body = bodyRefs.current[node.id];
      if (!body) return;

      body.applyImpulse({ x: 0, y: -loadForcePerNode * dt, z: 0 }, true);

      const pos = body.translation();
      const vel = body.linvel();
      if (!Number.isFinite(vel.x) || !Number.isFinite(vel.y) || !Number.isFinite(vel.z)) return;

      let vx = THREE.MathUtils.clamp(vel.x, -2.2, 2.2);
      let vy = THREE.MathUtils.clamp(vel.y, -2.2, 2.2);
      let vz = isPlanarSketch ? 0 : THREE.MathUtils.clamp(vel.z, -2.2, 2.2);

      if (pos.y <= 0.06 && vy < 0) {
        body.setTranslation({ x: pos.x, y: 0.06, z: pos.z }, true);
        vy = 0;
        vx *= 0.85;
        vz *= 0.85;
      }

      body.setLinvel({ x: vx, y: vy, z: vz }, true);
    });

    structure.beams.forEach((beam) => {
      const bodyA = bodyRefs.current[beam.startNodeId];
      const bodyB = bodyRefs.current[beam.endNodeId];
      const mesh = beamMeshRefs.current[beam.id];
      const mat = beamMatRefs.current[beam.id];
      const restLen = restLengthMap.get(beam.id);

      if (!bodyA || !bodyB || !mesh || !mat || !restLen) return;

      const tA = bodyA.translation();
      const tB = bodyB.translation();
      if (!Number.isFinite(tA.x) || !Number.isFinite(tB.x)) return;

      const pA = new THREE.Vector3(tA.x, tA.y, tA.z);
      const pB = new THREE.Vector3(tB.x, tB.y, tB.z);
      const diff = new THREE.Vector3().subVectors(pB, pA);
      const currentLen = Math.max(0.02, diff.length());
      const displacement = THREE.MathUtils.clamp(currentLen - restLen, -0.8, 0.8);
      const dir = diff.clone().normalize();

      const vA = bodyA.linvel();
      const vB = bodyB.linvel();
      const relVel = new THREE.Vector3(vB.x - vA.x, vB.y - vA.y, vB.z - vA.z).dot(dir);

      const springForce = displacement * springK + relVel * dampingC;
      const impulseMag = THREE.MathUtils.clamp(springForce * dt, -3.5, 3.5);

      const nodeA = structure.nodes.find((n) => n.id === beam.startNodeId);
      const nodeB = structure.nodes.find((n) => n.id === beam.endNodeId);

      if (nodeA && !nodeA.isFixed) {
        bodyA.applyImpulse({ x: dir.x * impulseMag, y: dir.y * impulseMag, z: dir.z * impulseMag }, true);
      }
      if (nodeB && !nodeB.isFixed) {
        bodyB.applyImpulse({ x: -dir.x * impulseMag, y: -dir.y * impulseMag, z: -dir.z * impulseMag }, true);
      }

      const strain = Math.abs(displacement) / restLen;
      const stress = THREE.MathUtils.clamp(strain * 5.5, 0.06, 1.0);
      latestStressRef.current[beam.id] = stress;

      const { mid, length, quat } = computeBeamTransform(pA, pB);
      if (Number.isFinite(length) && length > 0.001) {
        mesh.position.copy(mid);
        mesh.quaternion.copy(quat);
        mesh.scale.set(1, length, 1);
      }

      const matKey = beam.material ?? structure.activeMaterial ?? 'hologram';
      const spec = MATERIAL_SPECS[matKey];
      const baseColor = new THREE.Color(beam.color ?? spec.defaultHex);
      const lerpedColor = baseColor.clone().lerp(DANGER_RED, stress);
      mat.color.copy(lerpedColor);
      mat.emissive.copy(lerpedColor);
      mat.emissiveIntensity = spec.emissiveIntensity + stress * 1.2;
    });

    const now = state.clock.elapsedTime;
    if (now - lastSyncTimeRef.current > 0.25) {
      lastSyncTimeRef.current = now;
      const updatedBeams: BeamMember[] = structure.beams.map((b) => ({
        ...b,
        stress: Number((latestStressRef.current[b.id] ?? b.stress).toFixed(2)),
      }));
      onUpdateStress(updatedBeams);
    }
  });

  return (
    <group>
      <RigidBody type="fixed" position={[0, -0.5, 0]}>
        <mesh>
          <boxGeometry args={[40, 1, 40]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      </RigidBody>

      {(structure.solids ?? []).map((solid) => (
        <RigidBody
          key={solid.id}
          type={solid.isFixed ? 'fixed' : 'dynamic'}
          position={solid.position}
          linearDamping={2.0}
          angularDamping={2.0}
          restitution={0.3}
          colliders="hull"
        >
          <SolidMeshView
            solid={{ ...solid, position: [0, 0, 0] }}
            defaultMaterial={structure.activeMaterial}
            defaultColor={structure.activeColor}
            xrayUnitMode={false}
            heatmapRatio={null}
          />
        </RigidBody>
      ))}

      {structure.nodes.map((node) => {
        const initPos = initialPosMap.get(node.id) ?? new THREE.Vector3(...node.position);
        return (
          <RigidBody
            key={node.id}
            ref={(el) => {
              bodyRefs.current[node.id] = el;
            }}
            type={node.isFixed ? 'fixed' : 'dynamic'}
            mass={4.0}
            position={[initPos.x, initPos.y, initPos.z]}
            linearDamping={7.5}
            angularDamping={8.0}
            colliders={false}
          >
            <mesh>
              {node.isFixed ? (
                <boxGeometry args={[0.16, 0.16, 0.16]} />
              ) : (
                <sphereGeometry args={[0.075, 16, 16]} />
              )}
              <meshStandardMaterial
                color={node.isFixed ? FIXED_AMBER : structure.activeColor}
                emissive={node.isFixed ? FIXED_AMBER : structure.activeColor}
                emissiveIntensity={0.6}
              />
            </mesh>
          </RigidBody>
        );
      })}

      {structure.beams.map((beam) => {
        const matKey = beam.material ?? structure.activeMaterial ?? 'hologram';
        const spec = MATERIAL_SPECS[matKey];
        const radius = beam.radius ?? 0.04;
        return (
          <mesh
            key={beam.id}
            ref={(el) => {
              beamMeshRefs.current[beam.id] = el;
            }}
          >
            <cylinderGeometry args={[radius, radius, 1, 16]} />
            <meshStandardMaterial
              ref={(el) => {
                beamMatRefs.current[beam.id] = el;
              }}
              color={beam.color ?? spec.defaultHex}
              emissive={beam.color ?? spec.defaultHex}
              emissiveIntensity={spec.emissiveIntensity}
              metalness={spec.metalness}
              roughness={spec.roughness}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export default function SceneCanvas({ structure, onUpdateStress }: Props) {
  const simKey = `${structure.solids?.length ?? 0}-${structure.nodes.length}-${structure.beams.length}`;

  return (
    <div className="w-full h-full bg-[#050811]">
      <Canvas
        camera={{ position: [0, 2.4, 5.2], fov: 45 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#050811']} />
        <fog attach="fog" args={['#050811', 10, 26]} />

        <ambientLight intensity={0.65} />
        <directionalLight position={[6, 10, 6]} intensity={2.2} color="#ffffff" />
        <directionalLight position={[-6, 4, -4]} intensity={1.1} color="#38bdf8" />
        <pointLight position={[0, 4, 3]} intensity={1.1} color="#fef3c7" />

        <StudioReflectionEnv />

        <Grid
          position={[0, 0, 0]}
          args={[24, 24]}
          cellSize={0.25}
          cellThickness={0.6}
          cellColor="#0b3b4c"
          sectionSize={1}
          sectionThickness={1.2}
          sectionColor="#00f3ff"
          fadeDistance={18}
          fadeStrength={1.2}
          infiniteGrid
        />

        {structure.isSimulating ? (
          <Physics key={simKey} gravity={[0, -9.81, 0]}>
            <DynamicPhysicsStructure structure={structure} onUpdateStress={onUpdateStress} />
          </Physics>
        ) : (
          <StaticStructure structure={structure} />
        )}

        <CameraController
          control={structure.cameraControl}
          shiftRightForPlan={Boolean(structure.selectedUnitTypeId)}
        />
      </Canvas>
    </div>
  );
}