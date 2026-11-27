import * as THREE from 'three';
import { CadMaterial } from '../types/cad';

export interface PbrTextureBundle {
  map: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
  roughnessMap: THREE.CanvasTexture | null;
  baseTintHex: string;
  metalness: number;
  roughness: number;
  bumpScale: number;
  clearcoat: number;
  clearcoatRoughness: number;
  reflectivity: number;
  ior: number;
  envMapIntensity: number;
  transparent: boolean;
  opacity: number;
  castShadow: boolean;
  labelKo: string;
  /** 자재 + 시공 포함 현실 단가 (원/㎡, 개별 부위 및 층 재질 변경 예산 산출용) */
  unitCostPerM2Krw: number;
}

const textureCache = new Map<CadMaterial, PbrTextureBundle>();

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTex(
  canvas: HTMLCanvasElement,
  repeatX = 2,
  repeatY = 2,
  isColor = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

/** 1. 내추럴 목재 (적삼목·오크 사이딩 판재 + 자연 나뭇결) */
function buildWoodBundle(): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = '#c29162';
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#bababa';
  ctxRough.fillRect(0, 0, size, size);

  const planks = 8;
  const plankW = size / planks;

  for (let p = 0; p < planks; p++) {
    const x0 = p * plankW;
    const shift = ((p * 37) % 24) - 12;
    const r = Math.min(228, Math.max(125, 194 + shift));
    const g = Math.min(196, Math.max(92, 146 + Math.round(shift * 0.8)));
    const b = Math.min(162, Math.max(64, 100 + Math.round(shift * 0.6)));

    ctxCol.fillStyle = `rgb(${r},${g},${b})`;
    ctxCol.fillRect(x0, 0, plankW - 1, size);

    for (let i = 0; i < 40; i++) {
      const lx = x0 + ((i * 19 + p * 7) % (plankW - 3)) + 1;
      ctxCol.strokeStyle =
        i % 2 === 0 ? 'rgba(84, 50, 24, 0.24)' : 'rgba(242, 214, 182, 0.16)';
      ctxCol.lineWidth = (i % 3) * 0.45 + 0.5;
      ctxCol.beginPath();
      for (let y = 0; y <= size; y += 16) {
        const wave = Math.sin(y * 0.04 + p + i) * 1.4;
        if (y === 0) ctxCol.moveTo(lx + wave, y);
        else ctxCol.lineTo(lx + wave, y);
      }
      ctxCol.stroke();

      ctxBump.strokeStyle = i % 2 === 0 ? 'rgba(40,40,40,0.34)' : 'rgba(215,215,215,0.24)';
      ctxBump.lineWidth = 0.8;
      ctxBump.beginPath();
      ctxBump.moveTo(lx, 0);
      ctxBump.lineTo(lx, size);
      ctxBump.stroke();
    }

    ctxCol.fillStyle = 'rgba(54, 30, 14, 0.55)';
    ctxCol.fillRect(x0 + plankW - 1.5, 0, 1.5, size);
    ctxBump.fillStyle = '#1a1a1a';
    ctxBump.fillRect(x0 + plankW - 2, 0, 2, size);
    ctxRough.fillStyle = '#e5e5e5';
    ctxRough.fillRect(x0 + plankW - 2, 0, 2, size);
  }

  return {
    map: finalizeTex(cCol, 2, 2, true),
    bumpMap: finalizeTex(cBump, 2, 2, false),
    roughnessMap: finalizeTex(cRough, 2, 2, false),
    baseTintHex: '#ffffff',
    metalness: 0.03,
    roughness: 0.72,
    bumpScale: 0.022,
    clearcoat: 0.1,
    clearcoatRoughness: 0.52,
    reflectivity: 0.28,
    ior: 1.5,
    envMapIntensity: 0.48,
    transparent: false,
    opacity: 1,
    castShadow: true,
    labelKo: '내추럴 적삼목·오크 목재',
    unitCostPerM2Krw: 197000,
  };
}

