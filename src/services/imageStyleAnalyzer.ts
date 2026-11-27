import {
  BuildingSpec,
  BuildingTemplateId,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  InteriorTheme,
  RoofStyle,
} from '../types/cad';

export interface SinglePhotoTrait {
  material: CadMaterial;
  roofStyle: RoofStyle;
  templateId: BuildingTemplateId;
  wallColor: string;
  roofColor: string;
  interiorTheme: InteriorTheme;
  interiorWallColor: string;
  interiorFloorColor: string;
  gardenBoost: number;
  woodRatio: number;
  greenRatio: number;
  darkRatio: number;
  whiteRatio: number;
  glassRatio: number;
  contrastScore: number;
  toneTitle: string;
  signatureHash: number;
  label: string;
}

export interface ExtractedHouseStyle {
  templateId: BuildingTemplateId;
  roofStyle: RoofStyle;
  material: CadMaterial;
  accentMaterial: CadMaterial;
  wallColor: string;
  roofColor: string;
  interiorTheme: InteriorTheme;
  interiorWallColor: string;
  interiorFloorColor: string;
  openPlanRatio: number;
  gardenBoostRatio: number;
  styleSummary: string;
  tags: string[];
  templates: BuildingTemplateOption[];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const ROOF_LABEL_MAP: Record<RoofStyle, string> = {
  gable: '박공 지붕',
  shed: '모던 경사지붕',
  butterfly: '나비형 역경사지붕',
  'split-gable': '비대칭 스플릿 지붕',
  'flat-overhang': '캔틸레버 처마 평지붕',
};

const STRUCTURE_LABEL_MAP: Record<BuildingTemplateId, string> = {
  'L-courtyard': 'L자 교차 중정 구조',
  'U-terrace': 'ㄷ자 아트리움 윙 구조',
  'stepped-wing': '계단식 셋백 테라스 구조',
  'twin-pavilion': '스카이브릿지 트윈동 구조',
  'bridge-cantilever': '필로티 캔틸레버 브릿지 구조',
  'split-gable': '이중 매스 스플릿 구조',
  'atrium-ring': '중앙 채광 아트리움 순환 구조',
};

async function analyzeSinglePhotoPixels(dataUrl: string, photoIdx: number): Promise<SinglePhotoTrait> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          material: 'stucco',
          roofStyle: 'flat-overhang',
          templateId: 'L-courtyard',
          wallColor: '#f5f2eb',
          roofColor: '#c89b6e',
          interiorTheme: 'warm-wood',
          interiorWallColor: '#faf7f2',
          interiorFloorColor: '#d4a373',
          gardenBoost: 1.0,
          woodRatio: 0.1,
          greenRatio: 0.1,
          darkRatio: 0.1,
          whiteRatio: 0.4,
          glassRatio: 0.1,
          contrastScore: 0.3,
          toneTitle: '웜 스타코',
          signatureHash: 17 + photoIdx,
          label: '모던 스타코 하우스',
        });
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumLumaSq = 0;
      let warmWoodCount = 0;
      let greenGardenCount = 0;
      let darkSteelCount = 0;
      let brightWhiteCount = 0;
      let glassBlueCount = 0;
      let validPixels = 0;
      let upperDarkCount = 0;
      let wallR = 0;
      let wallG = 0;
      let wallB = 0;
      let wallPixels = 0;
      let hashAcc = (img.width * 31 + img.height * 17 + photoIdx * 97) % 9973;

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const luma = (r + g + b) / 3;

          sumR += r;
          sumG += g;
          sumB += b;
          sumLumaSq += luma * luma;
          validPixels++;

          if ((x + y) % 19 === 0) {
            hashAcc = (hashAcc * 33 + r + g * 3 + b * 7) % 9973;
          }

          if (y > 10 && y < 38 && x > 18 && x < 78 && r + g + b < 280) {
            upperDarkCount++;
          }

          if (x > 20 && x < 76 && y > 32 && y < 78) {
            wallR += r;
            wallG += g;
            wallB += b;
            wallPixels++;
          }

          if (r > g + 13 && g > b + 9 && r > 80 && r < 235) {
            warmWoodCount++;
          } else if (g > r + 9 && g > b + 9 && g > 55) {
            greenGardenCount++;
          } else if (r > 205 && g > 205 && b > 198) {
            brightWhiteCount++;
          } else if (r < 88 && g < 92 && b < 108) {
            darkSteelCount++;
          } else if (b > r + 13 && b > 110 && y > 20) {
            glassBlueCount++;
          }
        }
      }

      const avgLuma = (sumR + sumG + sumB) / (3 * Math.max(1, validPixels));
      const variance = Math.max(0, sumLumaSq / Math.max(1, validPixels) - avgLuma * avgLuma);
      const contrastScore = Math.min(1, Math.sqrt(variance) / 85);

      const woodRatio = warmWoodCount / Math.max(1, validPixels);
      const greenRatio = greenGardenCount / Math.max(1, validPixels);
      const darkRatio = darkSteelCount / Math.max(1, validPixels);
      const whiteRatio = brightWhiteCount / Math.max(1, validPixels);
      const glassRatio = glassBlueCount / Math.max(1, validPixels);
      const imgAspect = img.width / Math.max(1, img.height);

      const rawCenterR = wallR / Math.max(1, wallPixels);
      const rawCenterG = wallG / Math.max(1, wallPixels);
      const rawCenterB = wallB / Math.max(1, wallPixels);
      const blendTone = (c: number, target: number) => Math.round(c * 0.35 + target * 0.65);

      if (woodRatio > 0.14) {
        resolve({
          material: 'wood',
          roofStyle: upperDarkCount > 220 ? 'gable' : 'split-gable',
          templateId: greenRatio > 0.13 ? 'U-terrace' : 'L-courtyard',
          wallColor: rgbToHex(
            blendTone(rawCenterR, 212),
            blendTone(rawCenterG, 172),
            blendTone(rawCenterB, 130)
          ),
          roofColor: '#3f3f46',
          interiorTheme: 'warm-wood',
          interiorWallColor: '#f8f0e5',
          interiorFloorColor: '#c48f5a',
          gardenBoost: greenRatio > 0.13 ? 1.32 : 1.12,
          woodRatio,
          greenRatio,
          darkRatio,
          whiteRatio,
          glassRatio,
          contrastScore,
          toneTitle: '내추럴 시더·오크 우드',
          signatureHash: hashAcc,
          label: '내추럴 우드 · 박공/스플릿 지붕',
        });
        return;
      }

      if (darkRatio > 0.2 || avgLuma < 102) {
        resolve({
          material: glassRatio > 0.12 ? 'steel' : 'concrete',
          roofStyle: contrastScore > 0.52 ? 'bridge-cantilever' === 'bridge-cantilever' ? 'butterfly' : 'shed' : 'shed',
          templateId: 'bridge-cantilever',
          wallColor: '#cbd5e1',
          roofColor: '#1e293b',
          interiorTheme: 'industrial-loft',
          interiorWallColor: '#e2e8f0',
          interiorFloorColor: '#8d99ae',
          gardenBoost: greenRatio > 0.14 ? 1.25 : 1.0,
          woodRatio,
          greenRatio,
          darkRatio,
          whiteRatio,
          glassRatio,
          contrastScore,
          toneTitle: '차콜 징크·노출콘크리트',
          signatureHash: hashAcc,
          label: '다크 스틸·캔틸레버 브릿지',
        });
        return;
      }

      if (glassRatio > 0.15) {
        resolve({
          material: 'glass',
          roofStyle: 'butterfly',
          templateId: 'twin-pavilion',
          wallColor: '#e0f2fe',
          roofColor: '#475569',
          interiorTheme: 'minimal-gallery',
          interiorWallColor: '#f8fafc',
          interiorFloorColor: '#cbd5e1',
          gardenBoost: 1.18,
          woodRatio,
          greenRatio,
          darkRatio,
          whiteRatio,
          glassRatio,
          contrastScore,
          toneTitle: '파노라마 로이 글라스',
          signatureHash: hashAcc,
          label: '전면 글라스 트윈 파빌리온',
        });
        return;
      }

      if (whiteRatio > 0.19) {
        resolve({
          material: 'stucco',
          roofStyle: imgAspect > 1.25 ? 'flat-overhang' : 'shed',
          templateId: greenRatio > 0.13 ? 'atrium-ring' : 'stepped-wing',
          wallColor: '#f5f2eb',
          roofColor: '#c89b6e',
          interiorTheme: 'japandi',
          interiorWallColor: '#faf6ef',
          interiorFloorColor: '#d6b48c',
          gardenBoost: greenRatio > 0.13 ? 1.35 : 1.08,
          woodRatio,
          greenRatio,
          darkRatio,
          whiteRatio,
          glassRatio,
          contrastScore,
          toneTitle: '퓨어 라임 스타코',
          signatureHash: hashAcc,
          label: '미니멀 화이트 아트리움·테라스',
        });
        return;
      }

      resolve({
        material: 'concrete',
        roofStyle: 'split-gable',
        templateId: 'stepped-wing',
        wallColor: rgbToHex(
          blendTone(rawCenterR, 222),
          blendTone(rawCenterG, 220),
          blendTone(rawCenterB, 214)
        ),
        roofColor: '#475569',
        interiorTheme: 'warm-wood',
        interiorWallColor: '#f5f0e6',
        interiorFloorColor: '#c89b6e',
        gardenBoost: 1.1,
        woodRatio,
        greenRatio,
        darkRatio,
        whiteRatio,
        glassRatio,
        contrastScore,
        toneTitle: '송판 노출콘크리트',
        signatureHash: hashAcc,
        label: '컨템포러리 노출콘크리트 하우스',
      });
    };

    img.onerror = () => {
      resolve({
        material: 'stucco',
        roofStyle: 'flat-overhang',
        templateId: 'L-courtyard',
        wallColor: '#f5f2eb',
        roofColor: '#c89b6e',
        interiorTheme: 'warm-wood',
        interiorWallColor: '#faf7f2',
        interiorFloorColor: '#d4a373',
        gardenBoost: 1.0,
        woodRatio: 0.1,
        greenRatio: 0.1,
        darkRatio: 0.1,
        whiteRatio: 0.3,
        glassRatio: 0.1,
        contrastScore: 0.3,
        toneTitle: '웜 스타코',
        signatureHash: 41 + photoIdx,
        label: '모던 하우스',
      });
    };

    img.src = dataUrl;
  });
}

