import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, Grid, Line, OrbitControls } from '@react-three/drei';
import { Physics, RigidBody, RapierRigidBody } from '@react-three/rapier';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  StructureState,
  NodePoint,
  BeamMember,
  CadMaterial,
  CameraControlState,
} from '../types/cad';
import { consumeCameraZoom } from '../services/cameraGesture';

export interface SceneHandCursor {
  position: [number, number, number];
  pinching: boolean;
  /** 핀치하면 이 좌표에서 커서까지 빔이 생김 (없으면 새 스트로크) */
  linkFrom: [number, number, number] | null;
}

interface Props {
  structure: StructureState;
  onUpdateStress: (updatedBeams: StructureState['beams']) => void;
  handCursor?: SceneHandCursor | null;
}

const DANGER_RED = new THREE.Color('#ff1e42');
const FIXED_AMBER = new THREE.Color('#ff9900');
const UP_VEC = new THREE.Vector3(0, 1, 0);

const MATERIAL_SPECS: Record<
  CadMaterial,
  { defaultHex: string; metalness: number; roughness: number; emissiveIntensity: number }
> = {
  hologram: { defaultHex: '#00f3ff', metalness: 0.1, roughness: 0.25, emissiveIntensity: 1.35 },
  steel: { defaultHex: '#e2e8f0', metalness: 0.92, roughness: 0.2, emissiveIntensity: 0.08 },
  titanium: { defaultHex: '#64748b', metalness: 0.95, roughness: 0.24, emissiveIntensity: 0.1 },
  carbon: { defaultHex: '#1e293b', metalness: 0.2, roughness: 0.72, emissiveIntensity: 0.04 },
  gold: { defaultHex: '#fbbf24', metalness: 0.98, roughness: 0.14, emissiveIntensity: 0.16 },
};

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
    grad.addColorStop(0.35, '#94a3b8');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(0.75, '#38bdf8');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(25, 14, 70, 22);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(155, 18, 75, 24);

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

