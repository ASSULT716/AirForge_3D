import { useState, useMemo, useRef, useEffect } from 'react';
import {
  ActiveSpecVisualization,
  BuildingSpec,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  ElementMaterialSpec,
  GlazingSpec,
  SiteShape,
  StructuralSystemId,
} from '../types/cad';
import { calculateKoreanBuildingLimits } from '../utils/buildingEstimator';
import {
  BUILDING_TEMPLATES_BY_CATEGORY,
  createDefaultSitePolygon,
  getDefaultSpecForCategory,
  rescalePolygonToArea,
} from '../utils/architectureGenerator';
import {
  resolveSafeStructuralSystem,
  STRUCTURAL_SYSTEM_DB,
} from '../utils/structuralPhysics';
import {
  analyzeMultipleHousePhotosAndAdaptSpec,
  ExtractedHouseStyle,
} from '../services/imageStyleAnalyzer';

interface Props {
  initialSpec?: BuildingSpec;
  isGenerating: boolean;
  isSiteEditMode: boolean;
  onToggleSiteEditMode: (next: boolean) => void;
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

const STRUCTURAL_BUTTONS: { id: StructuralSystemId; shortLabel: string }[] = [
  { id: 'rc_frame', shortLabel: 'RC 라멘조' },
  { id: 'steel_frame', shortLabel: 'H-Beam 철골' },
  { id: 'heavy_timber', shortLabel: '중목 집성재' },
  { id: 'hybrid_rc_steel', shortLabel: 'RC+철골 복합' },
];

const CLADDING_SELECT_OPTIONS: { id: CadMaterial; label: string }[] = [
  { id: 'stucco', label: '스타코(외단열)' },
  { id: 'wood', label: '적삼목·우드' },
  { id: 'concrete', label: '노출콘크리트' },
  { id: 'steel', label: '리얼징크·스틸' },
  { id: 'titanium', label: '티타늄 아연판' },
  { id: 'gold', label: '샴페인 골드' },
  { id: 'carbon', label: '세라믹·카본' },
];

const GLAZING_SELECT_OPTIONS: { id: GlazingSpec; label: string }[] = [
  { id: 'double_lowe', label: '이중 로이창' },
  { id: 'triple_lowe', label: '삼중 로이창' },
  { id: 'curtain_wall', label: '로이 커튼월' },
];

function formatKrwReadable(krw: number): string {
  const man = Math.round(krw / 10000);
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const remMan = man % 10000;
    return remMan > 0 ? `${eok}억 ${remMan.toLocaleString()}만 원` : `${eok}억 원`;
  }
  return `${Math.max(1, man).toLocaleString()}만 원`;
}

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
  isSiteEditMode,
  onToggleSiteEditMode,
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
  const [activePrimaryMaterial, setActivePrimaryMaterial] = useState<CadMaterial>(
    defaultInit.elementMaterials?.exteriorCladding ?? 'stucco'
  );
  const [isMaterialBoxOpen, setIsMaterialBoxOpen] = useState(false);

  const [refPhotos, setRefPhotos] = useState<string[]>([]);
  const [extractedStyle, setExtractedStyle] = useState<ExtractedHouseStyle | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 외부(대지 드래그, 부위 재질 변경, 하중 슬라이더)에서 바뀐 최신 물리·예산·대지 상태를 즉시 동기화
  useEffect(() => {
    if (!initialSpec) return;
    setSpecState((prev) => ({
      ...prev,
      siteShape: initialSpec.siteShape,
      sitePolygon: initialSpec.sitePolygon,
      siteAreaSqm: initialSpec.siteAreaSqm,
      buildingAreaSqm: initialSpec.buildingAreaSqm,
      structuralSystem: initialSpec.structuralSystem ?? prev.structuralSystem,
      elementMaterials: initialSpec.elementMaterials ?? prev.elementMaterials,
      structuralReport: initialSpec.structuralReport,
      budgetReport: initialSpec.budgetReport,
      floorLoadsKn: initialSpec.floorLoadsKn ?? prev.floorLoadsKn,
    }));
  }, [
    initialSpec?.sitePolygon,
    initialSpec?.siteAreaSqm,
    initialSpec?.buildingAreaSqm,
    initialSpec?.siteShape,
    initialSpec?.structuralReport,
    initialSpec?.budgetReport,
    initialSpec?.elementMaterials,
    initialSpec?.floorLoadsKn,
  ]);

  const curMaterials: ElementMaterialSpec = useMemo(() => {
    const sys =
      specState.elementMaterials?.structuralSystem ??
      specState.structuralSystem ??
      resolveSafeStructuralSystem({
        usageType: specState.usageType,
        floors: specState.floors,
        windowWallRatio: specState.windowWallRatio,
        primaryMaterial: activePrimaryMaterial,
      });
    return {
      structuralSystem: sys,
      foundationMaterial:
        specState.elementMaterials?.foundationMaterial ??
        (specState.floors >= 3 ? 'rc_mat' : 'rc_footing'),
      exteriorCladding:
        specState.elementMaterials?.exteriorCladding ?? activePrimaryMaterial,
      upperCladding:
        specState.elementMaterials?.upperCladding ?? specState.accentMaterial ?? 'wood',
      roofMaterial:
        specState.elementMaterials?.roofMaterial ?? specState.roofMaterial ?? 'steel',
      glazingSpec: specState.elementMaterials?.glazingSpec ?? 'double_lowe',
      insulationSpec: specState.elementMaterials?.insulationSpec ?? 'eps_150',
    };
  }, [specState, activePrimaryMaterial]);

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

  const applyPhotoCollection = async (nextUrls: string[]) => {
    setRefPhotos(nextUrls);
    if (nextUrls.length === 0) {
      setExtractedStyle(null);
      const cat = specState.usageType === '3D 디자인' ? '단독주택' : specState.usageType;
      const defaultTemplates = BUILDING_TEMPLATES_BY_CATEGORY[cat];
      const firstDef = defaultTemplates[0];
      const freshSys =
        firstDef.structuralSystem ??
        resolveSafeStructuralSystem({
          usageType: cat,
          floors: specState.floors,
          windowWallRatio: firstDef.windowWallRatio,
          primaryMaterial: firstDef.primaryMaterial,
        });
      const freshMats: ElementMaterialSpec = {
        ...curMaterials,
        structuralSystem: freshSys,
        exteriorCladding:
          firstDef.primaryMaterial === 'glass' ? 'concrete' : firstDef.primaryMaterial,
        upperCladding:
          firstDef.accentMaterial === 'glass' ? 'steel' : firstDef.accentMaterial,
        roofMaterial: firstDef.roofMaterial ?? 'steel',
        glazingSpec: firstDef.glazingSpec ?? 'double_lowe',
      };
      const cleared: BuildingSpec = {
        ...specState,
        templateId: firstDef.id,
        selectedTemplateName: firstDef.name,
        dynamicTemplates: defaultTemplates,
        architecturalDna: undefined,
        structuralSystem: freshSys,
        elementMaterials: freshMats,
        roofStyle: firstDef.roofStyle,
        roofPitchDeg: firstDef.roofPitchDeg ?? 0,
        overhangScale: firstDef.overhangScale ?? 0.22,
        windowWallRatio: firstDef.windowWallRatio ?? 0.56,
        accentMaterial: freshMats.upperCladding,
        roofMaterial: freshMats.roofMaterial,
        interiorTheme: firstDef.interiorTheme,
        interiorWallColor: firstDef.interiorWallColor,
        interiorFloorColor: firstDef.interiorFloorColor,
        openPlanRatio: firstDef.openPlanRatio,
        customWallColor: undefined,
        customUpperWallColor: undefined,
        customRoofColor: undefined,
        styleSummary: undefined,
        analysisSource: undefined,
        photoCount: 0,
      };
      setSpecState(cleared);
      setActivePrimaryMaterial(freshMats.exteriorCladding);
      onLivePreviewSpec(cleared, null, freshMats.exteriorCladding);
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

  const handleUpdateElementMaterials = (
    patch: Partial<ElementMaterialSpec>,
    nextWwr?: number
  ) => {
    const merged: ElementMaterialSpec = { ...curMaterials, ...patch };
    const effectiveWwr = nextWwr ?? specState.windowWallRatio ?? 0.56;
    const safeSys = resolveSafeStructuralSystem({
      usageType: specState.usageType,
      floors: specState.floors,
      windowWallRatio:
        merged.glazingSpec === 'curtain_wall'
          ? Math.max(0.7, effectiveWwr)
          : effectiveWwr,
      primaryMaterial: merged.exteriorCladding,
      requestedSystem: merged.structuralSystem,
    });
    merged.structuralSystem = safeSys;

    const next: BuildingSpec = {
      ...specState,
      structuralSystem: safeSys,
      elementMaterials: merged,
      accentMaterial: merged.upperCladding,
      roofMaterial: merged.roofMaterial,
      windowWallRatio: effectiveWwr,
      customWallColor: undefined,
      customUpperWallColor: undefined,
    };
    setSpecState(next);
    setActivePrimaryMaterial(merged.exteriorCladding);
    onLivePreviewSpec(next, null, merged.exteriorCladding);
  };

  const handlePriorityChange = (priorityKey: SpecFieldKey, rawVal: number) => {
    if (lockedKeys[priorityKey]) return;

    const next: BuildingSpec = { ...specState, [priorityKey]: rawVal };

    if (priorityKey === 'siteAreaSqm') {
      if (next.sitePolygon && next.sitePolygon.length >= 3) {
        next.sitePolygon = rescalePolygonToArea(next.sitePolygon, rawVal);
      } else {
        next.sitePolygon = createDefaultSitePolygon(rawVal, next.siteShape ?? 'rectangle');
      }
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
      curMaterials.exteriorCladding
    );
  };

  const handleDesignCategoryChange = async (nextCategory: DesignCategory) => {
    if (nextCategory === '3D 디자인') {
      onToggleSiteEditMode(false);
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
      const mat = def.elementMaterials?.exteriorCladding ?? 'stucco';
      setActivePrimaryMaterial(mat);
      onLivePreviewSpec(def, null, mat);
    }
  };

  const handleTemplateCardSelect = (tpl: BuildingTemplateOption) => {
    const nextGarden = !lockedKeys.gardenAreaSqm
      ? Math.min(
          Math.round(specState.siteAreaSqm * 0.55),
          Math.max(0, Math.round(baselineSpec.gardenAreaSqm * tpl.gardenMultiplier))
        )
      : specState.gardenAreaSqm;

    const nextSys =
      tpl.structuralSystem ??
      resolveSafeStructuralSystem({
        usageType: specState.usageType,
        floors: specState.floors,
        windowWallRatio: tpl.windowWallRatio,
        primaryMaterial: tpl.primaryMaterial,
      });

    const nextElemMats: ElementMaterialSpec = {
      ...curMaterials,
      structuralSystem: nextSys,
      exteriorCladding: tpl.primaryMaterial === 'glass' ? 'concrete' : tpl.primaryMaterial,
      upperCladding: tpl.accentMaterial === 'glass' ? 'steel' : tpl.accentMaterial,
      roofMaterial: tpl.roofMaterial ?? 'steel',
      glazingSpec:
        tpl.glazingSpec ??
        ((tpl.windowWallRatio ?? 0.56) >= 0.65 ? 'curtain_wall' : 'double_lowe'),
    };

    const updatedSpec: BuildingSpec = {
      ...specState,
      projectName: `AirForge ${tpl.name.replace(/^\[사진 직결\]\s*/, '')}`,
      templateId: tpl.id,
      selectedTemplateName: tpl.name,
      structuralSystem: nextSys,
      elementMaterials: nextElemMats,
      roofStyle: tpl.roofStyle,
      roofPitchDeg: tpl.roofPitchDeg ?? (tpl.roofStyle === 'flat-overhang' ? 0 : 20),
      overhangScale: tpl.overhangScale ?? 0.22,
      windowWallRatio: tpl.windowWallRatio ?? 0.56,
      accentMaterial: nextElemMats.upperCladding,
      roofMaterial: nextElemMats.roofMaterial,
      interiorTheme: tpl.interiorTheme,
      interiorWallColor: tpl.interiorWallColor,
      interiorFloorColor: tpl.interiorFloorColor,
      openPlanRatio: tpl.openPlanRatio,
      gardenAreaSqm: nextGarden,
      customWallColor: tpl.wallColor,
      customUpperWallColor: tpl.upperWallColor,
      customRoofColor: tpl.roofColor,
      designConcept: tpl.concept,
    };

    setSpecState(updatedSpec);
    setActivePrimaryMaterial(nextElemMats.exteriorCladding);
    onLivePreviewSpec(updatedSpec, null, nextElemMats.exteriorCladding);
  };

  const handleResetSiteShape = (shapeId: Exclude<SiteShape, 'custom'>) => {
    const freshPolygon = createDefaultSitePolygon(specState.siteAreaSqm, shapeId);
    const next: BuildingSpec = {
      ...specState,
      siteShape: shapeId,
      sitePolygon: freshPolygon,
    };
    setSpecState(next);
    onLivePreviewSpec(next, null, curMaterials.exteriorCladding);
  };

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
          lawNote: `대지 200㎡ 이상 시 조경 최소 ${limits.minGardenAreaSqm}㎡ · 자유형 경계 드래그 연동`,
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
          lawNote: `법정 최소 ${limits.minGardenAreaSqm}㎡ · 대지 경계 내부 남는 땅에만 안전 배치`,
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
          lawNote: '지하층은 용적률에서 제외되며 0층 설정 시 토목비 절감',
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

  const physics = specState.structuralReport;
  const budget = specState.budgetReport;

  return (
    <div className="space-y-2.5 text-slate-800">
      {/* 실시간 KDS 구조 안전 & 물량산출(QTO) 예상 공사비 요약 바 */}
      {(physics || budget) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-900 text-white">
          <div className="flex items-center gap-1.5 min-w-0">
            {physics && (
              <span
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold shrink-0 ${
                  physics.overallSafety === 'unsafe'
                    ? 'bg-red-600 text-white'
                    : physics.overallSafety === 'caution'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-emerald-500 text-slate-950'
                }`}
              >
                {physics.overallSafety === 'unsafe'
                  ? `위험 DCR ${Math.round(physics.maxDcr * 100)}%`
                  : physics.overallSafety === 'caution'
                  ? `주의 DCR ${Math.round(physics.maxDcr * 100)}%`
                  : `안전 DCR ${Math.round(physics.maxDcr * 100)}%`}
              </span>
            )}
            <span className="text-[10.5px] font-bold text-slate-200 truncate">
              {STRUCTURAL_SYSTEM_DB[curMaterials.structuralSystem].nameKo}
            </span>
          </div>
          {budget && (
            <div className="text-right shrink-0">
              <span className="font-mono text-xs font-extrabold text-amber-300">
                {formatKrwReadable(budget.grandTotalKrw)}
              </span>
              <span className="ml-1.5 font-mono text-[10px] text-slate-300">
                (평당 {Math.round(budget.costPerPyeongKrw / 10000).toLocaleString()}만)
              </span>
            </div>
          )}
        </div>
      )}

      {/* 여러 장 사진 업로드 -> Vision AI 구조·자재 DNA 추출 & 10종 템플릿 생성 */}
      <div className="p-2 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10.5px] font-extrabold text-sky-900 block">
              원하는 집 사진 넣기 (Vision AI 골조·자재·지붕 분석)
            </span>
            <span className="text-[9.5px] text-slate-600 block truncate">
              색상뿐 아니라 실제 골조(RC/철골/중목)·외장재·창호·지붕을 추출합니다
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
                : '사진 선택'}
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
                <div key={idx} className="relative shrink-0">
                  <img
                    src={url}
                    alt={`참조 사진 ${idx + 1}`}
                    className="w-11 h-11 rounded-md object-cover border border-slate-300"
                  />
                  <span className="absolute bottom-0.5 left-0.5 px-1 rounded bg-slate-900/80 text-white font-mono text-[8px]">
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
              <div className="space-y-1">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                    extractedStyle.analysisSource === 'vision-ai'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}
                >
                  {extractedStyle.analysisSource === 'vision-ai'
                    ? `✓ Vision AI 분석 · ${extractedStyle.modelUsed}`
                    : `⚠ ${extractedStyle.modelUsed}`}
                </span>
                <div className="text-[10px] font-bold text-slate-900 leading-snug">
                  {extractedStyle.styleSummary}
                </div>
                {extractedStyle.materialBreakdown.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded p-1.5 text-[9.5px] text-slate-700 space-y-0.5">
                    {extractedStyle.materialBreakdown.map((item, idx) => (
                      <div key={idx}>• {item}</div>
                    ))}
                  </div>
                )}
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
            <option value="단독주택">단독주택 (10종 템플릿)</option>
            <option value="공동주택">공동주택</option>
            <option value="업무·상업시설">업무·상업시설</option>
            <option value="복합문화시설">복합문화시설</option>
            <option value="3D 디자인">3D 디자인 (자유 조형모드)</option>
          </select>
        </div>
      </div>

      {/* 주구조 골조 & 핵심 자재 바로 선택 (접이식 세부 자재 포함) */}
      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-extrabold text-slate-800">
            주구조 골조 & 외장·창호 자재 (실시간 예산 연동)
          </span>
          <button
            type="button"
            onClick={() => setIsMaterialBoxOpen((v) => !v)}
            className="text-[10px] font-bold text-sky-700 hover:underline cursor-pointer"
          >
            {isMaterialBoxOpen ? '자재 접기 ▲' : '외벽·창호·지붕 변경 ▼'}
          </button>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {STRUCTURAL_BUTTONS.map((btn) => {
            const active = curMaterials.structuralSystem === btn.id;
            const disabledTimber = btn.id === 'heavy_timber' && specState.floors >= 4;
            return (
              <button
                key={btn.id}
                type="button"
                disabled={disabledTimber}
                onClick={() => handleUpdateElementMaterials({ structuralSystem: btn.id })}
                className={`py-1 px-1 rounded text-[10px] font-bold border cursor-pointer transition disabled:opacity-40 ${
                  active
                    ? 'bg-sky-700 text-white border-sky-800 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'
                }`}
              >
                {btn.shortLabel}
              </button>
            );
          })}
        </div>

        {isMaterialBoxOpen && (
          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200 text-[10.5px]">
            <div>
              <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">1층 외벽</label>
              <select
                value={curMaterials.exteriorCladding}
                onChange={(e) =>
                  handleUpdateElementMaterials({ exteriorCladding: e.target.value as CadMaterial })
                }
                className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 font-bold"
              >
                {CLADDING_SELECT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">상층 외벽</label>
              <select
                value={curMaterials.upperCladding}
                onChange={(e) =>
                  handleUpdateElementMaterials({ upperCladding: e.target.value as CadMaterial })
                }
                className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 font-bold"
              >
                {CLADDING_SELECT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">지붕 마감</label>
              <select
                value={curMaterials.roofMaterial}
                onChange={(e) =>
                  handleUpdateElementMaterials({ roofMaterial: e.target.value as CadMaterial })
                }
                className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 font-bold"
              >
                {CLADDING_SELECT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9.5px] font-bold text-slate-500 block mb-0.5">
                창호 등급 ({Math.round((specState.windowWallRatio ?? 0.56) * 100)}%)
              </label>
              <select
                value={curMaterials.glazingSpec}
                onChange={(e) => {
                  const g = e.target.value as GlazingSpec;
                  handleUpdateElementMaterials(
                    { glazingSpec: g },
                    g === 'curtain_wall'
                      ? Math.max(0.72, specState.windowWallRatio ?? 0.72)
                      : Math.min(0.6, specState.windowWallRatio ?? 0.52)
                  );
                }}
                className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 font-bold"
              >
                {GLAZING_SELECT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 자유형 대지 경계 편집 (마우스/제스처 드래그) + 기본형 빠른 초기화 */}
      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[10.5px] font-extrabold text-slate-800 block">
              자유형 대지 경계 편집 ({specState.sitePolygon?.length ?? 4}각형 ·{' '}
              {specState.siteAreaSqm.toLocaleString()}㎡)
            </span>
            <span className="text-[9.5px] text-slate-500 block">
              파란 핀을 드래그하면 건물이 깨지지 않고 경계 내부에 자동 재구성됩니다
            </span>
          </div>
          <button
            type="button"
            onClick={() => onToggleSiteEditMode(!isSiteEditMode)}
            className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold border cursor-pointer shrink-0 transition ${
              isSiteEditMode
                ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                : 'bg-white text-sky-800 border-sky-300 hover:bg-sky-50'
            }`}
          >
            {isSiteEditMode ? '경계 드래그 편집 ON' : '경계 드래그 편집'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(specState.lockSiteAreaOnDrag)}
              onChange={(e) => {
                const next = { ...specState, lockSiteAreaOnDrag: e.target.checked };
                setSpecState(next);
                onLivePreviewSpec(next, null, curMaterials.exteriorCladding);
              }}
              className="accent-sky-600 cursor-pointer"
            />
            드래그 시 기존 대지면적 고정 유지
          </label>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'rectangle', label: '▭' },
                { id: 'triangle', label: '△' },
                { id: 'circle', label: '○' },
                { id: 'trapezoid', label: '⏢' },
              ] as { id: Exclude<SiteShape, 'custom'>; label: string }[]
            ).map((shapeItem) => (
              <button
                key={shapeItem.id}
                type="button"
                title={`${shapeItem.id} 기본형으로 초기화`}
                onClick={() => handleResetSiteShape(shapeItem.id)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border cursor-pointer transition ${
                  specState.siteShape === shapeItem.id
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                }`}
              >
                {shapeItem.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 10종 디자인 템플릿 선택 그리드 */}
      {templatesForCurrent.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-extrabold text-slate-800">
              {specState.usageType} 디자인 템플릿 ({templatesForCurrent.length}종 구조·지붕·실내)
            </span>
            {refPhotos.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-[9.5px] font-bold">
                사진 {refPhotos.length}장 맞춤 {templatesForCurrent.length}종
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-[185px] overflow-y-auto pr-1">
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
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 카테고리별 구분선이 적용된 아코디언 제원 리스트 */}
      <div className="max-h-[21vh] overflow-y-auto pr-1 space-y-3">
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
                  if (!nextKey) onLivePreviewSpec(specState, null, curMaterials.exteriorCladding);
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
            onLivePreviewSpec(specState, null, curMaterials.exteriorCladding);
            onSubmitSpec(specState, curMaterials.exteriorCladding);
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