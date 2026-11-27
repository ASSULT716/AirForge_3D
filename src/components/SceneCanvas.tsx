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
import { MATERIAL_CATALOG } from '../utils/buildingEstimator';
import {
  computePolygonAreaSqm,
  getFloorColor,
  getSiteBoundaryPoints,
} from '../utils/architectureGenerator';
import { getPbrMaterialBundle } from '../utils/proceduralTextures';
import HandSceneLayer from '../hand/HandSceneLayer';
import { latheGeometry } from '../services/latheShape';

interface Props {
  structure: StructureState;
  onUpdateStress: (updatedBeams: StructureState['beams']) => void;
  onSelectPart: (partId: string | null) => void;
  onUpdateSitePolygon?: (nextPolygon: [number, number][]) => void;
}

interface HoveredTooltipState {
  x: number;
  y: number;
  floorIndex: number;
  title: string;
  areaText: string;
  physicsLine1: string;
  physicsLine2: string;
  dcrBadge?: { text: string; tone: 'safe' | 'caution' | 'unsafe' };
}

const WHITE_SAFE = new THREE.Color('#ffffff');
const PALE_WARM = new THREE.Color('#fef3c7');
const WARN_AMBER = new THREE.Color('#f97316');
const DANGER_RED = new THREE.Color('#dc2626');
const FIXED_SLATE = new THREE.Color('#475569');
const UP_VEC = new THREE.Vector3(0, 1, 0);

// ---------- 지붕-벽체 밀봉용 정규화 삼각 지오메트리 ----------
let cachedGableGeo: THREE.ExtrudeGeometry | null = null;
let cachedWedgeGeo: THREE.ExtrudeGeometry | null = null;

function getGableWallGeometry(): THREE.ExtrudeGeometry {
  if (cachedGableGeo) return cachedGableGeo;
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0, 0.5);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  geo.computeVertexNormals();
  cachedGableGeo = geo;
  return geo;
}

function getWedgeWallGeometry(): THREE.ExtrudeGeometry {
  if (cachedWedgeGeo) return cachedWedgeGeo;
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0.5, 0.5);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geo.translate(0, 0, -0.5);
  geo.computeVertexNormals();
  cachedWedgeGeo = geo;
  return geo;
}

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
        const t = (v - 0.52) / 0.48;
        r = Math.round(238 - t * 28);
        g = Math.round(244 - t * 14);
        b = Math.round(252 - t * 2);
      } else if (v > 0.46) {
        r = 255;
        g = 252;
        b = 246;
      } else {
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

/** 실제 KDS 응력비(DCR = Demand / φCapacity)를 화이트 → 아이보리 → 오렌지 → 레드로 매핑 */
function computeDcrHeatmapColor(dcr: number): THREE.Color {
  const clamped = THREE.MathUtils.clamp(dcr, 0, 1.25);
  if (clamped <= 0.55) {
    return WHITE_SAFE.clone().lerp(PALE_WARM, clamped / 0.55);
  }
  if (clamped <= 0.85) {
    return PALE_WARM.clone().lerp(WARN_AMBER, (clamped - 0.55) / 0.3);
  }
  return WARN_AMBER.clone().lerp(DANGER_RED, Math.min(1, (clamped - 0.85) / 0.25));
}

function isPrimaryLoadBearing(role?: SolidPrimitive['partRole']): boolean {
  return (
    role === 'structural_column' ||
    role === 'structural_beam' ||
    role === 'structural_footing' ||
    role === 'core' ||
    role === 'slab'
  );
}

function isNonStructuralDecor(role?: SolidPrimitive['partRole']): boolean {
  return (
    role === 'garden' ||
    role === 'furniture' ||
    role === 'sculpture' ||
    role === 'site_boundary'
  );
}

function computeBeamTransform(p1: THREE.Vector3, p2: THREE.Vector3) {
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const diff = new THREE.Vector3().subVectors(p2, p1);
  const length = Math.max(0.005, diff.length());
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, diff.clone().normalize());
  return { mid, length, quat };
}

