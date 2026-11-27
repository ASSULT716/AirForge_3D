import { SiteShape } from '../types/cad';

export const WORLD_SCALE_DIV = 3.2; // 1 Three.js unit = 3.2m

// 대지면적(㎡)과 기본 형태로부터 초기 다각형 꼭짓점([x, z][]) 생성
export function createSitePolygon(
  siteAreaSqm: number,
  shape: SiteShape = 'rectangle'
): [number, number][] {
  const areaUnits = Math.max(2.5, Math.min(56, siteAreaSqm / (WORLD_SCALE_DIV * WORLD_SCALE_DIV)));

  if (shape === 'triangle') {
    const base = Math.sqrt(areaUnits * 2.2);
    const height = (2 * areaUnits) / base;
    const hw = base * 0.5;
    const hd = height * 0.5;
    return [
      [0, Number((-hd).toFixed(3))],
      [Number(hw.toFixed(3)), Number(hd.toFixed(3))],
      [Number((-hw).toFixed(3)), Number(hd.toFixed(3))],
    ];
  }

  if (shape === 'circle') {
    // 8각형(자유 드래그 가능한 원형 근사 다각형)
    const segs = 8;
    const r = Math.sqrt((2 * areaUnits) / (segs * Math.sin((2 * Math.PI) / segs)));
    const pts: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2 - Math.PI / 2;
      pts.push([Number((Math.cos(a) * r).toFixed(3)), Number((Math.sin(a) * r).toFixed(3))]);
    }
    return pts;
  }

  if (shape === 'trapezoid') {
    const depth = Math.sqrt(areaUnits * 0.85);
    const avgW = areaUnits / depth;
    const topHalf = avgW * 0.36;
    const botHalf = avgW * 0.64;
    const hd = depth * 0.5;
    return [
      [Number((-topHalf).toFixed(3)), Number((-hd).toFixed(3))],
      [Number(topHalf.toFixed(3)), Number((-hd).toFixed(3))],
      [Number(botHalf.toFixed(3)), Number(hd.toFixed(3))],
      [Number((-botHalf).toFixed(3)), Number(hd.toFixed(3))],
    ];
  }

  // 기본 직사각형 (4꼭짓점, 사용자가 자유롭게 끌거나 변에 꼭짓점 추가 가능)
  const w = Math.sqrt(areaUnits * 1.18);
  const d = areaUnits / w;
  const hw = w * 0.5;
  const hd = d * 0.5;
  return [
    [Number((-hw).toFixed(3)), Number((-hd).toFixed(3))],
    [Number(hw.toFixed(3)), Number((-hd).toFixed(3))],
    [Number(hw.toFixed(3)), Number(hd.toFixed(3))],
    [Number((-hw).toFixed(3)), Number(hd.toFixed(3))],
  ];
}

// 신발끈 공식(Shoelace)으로 다각형의 실제 대지면적(㎡) 계산
export function computePolygonAreaUnits(poly: [number, number][]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) * 0.5;
}

export function computePolygonAreaSqm(poly: [number, number][]): number {
  const units = computePolygonAreaUnits(poly);
  return Math.max(50, Math.round(units * WORLD_SCALE_DIV * WORLD_SCALE_DIV));
}

export function computePolygonCentroid(poly: [number, number][]): [number, number] {
  if (poly.length === 0) return [0, 0];
  let cx = 0;
  let cz = 0;
  for (const [x, z] of poly) {
    cx += x;
    cz += z;
  }
  return [cx / poly.length, cz / poly.length];
}

// 사용자가 대지면적 슬라이더를 바꿀 때 현재 자유 다각형 모양을 유지한 채 면적만 스케일링
export function scalePolygonToAreaSqm(
  poly: [number, number][],
  targetAreaSqm: number
): [number, number][] {
  const currentSqm = computePolygonAreaSqm(poly);
  if (currentSqm <= 1) return createSitePolygon(targetAreaSqm, 'rectangle');
  const scale = Math.sqrt(Math.max(50, targetAreaSqm) / currentSqm);
  const [cx, cz] = computePolygonCentroid(poly);
  return poly.map(([x, z]) => [
    Number((cx + (x - cx) * scale).toFixed(3)),
    Number((cz + (z - cz) * scale).toFixed(3)),
  ]);
}

// Ray-casting Point-in-Polygon 판정
export function isPointInPolygon(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const intersect =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistSq(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return (px - x1) ** 2 + (pz - z1) ** 2;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / lenSq));
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;
  return (px - projX) ** 2 + (pz - projZ) ** 2;
}