/** 2. 브러시드 금속 패널 (강재 / 티타늄 / 샴페인 골드 — 고대비 금속 광택 유지) */
function buildBrushedMetalBundle(params: {
  baseRgb: [number, number, number];
  highlightRgba: string;
  shadowRgba: string;
  metalness: number;
  roughness: number;
  clearcoat: number;
  envMapIntensity: number;
  labelKo: string;
  unitCostPerM2Krw: number;
}): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  const [br, bg, bb] = params.baseRgb;
  const grad = ctxCol.createLinearGradient(0, 0, size, size);
  grad.addColorStop(
    0,
    `rgb(${Math.min(255, br + 18)},${Math.min(255, bg + 16)},${Math.min(255, bb + 12)})`
  );
  grad.addColorStop(0.5, `rgb(${br},${bg},${bb})`);
  grad.addColorStop(
    1,
    `rgb(${Math.max(0, br - 14)},${Math.max(0, bg - 14)},${Math.max(0, bb - 12)})`
  );
  ctxCol.fillStyle = grad;
  ctxCol.fillRect(0, 0, size, size);

  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#787878';
  ctxRough.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y++) {
    const delta = ((y * 29) % 16) - 8;
    ctxCol.fillStyle = delta > 0 ? params.highlightRgba : params.shadowRgba;
    ctxCol.fillRect(0, y, size, 1);

    const rVal = Math.max(70, Math.min(155, 112 + delta * 3));
    ctxRough.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    ctxRough.fillRect(0, y, size, 1);
  }

  ctxCol.strokeStyle = 'rgba(30, 41, 59, 0.28)';
  ctxCol.lineWidth = 1.4;
  ctxCol.strokeRect(1, 1, size - 2, size - 2);
  ctxCol.beginPath();
  ctxCol.moveTo(0, size / 2);
  ctxCol.lineTo(size, size / 2);
  ctxCol.stroke();

  ctxBump.strokeStyle = '#303030';
  ctxBump.lineWidth = 1.8;
  ctxBump.strokeRect(1, 1, size - 2, size - 2);
  ctxBump.beginPath();
  ctxBump.moveTo(0, size / 2);
  ctxBump.lineTo(size, size / 2);
  ctxBump.stroke();

  return {
    map: finalizeTex(cCol, 2, 2, true),
    bumpMap: finalizeTex(cBump, 2, 2, false),
    roughnessMap: finalizeTex(cRough, 2, 2, false),
    baseTintHex: '#ffffff',
    metalness: params.metalness,
    roughness: params.roughness,
    bumpScale: 0.008,
    clearcoat: params.clearcoat,
    clearcoatRoughness: 0.18,
    reflectivity: 0.92,
    ior: 1.5,
    envMapIntensity: params.envMapIntensity,
    transparent: false,
    opacity: 1,
    castShadow: true,
    labelKo: params.labelKo,
    unitCostPerM2Krw: params.unitCostPerM2Krw,
  };
}

/** 3. 카본 복합재 (2×2 능직 카본 직조 패턴 + 클리어코트 광택) */
function buildCarbonBundle(): PbrTextureBundle {
  const size = 128;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const parity = (x / cell + y / cell) % 2 === 0;
      ctxCol.fillStyle = parity ? '#3b4252' : '#525b6e';
      ctxCol.fillRect(x, y, cell, cell);
      ctxCol.fillStyle = parity ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)';
      ctxCol.fillRect(x, y, cell, 2);

      ctxBump.fillStyle = parity ? '#a8a8a8' : '#5c5c5c';
      ctxBump.fillRect(x, y, cell, cell);
      ctxRough.fillStyle = parity ? '#666666' : '#999999';
      ctxRough.fillRect(x, y, cell, cell);
    }
  }

  return {
    map: finalizeTex(cCol, 4, 4, true),
    bumpMap: finalizeTex(cBump, 4, 4, false),
    roughnessMap: finalizeTex(cRough, 4, 4, false),
    baseTintHex: '#ffffff',
    metalness: 0.35,
    roughness: 0.38,
    bumpScale: 0.012,
    clearcoat: 0.72,
    clearcoatRoughness: 0.14,
    reflectivity: 0.8,
    ior: 1.5,
    envMapIntensity: 1.5,
    transparent: false,
    opacity: 1,
    castShadow: true,
    labelKo: '세라믹·탄소복합재(CFRP) 패널',
    unitCostPerM2Krw: 257000,
  };
}