function CameraController({ control = { mode: 'free' } }: { control?: CameraControlState }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const animState = useRef({
    yawRemaining: 0,
    pitchRemaining: 0,
    speed: 1.0,
  });

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

    // zoomFactor > 1 이면 확대(카메라 거리 나누기), < 1 이면 축소(카메라 거리 늘리기)
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

    // 손 제스처 줌 (양손 펴고 벌리기=확대 / 모으기=축소)
    const zoomLog = consumeCameraZoom(Math.min(delta, 0.05));
    if (zoomLog !== 0) {
      const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(-zoomLog), 1.2, 18.0));
      camera.position.copy(ctrl.target).add(offset);
      ctrl.update();
    }

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

  return (
    <group>
      {structure.nodes.map((node) => {
        const isGrounded = node.isFixed;
        return (
          <mesh key={node.id} position={node.position}>
            {isGrounded ? (
              <boxGeometry args={[0.16, 0.16, 0.16]} />
            ) : (
              <sphereGeometry args={[0.075, 16, 16]} />
            )}
            <meshStandardMaterial
              color={isGrounded ? FIXED_AMBER : structure.activeColor}
              emissive={isGrounded ? FIXED_AMBER : structure.activeColor}
              emissiveIntensity={structure.activeMaterial === 'hologram' ? 1.1 : 0.2}
              metalness={0.6}
              roughness={0.25}
            />
          </mesh>
        );
      })}

      {structure.beams.map((beam) => {
        const n1 = nodeMap.get(beam.startNodeId);
        const n2 = nodeMap.get(beam.endNodeId);
        if (!n1 || !n2) return null;

        const p1 = new THREE.Vector3(...n1.position);
        const p2 = new THREE.Vector3(...n2.position);
        const { mid, length, quat } = computeBeamTransform(p1, p2);

        const matKey = beam.material ?? structure.activeMaterial ?? 'hologram';
        const spec = MATERIAL_SPECS[matKey];
        const baseColor = new THREE.Color(beam.color ?? spec.defaultHex);
        const stressBlend = Math.max(0, (beam.stress - 0.45) * 1.8);
        const finalColor = baseColor.clone().lerp(DANGER_RED, Math.min(1, stressBlend));
        const radius = beam.radius ?? 0.038;

        return (
          <mesh key={beam.id} position={mid} quaternion={quat} scale={[1, length, 1]}>
            <cylinderGeometry args={[radius, radius, 1, 16]} />
            <meshStandardMaterial
              color={finalColor}
              emissive={stressBlend > 0.2 ? DANGER_RED : finalColor}
              emissiveIntensity={spec.emissiveIntensity + stressBlend * 1.1}
              metalness={spec.metalness}
              roughness={spec.roughness}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// 임계 감쇠 스프링-댐퍼 기반 안정화 물리 시뮬레이션 (선 날뜀 원천 차단)
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
    const springK = 52.0;   // 안정적 강성
    const dampingC = 14.0;  // 축 방향 상대 속도 감쇠(진동 억제)

    // 1. 비고정 노드에 목표 하중 적용 + 속도/바닥 경계 안정화
    structure.nodes.forEach((node) => {
      if (node.isFixed) return;
      const body = bodyRefs.current[node.id];
      if (!body) return;

      body.applyImpulse({ x: 0, y: -loadForcePerNode * dt, z: 0 }, true);

      const pos = body.translation();
      const vel = body.linvel();
      if (!Number.isFinite(vel.x) || !Number.isFinite(vel.y) || !Number.isFinite(vel.z)) return;

      // 지면(y = 0.06) 이하 침투 방지 및 평면 스케치 Z축 고정
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

    // 2. 임계 감쇠 스프링-댐퍼 반력 계산 및 메시 업데이트
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

      // 두 노드 간 축 방향 상대 속도 계산 (진동 감쇠용)
      const vA = bodyA.linvel();
      const vB = bodyB.linvel();
      const relVel = new THREE.Vector3(vB.x - vA.x, vB.y - vA.y, vB.z - vA.z).dot(dir);

      const springForce = displacement * springK + relVel * dampingC;
      const impulseMag = THREE.MathUtils.clamp(springForce * dt, -3.5, 3.5);

      const nodeA = structure.nodes.find((n) => n.id === beam.startNodeId);
      const nodeB = structure.nodes.find((n) => n.id === beam.endNodeId);

      if (nodeA && !nodeA.isFixed) {
        bodyA.applyImpulse(
          { x: dir.x * impulseMag, y: dir.y * impulseMag, z: dir.z * impulseMag },
          true
        );
      }
      if (nodeB && !nodeB.isFixed) {
        bodyB.applyImpulse(
          { x: -dir.x * impulseMag, y: -dir.y * impulseMag, z: -dir.z * impulseMag },
          true
        );
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
        const radius = beam.radius ?? 0.038;
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

/** 손 커서: 핀치 시 노드가 찍힐 위치. 기존 노드에 겹치면 초록(병합), 핀치 중이면 빨강 */
function HandCursor({ cursor, nodes }: { cursor: SceneHandCursor; nodes: NodePoint[] }) {
  const [x, y, z] = cursor.position;
  const onNode = nodes.some(
    (n) => Math.hypot(n.position[0] - x, n.position[1] - y, n.position[2] - z) < 0.15
  );
  const color = cursor.pinching ? '#ff1e42' : onNode ? '#39ff88' : '#00f3ff';
  const r = cursor.pinching ? 0.09 : 0.14;

  return (
    <group renderOrder={10}>
      <Billboard position={cursor.position}>
        <mesh>
          <ringGeometry args={[r, r + 0.025, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} depthTest={false} toneMapped={false} />
        </mesh>
      </Billboard>

      {/* 깊이 가늠용: 바닥까지 수직선 + 바닥 그림자 링 */}
      {y > 0 && (
        <Line points={[cursor.position, [x, 0, z]]} color={color} lineWidth={1} dashed dashSize={0.06} gapSize={0.06} transparent opacity={0.5} />
      )}
      <mesh position={[x, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.13, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} />
      </mesh>

      {/* 다음 핀치로 생길 빔 미리보기 */}
      {cursor.linkFrom && (
        <Line points={[cursor.linkFrom, cursor.position]} color={color} lineWidth={2} dashed dashSize={0.1} gapSize={0.07} transparent opacity={0.8} depthTest={false} />
      )}
    </group>
  );
}

export default function SceneCanvas({ structure, onUpdateStress, handCursor }: Props) {
  const simKey = `${structure.nodes.length}-${structure.beams.length}`;

  return (
    <div className="w-full h-full bg-[#050811]">
      <Canvas camera={{ position: [0, 2.4, 5.2], fov: 45 }} gl={{ antialias: true }}>
        <color attach="background" args={['#050811']} />
        <fog attach="fog" args={['#050811', 10, 26]} />

        <ambientLight intensity={0.5} />
        <directionalLight position={[6, 10, 6]} intensity={2.2} color="#ffffff" />
        <directionalLight position={[-6, 4, -4]} intensity={1.1} color="#38bdf8" />
        <pointLight position={[0, 4, 3]} intensity={1.2} color="#fef3c7" />

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

        {handCursor && <HandCursor cursor={handCursor} nodes={structure.nodes} />}

        <CameraController control={structure.cameraControl} />
      </Canvas>
    </div>
  );
}