function SolidShapeGeometry({ shape, lathe }: { shape: SolidPrimitive['shape']; lathe?: SolidPrimitive['lathe'] }) {
  // (조원호) 면 스케일·원형 오프셋으로 바뀐 원기둥 (원뿔대·컵·파이프) — src/services/latheShape.ts
  if (shape === 'cylinder' && lathe) return <primitive object={latheGeometry(lathe)} attach="geometry" dispose={null} />;
  if (shape === 'gable_wall') return <primitive object={getGableWallGeometry()} attach="geometry" />;
  if (shape === 'wedge_wall') return <primitive object={getWedgeWallGeometry()} attach="geometry" />;
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
  structuralFrameMode,
  isHeatmapActive,
  isSelected,
  isFloorSelected,
  isFloorHovered,
  isParamHighlighted,
  onSelect,
  onHoverSolid,
  onLeaveSolid,
}: {
  solid: SolidPrimitive;
  defaultMaterial: CadMaterial;
  defaultColor: string;
  xrayUnitMode: boolean;
  pipeXrayMode: boolean;
  interiorCutawayMode: boolean;
  structuralFrameMode: boolean;
  isHeatmapActive: boolean;
  isSelected: boolean;
  isFloorSelected: boolean;
  isFloorHovered: boolean;
  isParamHighlighted: boolean;
  onSelect?: () => void;
  onHoverSolid?: (solid: SolidPrimitive, clientX: number, clientY: number) => void;
  onLeaveSolid?: () => void;
}) {
  const matKey = solid.material ?? defaultMaterial ?? 'stucco';
  const pbr = getPbrMaterialBundle(matKey);
  const primaryStructural = isPrimaryLoadBearing(solid.partRole);
  const nonStructural = isNonStructuralDecor(solid.partRole);

  const floorTint =
    typeof solid.floorIndex === 'number' &&
    !primaryStructural &&
    solid.partRole !== 'interior_wall' &&
    solid.partRole !== 'interior_floor' &&
    solid.partRole !== 'furniture' &&
    solid.partRole !== 'garden'
      ? getFloorColor(solid.floorIndex)
      : null;

  const rawTint =
    solid.color && solid.color !== '#00f3ff'
      ? solid.color
      : floorTint ?? MATERIAL_CATALOG[matKey]?.hex ?? defaultColor ?? '#ffffff';

  const effectiveColor =
    matKey === 'wood' || matKey === 'steel' || matKey === 'concrete'
      ? solid.partRole === 'structural_column' ||
        solid.partRole === 'structural_beam' ||
        solid.partRole === 'structural_footing'
        ? rawTint
        : '#ffffff'
      : rawTint;

  // 0. 실내 투시 뷰 (지붕·마감벽 + 남/동측 외벽 오픈)
  if (interiorCutawayMode) {
    if (
      solid.partRole === 'roof' ||
      solid.partRole === 'roof_infill' ||
      solid.partRole === 'sculpture'
    ) {
      return null;
    }
    if (
      solid.partRole === 'exterior_wall' &&
      (solid.id.includes('_ext_S_') || solid.id.includes('_ext_E_'))
    ) {
      return null;
    }
  }

  // 1. 구조 골조 전용 투시 뷰 (RC/철골/중목 기둥·보·기초·슬래브만 실체로 강조, 비구조 외피는 고스트화)
  if (structuralFrameMode) {
    if (solid.partRole === 'furniture' || solid.partRole === 'interior_floor') {
      return null;
    }
    if (!primaryStructural && solid.partRole !== 'basement') {
      if (solid.partRole === 'garden') {
        return (
          <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
            <mesh>
              <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
              <meshStandardMaterial color="#86efac" transparent opacity={0.22} depthWrite={false} />
            </mesh>
          </group>
        );
      }
      return (
        <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
          <mesh>
            <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
            <meshStandardMaterial
              color="#cbd5e1"
              roughness={0.35}
              transparent
              opacity={0.07}
              depthWrite={false}
            />
          </mesh>
          <mesh scale={[1.001, 1.001, 1.001]}>
            <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
            <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.14} />
          </mesh>
        </group>
      );
    }

    // 실제 주구조 골조 부재(기초·기둥·보·코어·슬래브) 선명 렌더링
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
          if (onHoverSolid) {
            e.stopPropagation();
            onHoverSolid(solid, e.clientX, e.clientY);
          }
        }}
        onPointerOut={() => onLeaveSolid?.()}
      >
        <mesh castShadow receiveShadow>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshStandardMaterial
            map={pbr.map}
            bumpMap={pbr.bumpMap}
            bumpScale={pbr.bumpScale}
            color={effectiveColor}
            metalness={pbr.metalness}
            roughness={pbr.roughness}
            transparent={solid.partRole === 'slab'}
            opacity={solid.partRole === 'slab' ? 0.42 : 0.98}
          />
        </mesh>
        <mesh scale={[1.006, 1.006, 1.006]}>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshBasicMaterial
            color={
              solid.partRole === 'structural_footing'
                ? '#0f172a'
                : solid.partRole === 'structural_column' || solid.partRole === 'structural_beam'
                ? '#0284c7'
                : '#475569'
            }
            wireframe
            transparent
            opacity={0.55}
          />
        </mesh>
      </group>
    );
  }

  // 2. 수도·전기 배관 투시 모드
  if (pipeXrayMode && solid.partRole !== 'garden') {
    return (
      <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
        <mesh>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshStandardMaterial
            color="#e2e8f0"
            roughness={0.3}
            transparent
            opacity={0.13}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.002, 1.002, 1.002]}>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.18} />
        </mesh>
      </group>
    );
  }

  // 3. 실제 KDS 물리 DCR 기반 하중 경로 히트맵 (정원·가구·조형물 제외, 골조 강조)
  if (isHeatmapActive) {
    if (nonStructural) {
      // 정원·가구 등은 하중을 받지 않으므로 붉게 물들이지 않고 배경 톤으로만 유지
      if (solid.partRole === 'furniture') return null;
      return (
        <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
          <mesh>
            <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
            <meshStandardMaterial
              color={rawTint}
              roughness={0.8}
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </mesh>
        </group>
      );
    }

    const actualDcr = typeof solid.dcr === 'number' ? solid.dcr : 0.15;
    const heatColor = computeDcrHeatmapColor(actualDcr);

    // 비내력 외벽/내벽/지붕은 반투명화해 내부 기둥·보·기초의 실제 하중 전달 경로가 한눈에 보이게 처리
    if (!primaryStructural) {
      return (
        <group position={solid.position} scale={solid.scale} rotation={solid.rotation ?? [0, 0, 0]}>
          <mesh>
            <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
            <meshStandardMaterial
              color={heatColor}
              roughness={0.5}
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
          <mesh scale={[1.002, 1.002, 1.002]}>
            <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
            <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.14} />
          </mesh>
        </group>
      );
    }

    // 실제 하중을 지지하는 주구조 골조 (기초·기둥·보·코어·슬래브)
    const isFrameBar =
      solid.partRole === 'structural_column' ||
      solid.partRole === 'structural_beam' ||
      solid.partRole === 'structural_footing' ||
      solid.partRole === 'core';

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
          if (onHoverSolid) {
            e.stopPropagation();
            onHoverSolid(solid, e.clientX, e.clientY);
          }
        }}
        onPointerOut={() => onLeaveSolid?.()}
      >
        <mesh>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshStandardMaterial
            color={heatColor}
            emissive={heatColor}
            emissiveIntensity={actualDcr > 0.8 ? 0.38 : actualDcr > 0.55 ? 0.16 : 0.04}
            roughness={0.35}
            transparent={!isFrameBar}
            opacity={isFrameBar ? 0.96 : 0.45}
            depthWrite={isFrameBar}
          />
        </mesh>
        <mesh scale={[1.005, 1.005, 1.005]}>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshBasicMaterial
            color={actualDcr > 1.0 ? '#991b1b' : '#475569'}
            wireframe
            transparent
            opacity={isFrameBar ? 0.45 : 0.22}
          />
        </mesh>
      </group>
    );
  }

  // 4. 방 평면도(TYPE-A 등) 선택 시 전체 건물 내 방 구역 투시
  if (xrayUnitMode) {
    const isRoofOrSculpture =
      solid.partRole === 'roof' ||
      solid.partRole === 'roof_infill' ||
      solid.partRole === 'sculpture';
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
          if (onHoverSolid) {
            e.stopPropagation();
            onHoverSolid(solid, e.clientX, e.clientY);
          }
        }}
        onPointerOut={() => onLeaveSolid?.()}
      >
        <mesh>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshStandardMaterial
            color={rawTint}
            roughness={0.45}
            transparent
            opacity={isRoofOrSculpture ? 0.08 : isWall ? 0.2 : 0.28}
            depthWrite={false}
          />
        </mesh>
        <mesh scale={[1.003, 1.003, 1.003]}>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
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
        if (onHoverSolid) {
          e.stopPropagation();
          onHoverSolid(solid, e.clientX, e.clientY);
        }
      }}
      onPointerOut={() => onLeaveSolid?.()}
    >
      <mesh castShadow receiveShadow>
        <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
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
            pbr.transparent ||
              solid.partRole === 'basement' ||
              solid.partRole === 'structural_footing' ||
              isBackExteriorInCutaway
          )}
          opacity={
            solid.partRole === 'basement' || solid.partRole === 'structural_footing'
              ? 0.55
              : isBackExteriorInCutaway
              ? 0.45
              : pbr.opacity ?? 1
          }
        />
      </mesh>
      {highlighted && (
        <mesh scale={[1.004, 1.004, 1.004]}>
          <SolidShapeGeometry shape={solid.shape} lathe={solid.lathe} />
          <meshBasicMaterial color="#0284c7" wireframe transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

/** 자유형 대지 경계 3D 꼭짓점 드래그 · 변 중간점 추가 · 더블클릭 삭제 편집기 */
function SiteBoundaryEditor({
  polygon2D,
  isEditMode,
  onUpdatePolygon,
  onDraggingChange,
}: {
  polygon2D: [number, number][];
  isEditMode: boolean;
  onUpdatePolygon?: (nextPolygon: [number, number][]) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    if (draggingIdx === null) return;
    const handleUp = () => {
      setDraggingIdx(null);
      onDraggingChange(false);
    };
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, [draggingIdx, onDraggingChange]);

  const liveAreaSqm = useMemo(() => computePolygonAreaSqm(polygon2D), [polygon2D]);

  if (!isEditMode || !onUpdatePolygon) return null;

  const handlePlaneMove = (pt: THREE.Vector3) => {
    if (draggingIdx === null) return;
    const clampedX = Number(THREE.MathUtils.clamp(pt.x, -7.5, 7.5).toFixed(2));
    const clampedZ = Number(THREE.MathUtils.clamp(pt.z, -7.5, 7.5).toFixed(2));
    const nextPoly = polygon2D.map((v, i): [number, number] =>
      i === draggingIdx ? [clampedX, clampedZ] : v
    );
    onUpdatePolygon(nextPoly);
  };

  return (
    <group>
      {draggingIdx !== null && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02, 0]}
          onPointerMove={(e) => {
            e.stopPropagation();
            handlePlaneMove(e.point);
          }}
          onPointerUp={(e) => {
            e.stopPropagation();
            setDraggingIdx(null);
            onDraggingChange(false);
          }}
        >
          <planeGeometry args={[40, 40]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {polygon2D.map(([vx, vz], idx) => {
        const isActive = draggingIdx === idx || hoveredIdx === idx;
        return (
          <group key={`site_vtx_${idx}`} position={[vx, 0.08, vz]}>
            <mesh
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredIdx(idx);
                document.body.style.cursor = 'grab';
              }}
              onPointerOut={() => {
                setHoveredIdx(null);
                if (draggingIdx === null) document.body.style.cursor = 'auto';
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingIdx(idx);
                onDraggingChange(true);
                document.body.style.cursor = 'grabbing';
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (polygon2D.length <= 3) return;
                onUpdatePolygon(polygon2D.filter((_, i) => i !== idx));
              }}
            >
              <cylinderGeometry args={[isActive ? 0.14 : 0.11, isActive ? 0.14 : 0.11, 0.18, 16]} />
              <meshStandardMaterial
                color={draggingIdx === idx ? '#f59e0b' : isActive ? '#0ea5e9' : '#0284c7'}
                emissive={isActive ? '#0284c7' : '#000000'}
                emissiveIntensity={0.35}
                roughness={0.25}
                metalness={0.3}
              />
            </mesh>
            <Html position={[0, 0.22, 0]} center distanceFactor={11}>
              <div className="pointer-events-none px-1.5 py-0.5 rounded bg-slate-900/85 text-white font-mono text-[9.5px] font-bold whitespace-nowrap border border-sky-400">
                P{idx + 1}
              </div>
            </Html>
          </group>
        );
      })}

      {polygon2D.length < 12 &&
        polygon2D.map(([x1, z1], idx) => {
          const [x2, z2] = polygon2D[(idx + 1) % polygon2D.length];
          const mx = Number(((x1 + x2) * 0.5).toFixed(2));
          const mz = Number(((z1 + z2) * 0.5).toFixed(2));
          return (
            <mesh
              key={`site_mid_${idx}`}
              position={[mx, 0.05, mz]}
              onClick={(e) => {
                e.stopPropagation();
                const next = [...polygon2D];
                next.splice(idx + 1, 0, [mx, mz]);
                onUpdatePolygon(next);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                if (draggingIdx === null) document.body.style.cursor = 'auto';
              }}
            >
              <sphereGeometry args={[0.07, 12, 12]} />
              <meshStandardMaterial color="#10b981" roughness={0.3} />
            </mesh>
          );
        })}

      {draggingIdx !== null && (
        <Html position={[polygon2D[draggingIdx][0], 0.45, polygon2D[draggingIdx][1]]} center>
          <div className="pointer-events-none px-2 py-1 rounded-lg bg-slate-900/95 text-white font-mono text-[11px] font-bold whitespace-nowrap shadow-lg border border-amber-400">
            자유 대지면적: {liveAreaSqm.toLocaleString()} ㎡ ({polygon2D.length}각형)
          </div>
        </Html>
      )}
    </group>
  );
}

