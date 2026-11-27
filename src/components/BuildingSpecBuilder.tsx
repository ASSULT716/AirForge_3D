import React, { useState, useMemo, useRef } from 'react';
import {
  ActiveSpecVisualization,
  BuildingSpec,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  SitePoint2D,
  SiteShape,
} from '../types/cad';
import { calculateKoreanBuildingLimits } from '../utils/buildingEstimator';
import {
  BUILDING_TEMPLATES_BY_CATEGORY,
  getDefaultSpecForCategory,
  getSiteBoundaryPoints,
} from '../utils/architectureGenerator';
import {
  analyzeMultipleHousePhotosAndAdaptSpec,
  ExtractedHouseStyle,
} from '../services/imageStyleAnalyzer';

interface Props {
  initialSpec?: BuildingSpec;
  isGenerating: boolean;
  onLivePreviewSpec: (
    spec: BuildingSpec,
    activeViz: ActiveSpecVisualization | null,
    overrideMaterial?: CadMaterial
  ) => void;
  onSubmitSpec: (spec: BuildingSpec, overrideMaterial?: CadMaterial) => void;
  onSelectFree3DMode: () => void;
  onClose?: () => void;
}

type SpecFieldKey =
  | 'siteAreaSqm'
  | 'buildingAreaSqm'
  | 'totalFloorAreaSqm'
  | 'gardenAreaSqm'
  | 'heightMeters'
  | 'floors'
  | 'undergroundFloors'
  | 'undergroundAreaSqm'
  | 'households'
  | 'unitTypeCount'
  | 'elevators'
  | 'stairs'
  | 'rooftops';

interface AccordionSpecItemProps {
  fieldKey: SpecFieldKey;
  isExpanded: boolean;
  isLocked: boolean;
  onToggleLock: () => void;
  onToggle: () => void;
  label: string;
  unit: string;
  value: number;
  baseValue: number;
  min: number;
  max: number;
  step?: number;
  lawNote: string;
  onChange: (val: number) => void;
  extraAction?: React.ReactNode;
}