// 다각형 내부 + 경계로부터 setback(이격거리) 안쪽에 안전하게 들어오는지 검사
function isRectInsidePolygon(
  cx: number,
  cz: number,
  w: number,
  d: number,
  rotY: number,
  poly: [number, number][],
  setback = 0.14
): boolean {
  const hw = w * 0.5;
  const hd = d * 0.5;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);

  // 오목 다각형에서도 경계 침범을 막기 위해 외곽 12개 + 중심 1개 샘플 검증
  const sampleNormals: [number, number][] = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-0.5, -1],
    [0.5, -1],
    [-0.5, 1],
    [0.5, 1],
    [0, 0],
  ];

  const setbackSq = setback * setback;

  for (const [nx, nz] of sampleNormals) {
    const lx = nx * hw;
    const lz = nz * hd;
    const wx = cx + lx * cos - lz * sin;
    const wz = cz + lx * sin + lz * cos;

    if (!isPointInPolygon(wx, wz, poly)) return false;

    if (setback > 0) {
      for (let i = 0; i < poly.length; i++) {
        const [x1, z1] = poly[i];
        const [x2, z2] = poly[(i + 1) % poly.length];
        if (pointToSegmentDistSq(wx, wz, x1, z1, x2, z2) < setbackSq) {
          return false;
        }
      }
    }
  }
  return true;
}

export interface InscribedBuildingFit {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  rotationY: number;
  achievedAreaSqm: number;
}

// 자유롭게 드래그된 대지 다각형 내부에 건물이 깨지지 않고 가장 넓고 자연스럽게 들어가는 위치·크기·각도 계산
export function computeBestBuildingFootprintInPolygon(
  poly: [number, number][],
  targetFootprintSqm: number,
  preferredAspect: number
): InscribedBuildingFit {
  const targetUnits = Math.max(
    1.8,
    targetFootprintSqm / (WORLD_SCALE_DIV * WORLD_SCALE_DIV)
  );

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const [centX, centZ] = computePolygonCentroid(poly);

  // 후보 회전 각도: 정북(0°) + 다각형의 각 변에 평행한 각도들
  const angleSet = new Set<number>([0]);
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    let ang = Math.atan2(z2 - z1, x2 - x1);
    // -PI/2 ~ PI/2 범위로 정규화
    while (ang > Math.PI * 0.5) ang -= Math.PI;
    while (ang < -Math.PI * 0.5) ang += Math.PI;
    angleSet.add(Number(ang.toFixed(2)));
  }

  // 내부 후보 중심점 그리드 (5x5 + 무게중심)
  const candidateCenters: [number, number][] = [];
  if (isPointInPolygon(centX, centZ, poly)) {
    candidateCenters.push([centX, centZ]);
  }
  const steps = 5;
  for (let ix = 1; ix <= steps; ix++) {
    for (let iz = 1; iz <= steps; iz++) {
      const gx = minX + ((maxX - minX) * ix) / (steps + 1);
      const gz = minZ + ((maxZ - minZ) * iz) / (steps + 1);
      if (isPointInPolygon(gx, gz, poly)) {
        candidateCenters.push([gx, gz]);
      }
    }
  }

  if (candidateCenters.length === 0) {
    candidateCenters.push([centX, centZ]);
  }

  const candidateAspects = [preferredAspect, 1 / preferredAspect, 1.0];
  let best: InscribedBuildingFit = {
    centerX: centX,
    centerZ: centZ,
    width: 1.8,
    depth: 1.5,
    rotationY: 0,
    achievedAreaSqm: 30,
  };
  let bestScore = -1;

  const maxSpan = Math.max(maxX - minX, maxZ - minZ);

  for (const rotY of angleSet) {
    // 정북(0도) 정렬에 약간의 보너스를 주어 직사각형일 때는 반듯하게 유지
    const angleBonus = Math.abs(rotY) < 0.05 ? 1.04 : 1.0;

    for (const aspect of candidateAspects) {
      const aspectBonus = Math.abs(aspect - preferredAspect) < 0.05 ? 1.03 : 1.0;
      const targetScale = Math.sqrt(targetUnits);

      for (const [cx, cz] of candidateCenters) {
        // 이진 탐색으로 이 중심·각도에서 들어가는 최대 직사각형 크기 산출
        let lo = 0.5;
        let hi = Math.min(maxSpan, targetScale * 1.15);

        const sqrtA = Math.sqrt(aspect);
        if (!isRectInsidePolygon(cx, cz, lo * sqrtA, lo / sqrtA, rotY, poly, 0.12)) {
          continue;
        }

        for (let iter = 0; iter < 8; iter++) {
          const mid = (lo + hi) * 0.5;
          if (isRectInsidePolygon(cx, cz, mid * sqrtA, mid / sqrtA, rotY, poly, 0.14)) {
            lo = mid;
          } else {
            hi = mid;
          }
        }

        const clampedScale = Math.min(lo, targetScale);
        const w = clampedScale * sqrtA;
        const d = clampedScale / sqrtA;
        const area = w * d;
        const score = area * angleBonus * aspectBonus;

        if (score > bestScore) {
          bestScore = score;
          best = {
            centerX: Number(cx.toFixed(3)),
            centerZ: Number(cz.toFixed(3)),
            width: Number(Math.max(1.2, w).toFixed(3)),
            depth: Number(Math.max(1.0, d).toFixed(3)),
            rotationY: Number(rotY.toFixed(3)),
            achievedAreaSqm: Math.round(area * WORLD_SCALE_DIV * WORLD_SCALE_DIV),
          };
        }
      }
    }
  }

  return best;
}

