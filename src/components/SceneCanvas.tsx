import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Grid, Html, Line, OrbitControls } from '@react-three/drei';
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
import { getFloorColor, getSiteBoundaryPoints } from '../utils/architectureGenerator';
import { getPbrMaterialBundle } from '../utils/proceduralTextures';

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

// 스튜디오 하늘-지평선-지면 PBR 환경맵 (철·티타늄·골드·유리가 실제 금속/유리처럼 반사되도록 지원)
function StudioEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const width = 128;
    const height = 64;
    const data = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      const v = y / (height - 1);
      let r = 240;
      let g = 244;
      let b = 248;
      if (v > 0.52) {
        // 상부 스카이 라이트
        const t = (v - 0.52) / 0.48;
        r = Math.round(238 - t * 28);
        g = Math.round(244 - t * 14);
        b = Math.round(252 - t * 2);
      } else if (v > 0.46) {
        // 밝은 스튜디오 수평선 하이라이트
        r = 255;
        g = 252;
        b = 246;
      } else {
        // 하부 따뜻한 건축 대지 반사광
        const t = (0.46 - v) / 0.46;
        r = Math.round(232 - t * 55);
        g = Math.round(226 - t * 52);
        b = Math.round(218 - t * 50);
      }

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    const eqTex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    eqTex.mapping = THREE.EquirectangularReflectionMapping;
    eqTex.colorSpace = THREE.SRGBColorSpace;
    eqTex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(gl);
    const envTarget = pmrem.fromEquirectangular(eqTex);
    scene.environment = envTarget.texture;

    return () => {
      scene.environment = null;
      envTarget.dispose();
      eqTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

function computeWhiteToRedColor(ratio: number): THREE.Color {
  const clamped = THREE.MathUtils.clamp(ratio, 0, 1.3);
  if (clamped <= 0.65) {
    return WHITE_SAFE.clone().lerp(new THREE.Color('#fef3c7'), clamped / 0.65);
  }
  if (clamped <= 1.0) {
    return new THREE.Color('#fef3c7').lerp(WARN_AMBER, (clamped - 0.65) / 0.35);
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
  pipeXrayMode,
  interiorCutawayMode,
  heatmapRatio,
  isSelected,
  isFloorSelected,
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
  pipeXrayMode: boolean;
  interiorCutawayMode: boolean;
  heatmapRatio: number | null;
  isSelected: boolean;
  isFloorSelected: boolean;
  isFloorHovered: boolean;
  isParamHighlighted: boolean;
  onSelect?: () => void;
  onHoverFloor?: (clientX: number, clientY: number) => void;
  onLeaveFloor?: () => void;
}) {
  const matKey = solid.material ?? defaultMaterial ?? 'stucco';
  const pbr = getPbrMaterialBundle(matKey);

  const floorTint =
    typeof solid.floorIndex === 'number' &&
    solid.partRole !== 'interior_wall' &&
    solid.partRole !== 'interior_floor' &&
    solid.partRole !== 'furniture' &&
    solid.partRole !== 'garden'
      ? getFloorColor(solid.floorIndex)
      : null;

  // 텍스처 고유의 색상을 살리기 위해 기본 재질(wood/steel/concrete)은 화이트 틴트 또는 은은한 조색 적용
  const rawTint =
    solid.color && solid.color !== '#00f3ff'
      ? solid.color
      : floorTint ?? MATERIAL_CATALOG[matKey]?.hex ?? defaultColor ?? '#ffffff';

  const effectiveColor =
    matKey === 'wood' || matKey === 'steel' || matKey === 'concrete'
      ? '#ffffff'
      : rawTint;

  // 0. 실내 투시 뷰(지붕 + 남/동측 전면 외벽 오픈 -> 실내 바닥·내벽·가구 선명 표시)
  if (interiorCutawayMode) {
    if (solid.partRole === 'roof' || solid.partRole === 'sculpture') {
      return null;
    }
    if (
      solid.partRole === 'exterior_wall' &&
      (solid.id.includes('_ext_S_') || solid.id.includes('_ext_E_'))
    ) {
      return null;
    }
  }

  // 1. 수도·전기 배관 투시 모드
  if (pipeXrayMode && solid.partRole !== 'garden') {
    return (
      <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
        <mesh>
          <SolidShapeGeometry shape={solid.shape} />
          <meshStandardMaterial
            color="#e2e8f0"
            roughness={0.3}
            transparent
            opacity={0.13}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.002, 1.002, 1.002]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.18} />
        </mesh>
      </group>
    );
  }

  // 2. 설계하중 히트맵 모드
  if (heatmapRatio !== null && solid.partRole !== 'garden' && solid.partRole !== 'sculpture') {
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
            emissiveIntensity={heatmapRatio > 0.7 ? 0.25 : 0.08}
            roughness={0.4}
            transparent
            opacity={solid.partRole === 'core' || solid.id.includes('_pier_') ? 0.88 : 0.42}
            depthWrite={solid.partRole === 'core' || solid.id.includes('_pier_')}
          />
        </mesh>
        <mesh scale={[1.003, 1.003, 1.003]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.3} />
        </mesh>
      </group>
    );
  }

  // 3. 방 평면도(TYPE-A 등) 선택 시 전체 건물 내 방 구역 투시
  if (xrayUnitMode) {
    const isRoofOrSculpture =
      solid.partRole === 'roof' || solid.partRole === 'sculpture';
    const isWall =
      solid.partRole === 'exterior_wall' ||
      solid.partRole === 'interior_wall' ||
      solid.partRole === 'unit_divider';

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
            color={rawTint}
            roughness={0.45}
            transparent
            opacity={isRoofOrSculpture ? 0.08 : isWall ? 0.2 : 0.28}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.003, 1.003, 1.003]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial
            color={solid.partRole === 'unit_divider' ? '#0284c7' : '#64748b'}
            wireframe
            transparent
            opacity={isRoofOrSculpture ? 0.14 : 0.34}
          />
        </mesh>
      </group>
    );
  }

  const highlighted = isSelected || isFloorSelected;
  const isBackExteriorInCutaway =
    interiorCutawayMode && solid.partRole === 'exterior_wall';

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
      <mesh castShadow receiveShadow>
        <SolidShapeGeometry shape={solid.shape} />
        <meshStandardMaterial
          map={pbr.map}
          bumpMap={pbr.bumpMap}
          bumpScale={pbr.bumpScale}
          roughnessMap={pbr.roughnessMap}
          color={
            isParamHighlighted
              ? '#38bdf8'
              : isFloorSelected
              ? '#bae6fd'
              : isFloorHovered
              ? '#e0f2fe'
              : effectiveColor
          }
          emissive={
            isParamHighlighted || isFloorSelected
              ? '#0284c7'
              : isFloorHovered
              ? '#38bdf8'
              : '#000000'
          }
          emissiveIntensity={
            isParamHighlighted ? 0.22 : isFloorSelected ? 0.15 : isFloorHovered ? 0.1 : 0
          }
          metalness={pbr.metalness}
          roughness={pbr.roughness}
          transparent={Boolean(
            pbr.transparent || solid.partRole === 'basement' || isBackExteriorInCutaway
          )}
          opacity={
            solid.partRole === 'basement'
              ? 0.5
              : isBackExteriorInCutaway
              ? 0.45
              : pbr.opacity ?? 1
          }
        />
      </mesh>
      {highlighted && (
        <mesh scale={[1.004, 1.004, 1.004]}>
          <SolidShapeGeometry shape={solid.shape} />
          <meshBasicMaterial color="#0284c7" wireframe transparent opacity={0.85} />
        </mesh>
      )}
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
  const animState = useRef({ yawRemaining: 0, pitchRemaining: 0, speed: 1.0 });

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
  const isPipeXray = Boolean(structure.showMepPipes);
  const isInteriorCutaway = structure.viewMode === 'interior_cutaway';
  const kdsRange = spec ? getKdsLoadRange(spec.usageType) : null;
  const vizKey = structure.activeSpecViz?.paramKey;
  const glassPbr = getPbrMaterialBundle('glass');
  const steelPbr = getPbrMaterialBundle('steel');

  const getPhysicalStressRatio = (solid: SolidPrimitive): number | null => {
    if (!isHeatmap || !spec || !kdsRange) return null;
    if (
      solid.partRole === 'garden' ||
      solid.partRole === 'sculpture' ||
      solid.partRole === 'site_boundary'
    ) {
      return null;
    }

    const floors = Math.max(1, spec.floors);
    const fIdx =
      typeof solid.floorIndex === 'number' && solid.floorIndex >= 1 && solid.floorIndex <= floors
        ? solid.floorIndex
        : 1;
    const floorLoad = spec.floorLoadsKn?.[fIdx] ?? kdsRange.legalBaseKn;

    const isColumnLike = solid.partRole === 'core' || solid.id.includes('_pier_');
    if (isColumnLike) {
      let cumulativeLoad = 0;
      for (let f = fIdx; f <= floors; f++) {
        cumulativeLoad += spec.floorLoadsKn?.[f] ?? kdsRange.legalBaseKn;
      }
      const columnConcentration = 1 + (floors - fIdx) * 0.22;
      return ((cumulativeLoad / floors) * columnConcentration) / (kdsRange.designCapacityKn * 0.85);
    }

    if (solid.partRole === 'slab') {
      return (floorLoad / kdsRange.designCapacityKn) * 0.9;
    }

    return (floorLoad / kdsRange.designCapacityKn) * 0.35;
  };

  const getColumnBeamHeatRatio = (midY: number): number | null => {
    if (!isHeatmap || !spec || !kdsRange) return null;
    const totalH = Math.max(1.0, spec.heightMeters / 3.2);
    const floors = Math.max(1, spec.floors);
    const fIdx = Math.min(floors, Math.max(1, Math.ceil((Math.max(0.05, midY) / totalH) * floors)));
    let cumulativeLoad = 0;
    for (let f = fIdx; f <= floors; f++) {
      cumulativeLoad += spec.floorLoadsKn?.[f] ?? kdsRange.legalBaseKn;
    }
    const columnConcentration = 1 + (floors - fIdx) * 0.25;
    return ((cumulativeLoad / floors) * columnConcentration) / (kdsRange.designCapacityKn * 0.82);
  };

  const dimGuides = useMemo(() => {
    if (!spec) return null;
    const SCALE_DIV = 3.2;
    const { points, halfW, halfD } = getSiteBoundaryPoints(
      spec.siteAreaSqm,
      spec.siteShape ?? 'rectangle'
    );
    const totalH = Math.max(0.95, Math.min(12.0, spec.heightMeters / SCALE_DIV));
    const gardenSolid = (structure.solids ?? []).find((s) => s.partRole === 'garden');

    return {
      siteBoundary: points,
      heightPole: [
        [-halfW * 0.88, 0, halfD * 0.88],
        [-halfW * 0.88, totalH, halfD * 0.88],
      ] as [number, number, number][],
      topLabelPos: [-halfW * 0.88, totalH + 0.22, halfD * 0.88] as [number, number, number],
      gardenLabelPos: gardenSolid
        ? ([gardenSolid.position[0], 0.35, gardenSolid.position[2]] as [number, number, number])
        : ([1.5, 0.35, 0] as [number, number, number]),
    };
  }, [spec, structure.solids]);

  return (
    <group>
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
            pipeXrayMode={isPipeXray}
            interiorCutawayMode={isInteriorCutaway}
            heatmapRatio={getPhysicalStressRatio(solid)}
            isSelected={structure.selectedPartId === solid.id}
            isFloorSelected={
              typeof structure.selectedFloorIndex === 'number' &&
              solid.floorIndex === structure.selectedFloorIndex
            }
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

      {/* 외벽 로이 복층 유리 창호 (실내 투시 뷰에서는 절개면 창호 자동 숨김) */}
      {!isHeatmap &&
        (spec?.exteriorWindows ?? [])
          .filter((win) => !(isInteriorCutaway && (win.wall === 'S' || win.wall === 'E')))
          .map((win) => (
            <group
              key={win.id}
              position={win.position}
              rotation={[0, win.rotationY, 0]}
              scale={win.scale}
            >
              <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial
                  map={glassPbr.map}
                  color="#bae6fd"
                  metalness={0.22}
                  roughness={0.08}
                  transparent
                  opacity={isPipeXray ? 0.12 : selectedUnitType ? 0.25 : 0.45}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ))}

      {/* 수도·전기 배관 3D 라인 */}
      {(isPipeXray || Boolean(selectedUnitType)) &&
        (spec?.mepPipes ?? []).map((pipe) => (
          <Line
            key={pipe.id}
            points={pipe.points}
            color={pipe.system === 'water' ? '#2563eb' : '#ea580c'}
            lineWidth={pipe.id.includes('riser') ? 4.5 : 2.8}
          />
        ))}

      {/* 방 평면도 선택 시 전체 건물 내 해당 방 위치(층·구역) 3D 가시화 */}
      {selectedUnitType &&
        !isPipeXray &&
        selectedUnitType.placements.map((pl, idx) => (
          <group key={`unit_pl_${idx}`} position={pl.position}>
            <mesh scale={pl.scale}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={selectedUnitType.color}
                emissive={selectedUnitType.color}
                emissiveIntensity={0.45}
                transparent
                opacity={0.52}
                depthWrite={false}
              />
            </mesh>
            <mesh scale={[pl.scale[0] * 1.01, pl.scale[1] * 1.01, pl.scale[2] * 1.01]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshBasicMaterial color={selectedUnitType.color} wireframe />
            </mesh>
            <Html position={[0, pl.scale[1] * 0.55, 0]} center distanceFactor={11}>
              <div
                style={{ borderColor: selectedUnitType.color }}
                className="px-2 py-0.5 rounded-md bg-slate-900/90 text-white font-mono text-[10px] font-bold whitespace-nowrap shadow-md border-2"
              >
                {selectedUnitType.code} · {pl.floor}F #{idx + 1}
              </div>
            </Html>
          </group>
        ))}

      {/* 대지 경계선 및 높이 기준 폴 */}
      {dimGuides && (
        <group>
          <Line
            points={dimGuides.siteBoundary}
            color={vizKey === 'siteAreaSqm' ? '#0284c7' : '#64748b'}
            lineWidth={vizKey === 'siteAreaSqm' ? 2.8 : 1.6}
            dashed
            dashSize={0.25}
            gapSize={0.14}
          />
          <Line
            points={dimGuides.heightPole}
            color={vizKey === 'heightMeters' || vizKey === 'floors' ? '#0284c7' : '#64748b'}
            lineWidth={vizKey === 'heightMeters' || vizKey === 'floors' ? 3 : 1.5}
          />
          {structure.activeSpecViz && spec && (
            <Html
              position={
                vizKey === 'gardenAreaSqm' ? dimGuides.gardenLabelPos : dimGuides.topLabelPos
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

      {/* 구조 조인트 노드 & 수직 강재 H빔/원형 기둥 */}
      {structure.nodes.map((node) => {
        const isGrounded = node.isFixed;
        const heatRatio = getColumnBeamHeatRatio(node.position[1]);
        const nodeColor =
          heatRatio !== null
            ? computeWhiteToRedColor(heatRatio)
            : isGrounded
            ? FIXED_SLATE
            : '#64748b';

        return (
          <mesh key={node.id} position={node.position}>
            {isGrounded ? (
              <boxGeometry args={[0.11, 0.11, 0.11]} />
            ) : (
              <sphereGeometry args={[0.045, 10, 10]} />
            )}
            <meshStandardMaterial color={nodeColor} metalness={0.75} roughness={0.3} />
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
        const heatRatio = getColumnBeamHeatRatio(mid.y);

        const matKey = beam.material ?? structure.activeMaterial ?? 'steel';
        const beamPbr = matKey === 'steel' ? steelPbr : getPbrMaterialBundle(matKey);
        const finalColor =
          heatRatio !== null ? computeWhiteToRedColor(heatRatio) : new THREE.Color('#ffffff');
        const radius = heatRatio !== null ? (beam.radius ?? 0.034) * 1.45 : beam.radius ?? 0.032;

        return (
          <mesh key={beam.id} position={mid} quaternion={quat} scale={[1, length, 1]} castShadow>
            <cylinderGeometry args={[radius, radius, 1, 12]} />
            <meshStandardMaterial
              map={beamPbr.map}
              bumpMap={beamPbr.bumpMap}
              bumpScale={beamPbr.bumpScale}
              color={finalColor}
              emissive={heatRatio !== null && heatRatio > 0.7 ? finalColor : '#000000'}
              emissiveIntensity={heatRatio !== null && heatRatio > 0.7 ? 0.3 : 0}
              metalness={heatRatio !== null ? 0.2 : beamPbr.metalness}
              roughness={heatRatio !== null ? 0.35 : beamPbr.roughness}
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

  const { initialPosMap, restLengthMap, unfixedCount } = useMemo(() => {
    const posMap = new Map<string, THREE.Vector3>();
    let unfixed = 0;

    structure.nodes.forEach((n) => {
      posMap.set(n.id, new THREE.Vector3(...n.position));
      if (!n.isFixed) unfixed += 1;
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
    };
  }, [structure.nodes, structure.beams.length]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.016);
    const loadForcePerNode = Math.min(28, (structure.targetLoadKg / unfixedCount) * 0.35);

    structure.nodes.forEach((node) => {
      if (node.isFixed) return;
      const body = bodyRefs.current[node.id];
      if (!body) return;
      body.applyImpulse({ x: 0, y: -loadForcePerNode * dt, z: 0 }, true);
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
      const pA = new THREE.Vector3(tA.x, tA.y, tA.z);
      const pB = new THREE.Vector3(tB.x, tB.y, tB.z);
      const { mid, length, quat } = computeBeamTransform(pA, pB);
      mesh.position.copy(mid);
      mesh.quaternion.copy(quat);
      mesh.scale.set(1, length, 1);
      latestStressRef.current[beam.id] = 0.25;
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
          type="fixed"
          position={solid.position}
          colliders="hull"
        >
          <SolidMeshView
            solid={{ ...solid, position: [0, 0, 0] }}
            defaultMaterial={structure.activeMaterial}
            defaultColor={structure.activeColor}
            xrayUnitMode={false}
            pipeXrayMode={false}
            interiorCutawayMode={false}
            heatmapRatio={null}
            isSelected={false}
            isFloorSelected={false}
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
              <boxGeometry args={[0.1, 0.1, 0.1]} />
              <meshStandardMaterial color={FIXED_SLATE} />
            </mesh>
          </RigidBody>
        );
      })}

      {structure.beams.map((beam) => (
        <mesh
          key={beam.id}
          ref={(el) => {
            beamMeshRefs.current[beam.id] = el;
          }}
        >
          <cylinderGeometry args={[0.032, 0.032, 1, 10]} />
          <meshStandardMaterial
            ref={(el) => {
              beamMatRefs.current[beam.id] = el;
            }}
            color="#cbd5e1"
          />
        </mesh>
      ))}
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
        roomsText: '지붕 구조 · 루프탑 테라스 · 조경',
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
    <div className="relative w-full h-full bg-[#eef2f6]">
      <Canvas
        shadows
        dpr={[1, 2]}
        performance={{ min: 0.6 }}
        camera={{ position: [4.4, 3.4, 5.2], fov: 42 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          powerPreference: 'high-performance',
          preserveDrawingBuffer: true,
        }}
        onPointerMissed={() => onSelectPart(null)}
      >
        <color attach="background" args={['#eef2f6']} />
        <fog attach="fog" args={['#eef2f6', 20, 44]} />

        <StudioEnvironment />

        <hemisphereLight args={['#ffffff', '#cbd5e1', 0.85]} />
        <directionalLight
          castShadow
          position={[7, 13, 6]}
          intensity={1.55}
          color="#fffaf0"
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={1}
          shadow-camera-far={30}
          shadow-camera-left={-8}
          shadow-camera-right={8}
          shadow-camera-top={8}
          shadow-camera-bottom={-8}
          shadow-bias={-0.0004}
        />
        <directionalLight position={[-6, 5, -5]} intensity={0.55} color="#e0f2fe" />

        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.38}
          scale={18}
          blur={2.1}
          far={6}
          color="#1e293b"
        />

        <Grid
          position={[0, 0, 0]}
          args={[24, 24]}
          cellSize={0.25}
          cellThickness={0.5}
          cellColor="#dce3ec"
          sectionSize={1}
          sectionThickness={0.9}
          sectionColor="#cbd5e1"
          fadeDistance={22}
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