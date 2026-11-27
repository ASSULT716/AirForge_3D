// (조원호) 회전체(lathe) 원기둥: 윗면/아랫면 반지름 비율 + 오프셋으로 판 안쪽 구멍 → 원뿔대·원뿔·컵·파이프·접시
// SceneCanvas(렌더)와 HandSceneLayer(피킹·하이라이트)가 같은 단면을 씀
//
// 로컬 단위는 기본 원기둥 지오메트리와 같음 (반지름 0.7, 높이 1.2, 중심 원점) → solid.scale 의미 그대로
import * as THREE from 'three';
import type { LatheProfile } from '../types/cad';

export const LATHE_R = 0.7;
export const LATHE_H = 1.2;
const HALF = LATHE_H / 2;
const SEGMENTS = 40;
/** 안쪽 반지름 최소값 (로컬) */
const MIN_INNER = 0.004;

export const DEFAULT_LATHE: LatheProfile = { top: 1, bottom: 1 };

/** 높이 y(로컬)에서 바깥 반지름 */
export function outerRadiusAt(p: LatheProfile, y: number) {
  const t = (y + HALF) / LATHE_H;
  return LATHE_R * (p.bottom + (p.top - p.bottom) * t);
}

/** 구멍 정보 (로컬 단위). 구멍 없으면 null */
export function boreGeometry(p: LatheProfile) {
  const b = p.bore;
  if (!b) return null;
  const endY = b.from === 'top' ? HALF : -HALF;
  const endR = outerRadiusAt(p, endY);
  const wall = endR * b.wall;
  const depth = Math.min(1, Math.max(0, b.depth)) * LATHE_H;
  const floorY = b.from === 'top' ? HALF - depth : -HALF + depth;
  const innerAt = (y: number) => Math.max(MIN_INNER, outerRadiusAt(p, y) - wall);
  return { endY, endR, wall, depth, floorY, innerAt, through: b.depth >= 0.999 };
}

/**
 * 단면 (반지름 x, 높이 y). LatheGeometry는 점 사이 법선을 평균하므로 모서리 점을 두 번 넣어 각진 모서리 유지
 * 순서: 축 → 바닥 → 옆면 → 윗면 → (구멍 벽 → 구멍 바닥 → 축)
 */
export function latheProfilePoints(p: LatheProfile): THREE.Vector2[] {
  const rb = LATHE_R * p.bottom;
  const rt = LATHE_R * p.top;
  const pts: Array<[number, number]> = [];
  const corner = (x: number, y: number) => {
    pts.push([x, y], [x, y]);
  };
  const g = boreGeometry(p);

  if (!g || g.depth < 1e-4) {
    pts.push([0, -HALF]);
    corner(rb, -HALF);
    corner(rt, HALF);
    pts.push([0, HALF]);
  } else if (g.through) {
    // 파이프: 바깥 → 안쪽 벽으로 닫힌 고리
    const ib = g.innerAt(-HALF);
    const it = g.innerAt(HALF);
    corner(ib, -HALF);
    corner(rb, -HALF);
    corner(rt, HALF);
    corner(it, HALF);
    pts.push([ib, -HALF]);
  } else if (p.bore!.from === 'top') {
    pts.push([0, -HALF]);
    corner(rb, -HALF);
    corner(rt, HALF);
    corner(g.innerAt(HALF), HALF);
    corner(g.innerAt(g.floorY), g.floorY);
    pts.push([0, g.floorY]);
  } else {
    pts.push([0, g.floorY]);
    corner(g.innerAt(g.floorY), g.floorY);
    corner(g.innerAt(-HALF), -HALF);
    corner(rb, -HALF);
    corner(rt, HALF);
    pts.push([0, HALF]);
  }
  // 반지름 0인 점이 겹치면 LatheGeometry가 뒤집힌 면을 만들 수 있어 아주 살짝 띄움
  return pts.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y));
}

const cache = new Map<string, THREE.LatheGeometry>();
/** 같은 단면이면 지오메트리 공유 (프레임마다 새로 만들지 않게) */
export function latheGeometry(p: LatheProfile): THREE.LatheGeometry {
  const key = JSON.stringify(p);
  let geo = cache.get(key);
  if (!geo) {
    geo = new THREE.LatheGeometry(latheProfilePoints(p), SEGMENTS);
    if (cache.size > 200) {
      cache.forEach((g) => g.dispose());
      cache.clear();
    }
    cache.set(key, geo);
  }
  return geo;
}

export type LatheFace = 'top' | 'bottom' | 'side' | 'bore';

/** 로컬 좌표의 맞은 점 → 어느 면인지 (구멍 안쪽 벽·바닥, 깊이 0인 안쪽 원 포함 = bore) */
export function latheFaceAt(p: LatheProfile, local: { x: number; y: number; z: number }): LatheFace {
  const r = Math.hypot(local.x, local.z);
  const eps = 0.02;
  const g = boreGeometry(p);
  if (g) {
    const nearEnd = Math.abs(local.y - g.endY) < eps;
    const inside = r < g.innerAt(local.y) + eps * 0.5;
    const withinDepth = p.bore!.from === 'top' ? local.y >= g.floorY - eps : local.y <= g.floorY + eps;
    if (inside && (withinDepth || (nearEnd && g.depth < 1e-4))) return 'bore';
  }
  if (local.y > HALF - eps) return 'top';
  if (local.y < -HALF + eps) return 'bottom';
  return 'side';
}
