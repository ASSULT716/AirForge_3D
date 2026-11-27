import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActiveSpecVisualization,
  BuildingSpec,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  ElementMaterialSpec,
  GlazingSpec,
  InsulationSpec,
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

type WizardStep = 1 | 2 | 3 | 4;

type SpecFieldKey =
  | 'siteAreaSqm'
  | 'buildingAreaSqm'
  | 'totalFloorAreaSqm'
  | 'floors'
  | 'heightMeters'
  | 'gardenAreaSqm'
  | 'undergroundFloors';

interface Props {
  spec: BuildingSpec;
  isGenerating: boolean;
  isSeniorMode: boolean;
  isSiteEditMode: boolean;
  isHeatmapActive: boolean;
  onToggleSeniorMode: (next: boolean) => void;
  onToggleSiteEditMode: (next: boolean) => void;
  onToggleHeatmap: (next: boolean) => void;
  onLivePreviewSpec: (
    nextSpec: BuildingSpec,
    activeViz: ActiveSpecVisualization | null,
    overrideMaterial?: CadMaterial
  ) => void;
  onSubmitSpec: (nextSpec: BuildingSpec, overrideMaterial?: CadMaterial) => void;
  onOpenQuotation: () => void;
  onSelectFree3DMode: () => void;
}

const EXTERIOR_MATERIAL_OPTIONS: {
  id: CadMaterial;
  label: string;
  note: string;
  swatch: string;
}[] = [
  { id: 'stucco', label: '스타코 (외단열)', note: '합리적·단열 우수', swatch: '#f5f2eb' },
  { id: 'wood', label: '적삼목·탄화목', note: '따뜻한 자연 질감', swatch: '#c89b6e' },
  { id: 'concrete', label: '노출 콘크리트', note: '모던·중후한 질감', swatch: '#cbd5e1' },
  { id: 'steel', label: '리얼징크·스틸', note: '세련된 금속 패널', swatch: '#64748b' },
  { id: 'titanium', label: '티타늄 아연판', note: '고급 내후성 마감', swatch: '#94a3b8' },
];

const ROOF_MATERIAL_OPTIONS: { id: CadMaterial; label: string }[] = [
  { id: 'steel', label: '리얼징크 강판' },
  { id: 'wood', label: '목재 처마·슁글' },
  { id: 'concrete', label: 'RC 평지붕·방수' },
  { id: 'titanium', label: '티타늄 아연판' },
];

const GLAZING_OPTIONS: { id: GlazingSpec; label: string; desc: string }[] = [
  { id: 'double_lowe', label: '이중 로이 창호', desc: '표준 단열·경제적' },
  { id: 'triple_lowe', label: '삼중 로이 시스템창', desc: '고단열·방음 우수' },
  { id: 'curtain_wall', label: '삼중 로이 커튼월', desc: '전면 대형 유리(철골 권장)' },
];

const INSULATION_OPTIONS: { id: InsulationSpec; label: string }[] = [
  { id: 'eps_150', label: 'EPS 150T (표준 외단열)' },
  { id: 'pf_board_120', label: 'PF보드 120T (고성능 단열)' },
  { id: 'mineral_wool_150', label: '미네랄울 150T (불연·내화)' },
];

function formatKrwReadable(krw: number): string {
  const man = Math.round(krw / 10000);
  if (man >= 10000) {
    const eok = Math.floor(man / 10000);
    const remMan = man % 10000;
    return remMan > 0 ? `${eok}억 ${remMan.toLocaleString()}만 원` : `${eok}억 원`;
  }
  return `${man.toLocaleString()}만 원`;
}