function AccordionSpecItem({
  isExpanded,
  isLocked,
  onToggleLock,
  onToggle,
  label,
  unit,
  value,
  baseValue,
  min,
  max,
  step = 1,
  lawNote,
  onChange,
  extraAction,
}: AccordionSpecItemProps) {
  const safeMax = Math.max(min, max);
  const clampedValue = Math.max(min, Math.min(safeMax, value));
  const diff = Number((clampedValue - baseValue).toFixed(1));

  return (
    <div
      className={`border rounded-lg transition ${
        isLocked
          ? 'bg-amber-50/70 border-amber-300'
          : isExpanded
          ? 'bg-sky-50/70 border-sky-400 shadow-xs'
          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between text-left cursor-pointer min-w-0"
        >
          <span className="text-[11px] font-bold text-slate-800 truncate">{label}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {diff !== 0 && (
              <span
                className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded ${
                  diff > 0 ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {diff > 0 ? `+${diff}${unit}` : `${diff}${unit}`}
              </span>
            )}
            <span className="font-mono text-xs font-bold text-slate-900">
              {clampedValue.toLocaleString()} {unit}
            </span>
            <span className="text-[10px] text-slate-400">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          title={
            isLocked
              ? '잠금 해제 (다른 항목 변경 시 자동 연동 허용)'
              : '수치 잠금 (다른 항목을 수정해도 이 수치는 고정됨)'
          }
          className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer shrink-0 ${
            isLocked
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-slate-400 border-slate-200 hover:text-slate-700'
          }`}
        >
          {isLocked ? '🔒' : '🔓'}
        </button>
      </div>

      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-sky-200/70 space-y-1.5">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-[10px] font-mono text-emerald-800">
              {lawNote}
            </div>
            {extraAction}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={min}
              max={safeMax}
              step={step}
              disabled={isLocked}
              value={clampedValue}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-sky-600 cursor-pointer disabled:opacity-40"
            />
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={min}
                max={safeMax}
                step={step}
                disabled={isLocked}
                value={clampedValue}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!Number.isNaN(parsed)) {
                    onChange(Math.max(min, Math.min(safeMax, parsed)));
                  }
                }}
                className="w-18 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-900 outline-none focus:border-sky-500 disabled:bg-slate-100"
              />
              <span className="text-[11px] font-mono text-slate-500">{unit}</span>
            </div>
          </div>
          <div className="flex justify-between text-[9.5px] font-mono text-slate-400">
            <span>최소 {min.toLocaleString()}{unit}</span>
            <span>최대 {safeMax.toLocaleString()}{unit}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BuildingSpecBuilder({
  initialSpec,
  isGenerating,
  onLivePreviewSpec,
  onSubmitSpec,
  onSelectFree3DMode,
  onClose,
}: Props) {
  const defaultInit = initialSpec ?? getDefaultSpecForCategory('단독주택');

  const [specState, setSpecState] = useState<BuildingSpec>(defaultInit);
  const [lockedKeys, setLockedKeys] = useState<Partial<Record<SpecFieldKey, boolean>>>({});
  const [expandedKey, setExpandedKey] = useState<SpecFieldKey | null>(null);
  const [baselineSpec, setBaselineSpec] = useState<BuildingSpec>(defaultInit);
  const [activePrimaryMaterial, setActivePrimaryMaterial] = useState<CadMaterial>('stucco');

  // 제스처/마우스 자유 대지 경계 드로잉 상태
  const [isDrawingPadOpen, setIsDrawingPadOpen] = useState(false);
  const [draftPoints, setDraftPoints] = useState<SitePoint2D[]>([]);
  const isPointerDrawingRef = useRef(false);
  const drawBoxRef = useRef<HTMLDivElement | null>(null);

  // 여러 장 사진 무드보드 상태
  const [refPhotos, setRefPhotos] = useState<string[]>([]);
  const [extractedStyle, setExtractedStyle] = useState<ExtractedHouseStyle | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const limits = useMemo(
    () =>
      calculateKoreanBuildingLimits({
        usageType: specState.usageType,
        siteAreaSqm: specState.siteAreaSqm,
        buildingAreaSqm: specState.buildingAreaSqm,
        totalFloorAreaSqm: specState.totalFloorAreaSqm,
        undergroundAreaSqm: specState.undergroundAreaSqm,
        undergroundFloors: specState.undergroundFloors,
        heightMeters: specState.heightMeters,
        floors: specState.floors,
        households: specState.households,
      }),
    [specState]
  );

  const templatesForCurrent: BuildingTemplateOption[] = useMemo(() => {
    if (specState.usageType === '3D 디자인') return [];
    if (specState.dynamicTemplates && specState.dynamicTemplates.length > 0) {
      return specState.dynamicTemplates;
    }
    return BUILDING_TEMPLATES_BY_CATEGORY[specState.usageType];
  }, [specState.usageType, specState.dynamicTemplates]);

  const toLocalSitePoint = (clientX: number, clientY: number): SitePoint2D | null => {
    const el = drawBoxRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const nz = ((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    return {
      x: Number((nx * 4.5).toFixed(2)),
      z: Number((nz * 4.5).toFixed(2)),
    };
  };

  const appendDraftPointIfFarEnough = (pt: SitePoint2D) => {
    setDraftPoints((prev) => {
      if (prev.length === 0) return [pt];
      const last = prev[prev.length - 1];
      if (Math.hypot(pt.x - last.x, pt.z - last.z) < 0.35) return prev;
      return [...prev, pt];
    });
  };

  const commitFreeformBoundary = (pts: SitePoint2D[]) => {
    if (pts.length < 3) return;
    const next: BuildingSpec = {
      ...specState,
      siteShape: 'freeform',
      customSitePoints: pts,
    };
    setSpecState(next);
    onLivePreviewSpec(
      next,
      {
        paramKey: 'siteAreaSqm',
        label: '자유 대지 경계',
        formattedValue: `${specState.siteAreaSqm.toLocaleString()}㎡ (${pts.length}각 형상)`,
        deltaText: '경계 형상에 맞춰 집 매스·배치 갱신됨',
      },
      activePrimaryMaterial
    );
  };

  const applyPhotoCollection = async (nextUrls: string[]) => {
    setRefPhotos(nextUrls);
    if (nextUrls.length === 0) {
      setExtractedStyle(null);
      const cat =
        specState.usageType === '3D 디자인' ? '단독주택' : specState.usageType;
      const defaultTen = BUILDING_TEMPLATES_BY_CATEGORY[cat];
      const firstDef = defaultTen[0];
      const cleared: BuildingSpec = {
        ...specState,
        templateId: firstDef.id,
        selectedTemplateName: firstDef.name,
        dynamicTemplates: defaultTen,
        roofStyle: firstDef.roofStyle,
        accentMaterial: firstDef.accentMaterial,
        interiorTheme: firstDef.interiorTheme,
        interiorWallColor: firstDef.interiorWallColor,
        interiorFloorColor: firstDef.interiorFloorColor,
        openPlanRatio: firstDef.openPlanRatio,
        customWallColor: undefined,
        customRoofColor: undefined,
        styleSummary: undefined,
        photoCount: 0,
      };
      setSpecState(cleared);
      setActivePrimaryMaterial(firstDef.primaryMaterial);
      onLivePreviewSpec(cleared, null, firstDef.primaryMaterial);
      return;
    }

    setIsAnalyzingPhoto(true);
    try {
      const { adaptedSpec, extracted } = await analyzeMultipleHousePhotosAndAdaptSpec(
        nextUrls,
        specState,
        lockedKeys
      );
      setExtractedStyle(extracted);
      setSpecState(adaptedSpec);
      setBaselineSpec(adaptedSpec);
      setActivePrimaryMaterial(extracted.material);
      onLivePreviewSpec(adaptedSpec, null, extracted.material);
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  const handleMultiPhotoUpload = async (fileList: FileList) => {
    const files = Array.from(fileList).slice(0, 6);
    if (files.length === 0) return;

    setIsAnalyzingPhoto(true);
    const readPromises = files.map(
      (file) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
        })
    );

    const loaded = (await Promise.all(readPromises)).filter((u): u is string => Boolean(u));
    const merged = [...refPhotos, ...loaded].slice(0, 6);
    await applyPhotoCollection(merged);
  };

  const handlePriorityChange = (priorityKey: SpecFieldKey, rawVal: number) => {
    if (lockedKeys[priorityKey]) return;

    const next: BuildingSpec = { ...specState, [priorityKey]: rawVal };

    if (priorityKey === 'siteAreaSqm') {
      const nextLimits = calculateKoreanBuildingLimits(next);
      if (!lockedKeys.buildingAreaSqm && next.buildingAreaSqm > nextLimits.maxBuildingAreaSqm) {
        next.buildingAreaSqm = nextLimits.maxBuildingAreaSqm;
      }
      if (!lockedKeys.totalFloorAreaSqm && next.totalFloorAreaSqm > nextLimits.maxTotalFloorAreaSqm) {
        next.totalFloorAreaSqm = nextLimits.maxTotalFloorAreaSqm;
      }
      if (!lockedKeys.gardenAreaSqm && next.gardenAreaSqm < nextLimits.minGardenAreaSqm) {
        next.gardenAreaSqm = nextLimits.minGardenAreaSqm;
      }
    } else if (priorityKey === 'totalFloorAreaSqm') {
      if (!lockedKeys.buildingAreaSqm) {
        const targetBldg = Math.round(rawVal / Math.max(1, next.floors));
        if (targetBldg <= limits.maxBuildingAreaSqm && targetBldg >= 50) {
          next.buildingAreaSqm = targetBldg;
        } else if (!lockedKeys.floors) {
          next.buildingAreaSqm = Math.min(limits.maxBuildingAreaSqm, Math.max(50, targetBldg));
          next.floors = Math.max(1, Math.min(15, Math.ceil(rawVal / next.buildingAreaSqm)));
          if (!lockedKeys.heightMeters) {
            next.heightMeters = Number((next.floors * 3.4).toFixed(1));
          }
        }
      } else if (!lockedKeys.floors) {
        next.floors = Math.max(
          1,
          Math.min(15, Math.round(rawVal / Math.max(50, next.buildingAreaSqm)))
        );
        if (!lockedKeys.heightMeters) {
          next.heightMeters = Number((next.floors * 3.4).toFixed(1));
        }
      }
    } else if (priorityKey === 'buildingAreaSqm') {
      if (!lockedKeys.totalFloorAreaSqm) {
        next.totalFloorAreaSqm = Math.min(
          limits.maxTotalFloorAreaSqm,
          Math.round(rawVal * Math.max(1, next.floors))
        );
      }
    } else if (priorityKey === 'floors') {
      const floorH = specState.heightMeters / Math.max(1, specState.floors);
      if (!lockedKeys.heightMeters) {
        next.heightMeters = Number(Math.max(3.2, Math.min(150, rawVal * floorH)).toFixed(1));
      }
      if (!lockedKeys.totalFloorAreaSqm) {
        next.totalFloorAreaSqm = Math.min(
          limits.maxTotalFloorAreaSqm,
          Math.round(next.buildingAreaSqm * rawVal)
        );
      }
    } else if (priorityKey === 'heightMeters') {
      if (!lockedKeys.floors) {
        next.floors = Math.max(1, Math.min(15, Math.round(rawVal / 3.5)));
      }
    } else if (priorityKey === 'undergroundFloors') {
      if (!lockedKeys.undergroundAreaSqm) {
        next.undergroundAreaSqm =
          rawVal === 0 ? 0 : Math.round(next.buildingAreaSqm * 0.85 * rawVal);
      }
    } else if (priorityKey === 'households') {
      next.useHouseholds = rawVal > 0;
      if (!lockedKeys.unitTypeCount) {
        next.unitTypeCount = rawVal === 0 ? 0 : Math.min(next.unitTypeCount || 1, rawVal);
      }
    }

    setSpecState(next);

    const metaMap: Record<SpecFieldKey, { label: string; unit: string }> = {
      siteAreaSqm: { label: '대지면적', unit: '㎡' },
      buildingAreaSqm: { label: '건축면적', unit: '㎡' },
      totalFloorAreaSqm: { label: '지상 연면적', unit: '㎡' },
      gardenAreaSqm: { label: '정원 조경 면적', unit: '㎡' },
      heightMeters: { label: '건물 높이', unit: 'm' },
      floors: { label: '지상 층수', unit: '층' },
      undergroundFloors: { label: '지하 층수', unit: '층' },
      undergroundAreaSqm: { label: '지하 연면적', unit: '㎡' },
      households: { label: '총 가구 수', unit: '세대' },
      unitTypeCount: { label: '방 디자인 유형', unit: '종' },
      elevators: { label: '엘리베이터', unit: '대' },
      stairs: { label: '직통·피난 계단', unit: '개소' },
      rooftops: { label: '옥상(루프탑)', unit: '개소' },
    };

    const curVal = Number(next[priorityKey] ?? 0);
    const baseVal = Number(baselineSpec[priorityKey] ?? curVal);
    const diff = Number((curVal - baseVal).toFixed(1));
    const { label, unit } = metaMap[priorityKey];

    onLivePreviewSpec(
      next,
      {
        paramKey: priorityKey,
        label,
        formattedValue: `${curVal.toLocaleString()}${unit}`,
        deltaText:
          diff === 0 ? '기준값과 동일' : diff > 0 ? `+${diff}${unit} 증가` : `${diff}${unit} 감소`,
      },
      activePrimaryMaterial
    );
  };

  const handleDesignCategoryChange = async (nextCategory: DesignCategory) => {
    if (nextCategory === '3D 디자인') {
      onSelectFree3DMode();
      return;
    }
    const def = getDefaultSpecForCategory(nextCategory);
    if (refPhotos.length > 0) {
      const { adaptedSpec, extracted } = await analyzeMultipleHousePhotosAndAdaptSpec(
        refPhotos,
        def,
        lockedKeys
      );
      setExtractedStyle(extracted);
      setSpecState(adaptedSpec);
      setBaselineSpec(adaptedSpec);
      setActivePrimaryMaterial(extracted.material);
      onLivePreviewSpec(adaptedSpec, null, extracted.material);
    } else {
      setSpecState(def);
      setBaselineSpec(def);
      setActivePrimaryMaterial('stucco');
      onLivePreviewSpec(def, null, 'stucco');
    }
  };

  const handleTemplateCardSelect = (tpl: BuildingTemplateOption) => {
    const nextGarden = !lockedKeys.gardenAreaSqm
      ? Math.min(
          Math.round(specState.siteAreaSqm * 0.55),
          Math.max(0, Math.round(baselineSpec.gardenAreaSqm * tpl.gardenMultiplier))
        )
      : specState.gardenAreaSqm;

    const updatedSpec: BuildingSpec = {
      ...specState,
      projectName: `AirForge ${tpl.name}`,
      templateId: tpl.id,
      selectedTemplateName: tpl.name,
      roofStyle: tpl.roofStyle,
      accentMaterial: tpl.accentMaterial,
      interiorTheme: tpl.interiorTheme,
      interiorWallColor: tpl.interiorWallColor,
      interiorFloorColor: tpl.interiorFloorColor,
      openPlanRatio: tpl.openPlanRatio,
      gardenAreaSqm: nextGarden,
      customWallColor: tpl.wallColor,
      customRoofColor: tpl.roofColor,
      designConcept: tpl.concept,
    };

    setSpecState(updatedSpec);
    setActivePrimaryMaterial(tpl.primaryMaterial);
    onLivePreviewSpec(updatedSpec, null, tpl.primaryMaterial);
  };

  // 현재 대지 경계 미리보기 SVG 경로 계산
  const activeSiteBoundary = useMemo(
    () =>
      getSiteBoundaryPoints(
        specState.siteAreaSqm,
        specState.siteShape ?? 'rectangle',
        specState.customSitePoints
      ),
    [specState.siteAreaSqm, specState.siteShape, specState.customSitePoints]
  );

  const categories: {
    groupTitle: string;
    items: {
      key: SpecFieldKey;
      label: string;
      unit: string;
      min: number;
      max: number;
      step?: number;
      lawNote: string;
      extraAction?: React.ReactNode;
    }[];
  }[] = [
    {
      groupTitle: '1. 대지 · 면적 · 조경 제원',
      items: [
        {
          key: 'siteAreaSqm',
          label: '대지면적',
          unit: '㎡',
          min: 100,
          max: 20000,
          step: 10,
          lawNote: `대지 200㎡ 이상 시 조경 최소 ${limits.minGardenAreaSqm}㎡ 확보 필요`,
        },
        {
          key: 'buildingAreaSqm',
          label: '건축면적',
          unit: '㎡',
          min: 50,
          max: limits.maxBuildingAreaSqm,
          step: 10,
          lawNote: `건폐율 ${limits.maxBuildingCoverageRatio}% 이하 (최대 ${limits.maxBuildingAreaSqm.toLocaleString()}㎡)`,
        },
        {
          key: 'totalFloorAreaSqm',
          label: '지상 연면적',
          unit: '㎡',
          min: 50,
          max: limits.maxTotalFloorAreaSqm,
          step: 20,
          lawNote: `용적률 ${limits.maxFloorAreaRatio}% 이하 (최대 ${limits.maxTotalFloorAreaSqm.toLocaleString()}㎡)`,
        },
        {
          key: 'gardenAreaSqm',
          label: '정원 조경 면적',
          unit: '㎡',
          min: 0,
          max: Math.max(100, Math.floor(specState.siteAreaSqm * 0.9)),
          step: 5,
          lawNote: `법정 최소 ${limits.minGardenAreaSqm}㎡`,
        },
      ],
    },
    {
      groupTitle: '2. 규모 · 층수 · 지하 제원',
      items: [
        {
          key: 'floors',
          label: '지상 층수',
          unit: '층',
          min: 1,
          max: 15,
          step: 1,
          lawNote: '최소 1층부터 설정 가능 · 1층과 상층부 구조/외장재 자동 차별화',
        },
        {
          key: 'heightMeters',
          label: '건물 높이',
          unit: 'm',
          min: 3.2,
          max: 150,
          step: 0.5,
          lawNote: `높이 31m 초과 시 비상용 승강기 의무 설치 (현재 ${specState.heightMeters}m)`,
        },
        {
          key: 'undergroundFloors',
          label: '지하 층수',
          unit: '층',
          min: 0,
          max: 6,
          step: 1,
          lawNote: '지하층은 용적률에서 제외되며 0층 설정 시 지하 볼륨 제거',
        },
        {
          key: 'undergroundAreaSqm',
          label: '지하 연면적',
          unit: '㎡',
          min: 0,
          max: Math.max(200, limits.maxUndergroundAreaSqm),
          step: 10,
          lawNote: `대지면적 대비 지하 최대 굴착 한도: ${limits.maxUndergroundAreaSqm.toLocaleString()}㎡`,
        },
      ],
    },
    {
      groupTitle: '3. 세대(가구) · 코어 · 옥상 구성',
      items: [
        {
          key: 'households',
          label: '총 가구(세대) 수',
          unit: '세대',
          min: 0,
          max: Math.max(1, limits.maxHouseholds),
          step: 1,
          lawNote: '0세대로 삭제 시 내부 세대 칸막이·발코니 구획이 제거됩니다.',
          extraAction: (
            <button
              type="button"
              onClick={() => handlePriorityChange('households', specState.households > 0 ? 0 : 1)}
              className="px-2 py-1 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 shrink-0 cursor-pointer"
            >
              {specState.households > 0 ? '가구 구획 삭제' : '가구 구획 복원'}
            </button>
          ),
        },
        {
          key: 'unitTypeCount',
          label: '방 디자인 유형 수',
          unit: '종',
          min: 0,
          max: Math.max(0, limits.maxUnitTypes),
          step: 1,
          lawNote: '평면 타입별 내벽·창호 및 KDS 41 12 00 활하중 자동 배분',
        },
        {
          key: 'elevators',
          label: '엘리베이터 수',
          unit: '대',
          min: 0,
          max: 12,
          step: 1,
          lawNote: `건축법 제64조 기준 법정 권장 승강기: ${limits.minTotalElevators}대`,
        },
        {
          key: 'stairs',
          label: '직통·피난 계단 수',
          unit: '개소',
          min: 1,
          max: 10,
          step: 1,
          lawNote: `건축법 시행령 제34조 기준 법정 최소 직통계단: ${limits.minStairs}개소`,
        },
        {
          key: 'rooftops',
          label: '옥상(루프탑) 수',
          unit: '개소',
          min: 1,
          max: 8,
          step: 1,
          lawNote: '옥상 루프탑 개수 반영',
        },
      ],
    },
  ];

  const svgPolyString = activeSiteBoundary.points
    .map((pt) => `${(50 + (pt[0] / 5) * 42).toFixed(1)},${(50 + (pt[2] / 5) * 42).toFixed(1)}`)
    .join(' ');

  return (
    <div className="space-y-2.5 text-slate-800">
      {/* 여러 장 집 느낌 사진 업로드 -> 10종 맞춤형 디자인 템플릿 자동 재구성 */}
      <div className="p-2 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10.5px] font-extrabold text-sky-900 block">
              원하는 집 느낌 사진 여러 장 넣기 (외관 · 지붕 · 인테리어)
            </span>
            <span className="text-[9.5px] text-slate-600 block truncate">
              사진 특징에 따라 10가지 디자인 템플릿의 구조·지붕·실내가 모두 바뀝니다
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleMultiPhotoUpload(e.target.files);
              e.target.value = '';
            }}
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={isAnalyzingPhoto}
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10.5px] cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isAnalyzingPhoto
                ? '분석 중...'
                : refPhotos.length > 0
                ? `+ 사진 추가 (${refPhotos.length}/6)`
                : '사진 여러 장 선택'}
            </button>
            {refPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => applyPhotoCollection([])}
                className="px-2 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 font-bold text-[10px] cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {refPhotos.length > 0 && (
          <div className="bg-white/90 border border-sky-200 rounded-lg p-1.5 space-y-1.5">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {refPhotos.map((url, idx) => (
                <div key={idx} className="relative shrink-0 group">
                  <img
                    src={url}
                    alt={`참조 사진 ${idx + 1}`}
                    className="w-12 h-12 rounded-md object-cover border border-slate-300"
                  />
                  <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-slate-900/80 text-white font-mono text-[8.5px]">
                    {idx === 0 ? '외벽' : idx === 1 ? '지붕' : idx === 2 ? '실내' : `#${idx + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPhotoCollection(refPhotos.filter((_, i) => i !== idx))}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center cursor-pointer shadow"
                    title="이 사진 제거"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {extractedStyle && (
              <div>
                <div className="text-[10px] font-bold text-slate-900 truncate">
                  {extractedStyle.styleSummary}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {extractedStyle.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-mono text-[9.5px] font-bold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 프로젝트명 & 디자인 유형 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">프로젝트명</label>
          <input
            value={specState.projectName}
            onChange={(e) => setSpecState((p) => ({ ...p, projectName: e.target.value }))}
            className="w-full bg-slate-50 border border-slate-300 focus:border-sky-500 rounded px-2 py-1 text-xs text-slate-900 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">디자인 유형</label>
          <select
            value={specState.usageType}
            onChange={(e) => handleDesignCategoryChange(e.target.value as DesignCategory)}
            className="w-full bg-sky-50 border border-sky-300 focus:border-sky-500 rounded px-2 py-1 text-xs font-bold text-sky-900 outline-none"
          >
            <option value="단독주택">단독주택</option>
            <option value="공동주택">공동주택</option>
            <option value="업무·상업시설">업무·상업시설</option>
            <option value="복합문화시설">복합문화시설</option>
            <option value="3D 디자인">3D 디자인 (자유 조형모드)</option>
          </select>
        </div>
      </div>

      {/* 디자인 템플릿 (단독주택 10종 / 기타 용도 5종) */}
      {templatesForCurrent.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-extrabold text-slate-800">
              {specState.usageType} 디자인 템플릿 ({templatesForCurrent.length}종 구조·지붕·실내 변형)
            </span>
            {refPhotos.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[9.5px] font-bold">
                사진 {refPhotos.length}장 맞춤 생성됨
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-[210px] overflow-y-auto pr-1">
            {templatesForCurrent.map((tpl, idx) => {
              const isSelected =
                (specState.selectedTemplateName && specState.selectedTemplateName === tpl.name) ||
                (!specState.selectedTemplateName && specState.templateId === tpl.id && idx === 0);

              return (
                <button
                  key={`${tpl.id}_${tpl.name}_${idx}`}
                  type="button"
                  onClick={() => handleTemplateCardSelect(tpl)}
                  className={`${
                    idx === 0 ? 'col-span-2' : 'col-span-1'
                  } p-2 rounded-lg border text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-sky-400 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10.5px] font-extrabold truncate">
                      {idx + 1}안. {tpl.name}
                    </span>
                    <span
                      className={`shrink-0 px-1.5 py-0.2 rounded font-mono text-[8.5px] font-bold ${
                        isSelected
                          ? 'bg-sky-800/80 text-sky-100'
                          : 'bg-slate-200/80 text-slate-700'
                      }`}
                    >
                      {tpl.roofBadge}
                    </span>
                  </div>
                  <div
                    className={`text-[9.5px] line-clamp-2 mt-0.5 leading-snug ${
                      isSelected ? 'text-sky-100' : 'text-slate-600'
                    }`}
                  >
                    {tpl.subtitle}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span
                      className={`px-1 py-0.2 rounded font-mono text-[8.5px] ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-sky-50 text-sky-700'
                      }`}
                    >
                      {tpl.structureBadge}
                    </span>
                    <span
                      className={`px-1 py-0.2 rounded font-mono text-[8.5px] ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      1F {tpl.primaryMaterial.toUpperCase()} · 상층 {tpl.accentMaterial.toUpperCase()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 제스처 · 마우스 드래그 자유 대지 경계 생성기 (동일 면적 내 자유 변형 + 집 형태 연동) */}
      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10.5px] font-extrabold text-slate-800 block">
              대지 경계 자유 드로잉 (마우스 · 제스처 드래그 → {specState.siteAreaSqm.toLocaleString()}㎡ 연동)
            </span>
            <span className="text-[9.5px] text-slate-500 block">
              현재 형태: {specState.siteShape === 'freeform' ? `자유 곡선/다각형 (${specState.customSitePoints?.length ?? 0}점)` : specState.siteShape ?? 'rectangle'} · 경계에 맞춰 집 매스·방향 자동 변환
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsDrawingPadOpen((prev) => {
                const nextOpen = !prev;
                if (nextOpen && (!specState.customSitePoints || specState.customSitePoints.length < 3)) {
                  setDraftPoints([]);
                } else if (nextOpen && specState.customSitePoints) {
                  setDraftPoints(specState.customSitePoints);
                }
                return nextOpen;
              });
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold cursor-pointer shrink-0 transition ${
              isDrawingPadOpen
                ? 'bg-sky-600 text-white'
                : 'bg-white text-sky-700 border border-sky-300 hover:bg-sky-50'
            }`}
          >
            {isDrawingPadOpen ? '드로잉 패드 닫기' : '자유 경계 그리기'}
          </button>
        </div>

        {/* 현재 대지 경계 미니맵 */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg p-1.5">
          <svg viewBox="0 0 100 100" className="w-12 h-12 shrink-0 bg-slate-50 rounded border border-slate-200">
            <polygon
              points={svgPolyString}
              fill="rgba(2, 132, 199, 0.14)"
              stroke="#0284c7"
              strokeWidth="2.5"
            />
          </svg>
          <div className="flex-1 min-w-0 text-[9.5px] text-slate-600 space-y-0.5">
            <div className="font-bold text-slate-800">
              실면적 {specState.siteAreaSqm.toLocaleString()}㎡ 고정 반영
            </div>
            <div>
              드래그 또는 제스처 핀치로 그린 궤적의 면적을 {specState.siteAreaSqm.toLocaleString()}㎡로 환산하고 집 구조·각도를 맞춥니다.
            </div>
          </div>
        </div>

        {/* 제스처 & 마우스 드래그 패드 */}
        {isDrawingPadOpen && (
          <div className="bg-white border border-sky-300 rounded-xl p-2 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-sky-900">
                패드 위에서 마우스를 누르고 드래그하거나, 제스처 핀치로 경계를 그려보세요
              </span>
              <span className="font-mono text-slate-500">{draftPoints.length}개 좌표</span>
            </div>

            <div
              ref={drawBoxRef}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                isPointerDrawingRef.current = true;
                const pt = toLocalSitePoint(e.clientX, e.clientY);
                if (pt) setDraftPoints([pt]);
              }}
              onPointerMove={(e) => {
                if (!isPointerDrawingRef.current) return;
                const pt = toLocalSitePoint(e.clientX, e.clientY);
                if (pt) appendDraftPointIfFarEnough(pt);
              }}
              onPointerUp={(e) => {
                if (!isPointerDrawingRef.current) return;
                isPointerDrawingRef.current = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
                if (draftPoints.length >= 3) {
                  commitFreeformBoundary(draftPoints);
                }
              }}
              onClick={(e) => {
                if (isPointerDrawingRef.current) return;
                const pt = toLocalSitePoint(e.clientX, e.clientY);
                if (!pt) return;
                const nextPts = [...draftPoints, pt];
                setDraftPoints(nextPts);
                if (nextPts.length >= 3) {
                  commitFreeformBoundary(nextPts);
                }
              }}
              className="relative w-full h-36 bg-slate-900 rounded-lg overflow-hidden touch-none select-none cursor-crosshair border border-slate-700"
            >
              <svg viewBox="0 0 100 100" className="w-full h-full pointer-events-none">
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(148,163,184,0.22)" strokeDasharray="2 2" />
                <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(148,163,184,0.22)" strokeDasharray="2 2" />
                {draftPoints.length >= 2 && (
                  <polyline
                    fill={draftPoints.length >= 3 ? 'rgba(56, 189, 248, 0.22)' : 'none'}
                    stroke="#38bdf8"
                    strokeWidth="2.2"
                    points={draftPoints
                      .map((p) => `${(50 + (p.x / 4.5) * 44).toFixed(1)},${(50 + (p.z / 4.5) * 44).toFixed(1)}`)
                      .join(' ')}
                  />
                )}
                {draftPoints.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={50 + (p.x / 4.5) * 44}
                    cy={50 + (p.z / 4.5) * 44}
                    r={idx === 0 ? 3.5 : 2.3}
                    fill={idx === 0 ? '#f59e0b' : '#38bdf8'}
                  />
                ))}
              </svg>
              <div className="absolute bottom-1.5 left-2 text-[9px] font-mono text-sky-200/90 pointer-events-none">
                {draftPoints.length < 3
                  ? `점을 ${3 - draftPoints.length}개 더 찍거나 드래그하세요`
                  : `실시간 3D 반영 중 (${draftPoints.length}점 · ${specState.siteAreaSqm}㎡ 환산)`}
              </div>
            </div>

            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDraftPoints([]);
                  const resetSpec: BuildingSpec = {
                    ...specState,
                    siteShape: 'rectangle',
                    customSitePoints: undefined,
                  };
                  setSpecState(resetSpec);
                  onLivePreviewSpec(resetSpec, null, activePrimaryMaterial);
                }}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold cursor-pointer"
              >
                지우기
              </button>
              <button
                type="button"
                disabled={draftPoints.length < 3}
                onClick={() => {
                  commitFreeformBoundary(draftPoints);
                  setIsDrawingPadOpen(false);
                }}
                className="px-3 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[10px] font-bold cursor-pointer"
              >
                이 대지 경계로 집 생성
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 카테고리별 구분선이 적용된 아코디언 제원 리스트 */}
      <div className="max-h-[22vh] overflow-y-auto pr-1 space-y-3">
        {categories.map((cat) => (
          <div key={cat.groupTitle} className="space-y-1">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-extrabold text-sky-700 tracking-tight shrink-0">
                {cat.groupTitle}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {cat.items.map((item) => (
              <AccordionSpecItem
                key={item.key}
                fieldKey={item.key}
                isExpanded={expandedKey === item.key}
                isLocked={Boolean(lockedKeys[item.key])}
                onToggleLock={() =>
                  setLockedKeys((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                }
                onToggle={() => {
                  const nextKey = expandedKey === item.key ? null : item.key;
                  setExpandedKey(nextKey);
                  if (!nextKey) onLivePreviewSpec(specState, null, activePrimaryMaterial);
                }}
                label={item.label}
                unit={item.unit}
                value={Number(specState[item.key] ?? 0)}
                baseValue={Number(baselineSpec[item.key] ?? specState[item.key] ?? 0)}
                min={item.min}
                max={item.max}
                step={item.step}
                lawNote={item.lawNote}
                extraAction={item.extraAction}
                onChange={(val) => handlePriorityChange(item.key, val)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-1.5 pt-1">
        <button
          onClick={() => {
            setBaselineSpec(specState);
            onLivePreviewSpec(specState, null, activePrimaryMaterial);
            onSubmitSpec(specState, activePrimaryMaterial);
          }}
          disabled={isGenerating}
          className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 shadow-sm transition"
        >
          {isGenerating ? '건축 매스·설비 동기화 중...' : '현재 제원으로 확정 및 AI 동기화'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg cursor-pointer"
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}