import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Html, Line, OrbitControls } from '@react-three/drei';
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
import { getKdsLoadRange, MATERIAL_CATALOG } from '../utils/buildingEstimator';
import { getFloorColor } from '../utils/architectureGenerator';

interface Props {
  structure: StructureState;
  onUpdateStress: (updatedBeams: StructureState['beams']) => void;
  onSelectPart: (partId: string | null) => void;
}

interface HoveredFloorTooltip {
  x: number;
  y: number;
  floorIndex: number;
  title: string;
  areaText: string;
  heightText: string;
  roomsText: string;
}

const WHITE_SAFE = new THREE.Color('#ffffff');
const WARN_AMBER = new THREE.Color('#fb923c');
const DANGER_RED = new THREE.Color('#ef4444');
const FIXED_SLATE = new THREE.Color('#475569');
const UP_VEC = new THREE.Vector3(0, 1, 0);

const MATERIAL_SPECS: Record<
  CadMaterial,
  { defaultHex: string; metalness: number; roughness: number; transparent?: boolean; opacity?: number }
> = {
  stucco: { defaultHex: '#f8fafc', metalness: 0.04, roughness: 0.65 },
  wood: { defaultHex: '#e7d5be', metalness: 0.08, roughness: 0.55 },
  concrete: { defaultHex: '#e2e8f0', metalness: 0.1, roughness: 0.72 },
  glass: { defaultHex: '#bae6fd', metalness: 0.35, roughness: 0.12, transparent: true, opacity: 0.58 },
  hologram: { defaultHex: '#cfe8fc', metalness: 0.25, roughness: 0.18, transparent: true, opacity: 0.65 },
  steel: { defaultHex: '#cbd5e1', metalness: 0.75, roughness: 0.25 },
  titanium: { defaultHex: '#d6d3d1', metalness: 0.8, roughness: 0.28 },
  carbon: { defaultHex: '#94a3b8', metalness: 0.2, roughness: 0.6 },
  gold: { defaultHex: '#fde68a', metalness: 0.82, roughness: 0.22 },
};

function computeWhiteToRedColor(ratio: number): THREE.Color {
  const clamped = THREE.MathUtils.clamp(ratio, 0, 1.3);
  if (clamped <= 0.72) {
    return WHITE_SAFE.clone().lerp(new THREE.Color('#fef3c7'), clamped / 0.72);
  }
  if (clamped <= 1.0) {
    return new THREE.Color('#fef3c7').lerp(WARN_AMBER, (clamped - 0.72) / 0.28);
  }
  return WARN_AMBER.clone().lerp(DANGER_RED, Math.min(1, (clamped - 1.0) / 0.3));
}

function computeBeamTransform(p1: THREE.Vector3, p2: THREE.Vector3) {
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const diff = new THREE.Vector3().subVectors(p2, p1);
  const length = Math.max(0.005, diff.length());
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, diff.clone().normalize());
  return { mid, length, quat };
}

