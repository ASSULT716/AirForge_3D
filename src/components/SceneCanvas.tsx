import { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StructureState, NodePoint, BeamMember, CadMaterial, SolidPrimitive } from '../types/cad';
import { getSiteBoundaryPoints } from '../utils/architectureGenerator';

interface Props {
  structure: StructureState;
  onUpdateStress: (beams: BeamMember[]) => void;
  onSelectPart?: (partId: string | null) => void;
}

const getHeatColor = (stress: number): THREE.Color => {
  const s = Math.max(0, Math.min(1, stress));
  const c = new THREE.Color();
  if (s < 0.5) {
    c.lerpColors(new THREE.Color('#22c55e'), new THREE.Color('#eab308'), s * 2);
  } else {
    c.lerpColors(new THREE.Color('#eab308'), new THREE.Color('#ef4444'), (s - 0.5) * 2);
  }
  return c;
};

const getFloorLoadHeatColor = (loadKn: number): string => {
  const ratio = Math.max(0, Math.min(1, (loadKn - 1.5) / 4.5));
  if (ratio < 0.35) return '#22c55e';
  if (ratio < 0.7) return '#eab308';
  return '#ef4444';
};

const getMaterialProps = (mat?: CadMaterial) => {
  switch (mat) {
    case 'wood':
      return { roughness: 0.72, metalness: 0.04, transparent: false, opacity: 1 };
    case 'concrete':
      return { roughness: 0.88, metalness: 0.05, transparent: false, opacity: 1 };
    case 'glass':
      return { roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.55 };
    case 'hologram':
      return { roughness: 0.2, metalness: 0.7, transparent: true, opacity: 0.65 };
    case 'steel':
      return { roughness: 0.32, metalness: 0.82, transparent: false, opacity: 1 };
    case 'titanium':
      return { roughness: 0.28, metalness: 0.88, transparent: false, opacity: 1 };
    case 'carbon':
      return { roughness: 0.42, metalness: 0.55, transparent: false, opacity: 1 };
    case 'gold':
      return { roughness: 0.22, metalness: 0.92, transparent: false, opacity: 1 };
    case 'stucco':
    default:
      return { roughness: 0.78, metalness: 0.02, transparent: false, opacity: 1 };
  }
};

