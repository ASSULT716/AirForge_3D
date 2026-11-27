import { useState, useEffect, useMemo } from 'react';
import {
  ActiveSpecVisualization,
  BuildingSpec,
  BuildingTemplateId,
  DesignCategory,
} from '../types/cad';
import { calculateKoreanBuildingLimits } from '../utils/buildingEstimator';
import {
  BUILDING_TEMPLATES_BY_CATEGORY,
  getDefaultSpecForCategory,
} from '../utils/architectureGenerator';

interface Props {
  initialSpec?: BuildingSpec;
  isGenerating: boolean;
  onLivePreviewSpec: (spec: BuildingSpec, activeViz: ActiveSpecVisualization | null) => void;
  onSubmitSpec: (spec: BuildingSpec) => void;
  onSelectFree3DMode: () => void;
  onClose?: () => void;
}

type SpecFieldKey =
  | 'siteAreaSqm'
  | 'buildingAreaSqm'
  | 'totalFloorAreaSqm'
  | 'undergroundFloors'
  | 'undergroundAreaSqm'
  | 'heightMeters'
  | 'floors'
  | 'households'
  | 'unitTypeCount'
  | 'elevators'
  | 'stairs'
  | 'rooftops'
  | 'gardenAreaSqm';

interface AccordionSpecItemProps {
  fieldKey: SpecFieldKey;
  isExpanded: boolean;
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
}