/** 어르신도 쉽게 누를 수 있는 큰 -, + 스테퍼 + 슬라이더 컨트롤 */
function AccessibleStepperControl({
  label,
  unit,
  value,
  min,
  max,
  step,
  isLocked,
  isSenior,
  helperText,
  onToggleLock,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  isLocked: boolean;
  isSenior: boolean;
  helperText: string;
  onToggleLock: () => void;
  onChange: (nextVal: number) => void;
}) {
  const safeMax = Math.max(min, max);
  const clamped = Math.max(min, Math.min(safeMax, value));

  const nudge = (delta: number) => {
    if (isLocked) return;
    const raw = Number((clamped + delta).toFixed(1));
    onChange(Math.max(min, Math.min(safeMax, raw)));
  };

  return (
    <div
      className={`rounded-xl border-2 p-2.5 space-y-2 transition ${
        isLocked
          ? 'bg-amber-50 border-amber-400'
          : 'bg-white border-slate-300 hover:border-sky-400'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`font-extrabold text-slate-900 ${isSenior ? 'text-base' : 'text-xs'}`}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`font-mono font-extrabold text-sky-900 ${
              isSenior ? 'text-base' : 'text-xs'
            }`}
          >
            {clamped.toLocaleString()} {unit}
          </span>
          <button
            type="button"
            onClick={onToggleLock}
            className={`px-2 py-1 rounded-lg border font-bold cursor-pointer ${
              isSenior ? 'text-xs' : 'text-[10px]'
            } ${
              isLocked
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
          >
            {isLocked ? '🔒 고정됨' : '🔓 잠금'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isLocked || clamped <= min}
          onClick={() => nudge(-step)}
          className={`rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold cursor-pointer disabled:opacity-40 shrink-0 ${
            isSenior ? 'w-11 h-10 text-xl' : 'w-8 h-7 text-sm'
          }`}
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={safeMax}
          step={step}
          disabled={isLocked}
          value={clamped}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="flex-1 h-2 accent-sky-700 cursor-pointer disabled:opacity-40"
        />
        <button
          type="button"
          disabled={isLocked || clamped >= safeMax}
          onClick={() => nudge(step)}
          className={`rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-extrabold cursor-pointer disabled:opacity-40 shrink-0 ${
            isSenior ? 'w-11 h-10 text-xl' : 'w-8 h-7 text-sm'
          }`}
        >
          +
        </button>
      </div>

      <p className={`text-slate-600 leading-snug ${isSenior ? 'text-xs' : 'text-[10.5px]'}`}>
        {helperText}
      </p>
    </div>
  );
}

export default function StudioWizardPanel({
  spec,
  isGenerating,
  isSeniorMode,
  isSiteEditMode,
  isHeatmapActive,
  onToggleSeniorMode,
  onToggleSiteEditMode,
  onToggleHeatmap,
  onLivePreviewSpec,
  onSubmitSpec,
  onOpenQuotation,
  onSelectFree3DMode,
}: Props) {
  const [step, setStep] = useState<WizardStep>(1);
  const [lockedKeys, setLockedKeys] = useState<Partial<Record<SpecFieldKey, boolean>>>({});
  const [refPhotos, setRefPhotos] = useState<string[]>([]);
  const [extractedStyle, setExtractedStyle] = useState<ExtractedHouseStyle | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const curMaterials: ElementMaterialSpec = useMemo(() => {
    const sys =
      spec.elementMaterials?.structuralSystem ??
      spec.structuralSystem ??
      resolveSafeStructuralSystem({
        usageType: spec.usageType,
        floors: spec.floors,
        windowWallRatio: spec.windowWallRatio,
        primaryMaterial: 'stucco',
      });
    return {
      structuralSystem: sys,
      foundationMaterial:
        spec.elementMaterials?.foundationMaterial ?? (spec.floors >= 3 ? 'rc_mat' : 'rc_footing'),
      exteriorCladding: spec.elementMaterials?.exteriorCladding ?? 'stucco',
      upperCladding: spec.elementMaterials?.upperCladding ?? spec.accentMaterial ?? 'wood',
      roofMaterial: spec.elementMaterials?.roofMaterial ?? spec.roofMaterial ?? 'steel',
      glazingSpec: spec.elementMaterials?.glazingSpec ?? 'double_lowe',
      insulationSpec: spec.elementMaterials?.insulationSpec ?? 'eps_150',
    };
  }, [spec]);

  const limits = useMemo(
    () =>
      calculateKoreanBuildingLimits({
        usageType: spec.usageType,
        siteAreaSqm: spec.siteAreaSqm,
        buildingAreaSqm: spec.buildingAreaSqm,
        totalFloorAreaSqm: spec.totalFloorAreaSqm,
        undergroundAreaSqm: spec.undergroundAreaSqm,
        undergroundFloors: spec.undergroundFloors,
        heightMeters: spec.heightMeters,
        floors: spec.floors,
        households: spec.households,
      }),
    [spec]
  );

  const templatesForCurrent: BuildingTemplateOption[] = useMemo(() => {
    if (spec.usageType === '3D 디자인') return [];
    if (spec.dynamicTemplates && spec.dynamicTemplates.length > 0) {
      return spec.dynamicTemplates;
    }
    return BUILDING_TEMPLATES_BY_CATEGORY[spec.usageType];
  }, [spec.usageType, spec.dynamicTemplates]);

  // 4단계(안전·예산) 진입 시 물리 하중 검토가 편하도록 대지 편집 모드는 자동 해제
  useEffect(() => {
    if (step !== 3 && isSiteEditMode) {
      onToggleSiteEditMode(false);
    }
  }, [step, isSiteEditMode, onToggleSiteEditMode]);

  const applyPhotoCollection = async (nextUrls: string[]) => {
    setRefPhotos(nextUrls);
    if (nextUrls.length === 0) {
      setExtractedStyle(null);
      const cat = spec.usageType === '3D 디자인' ? '단독주택' : spec.usageType;
      const fresh = getDefaultSpecForCategory(cat);
      onLivePreviewSpec(fresh, null, fresh.elementMaterials?.exteriorCladding ?? 'stucco');
      return;
    }
    setIsAnalyzingPhoto(true);
    try {
      const { adaptedSpec, extracted } = await analyzeMultipleHousePhotosAndAdaptSpec(
        nextUrls,
        spec,
        lockedKeys
      );
      setExtractedStyle(extracted);
      onLivePreviewSpec(adaptedSpec, null, extracted.material);
    } finally {
      setIsAnalyzingPhoto(false);
    }
  };

  const handlePhotoSelect = async (fileList: FileList) => {
    const files = Array.from(fileList).slice(0, 6);
    if (files.length === 0) return;
    setIsAnalyzingPhoto(true);
    const readAll = files.map(
      (f) =>
        new Promise<string | null>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
          r.onerror = () => resolve(null);
          r.readAsDataURL(f);
        })
    );
    const urls = (await Promise.all(readAll)).filter((u): u is string => Boolean(u));
    await applyPhotoCollection([...refPhotos, ...urls].slice(0, 6));
  };

  const handleSelectTemplate = (tpl: BuildingTemplateOption) => {
    const nextSys =
      tpl.structuralSystem ??
      resolveSafeStructuralSystem({
        usageType: spec.usageType,
        floors: spec.floors,
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
        ((tpl.windowWallRatio ?? 0.5) >= 0.65 ? 'curtain_wall' : 'double_lowe'),
    };

    const nextSpec: BuildingSpec = {
      ...spec,
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
      customWallColor: tpl.wallColor,
      customUpperWallColor: tpl.upperWallColor,
      customRoofColor: tpl.roofColor,
      designConcept: tpl.concept,
    };

    onLivePreviewSpec(nextSpec, null, nextElemMats.exteriorCladding);
  };

  const updateElementMaterials = (patch: Partial<ElementMaterialSpec>, nextWwr?: number) => {
    const merged: ElementMaterialSpec = { ...curMaterials, ...patch };
    const effectiveWwr = nextWwr ?? spec.windowWallRatio ?? 0.56;

    // 커튼월 또는 고창호비 선택 시 안전한 철골/복합조로 자동 보호
    const safeSys = resolveSafeStructuralSystem({
      usageType: spec.usageType,
      floors: spec.floors,
      windowWallRatio: merged.glazingSpec === 'curtain_wall' ? Math.max(0.7, effectiveWwr) : effectiveWwr,
      primaryMaterial: merged.exteriorCladding,
      requestedSystem: merged.structuralSystem,
    });
    merged.structuralSystem = safeSys;

    const nextSpec: BuildingSpec = {
      ...spec,
      structuralSystem: safeSys,
      elementMaterials: merged,
      accentMaterial: merged.upperCladding,
      roofMaterial: merged.roofMaterial,
      windowWallRatio: effectiveWwr,
      customWallColor: undefined,
      customUpperWallColor: undefined,
    };
    onLivePreviewSpec(nextSpec, null, merged.exteriorCladding);
  };

  const handleScaleFieldChange = (key: SpecFieldKey, val: number) => {
    if (lockedKeys[key]) return;
    const next: BuildingSpec = { ...spec, [key]: val };

    if (key === 'siteAreaSqm') {
      next.sitePolygon =
        next.sitePolygon && next.sitePolygon.length >= 3
          ? rescalePolygonToArea(next.sitePolygon, val)
          : createDefaultSitePolygon(val, next.siteShape ?? 'rectangle');
      const nextLim = calculateKoreanBuildingLimits(next);
      if (!lockedKeys.buildingAreaSqm && next.buildingAreaSqm > nextLim.maxBuildingAreaSqm) {
        next.buildingAreaSqm = nextLim.maxBuildingAreaSqm;
      }
      if (!lockedKeys.totalFloorAreaSqm && next.totalFloorAreaSqm > nextLim.maxTotalFloorAreaSqm) {
        next.totalFloorAreaSqm = nextLim.maxTotalFloorAreaSqm;
      }
    } else if (key === 'buildingAreaSqm') {
      if (!lockedKeys.totalFloorAreaSqm) {
        next.totalFloorAreaSqm = Math.min(
          limits.maxTotalFloorAreaSqm,
          Math.round(val * Math.max(1, next.floors))
        );
      }
    } else if (key === 'totalFloorAreaSqm') {
      if (!lockedKeys.buildingAreaSqm) {
        const targetBldg = Math.round(val / Math.max(1, next.floors));
        next.buildingAreaSqm = Math.max(50, Math.min(limits.maxBuildingAreaSqm, targetBldg));
      }
    } else if (key === 'floors') {
      const avgFloorH = spec.heightMeters / Math.max(1, spec.floors);
      if (!lockedKeys.heightMeters) {
        next.heightMeters = Number(Math.max(3.2, Math.min(60, val * avgFloorH)).toFixed(1));
      }
      if (!lockedKeys.totalFloorAreaSqm) {
        next.totalFloorAreaSqm = Math.min(
          limits.maxTotalFloorAreaSqm,
          Math.round(next.buildingAreaSqm * val)
        );
      }
    } else if (key === 'undergroundFloors') {
      next.undergroundAreaSqm = val === 0 ? 0 : Math.round(next.buildingAreaSqm * 0.85 * val);
    }

    const labelMap: Record<SpecFieldKey, { label: string; unit: string }> = {
      siteAreaSqm: { label: '대지면적', unit: '㎡' },
      buildingAreaSqm: { label: '건축면적', unit: '㎡' },
      totalFloorAreaSqm: { label: '지상 연면적', unit: '㎡' },
      floors: { label: '지상 층수', unit: '층' },
      heightMeters: { label: '건물 높이', unit: 'm' },
      gardenAreaSqm: { label: '정원 조경', unit: '㎡' },
      undergroundFloors: { label: '지하 층수', unit: '층' },
    };

    onLivePreviewSpec(
      next,
      {
        paramKey: key,
        label: labelMap[key].label,
        formattedValue: `${val.toLocaleString()}${labelMap[key].unit}`,
      },
      curMaterials.exteriorCladding
    );
  };

  const handleCategoryChange = (cat: DesignCategory) => {
    if (cat === '3D 디자인') {
      onToggleSiteEditMode(false);
      onSelectFree3DMode();
      return;
    }
    const fresh = getDefaultSpecForCategory(cat);
    onLivePreviewSpec(fresh, null, fresh.elementMaterials?.exteriorCladding ?? 'stucco');
  };

  const handleFloorLiveLoadChange = (floor: number, loadKn: number) => {
    const nextSpec: BuildingSpec = {
      ...spec,
      floorLoadsKn: {
        ...(spec.floorLoadsKn ?? {}),
        [floor]: loadKn,
      },
    };
    onToggleHeatmap(true);
    onLivePreviewSpec(nextSpec, null, curMaterials.exteriorCladding);
  };

  const physics = spec.structuralReport;
  const budget = spec.budgetReport;

  const stepsMeta: { num: WizardStep; short: string; full: string }[] = [
    { num: 1, short: '1.사진·디자인', full: '사진 및 디자인' },
    { num: 2, short: '2.구조·자재', full: '구조 및 자재' },
    { num: 3, short: '3.대지·규모', full: '대지 및 크기' },
    { num: 4, short: '4.안전·예산', full: '물리 안전·예산' },
  ];

  const baseText = isSeniorMode ? 'text-sm' : 'text-xs';

  return (
    <div className={`flex flex-col gap-3 text-slate-900 ${baseText}`}>
      {/* 상단 접근성 모드 토글 + 실시간 예상 총액/안전 배지 */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white rounded-xl px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {physics && (
            <span
              className={`px-2 py-0.5 rounded-md font-extrabold shrink-0 ${
                isSeniorMode ? 'text-xs' : 'text-[10.5px]'
              } ${
                physics.overallSafety === 'unsafe'
                  ? 'bg-red-600 text-white'
                  : physics.overallSafety === 'caution'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-emerald-500 text-slate-950'
              }`}
            >
              {physics.overallSafety === 'unsafe'
                ? `구조 주의 (DCR ${Math.round(physics.maxDcr * 100)}%)`
                : physics.overallSafety === 'caution'
                ? `여유 보통 (DCR ${Math.round(physics.maxDcr * 100)}%)`
                : `구조 안전 (DCR ${Math.round(physics.maxDcr * 100)}%)`}
            </span>
          )}
          {budget && (
            <span className={`font-mono font-extrabold text-amber-300 truncate ${isSeniorMode ? 'text-sm' : 'text-xs'}`}>
              예상 {formatKrwReadable(budget.grandTotalKrw)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onToggleSeniorMode(!isSeniorMode)}
          className={`px-2.5 py-1 rounded-lg font-extrabold border cursor-pointer shrink-0 transition ${
            isSeniorMode
              ? 'bg-amber-400 text-slate-950 border-amber-300 text-xs'
              : 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700 text-[11px]'
          }`}
        >
          {isSeniorMode ? '큰 글씨 모드 ON' : '큰 글씨 모드'}
        </button>
      </div>

      {/* 4단계 스텝 네비게이션 */}
      <div className="grid grid-cols-4 gap-1.5">
        {stepsMeta.map((s) => {
          const active = step === s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`rounded-xl font-extrabold border-2 transition cursor-pointer ${
                isSeniorMode ? 'py-2.5 px-1 text-xs' : 'py-1.5 px-1 text-[11px]'
              } ${
                active
                  ? 'bg-sky-700 text-white border-sky-800 shadow-sm'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-white hover:border-sky-400'
              }`}
            >
              {s.short}
            </button>
          );
        })}
      </div>

      {/* 단계별 본문 영역 */}
      <div className="max-h-[48vh] overflow-y-auto pr-1 space-y-3">
        {/* ================= 1단계: 사진 업로드 & 10종 디자인 선택 ================= */}
        {step === 1 && (
          <div className="space-y-3">
            {/* 건물 용도 선택 */}
            <div className="flex items-center gap-2">
              <label className="font-extrabold text-slate-800 shrink-0">건물 종류</label>
              <select
                value={spec.usageType}
                onChange={(e) => handleCategoryChange(e.target.value as DesignCategory)}
                className={`flex-1 bg-sky-50 border-2 border-sky-400 rounded-xl px-3 font-extrabold text-sky-950 outline-none ${
                  isSeniorMode ? 'py-2.5 text-base' : 'py-1.5 text-xs'
                }`}
              >
                <option value="단독주택">단독주택 (10종 디자인)</option>
                <option value="공동주택">공동주택·빌라</option>
                <option value="업무·상업시설">상가·오피스</option>
                <option value="복합문화시설">문화·전시시설</option>
                <option value="3D 디자인">자유 3D 모델링 (대화 모드)</option>
              </select>
            </div>

            {/* 사진 업로드 카드 */}
            <div className="rounded-xl border-2 border-sky-300 bg-sky-50/80 p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className={`font-extrabold text-sky-950 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                    원하는 집 사진 올리기 (최대 6장)
                  </div>
                  <div className={`text-slate-700 ${isSeniorMode ? 'text-xs' : 'text-[11px]'}`}>
                    색상뿐 아니라 실제 골조(RC/철골/목조)·외장재·창호·지붕까지 분석합니다.
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handlePhotoSelect(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  disabled={isAnalyzingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className={`rounded-xl bg-sky-700 hover:bg-sky-600 text-white font-extrabold cursor-pointer shrink-0 shadow-sm disabled:opacity-50 ${
                    isSeniorMode ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs'
                  }`}
                >
                  {isAnalyzingPhoto ? '분석 중...' : refPhotos.length > 0 ? '+ 사진 추가' : '사진 넣기'}
                </button>
              </div>

              {refPhotos.length > 0 && (
                <div className="bg-white rounded-xl border border-sky-200 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5 overflow-x-auto">
                      {refPhotos.map((u, idx) => (
                        <div key={idx} className="relative shrink-0">
                          <img
                            src={u}
                            alt={`참조 ${idx + 1}`}
                            className="w-14 h-14 rounded-lg object-cover border border-slate-300"
                          />
                          <button
                            type="button"
                            onClick={() => applyPhotoCollection(refPhotos.filter((_, i) => i !== idx))}
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => applyPhotoCollection([])}
                      className="text-xs font-bold text-rose-700 underline px-2 cursor-pointer shrink-0"
                    >
                      모두 삭제
                    </button>
                  </div>

                  {extractedStyle && (
                    <div className="space-y-1.5 border-t border-slate-200 pt-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold ${
                            extractedStyle.analysisSource === 'vision-ai'
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {extractedStyle.analysisSource === 'vision-ai'
                            ? '✓ Vision AI 구조·자재 추출'
                            : '로컬 자재 추정'}
                        </span>
                        <span className="font-bold text-slate-900 text-xs">
                          {extractedStyle.styleSummary}
                        </span>
                      </div>

                      {/* 사진에서 추출된 실제 사용 자재 목록 표시 */}
                      <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 space-y-0.5">
                        <div className="text-[10.5px] font-extrabold text-sky-900">
                          추출된 건축 골조 및 사용 자재 명세
                        </div>
                        {extractedStyle.materialBreakdown.map((line, i) => (
                          <div key={i} className="text-[11px] text-slate-800">
                            • {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 10종 디자인 템플릿 카드 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={`font-extrabold text-slate-900 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                  집 디자인 고르기 ({templatesForCurrent.length}종)
                </span>
                <span className="text-[11px] text-slate-500">누르면 3D와 예산이 즉시 바뀝니다</span>
              </div>

              <div className={`grid gap-2 ${isSeniorMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {templatesForCurrent.map((tpl, idx) => {
                  const selected =
                    (spec.selectedTemplateName && spec.selectedTemplateName === tpl.name) ||
                    (!spec.selectedTemplateName && spec.templateId === tpl.id && idx === 0);

                  return (
                    <button
                      key={`${tpl.id}_${idx}`}
                      type="button"
                      onClick={() => handleSelectTemplate(tpl)}
                      className={`p-2.5 rounded-xl border-2 text-left transition cursor-pointer ${
                        selected
                          ? 'bg-sky-700 text-white border-sky-900 shadow-sm'
                          : 'bg-white text-slate-900 border-slate-300 hover:border-sky-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`font-extrabold truncate ${isSeniorMode ? 'text-sm' : 'text-xs'}`}>
                          {idx + 1}. {tpl.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-bold shrink-0 ${
                            selected ? 'bg-sky-900 text-sky-100' : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {tpl.roofBadge}
                        </span>
                      </div>
                      <p
                        className={`mt-1 leading-snug line-clamp-2 ${
                          isSeniorMode ? 'text-xs' : 'text-[10.5px]'
                        } ${selected ? 'text-sky-100' : 'text-slate-600'}`}
                      >
                        {tpl.subtitle}
                      </p>
                      {tpl.materialTags && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tpl.materialTags.map((tag, ti) => (
                            <span
                              key={ti}
                              className={`px-1.5 py-0.5 rounded font-mono text-[9.5px] font-bold ${
                                selected ? 'bg-white/20 text-white' : 'bg-sky-50 text-sky-800'
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================= 2단계: 실제 주구조 골조 및 부위별 자재 지정 ================= */}
        {step === 2 && (
          <div className="space-y-3">
            {/* 주 구조 시스템 선택 */}
            <div className="space-y-1.5">
              <div className={`font-extrabold text-slate-900 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                1. 집의 뼈대 (주 구조 골조 선택)
              </div>
              <div className="grid grid-cols-1 gap-2">
                {(['rc_frame', 'steel_frame', 'heavy_timber', 'hybrid_rc_steel'] as StructuralSystemId[]).map(
                  (sysId) => {
                    const info = STRUCTURAL_SYSTEM_DB[sysId];
                    const active = curMaterials.structuralSystem === sysId;
                    const disabledTimber = sysId === 'heavy_timber' && spec.floors >= 4;
                    return (
                      <button
                        key={sysId}
                        type="button"
                        disabled={disabledTimber}
                        onClick={() => updateElementMaterials({ structuralSystem: sysId })}
                        className={`p-2.5 rounded-xl border-2 text-left transition cursor-pointer disabled:opacity-40 ${
                          active
                            ? 'bg-sky-700 text-white border-sky-900 shadow-sm'
                            : 'bg-white text-slate-900 border-slate-300 hover:border-sky-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-extrabold ${isSeniorMode ? 'text-sm' : 'text-xs'}`}>
                            {info.nameKo}
                          </span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                              active ? 'bg-sky-900 text-sky-100' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {info.codeRef.split(' ')[0]} {info.codeRef.split(' ')[1]}
                          </span>
                        </div>
                        <p
                          className={`mt-1 leading-snug ${
                            isSeniorMode ? 'text-xs' : 'text-[10.5px]'
                          } ${active ? 'text-sky-100' : 'text-slate-600'}`}
                        >
                          {disabledTimber
                            ? '현재 4층 이상이므로 안전 기준상 중목구조 단독 적용 불가 (RC/복합조 권장)'
                            : info.summary}
                        </p>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* 1층 및 상층 외벽 마감재 */}
            <div className="space-y-1.5">
              <div className={`font-extrabold text-slate-900 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                2. 1층 외벽 마감재
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {EXTERIOR_MATERIAL_OPTIONS.map((opt) => {
                  const active = curMaterials.exteriorCladding === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateElementMaterials({ exteriorCladding: opt.id })}
                      className={`p-2 rounded-xl border-2 text-left flex items-center gap-2 cursor-pointer transition ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-900 border-slate-300 hover:border-sky-500'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-md border border-slate-400 shrink-0"
                        style={{ backgroundColor: opt.swatch }}
                      />
                      <div className="min-w-0">
                        <div className="font-extrabold truncate">{opt.label}</div>
                        <div className={`text-[10px] truncate ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                          {opt.note}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {spec.floors >= 2 && (
              <div className="space-y-1.5">
                <div className={`font-extrabold text-slate-900 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                  3. 2층 이상 상층부 포인트 외장재
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {EXTERIOR_MATERIAL_OPTIONS.map((opt) => {
                    const active = curMaterials.upperCladding === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateElementMaterials({ upperCladding: opt.id })}
                        className={`p-2 rounded-xl border-2 text-left flex items-center gap-2 cursor-pointer transition ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-900 border-slate-300 hover:border-sky-500'
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-md border border-slate-400 shrink-0"
                          style={{ backgroundColor: opt.swatch }}
                        />
                        <span className="font-extrabold truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 창호 등급 & 창문 비율 */}
            <div className="rounded-xl border-2 border-slate-300 bg-white p-3 space-y-2">
              <div className={`font-extrabold text-slate-900 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                4. 창호·유리 등급 및 창문 비율 ({Math.round((spec.windowWallRatio ?? 0.56) * 100)}%)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {GLAZING_OPTIONS.map((g) => {
                  const active = curMaterials.glazingSpec === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        updateElementMaterials(
                          { glazingSpec: g.id },
                          g.id === 'curtain_wall'
                            ? Math.max(0.72, spec.windowWallRatio ?? 0.72)
                            : Math.min(0.62, spec.windowWallRatio ?? 0.52)
                        )
                      }
                      className={`p-2 rounded-xl border-2 text-left cursor-pointer ${
                        active
                          ? 'bg-sky-700 text-white border-sky-900'
                          : 'bg-slate-50 text-slate-800 border-slate-300 hover:border-sky-400'
                      }`}
                    >
                      <div className="font-extrabold text-[11px]">{g.label}</div>
                      <div className={`text-[10px] mt-0.5 ${active ? 'text-sky-100' : 'text-slate-500'}`}>
                        {g.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
              <input
                type="range"
                min={0.28}
                max={0.8}
                step={0.04}
                value={spec.windowWallRatio ?? 0.56}
                onChange={(e) => updateElementMaterials({}, parseFloat(e.target.value))}
                className="w-full h-2 accent-sky-700 cursor-pointer"
              />
              <div className="text-[11px] text-slate-600">
                * 창호 비율 65% 이상 선택 시 구조 안전을 위해 H-Beam 철골 또는 RC+철골 골조가 자동 결합됩니다.
              </div>
            </div>

            {/* 지붕재 & 단열재 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-extrabold text-slate-800 block">5. 지붕 마감재</label>
                <select
                  value={curMaterials.roofMaterial}
                  onChange={(e) =>
                    updateElementMaterials({ roofMaterial: e.target.value as CadMaterial })
                  }
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-2.5 py-2 font-bold"
                >
                  {ROOF_MATERIAL_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="font-extrabold text-slate-800 block">6. 단열재 등급</label>
                <select
                  value={curMaterials.insulationSpec}
                  onChange={(e) =>
                    updateElementMaterials({ insulationSpec: e.target.value as InsulationSpec })
                  }
                  className="w-full bg-white border-2 border-slate-300 rounded-xl px-2.5 py-2 font-bold"
                >
                  {INSULATION_OPTIONS.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ================= 3단계: 자유 대지 경계 & 크기 조절 ================= */}
        {step === 3 && (
          <div className="space-y-2.5">
            {/* 자유형 대지 경계 드래그 편집 상자 */}
            <div className="rounded-xl border-2 border-sky-400 bg-sky-50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className={`font-extrabold text-sky-950 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                    땅 모양 자유롭게 바꾸기 ({spec.sitePolygon?.length ?? 4}각형)
                  </div>
                  <div className="text-[11px] text-slate-700">
                    버튼을 켜고 3D 화면의 파란 핀을 끌면 건물도 깨지지 않고 자동 재배치됩니다.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleSiteEditMode(!isSiteEditMode)}
                  className={`rounded-xl font-extrabold border-2 cursor-pointer shrink-0 ${
                    isSeniorMode ? 'px-4 py-2.5 text-sm' : 'px-3 py-1.5 text-xs'
                  } ${
                    isSiteEditMode
                      ? 'bg-sky-700 text-white border-sky-900'
                      : 'bg-white text-sky-900 border-sky-500 hover:bg-sky-100'
                  }`}
                >
                  {isSiteEditMode ? '편집 중 (끄기)' : '땅 경계 끌기 ON'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-1.5 font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(spec.lockSiteAreaOnDrag)}
                    onChange={(e) =>
                      onLivePreviewSpec(
                        { ...spec, lockSiteAreaOnDrag: e.target.checked },
                        null,
                        curMaterials.exteriorCladding
                      )
                    }
                    className="w-4 h-4 accent-sky-700 cursor-pointer"
                  />
                  드래그할 때 대지면적 유지
                </label>

                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'rectangle', label: '네모' },
                      { id: 'triangle', label: '세모' },
                      { id: 'circle', label: '둥근형' },
                      { id: 'trapezoid', label: '사다리꼴' },
                    ] as { id: Exclude<SiteShape, 'custom'>; label: string }[]
                  ).map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => {
                        const poly = createDefaultSitePolygon(spec.siteAreaSqm, sh.id);
                        onLivePreviewSpec(
                          { ...spec, siteShape: sh.id, sitePolygon: poly },
                          null,
                          curMaterials.exteriorCladding
                        );
                      }}
                      className={`px-2 py-1 rounded-lg border font-bold text-[11px] cursor-pointer ${
                        spec.siteShape === sh.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <AccessibleStepperControl
              label="대지면적 (땅 크기)"
              unit="㎡"
              value={spec.siteAreaSqm}
              min={100}
              max={5000}
              step={20}
              isLocked={Boolean(lockedKeys.siteAreaSqm)}
              isSenior={isSeniorMode}
              helperText={`약 ${Math.round(spec.siteAreaSqm / 3.3058)}평 · 건폐율 ${limits.maxBuildingCoverageRatio}% 이하`}
              onToggleLock={() =>
                setLockedKeys((p) => ({ ...p, siteAreaSqm: !p.siteAreaSqm }))
              }
              onChange={(v) => handleScaleFieldChange('siteAreaSqm', v)}
            />

            <AccessibleStepperControl
              label="건축면적 (1층 바닥 크기)"
              unit="㎡"
              value={spec.buildingAreaSqm}
              min={50}
              max={limits.maxBuildingAreaSqm}
              step={10}
              isLocked={Boolean(lockedKeys.buildingAreaSqm)}
              isSenior={isSeniorMode}
              helperText={`약 ${Math.round(spec.buildingAreaSqm / 3.3058)}평 (법정 최대 ${limits.maxBuildingAreaSqm}㎡)`}
              onToggleLock={() =>
                setLockedKeys((p) => ({ ...p, buildingAreaSqm: !p.buildingAreaSqm }))
              }
              onChange={(v) => handleScaleFieldChange('buildingAreaSqm', v)}
            />

            <AccessibleStepperControl
              label="지상 층수"
              unit="층"
              value={spec.floors}
              min={1}
              max={10}
              step={1}
              isLocked={Boolean(lockedKeys.floors)}
              isSenior={isSeniorMode}
              helperText={`최소 1층부터 설정 가능 · 현재 높이 ${spec.heightMeters}m · 연면적 ${spec.totalFloorAreaSqm}㎡`}
              onToggleLock={() => setLockedKeys((p) => ({ ...p, floors: !p.floors }))}
              onChange={(v) => handleScaleFieldChange('floors', v)}
            />

            <AccessibleStepperControl
              label="지상 연면적 (전체 실내 합계)"
              unit="㎡"
              value={spec.totalFloorAreaSqm}
              min={50}
              max={limits.maxTotalFloorAreaSqm}
              step={20}
              isLocked={Boolean(lockedKeys.totalFloorAreaSqm)}
              isSenior={isSeniorMode}
              helperText={`약 ${Math.round(spec.totalFloorAreaSqm / 3.3058)}평 · 공사비 계산의 핵심 기준`}
              onToggleLock={() =>
                setLockedKeys((p) => ({ ...p, totalFloorAreaSqm: !p.totalFloorAreaSqm }))
              }
              onChange={(v) => handleScaleFieldChange('totalFloorAreaSqm', v)}
            />

            <AccessibleStepperControl
              label="정원 조경 면적"
              unit="㎡"
              value={spec.gardenAreaSqm}
              min={0}
              max={Math.max(80, Math.floor(spec.siteAreaSqm * 0.7))}
              step={10}
              isLocked={Boolean(lockedKeys.gardenAreaSqm)}
              isSenior={isSeniorMode}
              helperText={`법정 권장 최소 ${limits.minGardenAreaSqm}㎡ · 남는 대지 안쪽에만 배치`}
              onToggleLock={() =>
                setLockedKeys((p) => ({ ...p, gardenAreaSqm: !p.gardenAreaSqm }))
              }
              onChange={(v) => handleScaleFieldChange('gardenAreaSqm', v)}
            />

            <AccessibleStepperControl
              label="지하층 수 (0층 = 지하 없음)"
              unit="층"
              value={spec.undergroundFloors}
              min={0}
              max={3}
              step={1}
              isLocked={Boolean(lockedKeys.undergroundFloors)}
              isSenior={isSeniorMode}
              helperText={
                spec.undergroundFloors === 0
                  ? '지하층 없이 지상에만 시공 (토목비 절감)'
                  : `지하 ${spec.undergroundFloors}개층 · 지하 연면적 약 ${spec.undergroundAreaSqm}㎡`
              }
              onToggleLock={() =>
                setLockedKeys((p) => ({ ...p, undergroundFloors: !p.undergroundFloors }))
              }
              onChange={(v) => handleScaleFieldChange('undergroundFloors', v)}
            />
          </div>
        )}

        {/* ================= 4단계: KDS 물리 구조 안전 해석 & 물량산출(QTO) 현실 예산 ================= */}
        {step === 4 && (
          <div className="space-y-3">
            {/* A. 실제 물리 구조역학 검토 카드 */}
            {physics && (
              <div className="rounded-xl border-2 border-slate-300 bg-white p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={`font-extrabold text-slate-900 ${isSeniorMode ? 'text-base' : 'text-xs'}`}>
                      KDS 물리 구조역학 검토 ({physics.system.nameKo})
                    </div>
                    <div className="text-[11px] font-mono text-slate-600">
                      {physics.system.codeRef}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleHeatmap(!isHeatmapActive)}
                    className={`px-3 py-1.5 rounded-xl font-extrabold border-2 cursor-pointer shrink-0 ${
                      isHeatmapActive
                        ? 'bg-red-600 text-white border-red-800'
                        : 'bg-sky-50 text-sky-900 border-sky-400 hover:bg-sky-100'
                    }`}
                  >
                    {isHeatmapActive ? '3D 하중 경로 끄기' : '3D 하중 경로 보기'}
                  </button>
                </div>

                {/* 핵심 물리 수치 3대 지표 */}
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500 font-bold">건물 총 중량</div>
                    <div className="font-mono font-extrabold text-slate-900">
                      {physics.totalGravityMassTon.toLocaleString()} t
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500 font-bold">기초 지반압</div>
                    <div
                      className={`font-mono font-extrabold ${
                        physics.foundationDcr > 1 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {physics.soilBearingPressureKpa}/{physics.allowableSoilKpa} kPa
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                    <div className="text-[10px] text-slate-500 font-bold">최대 응력비(DCR)</div>
                    <div
                      className={`font-mono font-extrabold ${
                        physics.maxDcr > 1
                          ? 'text-red-600'
                          : physics.maxDcr > 0.78
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                      }`}
                    >
                      {Math.round(physics.maxDcr * 100)}%
                    </div>
                  </div>
                </div>

                <div className="text-[11px] bg-slate-50 rounded-lg p-2 border border-slate-200 space-y-0.5 text-slate-700">
                  <div>• 기둥 단면: <strong className="text-slate-900">{physics.columnSectionLabel}</strong> (총 {physics.totalColumnsPerFloor}본/층)</div>
                  <div>• 수평 보 단면: <strong className="text-slate-900">{physics.beamSectionLabel}</strong> (경간 {physics.spanXM}m × {physics.spanZM}m)</div>
                </div>

                {physics.safetyWarnings.length > 0 && (
                  <div className="rounded-lg bg-red-50 border-2 border-red-300 p-2 space-y-1 text-red-900 font-bold text-[11px]">
                    {physics.safetyWarnings.map((w, wi) => (
                      <div key={wi}>⚠ {w}</div>
                    ))}
                  </div>
                )}

                {/* 층별 활하중 테스트 & 실시간 기둥 축하중/보 처짐 표시 */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-extrabold text-slate-800">
                    층별 무게(활하중) 테스트 — 상층 무게가 아래층 기둥으로 누적 전달됩니다
                  </div>
                  {physics.floors.map((fp) => (
                    <div
                      key={fp.floor}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-slate-900">
                          {fp.floor}층 (활하중 {fp.liveLoadKnM2.toFixed(1)} kN/㎡)
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold ${
                            fp.status === 'unsafe'
                              ? 'bg-red-600 text-white'
                              : fp.status === 'caution'
                              ? 'bg-amber-500 text-white'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          기둥 {Math.round(fp.columnDcr * 100)}% · 보처짐 {fp.beamDeflectionMm}mm
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={12.0}
                        step={0.5}
                        value={fp.liveLoadKnM2}
                        onChange={(e) =>
                          handleFloorLiveLoadChange(fp.floor, parseFloat(e.target.value))
                        }
                        className="w-full h-1.5 accent-sky-700 cursor-pointer"
                      />
                      <div className="flex justify-between font-mono text-[10px] text-slate-600">
                        <span>계수하중 U={fp.factoredLoadKnM2}kN/㎡</span>
                        <span>기둥하중 {fp.columnAxialDemandKn}/{fp.columnCapacityKn}kN</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* B. 물량산출(QTO) 기반 현실적 총 예상 예산 리포트 */}
            {budget && (
              <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50/60 p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold text-emerald-900">
                      실제 자재 물량산출(QTO) 총 예상 공사비
                    </div>
                    <div className={`font-mono font-extrabold text-slate-950 ${isSeniorMode ? 'text-xl' : 'text-lg'}`}>
                      {formatKrwReadable(budget.grandTotalKrw)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-extrabold text-emerald-900">
                      평당 약 {Math.round(budget.costPerPyeongKrw / 10000).toLocaleString()}만 원
                    </div>
                    <div className="text-[10.5px] font-mono text-slate-600">
                      (㎡당 {Math.round(budget.costPerSqmKrw / 10000).toLocaleString()}만 원)
                    </div>
                  </div>
                </div>

                {/* 공종별 세부 내역 */}
                <div className="bg-white rounded-xl border border-emerald-200 divide-y divide-slate-100">
                  {budget.lines.map((line, idx) => (
                    <div key={idx} className="p-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          [{line.category}] {line.itemName}
                        </div>
                        <div className="text-[10.5px] text-slate-500 truncate">
                          {line.specDetail}
                        </div>
                      </div>
                      <div className="font-mono font-extrabold text-slate-900 shrink-0">
                        {formatKrwReadable(line.totalCostKrw)}
                      </div>
                    </div>
                  ))}
                  <div className="p-2 flex items-center justify-between bg-slate-50">
                    <span className="font-bold text-slate-700">설계·감리·현장관리비 (16%)</span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatKrwReadable(budget.indirectAndDesignKrw)}
                    </span>
                  </div>
                </div>

                <p className="text-[10.5px] text-slate-600 leading-snug">
                  * {budget.referenceNote}
                </p>

                <button
                  type="button"
                  onClick={onOpenQuotation}
                  className={`w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-extrabold cursor-pointer shadow-sm ${
                    isSeniorMode ? 'py-3 text-base' : 'py-2 text-xs'
                  }`}
                >
                  상세 견적서 · 인쇄 리포트 열기
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 큰 이전/다음/확정 네비게이션 */}
      <div className="flex items-center gap-2 pt-2 border-t-2 border-slate-200">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as WizardStep)}
            className={`rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-extrabold cursor-pointer ${
              isSeniorMode ? 'px-5 py-3 text-base' : 'px-3.5 py-2 text-xs'
            }`}
          >
            ← 이전
          </button>
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(4, s + 1) as WizardStep)}
            className={`flex-1 rounded-xl bg-sky-700 hover:bg-sky-600 text-white font-extrabold cursor-pointer shadow-sm ${
              isSeniorMode ? 'py-3 text-base' : 'py-2 text-xs'
            }`}
          >
            다음 단계 ({stepsMeta[step].full}) →
          </button>
        ) : (
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => onSubmitSpec(spec, curMaterials.exteriorCladding)}
            className={`flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer shadow-sm disabled:opacity-50 ${
              isSeniorMode ? 'py-3 text-base' : 'py-2 text-xs'
            }`}
          >
            {isGenerating ? '설계 반영 중...' : '✓ 이 설계로 확정하기'}
          </button>
        )}
      </div>
    </div>
  );
}