// 다각형 대지 내부의 빈 땅(건물 바깥)에 깔끔하게 들어가는 정원 조경 패치 탐색
export function findGardenPatchesInPolygon(
  poly: [number, number][],
  bldg: InscribedBuildingFit,
  gardenReqSqm: number
): { cx: number; cz: number; w: number; d: number; rotY: number; sqm: number }[] {
  if (gardenReqSqm <= 5) return [];
  const reqUnits = gardenReqSqm / (WORLD_SCALE_DIV * WORLD_SCALE_DIV);
  const patches: { cx: number; cz: number; w: number; d: number; rotY: number; sqm: number }[] = [];

  const cos = Math.cos(bldg.rotationY);
  const sin = Math.sin(bldg.rotationY);

  // 건물 주변 4방향(동·남·서·북) 로컬 오프셋에 정원 배치 시도
  const sideDirs: { lx: number; lz: number; wRatio: number; dRatio: number }[] = [
    { lx: bldg.width * 0.5 + 0.55, lz: 0, wRatio: 0.75, dRatio: 1.25 },
    { lx: 0, lz: bldg.depth * 0.5 + 0.55, wRatio: 1.25, dRatio: 0.72 },
    { lx: -(bldg.width * 0.5 + 0.55), lz: 0, wRatio: 0.75, dRatio: 1.2 },
    { lx: 0, lz: -(bldg.depth * 0.5 + 0.55), wRatio: 1.2, dRatio: 0.72 },
  ];

  let placedUnits = 0;

  for (const dir of sideDirs) {
    const remaining = reqUnits - placedUnits;
    if (remaining <= 0.12) break;

    const wx = bldg.centerX + dir.lx * cos - dir.lz * sin;
    const wz = bldg.centerZ + dir.lx * sin + dir.lz * cos;

    if (!isPointInPolygon(wx, wz, poly)) continue;

    // 건물에 겹치지 않으면서 대지 경계 안에 들어가는 최대 패치 크기 이진탐색
    let lo = 0.25;
    let hi = Math.min(2.4, Math.sqrt(remaining * 1.4));
    const maxW = Math.max(0.35, bldg.width * 0.85);
    const maxD = Math.max(0.35, bldg.depth * 0.85);

    if (
      !isRectInsidePolygon(
        wx,
        wz,
        Math.min(maxW, lo * dir.wRatio),
        Math.min(maxD, lo * dir.dRatio),
        bldg.rotationY,
        poly,
        0.08
      )
    ) {
      continue;
    }

    for (let iter = 0; iter < 6; iter++) {
      const mid = (lo + hi) * 0.5;
      const tw = Math.min(maxW, mid * dir.wRatio);
      const td = Math.min(maxD, mid * dir.dRatio);
      if (isRectInsidePolygon(wx, wz, tw, td, bldg.rotationY, poly, 0.08)) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const pw = Number(Math.min(maxW, lo * dir.wRatio).toFixed(3));
    const pd = Number(Math.min(maxD, lo * dir.dRatio).toFixed(3));
    const areaU = pw * pd;

    patches.push({
      cx: Number(wx.toFixed(3)),
      cz: Number(wz.toFixed(3)),
      w: pw,
      d: pd,
      rotY: bldg.rotationY,
      sqm: Math.round(areaU * WORLD_SCALE_DIV * WORLD_SCALE_DIV),
    });
    placedUnits += areaU;
  }

  return patches;
}