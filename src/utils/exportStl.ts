import * as THREE from 'three';
import { StructureState } from '../types/cad';

const UP_VEC = new THREE.Vector3(0, 1, 0);

function appendGeometryTriangles(
  geom: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][]
) {
  const nonIndexed = geom.index ? geom.toNonIndexed() : geom.clone();
  nonIndexed.applyMatrix4(matrix);
  const pos = nonIndexed.getAttribute('position');
  if (!pos) return;

  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    triangles.push([a, b, c]);
  }
  nonIndexed.dispose();
}

export function downloadStructureAsSTL(structure: StructureState) {
  const triangles: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  // 1 Three.js unit = 20mm (실제 3D 프린팅 베드 출력에 적합한 밀리미터 스케일)
  const PRINT_SCALE_MM = 20;

  // 1. 입체 솔리드 메쉬 변환
  (structure.solids ?? []).forEach((s) => {
    let baseGeom: THREE.BufferGeometry;
    if (s.shape === 'sphere') baseGeom = new THREE.SphereGeometry(0.8, 28, 28);
    else if (s.shape === 'cone') baseGeom = new THREE.ConeGeometry(0.8, 1.4, 24);
    else if (s.shape === 'cylinder') baseGeom = new THREE.CylinderGeometry(0.7, 0.7, 1.2, 28);
    else if (s.shape === 'torus') baseGeom = new THREE.TorusGeometry(0.7, 0.25, 20, 40);
    else baseGeom = new THREE.BoxGeometry(1, 1, 1);

    const pos = new THREE.Vector3(
      s.position[0] * PRINT_SCALE_MM,
      s.position[1] * PRINT_SCALE_MM,
      s.position[2] * PRINT_SCALE_MM
    );
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(s.rotation?.[0] ?? 0, s.rotation?.[1] ?? 0, s.rotation?.[2] ?? 0)
    );
    const scl = new THREE.Vector3(
      s.scale[0] * PRINT_SCALE_MM,
      s.scale[1] * PRINT_SCALE_MM,
      s.scale[2] * PRINT_SCALE_MM
    );
    const mat = new THREE.Matrix4().compose(pos, quat, scl);
    appendGeometryTriangles(baseGeom, mat, triangles);
    baseGeom.dispose();
  });

  // 2. 트러스 빔 부재 변환
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, new THREE.Vector3(...n.position)]));
  structure.beams.forEach((b) => {
    const p1 = nodeMap.get(b.startNodeId);
    const p2 = nodeMap.get(b.endNodeId);
    if (!p1 || !p2) return;

    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5 * PRINT_SCALE_MM);
    const diff = new THREE.Vector3().subVectors(p2, p1);
    const len = Math.max(0.01, diff.length()) * PRINT_SCALE_MM;
    const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, diff.clone().normalize());
    const radius = (b.radius ?? 0.045) * PRINT_SCALE_MM;

    const cylGeom = new THREE.CylinderGeometry(radius, radius, len, 12);
    const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, 1, 1));
    appendGeometryTriangles(cylGeom, mat, triangles);
    cylGeom.dispose();
  });

  // 3. 조인트 노드 변환
  structure.nodes.forEach((n) => {
    const nodeGeom = n.isFixed
      ? new THREE.BoxGeometry(0.18 * PRINT_SCALE_MM, 0.18 * PRINT_SCALE_MM, 0.18 * PRINT_SCALE_MM)
      : new THREE.SphereGeometry(0.085 * PRINT_SCALE_MM, 12, 12);
    const mat = new THREE.Matrix4().makeTranslation(
      n.position[0] * PRINT_SCALE_MM,
      n.position[1] * PRINT_SCALE_MM,
      n.position[2] * PRINT_SCALE_MM
    );
    appendGeometryTriangles(nodeGeom, mat, triangles);
    nodeGeom.dispose();
  });

  if (triangles.length === 0) {
    alert('출력할 3D 모델이 비어 있습니다. 먼저 건물을 생성해 주세요.');
    return;
  }

  // 3D 프린터 표준 좌표계 변환 (Three.js Y-up -> STL Z-up, 바닥 Z=0 밀착)
  let minZ = Infinity;
  const converted = triangles.map(([a, b, c]) => {
    const va = new THREE.Vector3(a.x, -a.z, a.y);
    const vb = new THREE.Vector3(b.x, -b.z, b.y);
    const vc = new THREE.Vector3(c.x, -c.z, c.y);
    minZ = Math.min(minZ, va.z, vb.z, vc.z);
    return [va, vb, vc] as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  });

  // Binary STL 버퍼 생성 (80바이트 헤더 + 4바이트 삼각형 수 + 삼각형당 50바이트)
  const buffer = new ArrayBuffer(84 + converted.length * 50);
  const view = new DataView(buffer);
  const header = 'AirForge 3D Architectural Model STL (mm)';
  for (let i = 0; i < header.length; i++) {
    view.setUint8(i, header.charCodeAt(i));
  }
  view.setUint32(80, converted.length, true);

  let offset = 84;
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();

  converted.forEach(([va, vb, vc]) => {
    va.z -= minZ;
    vb.z -= minZ;
    vc.z -= minZ;

    edge1.subVectors(vb, va);
    edge2.subVectors(vc, va);
    normal.crossVectors(edge1, edge2).normalize();

    view.setFloat32(offset, normal.x, true);
    view.setFloat32(offset + 4, normal.y, true);
    view.setFloat32(offset + 8, normal.z, true);
    offset += 12;

    [va, vb, vc].forEach((v) => {
      view.setFloat32(offset, v.x, true);
      view.setFloat32(offset + 4, v.y, true);
      view.setFloat32(offset + 8, v.z, true);
      offset += 12;
    });

    view.setUint16(offset, 0, true);
    offset += 2;
  });

  const blob = new Blob([buffer], { type: 'application/sla' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileName = `${structure.buildingSpec?.projectName || 'AirForge_3D_Building'}_Print.stl`;
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}