function SimulationScene({ structure, onUpdateStress, onSelectPart }: Props) {
  const { camera, scene } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const frameCountRef = useRef(0);
  const lastCommandIdRef = useRef<number | undefined>(undefined);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);

  const isInteriorCutaway = structure.viewMode === 'interior_cutaway';
  const showMepPipes = Boolean(structure.showMepPipes);

  const displacedNodes = useMemo<NodePoint[]>(() => {
    const loadFactor = structure.targetLoadKg / 100;
    const wave = structure.isSimulating ? Math.sin(performance.now() * 0.004) * 0.015 : 0;

    return structure.nodes.map((n) => {
      if (n.isFixed) return n;
      const heightRatio = Math.max(0, n.position[1] / 2.5);
      const sagY = -0.06 * loadFactor * heightRatio + wave * heightRatio;
      const swayX =
        0.03 * loadFactor * heightRatio * (structure.isSimulating ? Math.cos(performance.now() * 0.003) : 1);
      return {
        ...n,
        position: [
          Number((n.position[0] + swayX).toFixed(4)),
          Number((n.position[1] + sagY).toFixed(4)),
          n.position[2],
        ],
      };
    });
  }, [structure.nodes, structure.targetLoadKg, structure.isSimulating]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    displacedNodes.forEach((n) => map.set(n.id, n.position));
    return map;
  }, [displacedNodes]);

  useFrame((_, delta) => {
    frameCountRef.current += 1;

    const camCmd = structure.cameraControl;
    if (camCmd && controlsRef.current) {
      const isNewCmd =
        camCmd.commandId !== undefined && camCmd.commandId !== lastCommandIdRef.current;

      if (isNewCmd) {
        lastCommandIdRef.current = camCmd.commandId;
        if (camCmd.mode === 'preset') {
          if (camCmd.preset === 'front') {
            camera.position.set(0, 1.8, 9.5);
            controlsRef.current.target.set(0, 1.2, 0);
          } else if (camCmd.preset === 'top') {
            camera.position.set(0, 11.5, 0.01);
            controlsRef.current.target.set(0, 0, 0);
          } else {
            camera.position.set(6.2, 5.2, 7.2);
            controlsRef.current.target.set(0, 1.2, 0);
          }
          controlsRef.current.update();
        } else if (camCmd.mode === 'step_rotate') {
          const offset = camera.position.clone().sub(controlsRef.current.target);
          const yawRad = THREE.MathUtils.degToRad(camCmd.yawDeg ?? 0);
          const pitchRad = THREE.MathUtils.degToRad(camCmd.pitchDeg ?? 0);
          const euler = new THREE.Euler(pitchRad, yawRad, 0, 'YXZ');
          offset.applyEuler(euler);
          if (camCmd.zoomFactor && camCmd.zoomFactor > 0) {
            offset.multiplyScalar(camCmd.zoomFactor);
          }
          camera.position.copy(controlsRef.current.target).add(offset);
          controlsRef.current.update();
        }
      }

      if (camCmd.mode === 'auto_rotate') {
        const speed = camCmd.speed ?? 0.65;
        const offset = camera.position.clone().sub(controlsRef.current.target);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), speed * delta);
        camera.position.copy(controlsRef.current.target).add(offset);
        controlsRef.current.update();
      }
    }

    if (structure.isSimulating && frameCountRef.current % 15 === 0) {
      const loadFactor = structure.targetLoadKg / 100;
      const t = performance.now() * 0.002;
      const updated = structure.beams.map((b, idx) => {
        const pulse = Math.sin(t + idx * 0.7) * 0.14;
        const nextStress = Math.max(0.05, Math.min(1, b.stress * 0.85 + (0.38 * loadFactor + pulse) * 0.15));
        return { ...b, stress: Number(nextStress.toFixed(3)) };
      });
      onUpdateStress(updated);
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && document.pointerLockElement) {
        document.exitPointerLock();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scene]);

  const selectedUnitType =
    structure.buildingSpec?.unitTypes?.find((u) => u.id === structure.selectedUnitTypeId) ?? null;

  const siteBoundary = useMemo(() => {
    if (!structure.buildingSpec) return null;
    return getSiteBoundaryPoints(
      structure.buildingSpec.siteAreaSqm,
      structure.buildingSpec.siteShape ?? 'rectangle',
      structure.buildingSpec.customSitePoints
    );
  }, [
    structure.buildingSpec?.siteAreaSqm,
    structure.buildingSpec?.siteShape,
    structure.buildingSpec?.customSitePoints,
  ]);

  const isSolidCutawayHidden = (solid: SolidPrimitive): boolean => {
    if (!isInteriorCutaway) return false;
    if (solid.partRole === 'roof') return true;
    if (solid.partRole === 'exterior_wall') {
      return solid.id.includes('_ext_S_') || solid.id.includes('_ext_E_');
    }
    return false;
  };

  return (
    <>
      <color attach="background" args={['#eef2f6']} />
      <ambientLight intensity={1.0} />
      <directionalLight position={[8, 14, 10]} intensity={1.7} castShadow />
      <directionalLight position={[-8, 6, -8]} intensity={0.65} />

      <Grid
        args={[24, 24]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#cbd5e1"
        sectionSize={2.5}
        sectionThickness={1.2}
        sectionColor="#94a3b8"
        fadeDistance={28}
        position={[0, -0.01, 0]}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        target={[0, 1.2, 0]}
      />

      <group ref={groupRef} name="cad_structure_group">
        {siteBoundary && (
          <Line
            points={siteBoundary.points}
            color="#0284c7"
            lineWidth={2.5}
            dashed={false}
          />
        )}

        {(structure.solids ?? []).map((solid) => {
          if (isSolidCutawayHidden(solid)) return null;

          const isSelected = structure.selectedPartId === solid.id;
          const isFloorHighlighted =
            structure.selectedFloorIndex !== null &&
            structure.selectedFloorIndex !== undefined &&
            solid.floorIndex === structure.selectedFloorIndex;
          const isHovered = hoveredPartId === solid.id;

          const floorLoadKn =
            structure.isLoadHeatmapActive && solid.floorIndex && solid.floorIndex >= 1
              ? structure.buildingSpec?.floorLoadsKn?.[solid.floorIndex] ?? 2.0
              : null;

          const matProps = getMaterialProps(solid.material ?? structure.activeMaterial);
          const baseColor =
            floorLoadKn !== null
              ? getFloorLoadHeatColor(floorLoadKn)
              : isSelected
              ? '#f59e0b'
              : isFloorHighlighted
              ? '#38bdf8'
              : isHovered
              ? '#0ea5e9'
              : solid.color ?? structure.activeColor;

          const interactive = solid.partRole !== 'garden';
          const effectiveOpacity = isInteriorCutaway
            ? solid.partRole === 'interior_wall' ||
              solid.partRole === 'furniture' ||
              solid.partRole === 'interior_floor'
              ? 1
              : Math.min(matProps.opacity, 0.28)
            : matProps.opacity;
          const effectiveTransparent = isInteriorCutaway
            ? solid.partRole !== 'interior_wall' &&
              solid.partRole !== 'furniture' &&
              solid.partRole !== 'interior_floor'
            : matProps.transparent;

          return (
            <mesh
              key={solid.id}
              position={solid.position}
              scale={solid.scale}
              rotation={solid.rotation ?? [0, 0, 0]}
              onPointerOver={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      setHoveredPartId(solid.id);
                      document.body.style.cursor = 'pointer';
                    }
                  : undefined
              }
              onPointerOut={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      setHoveredPartId((prev) => (prev === solid.id ? null : prev));
                      document.body.style.cursor = 'auto';
                    }
                  : undefined
              }
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      onSelectPart?.(solid.id);
                    }
                  : undefined
              }
            >
              {solid.shape === 'sphere' && <sphereGeometry args={[0.5, 24, 24]} />}
              {solid.shape === 'cone' && <coneGeometry args={[0.5, 1, 24]} />}
              {solid.shape === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 24]} />}
              {solid.shape === 'torus' && <torusGeometry args={[0.5, 0.16, 16, 32]} />}
              {solid.shape === 'box' && <boxGeometry args={[1, 1, 1]} />}
              <meshStandardMaterial
                color={baseColor}
                roughness={matProps.roughness}
                metalness={matProps.metalness}
                transparent={effectiveTransparent}
                opacity={effectiveOpacity}
              />
            </mesh>
          );
        })}

        {showMepPipes &&
          (structure.buildingSpec?.mepPipes ?? []).map((pipe) => (
            <Line
              key={pipe.id}
              points={pipe.points}
              color={pipe.system === 'water' ? '#0284c7' : '#eab308'}
              lineWidth={3}
            />
          ))}

        {selectedUnitType &&
          selectedUnitType.placements.map((pl, idx) => (
            <mesh
              key={`${selectedUnitType.id}_pl_${idx}`}
              position={pl.position}
              scale={pl.scale}
              onClick={(e) => {
                e.stopPropagation();
                onSelectPart?.(`unit_${selectedUnitType.id}_f${pl.floor}`);
              }}
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color={selectedUnitType.color}
                transparent
                opacity={0.45}
                roughness={0.25}
              />
            </mesh>
          ))}

        {structure.buildingSpec &&
          Array.from({ length: structure.buildingSpec.floors }, (_, i) => i + 1).map((fNum) => {
            const totalH = Math.max(0.95, Math.min(12.0, structure.buildingSpec!.heightMeters / 3.2));
            const yPos = ((fNum - 0.5) / structure.buildingSpec!.floors) * totalH;
            const loadKn = structure.buildingSpec?.floorLoadsKn?.[fNum] ?? 2.0;

            if (structure.isLoadHeatmapActive) {
              return (
                <Html key={`heat_tag_${fNum}`} position={[0, yPos, 0]} center distanceFactor={9}>
                  <div
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold text-white shadow border border-white/70 whitespace-nowrap"
                    style={{ backgroundColor: getFloorLoadHeatColor(loadKn) }}
                  >
                    {fNum}층 · {loadKn.toFixed(1)} kN/㎡
                  </div>
                </Html>
              );
            }
            return null;
          })}

        {displacedNodes.map((node) => (
          <mesh key={node.id} position={node.position}>
            <sphereGeometry args={[node.isFixed ? 0.065 : 0.048, 14, 14]} />
            <meshStandardMaterial
              color={node.isFixed ? '#f59e0b' : '#0284c7'}
              roughness={0.35}
              metalness={0.3}
            />
          </mesh>
        ))}

        {structure.beams.map((beam) => {
          const start = nodeMap.get(beam.startNodeId);
          const end = nodeMap.get(beam.endNodeId);
          if (!start || !end) return null;

          const vStart = new THREE.Vector3(...start);
          const vEnd = new THREE.Vector3(...end);
          const dir = new THREE.Vector3().subVectors(vEnd, vStart);
          const len = dir.length();
          if (len < 1e-4) return null;

          const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);
          const quat = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dir.clone().normalize()
          );

          const matProps = getMaterialProps(beam.material ?? structure.activeMaterial);
          const beamColor = structure.isSimulating
            ? `#${getHeatColor(beam.stress).getHexString()}`
            : beam.color ?? structure.activeColor;
          const r = beam.radius ?? 0.028;

          return (
            <mesh key={beam.id} position={mid} quaternion={quat}>
              <cylinderGeometry args={[r, r, len, 12]} />
              <meshStandardMaterial
                color={beamColor}
                roughness={matProps.roughness}
                metalness={matProps.metalness}
                transparent={matProps.transparent}
                opacity={matProps.opacity}
              />
            </mesh>
          );
        })}
      </group>
    </>
  );
}

export default function SceneCanvas(props: Props) {
  return (
    <div
      className="w-full h-full"
      onClick={() => {
        if (props.structure.selectedPartId) {
          props.onSelectPart?.(null);
        }
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [5.5, 4.6, 6.5], fov: 45, near: 0.1, far: 200 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
          });
        }}
      >
        <SimulationScene {...props} />
      </Canvas>
    </div>
  );
}