// 사진의 시각적 특성과 해시를 기반으로 서로 완전히 다른 5가지 건축 구조·지붕·실내 템플릿을 동적 생성
function buildFivePhotoAdaptiveTemplates(
  traits: SinglePhotoTrait[],
  category: Exclude<DesignCategory, '3D 디자인'>
): BuildingTemplateOption[] {
  const primary = traits[0];
  const secondary = traits[1] ?? traits[0];
  const tertiary = traits[2] ?? traits[1] ?? traits[0];

  const avgWood = traits.reduce((a, t) => a + t.woodRatio, 0) / traits.length;
  const avgGreen = traits.reduce((a, t) => a + t.greenRatio, 0) / traits.length;
  const avgDark = traits.reduce((a, t) => a + t.darkRatio, 0) / traits.length;
  const avgGlass = traits.reduce((a, t) => a + t.glassRatio, 0) / traits.length;
  const avgContrast = traits.reduce((a, t) => a + t.contrastScore, 0) / traits.length;
  const combinedHash = traits.reduce((acc, t, idx) => (acc + t.signatureHash * (idx + 3)) % 9973, 0);

  // 각 구조 아키타입별 사진 적합도 점수 계산 (사진이 바뀔 때마다 5가지 순위와 구성이 달라짐)
  const candidates: {
    id: BuildingTemplateId;
    score: number;
    defaultRoof: RoofStyle;
    altRoof: RoofStyle;
  }[] = [
    {
      id: 'L-courtyard',
      score: 50 + avgWood * 85 + avgGreen * 70 + ((combinedHash % 17) - 8),
      defaultRoof: 'gable',
      altRoof: 'flat-overhang',
    },
    {
      id: 'U-terrace',
      score: 48 + avgGreen * 110 + avgWood * 50 + (((combinedHash >> 2) % 19) - 9),
      defaultRoof: 'shed',
      altRoof: 'split-gable',
    },
    {
      id: 'bridge-cantilever',
      score: 46 + avgDark * 105 + avgContrast * 45 + (((combinedHash >> 3) % 21) - 10),
      defaultRoof: 'flat-overhang',
      altRoof: 'butterfly',
    },
    {
      id: 'twin-pavilion',
      score: 47 + avgGlass * 115 + avgDark * 40 + (((combinedHash >> 4) % 17) - 8),
      defaultRoof: 'butterfly',
      altRoof: 'shed',
    },
    {
      id: 'split-gable',
      score: 49 + avgWood * 75 + avgContrast * 50 + (((combinedHash >> 5) % 19) - 9),
      defaultRoof: 'split-gable',
      altRoof: 'gable',
    },
    {
      id: 'atrium-ring',
      score: 47 + avgGreen * 80 + avgGlass * 65 + (((combinedHash >> 6) % 17) - 8),
      defaultRoof: 'shed',
      altRoof: 'flat-overhang',
    },
    {
      id: 'stepped-wing',
      score: 48 + avgContrast * 60 + avgGlass * 55 + (((combinedHash >> 7) % 15) - 7),
      defaultRoof: 'flat-overhang',
      altRoof: 'split-gable',
    },
  ];

  // 상위 5개 서로 다른 구조 추출
  const topFive = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const catSuffix =
    category === '단독주택'
      ? '하우스'
      : category === '공동주택'
      ? '레지던스'
      : category === '업무·상업시설'
      ? '파빌리온'
      : '아트센터';

  const matPairs: { primary: CadMaterial; accent: CadMaterial; titlePrefix: string }[] = [
    {
      primary: primary.material,
      accent:
        secondary.material !== primary.material
          ? secondary.material
          : primary.material === 'wood'
          ? 'stucco'
          : 'wood',
      titlePrefix: primary.toneTitle,
    },
    {
      primary: secondary.material,
      accent: primary.material === secondary.material ? 'steel' : primary.material,
      titlePrefix: secondary.toneTitle,
    },
    {
      primary: avgWood > 0.14 ? 'wood' : avgDark > 0.18 ? 'steel' : 'concrete',
      accent: 'glass',
      titlePrefix: avgWood > 0.14 ? '오크 팀버·글라스' : avgDark > 0.18 ? '징크 스틸·커튼월' : '노출콘크리트·통창',
    },
    {
      primary: 'stucco',
      accent: avgWood > 0.12 ? 'wood' : 'steel',
      titlePrefix: avgWood > 0.12 ? '라임 스타코·시더' : '화이트 플라스터·메탈',
    },
    {
      primary: avgDark > 0.16 ? 'concrete' : 'wood',
      accent: avgGlass > 0.12 ? 'glass' : 'concrete',
      titlePrefix: avgDark > 0.16 ? '모노리스 콘크리트' : '웜 브릭·우드 루버',
    },
  ];

  const interiorThemes: InteriorTheme[] = [
    tertiary.interiorTheme,
    'warm-wood',
    'minimal-gallery',
    'japandi',
    'industrial-loft',
  ];

  const interiorWallPalette: Record<InteriorTheme, { wall: string; floor: string; openRatio: number }> = {
    'warm-wood': { wall: '#f8f0e5', floor: '#c48f5a', openRatio: 1.05 },
    'minimal-gallery': { wall: '#f8fafc', floor: '#cbd5e1', openRatio: 1.28 },
    japandi: { wall: '#faf6ef', floor: '#d6b48c', openRatio: 1.12 },
    'industrial-loft': { wall: '#e2e8f0', floor: '#8d99ae', openRatio: 1.24 },
  };

  const subtitleByStructure: Record<BuildingTemplateId, (roof: RoofStyle, tone: string) => string> = {
    'L-courtyard': (roof, tone) =>
      `${tone} 외벽에 ${ROOF_LABEL_MAP[roof]}을 얹고 1·2층 매스를 직교 교차시킨 중정형 ${catSuffix}`,
    'U-terrace': (roof, tone) =>
      `중앙 선큰 정원을 양翼 매스가 감싸며 상층부 테라스와 ${ROOF_LABEL_MAP[roof]}이 결합된 ${catSuffix}`,
    'bridge-cantilever': (roof, tone) =>
      `1층 필로티 코어 위에 2층 매스를 과감히 돌출시킨 ${tone} 캔틸레버 브릿지 ${catSuffix}`,
    'twin-pavilion': (roof, tone) =>
      `좌·우 분리된 두 개의 동을 2층 글라스 스카이브릿지와 ${ROOF_LABEL_MAP[roof]}으로 연결한 ${catSuffix}`,
    'split-gable': (roof, tone) =>
      `서로 다른 높이의 이중 박공·경사 지붕 사이에 고측창 채광 틈을 둔 ${tone} ${catSuffix}`,
    'atrium-ring': (roof, tone) =>
      `건물 중앙 수직 채광 아트리움을 중심으로 방들이 순환 배치된 ${tone} 갤러리 ${catSuffix}`,
    'stepped-wing': (roof, tone) =>
      `층마다 비대칭 후퇴·돌출을 주어 넓은 야외 우드 테라스를 확보한 ${tone} 스텝 ${catSuffix}`,
  };

  return topFive.map((item, idx) => {
    const pair = matPairs[idx % matPairs.length];
    const roof: RoofStyle =
      idx === 0
        ? primary.roofStyle
        : idx % 2 === 1
        ? item.defaultRoof
        : item.altRoof;
    const iTheme = interiorThemes[idx % interiorThemes.length];
    const iPalette = interiorWallPalette[iTheme];

    const shortStructName: Record<BuildingTemplateId, string> = {
      'L-courtyard': 'L자 교차 중정',
      'U-terrace': 'ㄷ자 아트리움',
      'bridge-cantilever': '캔틸레버 브릿지',
      'twin-pavilion': '트윈 파빌리온',
      'split-gable': '스플릿 듀얼지붕',
      'atrium-ring': '채광 아트리움',
      'stepped-wing': '스텝 테라스',
    };

    const name = `${pair.titlePrefix} ${shortStructName[item.id]} ${catSuffix}`;
    const subtitle = subtitleByStructure[item.id](roof, pair.titlePrefix);

    return {
      id: item.id,
      name,
      subtitle,
      concept: `${name} (${ROOF_LABEL_MAP[roof]})`,
      roofStyle: roof,
      primaryMaterial: pair.primary,
      accentMaterial: pair.accent,
      wallColor: idx === 0 ? primary.wallColor : idx === 1 ? secondary.wallColor : primary.wallColor,
      roofColor: idx % 2 === 0 ? primary.roofColor : secondary.roofColor,
      interiorTheme: iTheme,
      interiorWallColor: iPalette.wall,
      interiorFloorColor: iPalette.floor,
      openPlanRatio: iPalette.openRatio,
      gardenMultiplier: idx === 1 || idx === 5 ? 1.28 : 1.05,
      structureBadge: STRUCTURE_LABEL_MAP[item.id],
      roofBadge: ROOF_LABEL_MAP[roof],
      isPhotoDerived: true,
    };
  });
}

