import * as THREE from 'three';
import { CadMaterial } from '../types/cad';

export interface PbrTextureBundle {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  metalness: number;
  roughness: number;
  bumpScale: number;
  transparent?: boolean;
  opacity?: number;
}

const textureCache = new Map<CadMaterial, PbrTextureBundle>();

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTex(canvas: HTMLCanvasElement, repeatX = 2, repeatY = 2, isColor = true): THREE.CanvasTexture {
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

// 1. 내추럴 목재(세다·오크 사이딩 판재 + 나뭇결 섬유)
function buildWoodBundle(): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = '#c89b6e';
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#a8a8a8';
  ctxRough.fillRect(0, 0, size, size);

  const planks = 8;
  const plankW = size / planks;

  for (let p = 0; p < planks; p++) {
    const x0 = p * plankW;
    const toneShift = ((p * 37) % 24) - 12;
    const r = Math.min(240, Math.max(120, 198 + toneShift));
    const g = Math.min(210, Math.max(90, 152 + Math.round(toneShift * 0.8)));
    const b = Math.min(175, Math.max(60, 106 + Math.round(toneShift * 0.6)));

    ctxCol.fillStyle = `rgb(${r},${g},${b})`;
    ctxCol.fillRect(x0, 0, plankW - 1, size);

    // 나뭇결 파동 섬유
    for (let i = 0; i < 42; i++) {
      const lx = x0 + ((i * 19 + p * 7) % (plankW - 3)) + 1;
      ctxCol.strokeStyle = i % 2 === 0 ? 'rgba(92, 56, 28, 0.22)' : 'rgba(245, 218, 185, 0.16)';
      ctxCol.lineWidth = (i % 3) * 0.45 + 0.5;
      ctxCol.beginPath();
      for (let y = 0; y <= size; y += 16) {
        const wave = Math.sin(y * 0.04 + p + i) * 1.4;
        if (y === 0) ctxCol.moveTo(lx + wave, y);
        else ctxCol.lineTo(lx + wave, y);
      }
      ctxCol.stroke();

      ctxBump.strokeStyle = i % 2 === 0 ? 'rgba(40,40,40,0.35)' : 'rgba(210,210,210,0.25)';
      ctxBump.lineWidth = 0.8;
      ctxBump.beginPath();
      ctxBump.moveTo(lx, 0);
      ctxBump.lineTo(lx, size);
      ctxBump.stroke();
    }

    // 판재 사이 음영 홈
    ctxCol.fillStyle = 'rgba(58, 34, 16, 0.55)';
    ctxCol.fillRect(x0 + plankW - 1.5, 0, 1.5, size);
    ctxBump.fillStyle = '#181818';
    ctxBump.fillRect(x0 + plankW - 2, 0, 2, size);
    ctxRough.fillStyle = '#e5e5e5';
    ctxRough.fillRect(x0 + plankW - 2, 0, 2, size);
  }

  return {
    map: finalizeTex(cCol, 2, 2, true),
    bumpMap: finalizeTex(cBump, 2, 2, false),
    roughnessMap: finalizeTex(cRough, 2, 2, false),
    metalness: 0.04,
    roughness: 0.68,
    bumpScale: 0.022,
  };
}

// 2. 브러시드 구조용 강재 / 징크 메탈 패널
function buildSteelBundle(baseRgb = [176, 186, 198], metalness = 0.86, roughness = 0.28): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = `rgb(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]})`;
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#585858';
  ctxRough.fillRect(0, 0, size, size);

  // 미세 브러시 헤어라인
  for (let y = 0; y < size; y++) {
    const delta = ((y * 29) % 18) - 9;
    ctxCol.fillStyle = delta > 0 ? `rgba(255,255,255,${delta * 0.008})` : `rgba(15,23,42,${-delta * 0.009})`;
    ctxCol.fillRect(0, y, size, 1);

    const rVal = Math.max(45, Math.min(130, 82 + delta * 2));
    ctxRough.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    ctxRough.fillRect(0, y, size, 1);
  }

  // 건축 메탈 커튼월/징크 패널 조인트
  ctxCol.strokeStyle = 'rgba(30, 41, 59, 0.35)';
  ctxCol.lineWidth = 1.5;
  ctxCol.strokeRect(1, 1, size - 2, size - 2);
  ctxCol.beginPath();
  ctxCol.moveTo(0, size / 2);
  ctxCol.lineTo(size, size / 2);
  ctxCol.stroke();

  ctxBump.strokeStyle = '#252525';
  ctxBump.lineWidth = 2;
  ctxBump.strokeRect(1, 1, size - 2, size - 2);
  ctxBump.beginPath();
  ctxBump.moveTo(0, size / 2);
  ctxBump.lineTo(size, size / 2);
  ctxBump.stroke();

  return {
    map: finalizeTex(cCol, 2, 2, true),
    bumpMap: finalizeTex(cBump, 2, 2, false),
    roughnessMap: finalizeTex(cRough, 2, 2, false),
    metalness,
    roughness,
    bumpScale: 0.01,
  };
}