/** 4. 노출 콘크리트 (차분한 미네랄 톤 + 거푸집 줄눈 + P-Cone 홀) */
function buildConcreteBundle(): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = '#bcc3cc';
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#d0d0d0';
  ctxRough.fillRect(0, 0, size, size);

  for (let i = 0; i < 2400; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const dark = i % 3 === 0;
    ctxCol.fillStyle = dark ? 'rgba(60, 72, 90, 0.16)' : 'rgba(240, 244, 248, 0.12)';
    ctxCol.fillRect(x, y, 2, 2);

    ctxBump.fillStyle = dark ? 'rgba(45,45,45,0.28)' : 'rgba(205,205,205,0.22)';
    ctxBump.fillRect(x, y, 2, 2);
  }

  ctxCol.strokeStyle = 'rgba(58, 70, 88, 0.34)';
  ctxCol.lineWidth = 1.2;
  [0, size / 2].forEach((pos) => {
    ctxCol.beginPath();
    ctxCol.moveTo(0, pos);
    ctxCol.lineTo(size, pos);
    ctxCol.stroke();

    ctxCol.beginPath();
    ctxCol.moveTo(pos, 0);
    ctxCol.lineTo(pos, size);
    ctxCol.stroke();
  });

  const holes = [
    [32, 32],
    [96, 32],
    [160, 32],
    [224, 32],
    [32, 160],
    [96, 160],
    [160, 160],
    [224, 160],
  ];
  holes.forEach(([hx, hy]) => {
    ctxCol.fillStyle = 'rgba(45, 58, 76, 0.48)';
    ctxCol.beginPath();
    ctxCol.arc(hx, hy, 2.3, 0, Math.PI * 2);
    ctxCol.fill();

    ctxBump.fillStyle = '#1f1f1f';
    ctxBump.beginPath();
    ctxBump.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctxBump.fill();
  });

  return {
    map: finalizeTex(cCol, 2, 2, true),
    bumpMap: finalizeTex(cBump, 2, 2, false),
    roughnessMap: finalizeTex(cRough, 2, 2, false),
    baseTintHex: '#ffffff',
    metalness: 0.03,
    roughness: 0.88,
    bumpScale: 0.018,
    clearcoat: 0.02,
    clearcoatRoughness: 0.8,
    reflectivity: 0.18,
    ior: 1.5,
    envMapIntensity: 0.38,
    transparent: false,
    opacity: 1,
    castShadow: true,
    labelKo: '노출 콘크리트 마감',
    unitCostPerM2Krw: 163000,
  };
}

/** 5. 웜 미네랄 스타코 (화이트 클리핑 방지: 실물 라임 플라스터 반사율 #e0dbd0 + 무광 환경반사 억제) */
function buildStuccoBundle(): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = '#e0dbd0';
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#e4e4e4';
  ctxRough.fillRect(0, 0, size, size);

  for (let i = 0; i < 3200; i++) {
    const x = (i * 97) % size;
    const y = (i * 53) % size;
    const light = i % 2 === 0;
    ctxCol.fillStyle = light ? 'rgba(255,253,248,0.16)' : 'rgba(138,130,118,0.18)';
    ctxCol.fillRect(x, y, 2, 2);
    ctxBump.fillStyle = light ? 'rgba(220,220,220,0.3)' : 'rgba(55,55,55,0.28)';
    ctxBump.fillRect(x, y, 2, 2);
  }

  return {
    map: finalizeTex(cCol, 3, 3, true),
    bumpMap: finalizeTex(cBump, 3, 3, false),
    roughnessMap: finalizeTex(cRough, 3, 3, false),
    baseTintHex: '#f0ece4',
    metalness: 0.0,
    roughness: 0.94,
    bumpScale: 0.016,
    clearcoat: 0,
    clearcoatRoughness: 1.0,
    reflectivity: 0.1,
    ior: 1.45,
    envMapIntensity: 0.26,
    transparent: false,
    opacity: 1,
    castShadow: true,
    labelKo: '스타코플렉스(외단열 마감)',
    unitCostPerM2Krw: 136000,
  };
}

