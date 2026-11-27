import { useState, useEffect, useMemo } from 'react';
import { BuildingSpec } from '../types/cad';
import { calculateKoreanBuildingLimits } from '../utils/buildingEstimator';

interface Props {
  initialSpec?: BuildingSpec;
  isGenerating: boolean;
  onSubmitSpec: (spec: BuildingSpec) => void;
  onClose?: () => void;
}

interface SliderInputRowProps {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  lawBadge?: string;
  onChange: (val: number) => void;
}

function SliderInputRow({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  lawBadge,
  onChange,
}: SliderInputRowProps) {
  const safeMax = Math.max(min, max);
  const clampedValue = Math.max(min, Math.min(safeMax, value));

  return (
    <div className="bg-slate-900/85 border border-slate-800 rounded-lg p-2 space-y-1">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-slate-200">{label}</span>
          {lawBadge && (
            <span className="text-[9.5px] font-mono text-emerald-400 leading-tight">
              {lawBadge}
            </span>
          )}
        </div>
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
            className="w-20 bg-black/80 border border-cyan-500/50 rounded px-1.5 py-0.5 text-right font-mono text-xs text-cyan-200 outline-none focus:border-cyan-300"
          />
          <span className="text-[11px] font-mono text-slate-400 w-7">{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={safeMax}
        step={step}
        value={clampedValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 accent-cyan-400 cursor-pointer"
      />
      <div className="flex justify-between text-[9px] font-mono text-slate-500">
        <span>최소 {min.toLocaleString()}{unit}</span>
        <span>최대 {safeMax.toLocaleString()}{unit}</span>
      </div>
    </div>
  );
}

export default function BuildingSpecBuilder({
  initialSpec,
  isGenerating,
  onSubmitSpec,
  onClose,
}: Props) {
  const [projectName, setProjectName] = useState(
    initialSpec?.projectName || 'AirForge 모던 단독주택'
  );
  const [usageType, setUsageType] = useState<BuildingSpec['usageType']>(
    initialSpec?.usageType || '단독주택'
  );
  const [siteAreaSqm, setSiteAreaSqm] = useState(initialSpec?.siteAreaSqm ?? 450);
  const [buildingAreaSqm, setBuildingAreaSqm] = useState(initialSpec?.buildingAreaSqm ?? 210);
  const [totalFloorAreaSqm, setTotalFloorAreaSqm] = useState(
    initialSpec?.totalFloorAreaSqm ?? 420
  );
  const [undergroundFloors, setUndergroundFloors] = useState(
    initialSpec?.undergroundFloors ?? 1
  );
  const [undergroundAreaSqm, setUndergroundAreaSqm] = useState(
    initialSpec?.undergroundAreaSqm ?? 180
  );
  const [heightMeters, setHeightMeters] = useState(initialSpec?.heightMeters ?? 10);
  const [floors, setFloors] = useState(initialSpec?.floors ?? 2);
  const [households, setHouseholds] = useState(initialSpec?.households ?? 1);
  const [unitTypeCount, setUnitTypeCount] = useState(initialSpec?.unitTypeCount ?? 2);
  const [elevators, setElevators] = useState(initialSpec?.elevators ?? 0);
  const [stairs, setStairs] = useState(initialSpec?.stairs ?? 1);
  const [rooftops, setRooftops] = useState(initialSpec?.rooftops ?? 1);
  const [gardenAreaSqm, setGardenAreaSqm] = useState(initialSpec?.gardenAreaSqm ?? 80);
  const [designConcept, setDesignConcept] = useState(
    initialSpec?.designConcept || '중정형 모던 스텝 테라스 단독주택'
  );

  // 한국 건축법 실시간 최소·최대 한계 계산
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

  // 법정 최소·최대 수치 변동 시 현재 수치를 법정 허용 범위로 자동 동기화
  useEffect(() => {
    if (buildingAreaSqm > limits.maxBuildingAreaSqm) {
      setBuildingAreaSqm(limits.maxBuildingAreaSqm);
    }
    if (totalFloorAreaSqm > limits.maxTotalFloorAreaSqm) {
      setTotalFloorAreaSqm(limits.maxTotalFloorAreaSqm);
    }
    if (undergroundFloors === 0 && undergroundAreaSqm !== 0) {
      setUndergroundAreaSqm(0);
    } else if (undergroundFloors > 0 && undergroundAreaSqm === 0) {
      setUndergroundAreaSqm(Math.min(limits.maxUndergroundAreaSqm, Math.round(buildingAreaSqm * 0.85)));
    } else if (undergroundAreaSqm > limits.maxUndergroundAreaSqm) {
      setUndergroundAreaSqm(limits.maxUndergroundAreaSqm);
    }
    if (floors < limits.minFloorsForHeight) {
      setFloors(limits.minFloorsForHeight);
    } else if (floors > limits.maxFloorsForHeight) {
      setFloors(limits.maxFloorsForHeight);
    }
    if (households > limits.maxHouseholds) {
      setHouseholds(limits.maxHouseholds);
    }
    if (unitTypeCount > limits.maxUnitTypes) {
      setUnitTypeCount(limits.maxUnitTypes);
    }
    if (elevators < limits.minTotalElevators) {
      setElevators(limits.minTotalElevators);
    }
    if (stairs < limits.minStairs) {
      setStairs(limits.minStairs);
    }
    if (gardenAreaSqm < limits.minGardenAreaSqm) {
      setGardenAreaSqm(limits.minGardenAreaSqm);
    }
  }, [
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

  const handleUsageChange = (nextUsage: BuildingSpec['usageType']) => {
    setUsageType(nextUsage);
    if (nextUsage === '단독주택') {
      setProjectName('AirForge 모던 단독주택');
      setSiteAreaSqm(450);
      setBuildingAreaSqm(210);
      setTotalFloorAreaSqm(420);
      setUndergroundFloors(1);
      setUndergroundAreaSqm(180);
      setHeightMeters(10);
      setFloors(2);
      setHouseholds(1);
      setUnitTypeCount(1);
      setElevators(0);
      setStairs(1);
      setRooftops(1);
      setGardenAreaSqm(80);
      setDesignConcept('중정형 모던 스텝 테라스 단독주택');
    } else if (nextUsage === '공동주택') {
      setProjectName('AirForge 스마트 공동주택');
      setSiteAreaSqm(1500);
      setBuildingAreaSqm(750);
      setTotalFloorAreaSqm(3600);
      setUndergroundFloors(2);
      setUndergroundAreaSqm(1800);
      setHeightMeters(26);
      setFloors(8);
      setHouseholds(32);
      setUnitTypeCount(3);
      setElevators(1);
      setStairs(2);
      setRooftops(2);
      setGardenAreaSqm(200);
      setDesignConcept('스텝 테라스 친환경 캔틸레버 타워');
    }
  };

  const handleCreate = () => {
    onSubmitSpec({
      projectName: projectName.trim() || 'AirForge 건축 프로젝트',
      usageType,
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
      designConcept: designConcept.trim() || '모던 건축 설계안',
    });
  };

  return (
    <div className="bg-slate-950/95 border border-cyan-400/60 rounded-xl p-3 space-y-2.5 shadow-[0_0_25px_rgba(0,243,255,0.15)]">
      <div className="flex items-center justify-between border-b border-cyan-500/30 pb-1.5">
        <div>
          <span className="font-mono text-[10px] font-bold text-cyan-400 tracking-wider block">
            KOREAN BUILDING CODE LIVE CALCULATOR
          </span>
          <h3 className="text-xs font-bold text-white">
            건축 제원 일괄 설정 (한국 건축법 최소·최대 실시간 연동)
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-2 py-0.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
          >
            닫기 ✕
          </button>
        )}
      </div>

      {/* 프로젝트명 & 주용도 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-slate-400 block mb-0.5">프로젝트명</label>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full bg-black/70 border border-slate-700 focus:border-cyan-400 rounded px-2 py-1 text-xs text-white outline-none"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-400 block mb-0.5">건축물 주용도 (법정 기준 연동)</label>
          <select
            value={usageType}
            onChange={(e) => handleUsageChange(e.target.value as BuildingSpec['usageType'])}
            className="w-full bg-black/80 border border-slate-700 focus:border-cyan-400 rounded px-2 py-1 text-xs text-cyan-200 outline-none"
          >
            <option value="단독주택">단독주택 (일반·다가구주택)</option>
            <option value="공동주택">공동주택 (아파트·연립·다세대)</option>
            <option value="업무·상업시설">업무·상업시설 (오피스·근린생활)</option>
            <option value="복합문화시설">복합문화시설 (전시·커뮤니티)</option>
          </select>
        </div>
      </div>

      {/* 실시간 법규 요약 배너 */}
      <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-lg px-2.5 py-1.5 text-[10.5px] text-emerald-200 flex flex-wrap gap-x-3 gap-y-0.5 font-mono">
        <span>건폐율 상한: {limits.maxBuildingCoverageRatio}%</span>
        <span>용적률 상한: {limits.maxFloorAreaRatio}%</span>
        <span>법정 최소 계단: {limits.minStairs}개소</span>
        <span>법정 최소 승강기: {limits.minTotalElevators}대</span>
        <span>법정 주차: {limits.requiredParkingCount}대</span>
      </div>

      {/* 스크롤 가능한 제원 슬라이더 + 입력칸 그리드 */}
      <div className="max-h-[34vh] overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <SliderInputRow
          label="대지면적"
          unit="㎡"
          value={siteAreaSqm}
          min={100}
          max={20000}
          step={10}
          lawBadge="건폐율·용적률·조경 기준 모수"
          onChange={setSiteAreaSqm}
        />
        <SliderInputRow
          label="건축면적"
          unit="㎡"
          value={buildingAreaSqm}
          min={50}
          max={limits.maxBuildingAreaSqm}
          step={10}
          lawBadge={`법정 건폐율 ${limits.maxBuildingCoverageRatio}% 한도`}
          onChange={setBuildingAreaSqm}
        />
        <SliderInputRow
          label="지상 연면적"
          unit="㎡"
          value={totalFloorAreaSqm}
          min={60}
          max={limits.maxTotalFloorAreaSqm}
          step={20}
          lawBadge={`법정 용적률 ${limits.maxFloorAreaRatio}% 한도`}
          onChange={setTotalFloorAreaSqm}
        />
        <SliderInputRow
          label="지하 층수"
          unit="층"
          value={undergroundFloors}
          min={0}
          max={6}
          step={1}
          lawBadge="지하 200㎡ 이상 시 계단 2개소"
          onChange={setUndergroundFloors}
        />
        <SliderInputRow
          label="지하 연면적"
          unit="㎡"
          value={undergroundAreaSqm}
          min={0}
          max={limits.maxUndergroundAreaSqm}
          step={10}
          lawBadge={
            undergroundFloors === 0
              ? '지하 층수 0층 (지하 없음)'
              : `용적률 제외 · 굴착 상한 ${limits.maxUndergroundAreaSqm}㎡`
          }
          onChange={setUndergroundAreaSqm}
        />
        <SliderInputRow
          label="건물 높이"
          unit="m"
          value={heightMeters}
          min={4}
          max={150}
          step={1}
          lawBadge={heightMeters > 31 ? '31m 초과: 비상용 승강기 의무' : '31m 이하 일반 높이'}
          onChange={setHeightMeters}
        />
        <SliderInputRow
          label="지상 층수"
          unit="층"
          value={floors}
          min={limits.minFloorsForHeight}
          max={limits.maxFloorsForHeight}
          step={1}
          lawBadge={floors >= 6 ? '6층 이상: 연면적 2,000㎡↑ 승강기 의무' : '층고 2.6~6.0m 연동'}
          onChange={setFloors}
        />
        <SliderInputRow
          label={usageType === '단독주택' ? '가구(다가구) 수' : '총 가구(세대) 수'}
          unit="세대"
          value={households}
          min={limits.minHouseholds}
          max={limits.maxHouseholds}
          step={1}
          lawBadge={usageType === '단독주택' ? '다가구 법정 상한 19세대 이하' : `연면적 대비 최대 ${limits.maxHouseholds}세대`}
          onChange={setHouseholds}
        />
        <SliderInputRow
          label="가구 디자인 유형 수"
          unit="종"
          value={unitTypeCount}
          min={limits.minUnitTypes}
          max={limits.maxUnitTypes}
          step={1}
          lawBadge="좌측 하단 평면도·3D 배치 유형 수"
          onChange={setUnitTypeCount}
        />
        <SliderInputRow
          label="엘리베이터 수"
          unit="대"
          value={elevators}
          min={limits.minTotalElevators}
          max={12}
          step={1}
          lawBadge={`건축법 제64조 최소 ${limits.minTotalElevators}대 의무`}
          onChange={setElevators}
        />
        <SliderInputRow
          label="직통·피난 계단 수"
          unit="개소"
          value={stairs}
          min={limits.minStairs}
          max={10}
          step={1}
          lawBadge={`시행령 제34조 최소 ${limits.minStairs}개소 의무`}
          onChange={setStairs}
        />
        <SliderInputRow
          label="옥상(루프탑) 수"
          unit="개소"
          value={rooftops}
          min={1}
          max={8}
          step={1}
          lawBadge="루프탑 테라스·옥상정원 구역"
          onChange={setRooftops}
        />
        <div className="sm:col-span-2">
          <SliderInputRow
            label="정원(조경) 면적"
            unit="㎡"
            value={gardenAreaSqm}
            min={limits.minGardenAreaSqm}
            max={Math.max(limits.minGardenAreaSqm, Math.floor(siteAreaSqm * 0.85))}
            step={5}
            lawBadge={`건축법 제42조 최소 ${limits.minGardenAreaSqm}㎡ 이상`}
            onChange={setGardenAreaSqm}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] text-slate-400 block mb-0.5">
            건축 디자인 컨셉 (선택 입력)
          </label>
          <input
            value={designConcept}
            onChange={(e) => setDesignConcept(e.target.value)}
            placeholder="예: 중정형 모던 단독주택, 스킵플로어 캔틸레버 하우스"
            className="w-full bg-black/70 border border-slate-700 focus:border-cyan-400 rounded px-2 py-1 text-xs text-white outline-none"
          />
        </div>
      </div>

      {/* 일괄 전송 버튼 */}
      <button
        onClick={handleCreate}
        disabled={isGenerating}
        className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-black font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 shadow-lg transition"
      >
        {isGenerating
          ? '한국 건축법·지하 구조·KDS 하중 반영하여 3D 생성 중...'
          : '설정된 제원으로 3D 건축물 즉시 생성'}
      </button>
    </div>
  );
}