// 3. 노출 콘크리트 (송판 거푸집 라인 + 콘크리트 기공·콘 홀)
function buildConcreteBundle(): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = '#cbd2d9';
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#c8c8c8';
  ctxRough.fillRect(0, 0, size, size);

  // 미네랄 골재 노이즈
  for (let i = 0; i < 2400; i++) {
    const x = (i * 73) % size;
    const y = (i * 137) % size;
    const dark = i % 3 === 0;
    ctxCol.fillStyle = dark ? 'rgba(71, 85, 105, 0.14)' : 'rgba(248, 250, 252, 0.14)';
    ctxCol.fillRect(x, y, 2, 2);

    ctxBump.fillStyle = dark ? 'rgba(45,45,45,0.28)' : 'rgba(205,205,205,0.22)';
    ctxBump.fillRect(x, y, 2, 2);
  }

  // 노출 콘크리트 거푸집 줄눈 & 타이 홀(P-Cone)
  ctxCol.strokeStyle = 'rgba(71, 85, 105, 0.32)';
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
    ctxCol.fillStyle = 'rgba(51, 65, 85, 0.45)';
    ctxCol.beginPath();
    ctxCol.arc(hx, hy, 2.4, 0, Math.PI * 2);
    ctxCol.fill();

    ctxBump.fillStyle = '#1f1f1f';
    ctxBump.beginPath();
    ctxBump.arc(hx, hy, 2.6, 0, Math.PI * 2);
    ctxBump.fill();
  });

  return {
    map: finalizeTex(cCol, 2, 2, true),
    bumpMap: finalizeTex(cBump, 2, 2, false),
    roughnessMap: finalizeTex(cRough, 2, 2, false),
    metalness: 0.05,
    roughness: 0.84,
    bumpScale: 0.018,
  };
}

// 4. 웜 미네랄 스타코 / 라임 플라스터
function buildStuccoBundle(): PbrTextureBundle {
  const size = 256;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  ctxCol.fillStyle = '#f5f2eb';
  ctxCol.fillRect(0, 0, size, size);
  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#d8d8d8';
  ctxRough.fillRect(0, 0, size, size);

  for (let i = 0; i < 3200; i++) {
    const x = (i * 97) % size;
    const y = (i * 53) % size;
    const light = i % 2 === 0;
    ctxCol.fillStyle = light ? 'rgba(255,255,255,0.22)' : 'rgba(180,172,158,0.14)';
    ctxCol.fillRect(x, y, 2, 2);
    ctxBump.fillStyle = light ? 'rgba(215,215,215,0.28)' : 'rgba(65,65,65,0.25)';
    ctxBump.fillRect(x, y, 2, 2);
  }

  return {
    map: finalizeTex(cCol, 3, 3, true),
    bumpMap: finalizeTex(cBump, 3, 3, false),
    roughnessMap: finalizeTex(cRough, 3, 3, false),
    metalness: 0.02,
    roughness: 0.88,
    bumpScale: 0.014,
  };
}

// 5. 건축용 로이 복층 유리
function buildGlassBundle(): PbrTextureBundle {
  const size = 128;
  const [cCol, ctxCol] = makeCanvas(size);
  const [cBump, ctxBump] = makeCanvas(size);
  const [cRough, ctxRough] = makeCanvas(size);

  const grad = ctxCol.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#bae6fd');
  grad.addColorStop(0.5, '#e0f2fe');
  grad.addColorStop(1, '#7dd3fc');
  ctxCol.fillStyle = grad;
  ctxCol.fillRect(0, 0, size, size);

  ctxCol.strokeStyle = 'rgba(30, 41, 59, 0.55)';
  ctxCol.lineWidth = 3;
  ctxCol.strokeRect(1.5, 1.5, size - 3, size - 3);

  ctxBump.fillStyle = '#808080';
  ctxBump.fillRect(0, 0, size, size);
  ctxRough.fillStyle = '#181818';
  ctxRough.fillRect(0, 0, size, size);

  return {
    map: finalizeTex(cCol, 1, 1, true),
    bumpMap: finalizeTex(cBump, 1, 1, false),
    roughnessMap: finalizeTex(cRough, 1, 1, false),
    metalness: 0.18,
    roughness: 0.08,
    bumpScale: 0.004,
    transparent: true,
    opacity: 0.44,
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
      bundle = buildSteelBundle([164, 174, 186], 0.88, 0.25);
      break;
    case 'titanium':
      bundle = buildSteelBundle([196, 192, 188], 0.9, 0.24);
      break;
    case 'gold':
      bundle = buildSteelBundle([218, 184, 112], 0.88, 0.22);
      break;
    case 'carbon':
      bundle = buildSteelBundle([68, 76, 88], 0.35, 0.48);
      break;
    case 'concrete':
      bundle = buildConcreteBundle();
      break;
    case 'glass':
    case 'hologram':
      bundle = buildGlassBundle();
      break;
    case 'stucco':
    default:
      bundle = buildStuccoBundle();
      break;
  }

  textureCache.set(mat, bundle);
  return bundle;
}