// 여러 장의 사진 특징을 융합하여 5가지 맞춤형 템플릿 + 1안 즉시 적용 스펙 반환
export async function analyzeMultipleHousePhotosAndAdaptSpec(
  dataUrls: string[],
  currentSpec: BuildingSpec,
  lockedKeys: Partial<Record<string, boolean>> = {}
): Promise<{
  adaptedSpec: BuildingSpec;
  extracted: ExtractedHouseStyle;
}> {
  const validUrls = dataUrls.filter(Boolean);
  const traits = await Promise.all(
    validUrls.map((url, idx) => analyzeSinglePhotoPixels(url, idx))
  );

  const category: Exclude<DesignCategory, '3D 디자인'> =
    currentSpec.usageType === '3D 디자인' ? '단독주택' : currentSpec.usageType;

  const fiveTemplates = buildFivePhotoAdaptiveTemplates(traits, category);
  const firstTpl = fiveTemplates[0];

  const primary = traits[0];
  const secondary = traits[1] ?? traits[0];
  const avgGardenBoost =
    traits.reduce((acc, t) => acc + t.gardenBoost, 0) / Math.max(1, traits.length);

  const tags = Array.from(
    new Set([
      `1F:${firstTpl.primaryMaterial.toUpperCase()}`,
      `상층:${firstTpl.accentMaterial.toUpperCase()}`,
      firstTpl.roofBadge,
      `실내:${firstTpl.interiorTheme}`,
    ])
  );

  const styleSummary =
    traits.length > 1
      ? `${traits.length}장 참조 융합: ${primary.label} + ${secondary.label}`
      : primary.label;

  const extracted: ExtractedHouseStyle = {
    templateId: firstTpl.id,
    roofStyle: firstTpl.roofStyle,
    material: firstTpl.primaryMaterial,
    accentMaterial: firstTpl.accentMaterial,
    wallColor: firstTpl.wallColor,
    roofColor: firstTpl.roofColor,
    interiorTheme: firstTpl.interiorTheme,
    interiorWallColor: firstTpl.interiorWallColor,
    interiorFloorColor: firstTpl.interiorFloorColor,
    openPlanRatio: firstTpl.openPlanRatio,
    gardenBoostRatio: Number(avgGardenBoost.toFixed(2)),
    styleSummary,
    tags,
    templates: fiveTemplates,
  };

  const nextGardenArea = !lockedKeys.gardenAreaSqm
    ? Math.min(
        Math.round(currentSpec.siteAreaSqm * 0.55),
        Math.max(0, Math.round(currentSpec.gardenAreaSqm * extracted.gardenBoostRatio))
      )
    : currentSpec.gardenAreaSqm;

  const adaptedSpec: BuildingSpec = {
    ...currentSpec,
    usageType: category,
    templateId: firstTpl.id,
    selectedTemplateName: firstTpl.name,
    dynamicTemplates: fiveTemplates,
    roofStyle: firstTpl.roofStyle,
    accentMaterial: firstTpl.accentMaterial,
    interiorTheme: firstTpl.interiorTheme,
    interiorWallColor: firstTpl.interiorWallColor,
    interiorFloorColor: firstTpl.interiorFloorColor,
    openPlanRatio: firstTpl.openPlanRatio,
    gardenAreaSqm: nextGardenArea,
    customWallColor: firstTpl.wallColor,
    customRoofColor: firstTpl.roofColor,
    styleSummary,
    photoCount: validUrls.length,
    designConcept: `${styleSummary} · ${firstTpl.name}`,
  };

  return { adaptedSpec, extracted };
}