function SolidShapeGeometry({ shape }: { shape: SolidPrimitive['shape'] }) {
  if (shape === 'sphere') return <sphereGeometry args={[0.8, 24, 24]} />;
  if (shape === 'cone') return <coneGeometry args={[0.8, 1.4, 20]} />;
  if (shape === 'cylinder') return <cylinderGeometry args={[0.7, 0.7, 1.2, 24]} />;
  if (shape === 'torus') return <torusGeometry args={[0.7, 0.25, 16, 32]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

function SolidMeshView({
  solid,
  defaultMaterial,
  defaultColor,
  xrayUnitMode,
  heatmapRatio,
  isSelected,
  isFloorHovered,
  isParamHighlighted,
  onSelect,
  onHoverFloor,
  onLeaveFloor,
}: {
  solid: SolidPrimitive;
  defaultMaterial: CadMaterial;
  defaultColor: string;
  xrayUnitMode: boolean;
  heatmapRatio: number | null;
  isSelected: boolean;
  isFloorHovered: boolean;
  isParamHighlighted: boolean;
  onSelect?: () => void;
  onHoverFloor?: (clientX: number, clientY: number) => void;
  onLeaveFloor?: () => void;
}) {
  const matKey = solid.material ?? defaultMaterial ?? 'stucco';
  const spec = MATERIAL_SPECS[matKey] ?? MATERIAL_SPECS.stucco;

  // 층별 은은한 컬러 구분 적용
  const floorTint =
    typeof solid.floorIndex === 'number' && solid.partRole !== 'interior_wall' && solid.partRole !== 'garden'
      ? getFloorColor(solid.floorIndex)
      : null;

  const baseHex =
    solid.color && solid.color !== '#00f3ff'
      ? solid.color
      : floorTint ?? MATERIAL_CATALOG[matKey]?.hex ?? defaultColor ?? spec.defaultHex;

  if (heatmapRatio !== null) {
    const heatColor = computeWhiteToRedColor(heatmapRatio);
    return (
      <group
        position={solid.position}
        scale={solid.scale}
        rotation={solid.rotation ?? [0, 0, 0]}
        onClick={(e) => {
          if (onSelect) {
            e.stopPropagation();
            onSelect();
          }
        }}
      >
        <mesh>
          <SolidShapeGeometry shape={solid.shape} />
          <meshStandardMaterial
            color={heatColor}
            emissive={heatColor}
            emissiveIntensity={0.18}
            roughness={0.4}
            transparent
            opacity={0.48}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.003, 1.003, 1.003]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.35} />
        </mesh>
      </group>
    );
  }

  // 방 유형(TYPE-A 등) 선택 시:
  // 지붕과 상부 슬래브는 컷어웨이(반투명 유리)로 열어주고, 외벽과 내벽(interior_wall)은 실체감 있게 보여줌!
  if (xrayUnitMode) {
    const isRoofOrUpperSlab =
      solid.partRole === 'roof' ||
      solid.partRole === 'sculpture' ||
      (solid.partRole === 'slab' && (solid.floorIndex ?? 1) > 1);
    const isWall = solid.partRole === 'exterior_wall' || solid.partRole === 'interior_wall';

    return (
      <group
        position={solid.position}
        scale={solid.scale}
        rotation={solid.rotation ?? [0, 0, 0]}
        onClick={(e) => {
          if (onSelect) {
            e.stopPropagation();
            onSelect();
          }
        }}
        onPointerMove={(e) => {
          if (onHoverFloor) {
            e.stopPropagation();
            onHoverFloor(e.clientX, e.clientY);
          }
        }}
        onPointerOut={() => onLeaveFloor?.()}
      >
        <mesh>
          <SolidShapeGeometry shape={solid.shape} />
          <meshStandardMaterial
            color={solid.partRole === 'interior_wall' ? '#0f172a' : baseHex}
            roughness={0.45}
            transparent
            opacity={isRoofOrUpperSlab ? 0.12 : isWall ? 0.85 : 0.45}
            depthWrite={!isRoofOrUpperSlab}
          />
        </mesh>
        {isWall && (
          <mesh scale={[1.003, 1.003, 1.003]}>
            <SolidShapeGeometry shape={solid.shape} />
            <meshBasicMaterial
              color={solid.partRole === 'interior_wall' ? '#0284c7' : '#475569'}
              wireframe
              transparent
              opacity={0.45}
            />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group
      position={solid.position}
      scale={solid.scale}
      rotation={solid.rotation ?? [0, 0, 0]}
      onClick={(e) => {
        if (onSelect) {
          e.stopPropagation();
          onSelect();
        }
      }}
      onPointerMove={(e) => {
        if (onHoverFloor) {
          e.stopPropagation();
          onHoverFloor(e.clientX, e.clientY);
        }
      }}
      onPointerOut={() => onLeaveFloor?.()}
    >
      <mesh>
        <SolidShapeGeometry shape={solid.shape} />
        <meshStandardMaterial
          color={
            isParamHighlighted
              ? '#38bdf8'
              : isFloorHovered
              ? '#e0f2fe'
              : baseHex
          }
          emissive={isParamHighlighted ? '#0284c7' : isFloorHovered ? '#38bdf8' : '#000000'}
          emissiveIntensity={isParamHighlighted ? 0.25 : isFloorHovered ? 0.14 : 0}
          metalness={spec.metalness}
          roughness={spec.roughness}
          transparent={Boolean(spec.transparent || solid.partRole === 'basement')}
          opacity={solid.partRole === 'basement' ? 0.55 : spec.opacity ?? 1}
        />
      </mesh>
      {/* 건축 외곽선(에지 라인) 및 선택 하이라이트 */}
      <mesh scale={[1.003, 1.003, 1.003]}>
        <SolidShapeGeometry shape={solid.shape} />
        <meshBasicMaterial
          color={isSelected ? '#0284c7' : isParamHighlighted ? '#0369a1' : '#94a3b8'}
          wireframe
          transparent
          opacity={isSelected || isParamHighlighted ? 0.85 : 0.22}
        />
      </mesh>
    </group>
  );
}

function CameraController({
  control = { mode: 'free' },
}: {
  control?: CameraControlState;
}) {
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
        camera.position.set(0, 1.8, 6.2);
        ctrl.target.set(0, 1.1, 0);
      } else if (control.preset === 'top') {
        camera.position.set(0, 7.6, 0.1);
        ctrl.target.set(0, 0, 0);
      } else {
        camera.position.set(4.5, 3.6, 5.4);
        ctrl.target.set(0, 1.1, 0);
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
      const clampedDist = THREE.MathUtils.clamp(offset.length(), 1.2, 20.0);
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
      dampingFactor={0.09}
      autoRotate={control.mode === 'auto_rotate'}
      autoRotateSpeed={(control.speed ?? 1.0) * 1.8}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  );
}

function StaticStructure({
  structure,
  hoveredFloorIndex,
  onSelectPart,
  onHoverFloor,
  onLeaveFloor,
}: {
  structure: StructureState;
  hoveredFloorIndex: number | null;
  onSelectPart: (partId: string | null) => void;
  onHoverFloor: (floorIndex: number, clientX: number, clientY: number) => void;
  onLeaveFloor: () => void;
}) {
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
  const vizKey = structure.activeSpecViz?.paramKey;

  const getHeatmapRatioAtY = (yPos: number, isVerticalColumn = false): number | null => {
    if (!isHeatmap || !spec || !kdsRange) return null;
    const maxY = Math.max(
      2.0,
      ...(structure.solids ?? []).map((s) => s.position[1] + s.scale[1] * 0.5)
    );
    const floors = Math.max(1, spec.floors);
    const floorIdx = Math.min(
      floors,
      Math.max(1, Math.ceil((Math.max(0.05, yPos) / maxY) * floors))
    );
    const floorLoad = spec.floorLoadsKn?.[floorIdx] ?? kdsRange.legalBaseKn;

    if (isVerticalColumn) {
      let upperSum = 0;
      let upperCount = 0;
      for (let f = floorIdx; f <= floors; f++) {
        upperSum += spec.floorLoadsKn?.[f] ?? kdsRange.legalBaseKn;
        upperCount += 1;
      }
      const cumulativeAvg = upperSum / Math.max(1, upperCount);
      return cumulativeAvg / kdsRange.designCapacityKn;
    }

    return floorLoad / kdsRange.designCapacityKn;
  };

  // 실시간 수치 조절 시 3D 치수선 · 높이 폴대 · 대지 경계선 계산
  const dimGuides = useMemo(() => {
    if (!spec) return null;
    const SCALE_DIV = 3.2;
    const siteSideM = Math.sqrt(Math.max(100, spec.siteAreaSqm));
    const sw = Math.max(3.2, Math.min(13.5, siteSideM / SCALE_DIV)) * 0.5;
    const sd = sw * 0.86;
    const totalH = Math.max(1.1, Math.min(9.5, spec.heightMeters / SCALE_DIV));
    const gardenSolid = (structure.solids ?? []).find((s) => s.partRole === 'garden');

    return {
      siteBoundary: [
        [-sw, 0.015, -sd],
        [sw, 0.015, -sd],
        [sw, 0.015, sd],
        [-sw, 0.015, sd],
        [-sw, 0.015, -sd],
      ] as [number, number, number][],
      heightPole: [
        [-sw + 0.25, 0, sd - 0.25],
        [-sw + 0.25, totalH, sd - 0.25],
      ] as [number, number, number][],
      topLabelPos: [-sw + 0.25, totalH + 0.22, sd - 0.25] as [number, number, number],
      gardenLabelPos: gardenSolid
        ? ([gardenSolid.position[0], 0.35, gardenSolid.position[2]] as [number, number, number])
        : ([1.8, 0.35, 0] as [number, number, number]),
    };
  }, [spec, structure.solids]);

  return (
    <group>
      {/* 빈틈없는 건축 매스 · 외벽 · 내벽 · 슬래브 · 옥상 */}
      {(structure.solids ?? []).map((solid) => {
        const isParamHighlighted =
          (vizKey === 'gardenAreaSqm' && solid.partRole === 'garden') ||
          ((vizKey === 'undergroundFloors' || vizKey === 'undergroundAreaSqm') &&
            solid.partRole === 'basement') ||
          (vizKey === 'rooftops' && solid.partRole === 'roof') ||
          ((vizKey === 'elevators' || vizKey === 'stairs') && solid.partRole === 'core');

        return (
          <SolidMeshView
            key={solid.id}
            solid={solid}
            defaultMaterial={structure.activeMaterial}
            defaultColor={structure.activeColor}
            xrayUnitMode={Boolean(selectedUnitType)}
            heatmapRatio={getHeatmapRatioAtY(solid.position[1], false)}
            isSelected={structure.selectedPartId === solid.id}
            isFloorHovered={
              typeof solid.floorIndex === 'number' &&
              solid.floorIndex !== 0 &&
              hoveredFloorIndex === solid.floorIndex
            }
            isParamHighlighted={isParamHighlighted}
            onSelect={() => onSelectPart(solid.id)}
            onHoverFloor={(cx, cy) => {
              if (typeof solid.floorIndex === 'number' && solid.floorIndex !== 0) {
                onHoverFloor(solid.floorIndex, cx, cy);
              }
            }}
            onLeaveFloor={onLeaveFloor}
          />
        );
      })}

      {/* 외벽 개구부 내부에 정확히 매립된 3D 유리 창호 */}
      {!isHeatmap &&
        (spec?.exteriorWindows ?? []).map((win) => (
          <group
            key={win.id}
            position={win.position}
            rotation={[0, win.rotationY, 0]}
            scale={win.scale}
          >
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color="#7dd3fc"
                metalness={0.4}
                roughness={0.12}
                transparent
                opacity={selectedUnitType ? 0.35 : 0.72}
              />
            </mesh>
            <mesh scale={[1.01, 1.01, 1.05]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color="#334155" wireframe transparent opacity={0.4} />
            </mesh>
          </group>
        ))}

      {/* 수도·전기 배관 3D 라인 */}
      {(structure.showMepPipes || Boolean(selectedUnitType)) &&
        (spec?.mepPipes ?? []).map((pipe) => (
          <Line
            key={pipe.id}
            points={pipe.points}
            color={pipe.system === 'water' ? '#2563eb' : '#d97706'}
            lineWidth={pipe.id.includes('riser') ? 3.5 : 2.0}
          />
        ))}

      {/* 방 유형 선택 시 내부 방 바닥 존 하이라이트 (내벽·외벽을 가리지 않도록 얇은 바닥 구역 표시) */}
      {selectedUnitType &&
        selectedUnitType.placements.map((pl, idx) => (
          <group
            key={`unit_pl_${idx}`}
            position={[pl.position[0], pl.position[1] - pl.scale[1] * 0.35, pl.position[2]]}
            scale={[pl.scale[0], pl.scale[1] * 0.25, pl.scale[2]]}
          >
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={selectedUnitType.color}
                emissive={selectedUnitType.color}
                emissiveIntensity={0.35}
                transparent
                opacity={0.65}
              />
            </mesh>
          </group>
        ))}

      {/* 대지 경계선 및 높이 기준 스케일 폴 (수치 조절 시 실시간 크기 변화 가시화) */}
      {dimGuides && (
        <group>
          <Line
            points={dimGuides.siteBoundary}
            color={vizKey === 'siteAreaSqm' ? '#0284c7' : '#94a3b8'}
            lineWidth={vizKey === 'siteAreaSqm' ? 2.5 : 1.2}
            dashed
            dashSize={0.25}
            gapSize={0.15}
          />
          <Line
            points={dimGuides.heightPole}
            color={vizKey === 'heightMeters' || vizKey === 'floors' ? '#0284c7' : '#64748b'}
            lineWidth={vizKey === 'heightMeters' || vizKey === 'floors' ? 3 : 1.5}
          />
          {structure.activeSpecViz && spec && (
            <Html
              position={
                vizKey === 'gardenAreaSqm'
                  ? dimGuides.gardenLabelPos
                  : dimGuides.topLabelPos
              }
              center
              distanceFactor={10}
            >
              <div className="px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[11px] font-mono whitespace-nowrap shadow-lg border border-sky-400">
                <span className="text-sky-300 font-bold">{structure.activeSpecViz.label}:</span>{' '}
                <span>{structure.activeSpecViz.formattedValue}</span>
                {structure.activeSpecViz.deltaText && (
                  <span className="ml-1.5 text-amber-300 font-bold">
                    ({structure.activeSpecViz.deltaText})
                  </span>
                )}
              </div>
            </Html>
          )}
        </group>
      )}

      {/* 구조 조인트 노드 & 기둥 */}
      {structure.nodes.map((node) => {
        const isGrounded = node.isFixed;
        const heatRatio = getHeatmapRatioAtY(node.position[1], true);
        const nodeColor =
          heatRatio !== null
            ? computeWhiteToRedColor(heatRatio)
            : isGrounded
            ? FIXED_SLATE
            : '#94a3b8';

        return (
          <mesh key={node.id} position={node.position}>
            {isGrounded ? (
              <boxGeometry args={[0.11, 0.11, 0.11]} />
            ) : (
              <sphereGeometry args={[0.05, 10, 10]} />
            )}
            <meshStandardMaterial color={nodeColor} metalness={0.35} roughness={0.35} />
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

        const isVertical = Math.abs(p2.y - p1.y) > Math.hypot(p2.x - p1.x, p2.z - p1.z);
        const heatRatio = getHeatmapRatioAtY(mid.y, isVertical);

        const matKey = beam.material ?? structure.activeMaterial ?? 'steel';
        const specMat = MATERIAL_SPECS[matKey] ?? MATERIAL_SPECS.steel;
        const baseColor = new THREE.Color(
          beam.color && beam.color !== '#00f3ff' ? beam.color : specMat.defaultHex
        );
        const stressBlend = Math.max(0, (beam.stress - 0.55) * 1.6);
        const finalColor =
          heatRatio !== null
            ? computeWhiteToRedColor(heatRatio)
            : baseColor.clone().lerp(DANGER_RED, Math.min(1, stressBlend));
        const radius = beam.radius ?? 0.032;

        return (
          <mesh key={beam.id} position={mid} quaternion={quat} scale={[1, length, 1]}>
            <cylinderGeometry args={[radius, radius, 1, 10]} />
            <meshStandardMaterial
              color={finalColor}
              metalness={heatRatio !== null ? 0.15 : specMat.metalness}
              roughness={heatRatio !== null ? 0.4 : specMat.roughness}
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
      const stress = THREE.MathUtils.clamp(strain * 4.5, 0.05, 1.0);
      latestStressRef.current[beam.id] = stress;

      const { mid, length, quat } = computeBeamTransform(pA, pB);
      if (Number.isFinite(length) && length > 0.001) {
        mesh.position.copy(mid);
        mesh.quaternion.copy(quat);
        mesh.scale.set(1, length, 1);
      }

      const baseColor = new THREE.Color('#cbd5e1');
      const lerpedColor = baseColor.clone().lerp(DANGER_RED, stress);
      mat.color.copy(lerpedColor);
    });

    const now = state.clock.elapsedTime;
    if (now - lastSyncTimeRef.current > 0.35) {
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
            isSelected={false}
            isFloorHovered={false}
            isParamHighlighted={false}
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
                <boxGeometry args={[0.11, 0.11, 0.11]} />
              ) : (
                <sphereGeometry args={[0.05, 10, 10]} />
              )}
              <meshStandardMaterial color={node.isFixed ? FIXED_SLATE : '#94a3b8'} />
            </mesh>
          </RigidBody>
        );
      })}

      {structure.beams.map((beam) => {
        const radius = beam.radius ?? 0.032;
        return (
          <mesh
            key={beam.id}
            ref={(el) => {
              beamMeshRefs.current[beam.id] = el;
            }}
          >
            <cylinderGeometry args={[radius, radius, 1, 10]} />
            <meshStandardMaterial
              ref={(el) => {
                beamMatRefs.current[beam.id] = el;
              }}
              color="#cbd5e1"
              metalness={0.5}
              roughness={0.3}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export default function SceneCanvas({ structure, onUpdateStress, onSelectPart }: Props) {
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredFloorTooltip | null>(null);
  const simKey = `${structure.solids?.length ?? 0}-${structure.nodes.length}-${structure.beams.length}`;

  const handleHoverFloor = (floorIndex: number, clientX: number, clientY: number) => {
    const spec = structure.buildingSpec;
    if (!spec) return;

    const avgFloorArea = Number(
      (spec.totalFloorAreaSqm / Math.max(1, spec.floors)).toFixed(1)
    );
    const floorHeightM = Number(
      (spec.heightMeters / Math.max(1, spec.floors)).toFixed(2)
    );
    const roomsList =
      spec.unitTypes?.[0]?.rooms
        .filter((r) => r.liveLoadKn < 3.0)
        .map((r) => r.name)
        .slice(0, 3)
        .join(' · ') || '거실 · 주방 · 침실';

    if (floorIndex < 0) {
      setHoveredTooltip({
        x: clientX,
        y: clientY,
        floorIndex,
        title: `지하층 (B1~B${spec.undergroundFloors})`,
        areaText: `지하 연면적 ${spec.undergroundAreaSqm.toLocaleString()} ㎡`,
        heightText: `지하 ${spec.undergroundFloors}개층`,
        roomsText: '지하 주차장 · 기계·전기실',
      });
      return;
    }

    if (floorIndex === 99) {
      setHoveredTooltip({
        x: clientX,
        y: clientY,
        floorIndex,
        title: `옥상층 (RF · 루프탑 ${spec.rooftops}개소)`,
        areaText: `옥상 면적 약 ${spec.buildingAreaSqm.toLocaleString()} ㎡`,
        heightText: `최고 높이 ${spec.heightMeters} m`,
        roomsText: '루프탑 테라스 · 조형 캐노피 · 코어탑',
      });
      return;
    }

    const loadKn = spec.floorLoadsKn?.[floorIndex] ?? 2.0;
    setHoveredTooltip({
      x: clientX,
      y: clientY,
      floorIndex,
      title: `지상 ${floorIndex}층 (${floorIndex}F)`,
      areaText: `층 바닥면적 ${avgFloorArea.toLocaleString()} ㎡`,
      heightText: `층고 ${floorHeightM} m · 활하중 ${loadKn.toFixed(1)} kN/㎡`,
      roomsText: roomsList,
    });
  };

  return (
    <div className="relative w-full h-full bg-[#f4f6f9]">
      <Canvas
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        camera={{ position: [4.4, 3.4, 5.2], fov: 44 }}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onPointerMissed={() => onSelectPart(null)}
      >
        <color attach="background" args={['#f4f6f9']} />
        <fog attach="fog" args={['#f4f6f9', 18, 40]} />

        <hemisphereLight args={['#ffffff', '#e2e8f0', 1.15]} />
        <directionalLight position={[8, 12, 6]} intensity={1.35} color="#ffffff" />
        <directionalLight position={[-6, 6, -5]} intensity={0.65} color="#f8fafc" />

        <Grid
          position={[0, 0, 0]}
          args={[24, 24]}
          cellSize={0.25}
          cellThickness={0.5}
          cellColor="#e2e8f0"
          sectionSize={1}
          sectionThickness={0.9}
          sectionColor="#cbd5e1"
          fadeDistance={20}
          fadeStrength={1}
          infiniteGrid
        />

        {structure.isSimulating ? (
          <Physics key={simKey} gravity={[0, -9.81, 0]}>
            <DynamicPhysicsStructure structure={structure} onUpdateStress={onUpdateStress} />
          </Physics>
        ) : (
          <StaticStructure
            structure={structure}
            hoveredFloorIndex={hoveredTooltip?.floorIndex ?? null}
            onSelectPart={onSelectPart}
            onHoverFloor={handleHoverFloor}
            onLeaveFloor={() => setHoveredTooltip(null)}
          />
        )}

        <CameraController control={structure.cameraControl} />
      </Canvas>

      {/* 마우스 커서 호버 시 층수·바닥면적·층고·실 구성 실시간 툴팁 */}
      {hoveredTooltip && (
        <div
          className="pointer-events-none fixed z-50 bg-white/95 backdrop-blur-md border border-sky-400 rounded-xl px-3 py-2 shadow-xl text-xs text-slate-800 space-y-0.5"
          style={{
            left: Math.min(window.innerWidth - 240, hoveredTooltip.x + 14),
            top: Math.max(12, hoveredTooltip.y - 12),
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm border border-slate-400"
              style={{ backgroundColor: getFloorColor(hoveredTooltip.floorIndex) }}
            />
            <span className="font-bold text-slate-900">{hoveredTooltip.title}</span>
          </div>
          <div className="font-mono text-[11px] font-bold text-sky-700">
            {hoveredTooltip.areaText}
          </div>
          <div className="text-[10.5px] text-slate-600">{hoveredTooltip.heightText}</div>
          <div className="text-[10px] text-slate-500">{hoveredTooltip.roomsText}</div>
        </div>
      )}
    </div>
  );
}