function AccordionSpecItem({
  isExpanded,
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
}: AccordionSpecItemProps) {
  const safeMax = Math.max(min, max);
  const clampedValue = Math.max(min, Math.min(safeMax, value));
  const diff = Number((clampedValue - baseValue).toFixed(1));

  return (
    <div
      className={`border rounded-lg transition ${
        isExpanded
          ? 'bg-sky-50/70 border-sky-400 shadow-xs'
          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* 접힌 상태: 항목명과 현재 수치만 간략하게 표시 */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-2.5 py-1.5 flex items-center justify-between text-left cursor-pointer"
      >
        <span className="text-[11px] font-bold text-slate-800">{label}</span>
        <div className="flex items-center gap-1.5">
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
          <span className="text-[10px] text-slate-400 ml-0.5">{isExpanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* 펼친 상태: 슬라이더, 입력칸, 초록색 법규 한도 정보 표시 */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-sky-200/70 space-y-1.5">
          <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1 text-[10px] font-mono text-emerald-800">
            {lawNote}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={min}
              max={safeMax}
              step={step}
              value={clampedValue}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-sky-600 cursor-pointer"
            />
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={min}
                max={safeMax}
                step={step}
                value={clampedValue}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!Number.isNaN(parsed)) {
                    onChange(Math.max(min, Math.min(safeMax, parsed)));
                  }
                }}
                className="w-18 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-right font-mono text-xs text-slate-900 outline-none focus:border-sky-500"
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

  const [projectName, setProjectName] = useState(defaultInit.projectName);
  const [usageType, setUsageType] = useState<DesignCategory>(defaultInit.usageType);
  const [templateId, setTemplateId] = useState<BuildingTemplateId>(
    defaultInit.templateId ?? 'L-courtyard'
  );
  const [siteAreaSqm, setSiteAreaSqm] = useState(defaultInit.siteAreaSqm);
  const [buildingAreaSqm, setBuildingAreaSqm] = useState(defaultInit.buildingAreaSqm);
  const [totalFloorAreaSqm, setTotalFloorAreaSqm] = useState(defaultInit.totalFloorAreaSqm);
  const [undergroundFloors, setUndergroundFloors] = useState(defaultInit.undergroundFloors);
  const [undergroundAreaSqm, setUndergroundAreaSqm] = useState(defaultInit.undergroundAreaSqm);
  const [heightMeters, setHeightMeters] = useState(defaultInit.heightMeters);
  const [floors, setFloors] = useState(defaultInit.floors);
  const [households, setHouseholds] = useState(defaultInit.households);
  const [unitTypeCount, setUnitTypeCount] = useState(defaultInit.unitTypeCount);
  const [elevators, setElevators] = useState(defaultInit.elevators);
  const [stairs, setStairs] = useState(defaultInit.stairs);
  const [rooftops, setRooftops] = useState(defaultInit.rooftops);
  const [gardenAreaSqm, setGardenAreaSqm] = useState(defaultInit.gardenAreaSqm);
  const [designConcept, setDesignConcept] = useState(
    defaultInit.designConcept || 'L자 중정 갤러리 모던 스텝 테라스 하우스'
  );

  // 아코디언 열림 상태 (기본 null = 모두 간략히 접힘)
  const [expandedKey, setExpandedKey] = useState<SpecFieldKey | null>(null);
  // 변화량(Δ) 비교용 기준 스냅샷
  const [baselineSpec, setBaselineSpec] = useState<BuildingSpec>(defaultInit);

  const limits = useMemo(
    () =>
      calculateKoreanBuildingLimits({
        usageType,
        siteAreaSqm,
        buildingAreaSqm,
        totalFloorAreaSqm,
        undergroundAreaSqm,
        undergroundFloors,
        heightMeters,
        floors,
        households,
      }),
    [
      usageType,
      siteAreaSqm,
      buildingAreaSqm,
      totalFloorAreaSqm,
      undergroundAreaSqm,
      undergroundFloors,
      heightMeters,
      floors,
      households,
    ]
  );

  useEffect(() => {
    if (usageType === '3D 디자인') return;
    if (buildingAreaSqm > limits.maxBuildingAreaSqm) setBuildingAreaSqm(limits.maxBuildingAreaSqm);
    if (totalFloorAreaSqm > limits.maxTotalFloorAreaSqm) setTotalFloorAreaSqm(limits.maxTotalFloorAreaSqm);
    if (undergroundFloors === 0 && undergroundAreaSqm !== 0) {
      setUndergroundAreaSqm(0);
    } else if (undergroundFloors > 0 && undergroundAreaSqm === 0) {
      setUndergroundAreaSqm(Math.min(limits.maxUndergroundAreaSqm, Math.round(buildingAreaSqm * 0.85)));
    } else if (undergroundAreaSqm > limits.maxUndergroundAreaSqm) {
      setUndergroundAreaSqm(limits.maxUndergroundAreaSqm);
    }
    if (floors < limits.minFloorsForHeight) setFloors(limits.minFloorsForHeight);
    else if (floors > limits.maxFloorsForHeight) setFloors(limits.maxFloorsForHeight);
    if (households > limits.maxHouseholds) setHouseholds(limits.maxHouseholds);
    if (unitTypeCount > limits.maxUnitTypes) setUnitTypeCount(limits.maxUnitTypes);
    if (elevators < limits.minTotalElevators) setElevators(limits.minTotalElevators);
    if (stairs < limits.minStairs) setStairs(limits.minStairs);
    if (gardenAreaSqm < limits.minGardenAreaSqm) setGardenAreaSqm(limits.minGardenAreaSqm);
  }, [
    usageType,
    limits,
    buildingAreaSqm,
    totalFloorAreaSqm,
    undergroundFloors,
    undergroundAreaSqm,
    floors,
    households,
    unitTypeCount,
    elevators,
    stairs,
    gardenAreaSqm,
  ]);

  const currentSpecObject: BuildingSpec = useMemo(
    () => ({
      projectName: projectName.trim() || 'AirForge 건축 프로젝트',
      usageType,
      templateId,
      siteAreaSqm,
      buildingAreaSqm,
      totalFloorAreaSqm,
      undergroundAreaSqm,
      undergroundFloors,
      heightMeters,
      floors,
      households,
      unitTypeCount,
      elevators,
      stairs,
      rooftops,
      gardenAreaSqm,
      designConcept: designConcept.trim() || '갤러리형 모던 건축 설계안',
    }),
    [
      projectName,
      usageType,
      templateId,
      siteAreaSqm,
      buildingAreaSqm,
      totalFloorAreaSqm,
      undergroundAreaSqm,
      undergroundFloors,
      heightMeters,
      floors,
      households,
      unitTypeCount,
      elevators,
      stairs,
      rooftops,
      gardenAreaSqm,
      designConcept,
    ]
  );

  // 아코디언 항목을 열거나 수치를 변경할 때마다 3D 캔버스에 실시간 크기 + 변화량(Δ) 반영
  const triggerLiveViz = (key: SpecFieldKey | null, nextSpec: BuildingSpec) => {
    if (!key) {
      onLivePreviewSpec(nextSpec, null);
      return;
    }
    const metaMap: Record<SpecFieldKey, { label: string; unit: string }> = {
      siteAreaSqm: { label: '대지면적', unit: '㎡' },
      buildingAreaSqm: { label: '건축면적', unit: '㎡' },
      totalFloorAreaSqm: { label: '지상 연면적', unit: '㎡' },
      undergroundFloors: { label: '지하 층수', unit: '층' },
      undergroundAreaSqm: { label: '지하 연면적', unit: '㎡' },
      heightMeters: { label: '건물 높이', unit: 'm' },
      floors: { label: '지상 층수', unit: '층' },
      households: { label: '총 가구 수', unit: '세대' },
      unitTypeCount: { label: '방 디자인 유형', unit: '종' },
      elevators: { label: '엘리베이터', unit: '대' },
      stairs: { label: '직통·피난 계단', unit: '개소' },
      rooftops: { label: '옥상(루프탑)', unit: '개소' },
      gardenAreaSqm: { label: '정원 조경 면적', unit: '㎡' },
    };
    const curVal = Number(nextSpec[key] ?? 0);
    const baseVal = Number(baselineSpec[key] ?? curVal);
    const diff = Number((curVal - baseVal).toFixed(1));
    const { label, unit } = metaMap[key];

    onLivePreviewSpec(nextSpec, {
      paramKey: key,
      label,
      formattedValue: `${curVal.toLocaleString()}${unit}`,
      deltaText:
        diff === 0
          ? '기준값과 동일'
          : diff > 0
          ? `+${diff}${unit} 확장`
          : `${diff}${unit} 축소`,
    });
  };

  const applyPresetSpec = (preset: BuildingSpec) => {
    setProjectName(preset.projectName);
    setUsageType(preset.usageType);
    setTemplateId(preset.templateId ?? 'L-courtyard');
    setSiteAreaSqm(preset.siteAreaSqm);
    setBuildingAreaSqm(preset.buildingAreaSqm);
    setTotalFloorAreaSqm(preset.totalFloorAreaSqm);
    setUndergroundFloors(preset.undergroundFloors);
    setUndergroundAreaSqm(preset.undergroundAreaSqm);
    setHeightMeters(preset.heightMeters);
    setFloors(preset.floors);
    setHouseholds(preset.households);
    setUnitTypeCount(preset.unitTypeCount);
    setElevators(preset.elevators);
    setStairs(preset.stairs);
    setRooftops(preset.rooftops);
    setGardenAreaSqm(preset.gardenAreaSqm);
    setDesignConcept(preset.designConcept ?? '');
    setBaselineSpec(preset);
    onLivePreviewSpec(preset, null);
  };

  const handleDesignCategoryChange = (nextCategory: DesignCategory) => {
    setUsageType(nextCategory);
    if (nextCategory === '3D 디자인') {
      onSelectFree3DMode();
      return;
    }
    const preset = getDefaultSpecForCategory(nextCategory);
    applyPresetSpec(preset);
  };

  const handleTemplateSelect = (nextTpl: BuildingTemplateId) => {
    if (usageType === '3D 디자인') return;
    const preset = getDefaultSpecForCategory(usageType, nextTpl);
    applyPresetSpec({
      ...currentSpecObject,
      templateId: nextTpl,
      projectName: preset.projectName,
      designConcept: preset.designConcept,
    });
  };

  const templatesForCurrent =
    usageType === '3D 디자인' ? [] : BUILDING_TEMPLATES_BY_CATEGORY[usageType];

  const itemsConfig: {
    key: SpecFieldKey;
    label: string;
    unit: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    lawNote: string;
    setter: (v: number) => void;
  }[] = [
    {
      key: 'siteAreaSqm',
      label: '대지면적',
      unit: '㎡',
      value: siteAreaSqm,
      min: 100,
      max: 20000,
      step: 10,
      lawNote: `대지 200㎡ 이상 시 조경 최소 ${limits.minGardenAreaSqm}㎡ 확보 필요`,
      setter: setSiteAreaSqm,
    },
    {
      key: 'buildingAreaSqm',
      label: '건축면적',
      unit: '㎡',
      value: buildingAreaSqm,
      min: 50,
      max: limits.maxBuildingAreaSqm,
      step: 10,
      lawNote: `국토계획법 건폐율 ${limits.maxBuildingCoverageRatio}% 이하 (최대 ${limits.maxBuildingAreaSqm.toLocaleString()}㎡)`,
      setter: setBuildingAreaSqm,
    },
    {
      key: 'totalFloorAreaSqm',
      label: '지상 연면적',
      unit: '㎡',
      value: totalFloorAreaSqm,
      min: 60,
      max: limits.maxTotalFloorAreaSqm,
      step: 20,
      lawNote: `국토계획법 용적률 ${limits.maxFloorAreaRatio}% 이하 (최대 ${limits.maxTotalFloorAreaSqm.toLocaleString()}㎡)`,
      setter: setTotalFloorAreaSqm,
    },
    {
      key: 'heightMeters',
      label: '건물 높이',
      unit: 'm',
      value: heightMeters,
      min: 4,
      max: 150,
      step: 0.5,
      lawNote: `높이 31m 초과 시 비상용 승강기 의무 설치 (현재 ${heightMeters}m)`,
      setter: setHeightMeters,
    },
    {
      key: 'floors',
      label: '지상 층수',
      unit: '층',
      value: floors,
      min: limits.minFloorsForHeight,
      max: limits.maxFloorsForHeight,
      step: 1,
      lawNote: `현재 높이(${heightMeters}m) 기준 적정 층수 범위: ${limits.minFloorsForHeight}~${limits.maxFloorsForHeight}층`,
      setter: setFloors,
    },
    {
      key: 'undergroundFloors',
      label: '지하 층수',
      unit: '층',
      value: undergroundFloors,
      min: 0,
      max: 6,
      step: 1,
      lawNote: '지하층은 용적률 산정에서 제외되며 200㎡ 이상 시 피난계단 2개소 필요',
      setter: setUndergroundFloors,
    },
    {
      key: 'undergroundAreaSqm',
      label: '지하 연면적',
      unit: '㎡',
      value: undergroundAreaSqm,
      min: 0,
      max: limits.maxUndergroundAreaSqm,
      step: 10,
      lawNote: `대지면적 대비 지하 최대 굴착 한도: ${limits.maxUndergroundAreaSqm.toLocaleString()}㎡`,
      setter: setUndergroundAreaSqm,
    },
    {
      key: 'gardenAreaSqm',
      label: '정원 조경 면적',
      unit: '㎡',
      value: gardenAreaSqm,
      min: limits.minGardenAreaSqm,
      max: Math.max(limits.minGardenAreaSqm, Math.floor(siteAreaSqm * 0.85)),
      step: 5,
      lawNote: `건축법 제42조 대지안의 조경 법정 최소 기준: ${limits.minGardenAreaSqm}㎡ 이상`,
      setter: setGardenAreaSqm,
    },
    {
      key: 'households',
      label: '총 가구(세대) 수',
      unit: '세대',
      value: households,
      min: limits.minHouseholds,
      max: limits.maxHouseholds,
      step: 1,
      lawNote: `연면적 기준 허용 가구 수 한도: 최대 ${limits.maxHouseholds}세대 (법정 주차 ${limits.requiredParkingCount}대)`,
      setter: setHouseholds,
    },
    {
      key: 'unitTypeCount',
      label: '방 디자인 유형 수',
      unit: '종',
      value: unitTypeCount,
      min: limits.minUnitTypes,
      max: limits.maxUnitTypes,
      step: 1,
      lawNote: `평면 타입별 내벽·창호 및 KDS 41 12 00 활하중 자동 배분 (최대 ${limits.maxUnitTypes}종)`,
      setter: setUnitTypeCount,
    },
    {
      key: 'elevators',
      label: '엘리베이터 수',
      unit: '대',
      value: elevators,
      min: limits.minTotalElevators,
      max: 12,
      step: 1,
      lawNote: `건축법 제64조 기준 법정 최소 승강기: ${limits.minTotalElevators}대 이상`,
      setter: setElevators,
    },
    {
      key: 'stairs',
      label: '직통·피난 계단 수',
      unit: '개소',
      value: stairs,
      min: limits.minStairs,
      max: 10,
      step: 1,
      lawNote: `건축법 시행령 제34조 기준 법정 최소 직통계단: ${limits.minStairs}개소 이상`,
      setter: setStairs,
    },
    {
      key: 'rooftops',
      label: '옥상(루프탑) 수',
      unit: '개소',
      value: rooftops,
      min: 1,
      max: 8,
      step: 1,
      lawNote: '옥상 난간(파라펫) 1.2m 안전 기준 및 루프탑 조형 캐노피 자동 반영',
      setter: setRooftops,
    },
  ];

  return (
    <div className="bg-white/95 border border-slate-300 rounded-xl p-3 space-y-2 shadow-lg text-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
        <div>
          <span className="font-mono text-[10px] font-bold text-sky-600 tracking-wider block">
            ARCHITECTURAL TEMPLATE & SPEC ACCORDION
          </span>
          <h3 className="text-xs font-bold text-slate-900">
            디자인 유형 · 기본 템플릿 · 제원 설정
          </h3>
        </div>
        {onClose && (
          <button
            onClick={() => {
              onLivePreviewSpec(currentSpecObject, null);
              onClose();
            }}
            className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded cursor-pointer"
          >
            접어두기 ✕
          </button>
        )}
      </div>

      {/* 프로젝트명 & 디자인 유형 선택 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">프로젝트명</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 focus:border-sky-500 rounded px-2 py-1 text-xs text-slate-900 outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 block mb-0.5">디자인 유형</label>
          <select
            value={usageType}
            onChange={(e) => handleDesignCategoryChange(e.target.value as DesignCategory)}
            className="w-full bg-sky-50 border border-sky-300 focus:border-sky-500 rounded px-2 py-1 text-xs font-bold text-sky-900 outline-none"
          >
            <option value="단독주택">단독주택 (기본 템플릿 포함)</option>
            <option value="공동주택">공동주택 (기본 템플릿 포함)</option>
            <option value="업무·상업시설">업무·상업시설 (기본 템플릿 포함)</option>
            <option value="복합문화시설">복합문화시설 (기본 템플릿 포함)</option>
            <option value="3D 디자인">3D 디자인 (3D 프린팅·자유 조형 대화모드)</option>
          </select>
        </div>
      </div>

      {/* 건물 유형에 따른 기본 템플릿(기본 디자인) 선택 카드 */}
      {templatesForCurrent.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-slate-500 block">
            {usageType} 기본 디자인 템플릿 (클릭 시 3D 건물 즉시 적용)
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {templatesForCurrent.map((tpl) => {
              const isSelected = templateId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleTemplateSelect(tpl.id)}
                  className={`p-1.5 rounded-lg border text-left transition cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-sky-400'
                  }`}
                >
                  <div className="text-[10.5px] font-bold truncate">{tpl.name}</div>
                  <div
                    className={`text-[9px] line-clamp-1 mt-0.5 ${
                      isSelected ? 'text-sky-100' : 'text-slate-500'
                    }`}
                  >
                    {tpl.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 항목별 아코디언 리스트 (누르지 않으면 간략하게 항목명+값만 표시) */}
      <div className="max-h-[26vh] overflow-y-auto pr-1 space-y-1">
        {itemsConfig.map((item) => (
          <AccordionSpecItem
            key={item.key}
            fieldKey={item.key}
            isExpanded={expandedKey === item.key}
            onToggle={() => {
              const nextKey = expandedKey === item.key ? null : item.key;
              setExpandedKey(nextKey);
              triggerLiveViz(nextKey, currentSpecObject);
            }}
            label={item.label}
            unit={item.unit}
            value={item.value}
            baseValue={Number(baselineSpec[item.key] ?? item.value)}
            min={item.min}
            max={item.max}
            step={item.step}
            lawNote={item.lawNote}
            onChange={(val) => {
              item.setter(val);
              const nextSpec = { ...currentSpecObject, [item.key]: val };
              triggerLiveViz(item.key, nextSpec);
            }}
          />
        ))}
      </div>

      <button
        onClick={() => {
          setBaselineSpec(currentSpecObject);
          onLivePreviewSpec(currentSpecObject, null);
          onSubmitSpec(currentSpecObject);
        }}
        disabled={isGenerating}
        className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 shadow-sm transition"
      >
        {isGenerating
          ? '건축 매스·내벽/외벽·창호·배관 정밀 생성 중...'
          : '현재 제원으로 확정 및 AI 구조·배관 동기화'}
      </button>
    </div>
  );
}