function CameraController({
  control = { mode: 'free' },
  disabled = false,
}: {
  control?: CameraControlState;
  disabled?: boolean;
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
      enabled={!disabled}
      enableDamping
      dampingFactor={0.09}
      autoRotate={control.mode === 'auto_rotate' && !disabled}
      autoRotateSpeed={(control.speed ?? 1.0) * 1.8}
      maxPolarAngle={Math.PI / 2 - 0.03}
    />
  );
}

function StaticStructure({
  structure,
  hoveredFloorIndex,
  onSelectPart,
  onHoverSolid,
  onLeaveSolid,
  onUpdateSitePolygon,
  onDraggingSiteChange,
}: {
  structure: StructureState;
  hoveredFloorIndex: number | null;
  onSelectPart: (partId: string | null) => void;
  onHoverSolid: (solid: SolidPrimitive, clientX: number, clientY: number) => void;
  onLeaveSolid: () => void;
  onUpdateSitePolygon?: (nextPolygon: [number, number][]) => void;
  onDraggingSiteChange: (dragging: boolean) => void;
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
  const isStructuralFrame = structure.viewMode === 'structural_frame';
  const isSiteEditMode = Boolean(structure.isSiteEditMode && spec);
  const vizKey = structure.activeSpecViz?.paramKey;
  const glassPbr = getPbrMaterialBundle('glass');
  const steelPbr = getPbrMaterialBundle('steel');

  const dimGuides = useMemo(() => {
    if (!spec) return null;
    const SCALE_DIV = 3.2;
    const { points, polygon2D, minX, maxZ } = getSiteBoundaryPoints(
      spec.siteAreaSqm,
      spec.siteShape ?? 'rectangle',
      spec.sitePolygon
    );
    const totalH = Math.max(0.95, Math.min(12.0, spec.heightMeters / SCALE_DIV));
    const gardenSolid = (structure.solids ?? []).find((s) => s.partRole === 'garden');

    return {
      siteBoundary: points,
      polygon2D,
      heightPole: [
        [minX + 0.18, 0, maxZ - 0.18],
        [minX + 0.18, totalH, maxZ - 0.18],
      ] as [number, number, number][],
      topLabelPos: [minX + 0.18, totalH + 0.22, maxZ - 0.18] as [number, number, number],
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
            structuralFrameMode={isStructuralFrame}
            isHeatmapActive={isHeatmap}
            isSelected={structure.selectedPartId === solid.id}
            isFloorSelected={
              typeof structure.selectedFloorIndex === 'number' &&
              solid.floorIndex === structure.selectedFloorIndex
            }
            isFloorHovered={
              !isHeatmap &&
              !isStructuralFrame &&
              typeof solid.floorIndex === 'number' &&
              solid.floorIndex !== 0 &&
              hoveredFloorIndex === solid.floorIndex
            }
            isParamHighlighted={isParamHighlighted}
            onSelect={() => {
              if (!isSiteEditMode) onSelectPart(solid.id);
            }}
            onHoverSolid={(s, cx, cy) => {
              if (typeof s.floorIndex === 'number' && s.floorIndex !== 0) {
                onHoverSolid(s, cx, cy);
              }
            }}
            onLeaveSolid={onLeaveSolid}
          />
        );
      })}

      {/* 외벽 로이 복층 유리 창호 (히트맵 및 구조 골조 전용 뷰에서는 반투명/숨김) */}
      {!isHeatmap &&
        !isStructuralFrame &&
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

      {/* 방 평면도 선택 시 전체 건물 내 해당 방 위치 3D 가시화 */}
      {selectedUnitType &&
        !isPipeXray &&
        !isStructuralFrame &&
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

      {/* 대지 경계선 + 자유형 꼭짓점 드래그 핸들 + 높이 기준 폴 */}
      {dimGuides && (
        <group>
          <Line
            points={dimGuides.siteBoundary}
            color={isSiteEditMode || vizKey === 'siteAreaSqm' ? '#0284c7' : '#64748b'}
            lineWidth={isSiteEditMode || vizKey === 'siteAreaSqm' ? 3.2 : 1.6}
            dashed={!isSiteEditMode}
            dashSize={0.25}
            gapSize={0.14}
          />
          <SiteBoundaryEditor
            polygon2D={dimGuides.polygon2D}
            isEditMode={isSiteEditMode}
            onUpdatePolygon={onUpdateSitePolygon}
            onDraggingChange={onDraggingSiteChange}
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

      {/* 구조 절점 노드 & 기둥 부재 (실제 beam.dcr 반영) */}
      {structure.nodes.map((node) => {
        const isGrounded = node.isFixed;
        const baseDcr = spec?.structuralReport?.foundationDcr ?? 0.25;
        const nodeColor = isHeatmap
          ? computeDcrHeatmapColor(baseDcr)
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
        const actualDcr = typeof beam.dcr === 'number' ? beam.dcr : beam.stress;

        const matKey = beam.material ?? structure.activeMaterial ?? 'steel';
        const beamPbr = matKey === 'steel' ? steelPbr : getPbrMaterialBundle(matKey);
        const finalColor = isHeatmap
          ? computeDcrHeatmapColor(actualDcr)
          : new THREE.Color('#ffffff');
        const radius = isHeatmap ? (beam.radius ?? 0.032) * 1.45 : beam.radius ?? 0.03;

        return (
          <mesh key={beam.id} position={mid} quaternion={quat} scale={[1, length, 1]} castShadow>
            <cylinderGeometry args={[radius, radius, 1, 12]} />
            <meshStandardMaterial
              map={isHeatmap ? null : beamPbr.map}
              bumpMap={isHeatmap ? null : beamPbr.bumpMap}
              bumpScale={beamPbr.bumpScale}
              color={finalColor}
              emissive={isHeatmap && actualDcr > 0.78 ? finalColor : '#000000'}
              emissiveIntensity={isHeatmap && actualDcr > 0.78 ? 0.35 : 0}
              metalness={isHeatmap ? 0.2 : beamPbr.metalness}
              roughness={isHeatmap ? 0.35 : beamPbr.roughness}
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
      latestStressRef.current[beam.id] = beam.dcr ?? 0.25;
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
        <RigidBody key={solid.id} type="fixed" position={solid.position} colliders="hull">
          <SolidMeshView
            solid={{ ...solid, position: [0, 0, 0] }}
            defaultMaterial={structure.activeMaterial}
            defaultColor={structure.activeColor}
            xrayUnitMode={false}
            pipeXrayMode={false}
            interiorCutawayMode={false}
            structuralFrameMode={false}
            isHeatmapActive={false}
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

export default function SceneCanvas({
  structure,
  onUpdateStress,
  onSelectPart,
  onUpdateSitePolygon,
}: Props) {
  const [hoveredTooltip, setHoveredTooltip] = useState<HoveredTooltipState | null>(null);
  const [isDraggingSite, setIsDraggingSite] = useState(false);
  const simKey = `${structure.solids?.length ?? 0}-${structure.nodes.length}-${structure.beams.length}`;
  const isSenior = Boolean(structure.isSeniorMode);

  const handleHoverSolid = (solid: SolidPrimitive, clientX: number, clientY: number) => {
    const spec = structure.buildingSpec;
    if (!spec) return;

    const floorIndex = solid.floorIndex ?? 1;
    const report = spec.structuralReport;
    const avgFloorArea = Number(
      (spec.totalFloorAreaSqm / Math.max(1, spec.floors)).toFixed(1)
    );

    const makeBadge = (dcr?: number): HoveredTooltipState['dcrBadge'] => {
      if (typeof dcr !== 'number') return undefined;
      const pct = Math.round(dcr * 100);
      if (dcr > 1.0) return { text: `위험 · 응력비 ${pct}% (초과)`, tone: 'unsafe' };
      if (dcr > 0.78) return { text: `주의 · 응력비 ${pct}%`, tone: 'caution' };
      return { text: `안전 · 응력비 ${pct}%`, tone: 'safe' };
    };

    // 기둥·보·기초·코어처럼 개별 공학 데이터가 붙은 구조 부재 호버 시 상세 역학 정보 우선 표시
    if (solid.stressLabel) {
      setHoveredTooltip({
        x: clientX,
        y: clientY,
        floorIndex,
        title: solid.groupName || `${floorIndex}층 구조 부재`,
        areaText: report ? `${report.system.nameKo} · ${report.system.codeRef}` : 'KDS 구조 골조',
        physicsLine1: solid.stressLabel,
        physicsLine2: report
          ? `건물 총 중량 ${report.totalGravityMassTon.toLocaleString()}톤 · 기초 지반압 ${report.soilBearingPressureKpa}kPa`
          : '',
        dcrBadge: makeBadge(solid.dcr),
      });
      return;
    }

    if (floorIndex < 0) {
      setHoveredTooltip({
        x: clientX,
        y: clientY,
        floorIndex,
        title: `지하·기초부 (B1~B${Math.max(1, spec.undergroundFloors)})`,
        areaText: `지하 연면적 ${spec.undergroundAreaSqm.toLocaleString()} ㎡`,
        physicsLine1: report
          ? `기초 지반접지압 ${report.soilBearingPressureKpa}kPa / 허용 ${report.allowableSoilKpa}kPa`
          : '철근콘크리트 기초 구조',
        physicsLine2: '지하 주차·기계실 및 RC 내진 기초',
        dcrBadge: makeBadge(report?.foundationDcr),
      });
      return;
    }

    if (floorIndex === 99) {
      setHoveredTooltip({
        x: clientX,
        y: clientY,
        floorIndex,
        title: `지붕·옥상층 (RF · ${spec.roofStyle ?? 'flat'})`,
        areaText: `건축면적 약 ${spec.buildingAreaSqm.toLocaleString()} ㎡ · 최고 높이 ${spec.heightMeters}m`,
        physicsLine1: '지붕-벽체 밀봉 마감 및 방수·단열 구조',
        physicsLine2: `지붕 마감재: ${(spec.roofMaterial ?? 'steel').toUpperCase()}`,
        dcrBadge: makeBadge(solid.dcr),
      });
      return;
    }

    const fp = report?.floors.find((f) => f.floor === floorIndex);
    setHoveredTooltip({
      x: clientX,
      y: clientY,
      floorIndex,
      title: `지상 ${floorIndex}층 (${floorIndex}F)`,
      areaText: `층 바닥면적 약 ${avgFloorArea.toLocaleString()} ㎡`,
      physicsLine1: fp
        ? `자중 ${fp.deadLoadKnM2} + 활하중 ${fp.liveLoadKnM2} → 계수하중 ${fp.factoredLoadKnM2} kN/㎡`
        : `활하중 ${(spec.floorLoadsKn?.[floorIndex] ?? 2.0).toFixed(1)} kN/㎡`,
      physicsLine2: fp
        ? `기둥 축하중 ${fp.columnAxialDemandKn}kN · 보 처짐 ${fp.beamDeflectionMm}/${fp.allowableDeflectionMm}mm`
        : 'KDS 41 12 00 구조 검토 완료',
      dcrBadge: fp
        ? makeBadge(Math.max(fp.columnDcr, fp.beamFlexureDcr, fp.beamDeflectionDcr))
        : undefined,
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
            onHoverSolid={handleHoverSolid}
            onLeaveSolid={() => setHoveredTooltip(null)}
            onUpdateSitePolygon={onUpdateSitePolygon}
            onDraggingSiteChange={setIsDraggingSite}
          />
        )}

        <CameraController control={structure.cameraControl} disabled={isDraggingSite} />
        {/* (조원호) 손 커서·선택·제스처 카메라 — src/hand/HandSceneLayer.tsx */}
        <HandSceneLayer structure={structure} />
      </Canvas>

      {/* 상태 안내 배너 (대지 편집 / 구조 골조 투시 / 물리 하중 히트맵) */}
      {structure.isSiteEditMode && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-sky-700/95 text-white text-xs sm:text-sm font-bold shadow-lg border border-sky-300">
          대지 경계 편집 중 · 파란 핀 드래그(모양 변경) · 초록점 클릭(꼭짓점 추가) · 핀 더블클릭(삭제)
        </div>
      )}

      {!structure.isSiteEditMode && structure.viewMode === 'structural_frame' && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-900/92 text-white text-xs sm:text-sm font-bold shadow-lg border border-sky-400">
          구조 골조 투시 ON · {structure.buildingSpec?.structuralReport?.system.nameKo ?? '주구조'} (기초 · 기둥 · 거더 보 · 내진 코어)
        </div>
      )}

      {!structure.isSiteEditMode && structure.isLoadHeatmapActive && (
        <div className="pointer-events-none fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-2xl bg-white/95 text-slate-900 text-xs font-bold shadow-lg border-2 border-slate-300 flex items-center gap-3">
          <span>물리 하중 경로 (KDS DCR):</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-white border border-slate-400 inline-block" /> 안전(&lt;55%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> 주의(78%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full bg-red-600 inline-block" /> 위험(&gt;100%)
          </span>
        </div>
      )}

      {/* 물리 하중·처짐·DCR 툴팁 (시니어 모드일 때 큰 글씨·고대비) */}
      {hoveredTooltip && !structure.isSiteEditMode && (
        <div
          className={`pointer-events-none fixed z-50 bg-white/98 backdrop-blur-md border-2 border-slate-800 rounded-xl px-3.5 py-2.5 shadow-2xl text-slate-900 space-y-1 ${
            isSenior ? 'max-w-[360px] text-sm' : 'max-w-[300px] text-xs'
          }`}
          style={{
            left: Math.min(window.innerWidth - (isSenior ? 375 : 315), hoveredTooltip.x + 16),
            top: Math.max(12, hoveredTooltip.y - 12),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-3 h-3 rounded-sm border border-slate-500 shrink-0"
                style={{ backgroundColor: getFloorColor(hoveredTooltip.floorIndex) }}
              />
              <span className="font-extrabold truncate">{hoveredTooltip.title}</span>
            </div>
            {hoveredTooltip.dcrBadge && (
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold shrink-0 ${
                  hoveredTooltip.dcrBadge.tone === 'unsafe'
                    ? 'bg-red-600 text-white'
                    : hoveredTooltip.dcrBadge.tone === 'caution'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {hoveredTooltip.dcrBadge.text}
              </span>
            )}
          </div>
          <div className="font-mono font-bold text-sky-800">{hoveredTooltip.areaText}</div>
          <div className="text-slate-700 leading-snug">{hoveredTooltip.physicsLine1}</div>
          {hoveredTooltip.physicsLine2 && (
            <div className="text-slate-500 text-[11px] leading-snug">
              {hoveredTooltip.physicsLine2}
            </div>
          )}
        </div>
      )}
    </div>
  );
}