/** 6. 실제 투명 건축 로이(Low-E) 복층 유리 */
function buildGlassBundle(isFrosted: boolean): PbrTextureBundle {
  return {
    map: null,
    bumpMap: null,
    roughnessMap: null,
    baseTintHex: isFrosted ? '#d8e7f3' : '#dfeef8',
    metalness: 0.06,
    roughness: isFrosted ? 0.18 : 0.05,
    bumpScale: 0,
    clearcoat: 1.0,
    clearcoatRoughness: isFrosted ? 0.16 : 0.03,
    reflectivity: 0.96,
    ior: 1.52,
    envMapIntensity: 2.15,
    transparent: true,
    opacity: isFrosted ? 0.34 : 0.24,
    castShadow: false,
    labelKo: isFrosted ? '반투명 에칭 로이 유리' : '고단열 투명 로이(Low-E) 유리',
    unitCostPerM2Krw: isFrosted ? 350000 : 380000,
  };
}

export function getPbrMaterialBundle(mat: CadMaterial): PbrTextureBundle {
  const cached = textureCache.get(mat);
  if (cached) return cached;

  let bundle: PbrTextureBundle;
  switch (mat) {
    case 'wood':
      bundle = buildWoodBundle();
      break;
    case 'steel':
      bundle = buildBrushedMetalBundle({
        baseRgb: [190, 200, 212],
        highlightRgba: 'rgba(255,255,255,0.09)',
        shadowRgba: 'rgba(30,41,59,0.07)',
        metalness: 0.8,
        roughness: 0.25,
        clearcoat: 0.28,
        envMapIntensity: 1.9,
        labelKo: '브러시드 리얼징크·강재',
        unitCostPerM2Krw: 186000,
      });
      break;
    case 'titanium':
      bundle = buildBrushedMetalBundle({
        baseRgb: [208, 204, 196],
        highlightRgba: 'rgba(255,252,245,0.1)',
        shadowRgba: 'rgba(45,42,38,0.07)',
        metalness: 0.82,
        roughness: 0.23,
        clearcoat: 0.34,
        envMapIntensity: 2.0,
        labelKo: '티타늄 아연판(VMZINC)',
        unitCostPerM2Krw: 283000,
      });
      break;
    case 'gold':
      bundle = buildBrushedMetalBundle({
        baseRgb: [238, 196, 98],
        highlightRgba: 'rgba(255,246,204,0.14)',
        shadowRgba: 'rgba(148,98,20,0.09)',
        metalness: 0.78,
        roughness: 0.21,
        clearcoat: 0.48,
        envMapIntensity: 2.2,
        labelKo: '샴페인 골드 아노다이징 메탈',
        unitCostPerM2Krw: 315000,
      });
      break;
    case 'carbon':
      bundle = buildCarbonBundle();
      break;
    case 'concrete':
      bundle = buildConcreteBundle();
      break;
    case 'glass':
      bundle = buildGlassBundle(false);
      break;
    case 'hologram':
      bundle = buildGlassBundle(true);
      break;
    case 'stucco':
    default:
      bundle = buildStuccoBundle();
      break;
  }

  textureCache.set(mat, bundle);
  return bundle;
}