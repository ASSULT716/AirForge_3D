import { StructureState } from '../types/cad';
import { evaluateBuildingSpec } from '../utils/buildingEstimator';

interface Props {
  structure: StructureState;
  snapshotDataUrl: string | null;
  onClose: () => void;
}

const formatKRW = (won: number) => {
  const eok = Math.floor(won / 100000000);
  const man = Math.round((won % 100000000) / 10000);
  if (eok > 0) return `${eok}억 ${man.toLocaleString()}만 원 (${won.toLocaleString()}원)`;
  return `${man.toLocaleString()}만 원 (${won.toLocaleString()}원)`;
};

export default function QuotationModal({ structure, snapshotDataUrl, onClose }: Props) {
  const spec = structure.buildingSpec ?? {
    projectName: 'AirForge 모던 단독주택',
    usageType: '단독주택',
    siteAreaSqm: 450,
    buildingAreaSqm: 210,
    totalFloorAreaSqm: 420,
    undergroundAreaSqm: 180,
    undergroundFloors: 1,
    heightMeters: 10,
    floors: 2,
    households: 1,
    unitTypeCount: 2,
    elevators: 0,
    stairs: 1,
    rooftops: 1,
    gardenAreaSqm: 80,
    designConcept: '중정형 모던 스텝 테라스 단독주택',
  };

  const report = evaluateBuildingSpec(spec, structure.activeMaterial);

  const handleDownloadHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<title>${spec.projectName} - 건축 설계 개요 및 자재비 견적서</title>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; color: #0f172a; padding: 32px; max-width: 960px; margin: auto; }
  h1 { border-bottom: 3px solid #0284c7; padding-bottom: 10px; }
  h2 { margin-top: 28px; color: #0369a1; border-left: 4px solid #0284c7; padding-left: 10px; }
  img { max-width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
  th { background: #f1f5f9; }
  .ok { color: #059669; font-weight: bold; }
  .warn { color: #dc2626; font-weight: bold; }
  .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 16px; color: #0f172a; }
</style>
</head>
<body>
  <h1>건축 설계 개요서 및 자재비 산출 견적서</h1>
  <p><strong>프로젝트명:</strong> ${spec.projectName} (${spec.designConcept || 'AI 생성 디자인'}) | <strong>주용도:</strong> ${spec.usageType}</p>
  ${snapshotDataUrl ? `<img src="${snapshotDataUrl}" alt="3D 건축 투시도" />` : ''}
  <h2>1. 건축 제원 요약</h2>
  <table>
    <tr><th>대지면적</th><td>${spec.siteAreaSqm.toLocaleString()} ㎡</td><th>건축면적 / 연면적</th><td>${spec.buildingAreaSqm.toLocaleString()} ㎡ / ${spec.totalFloorAreaSqm.toLocaleString()} ㎡</td></tr>
    <tr><th>건물 높이 / 층수</th><td>${spec.heightMeters} m / 지상 ${spec.floors}층</td><th>총 가구(세대) 수</th><td>${spec.households} 세대</td></tr>
    <tr><th>엘리베이터 / 계단</th><td>${spec.elevators} 대 / ${spec.stairs} 개소</td><th>옥상 / 정원(조경) 면적</th><td>${spec.rooftops} 개소 / ${spec.gardenAreaSqm.toLocaleString()} ㎡</td></tr>
  </table>
  <h2>2. 대한민국 건축법·주차장법 자동 검토 결과</h2>
  <table>
    <thead><tr><th>검토 항목</th><th>법정 의무 기준</th><th>현재 설계 반영</th><th>판정</th></tr></thead>
    <tbody>
      ${report.laws
        .map(
          (l) =>
            `<tr><td>${l.category}<br/><small>${l.note}</small></td><td>${l.requirement}</td><td>${l.currentValue}</td><td class="${
              l.isCompliant ? 'ok' : 'warn'
            }">${l.isCompliant ? '적합' : '보완 필요'}</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
  <h2>3. 항목별 총 자재비 산출 내역 (2026년 표준건축비 기준)</h2>
  <table>
    <thead><tr><th>공종 및 자재 항목</th><th>규격/산출근거</th><th>수량</th><th>단가</th><th>금액(원)</th></tr></thead>
    <tbody>
      ${report.costs
        .map(
          (c) =>
            `<tr><td>${c.item}</td><td>${c.spec}</td><td>${c.quantity}</td><td>${c.unitPrice.toLocaleString()}원</td><td>${c.totalPrice.toLocaleString()}원</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
  <div class="total">총 예상 자재비 합계: ${formatKRW(report.totalMaterialCost)}</div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${spec.projectName}_건축견적서.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-cyan-500/50 text-slate-100 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* 모달 상단 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-cyan-500/30">
          <div>
            <span className="text-xs font-mono text-cyan-400 tracking-wider">
              ARCHITECTURAL SPECIFICATION & COST REPORT
            </span>
            <h2 className="text-lg font-bold text-white">
              {spec.projectName} — 건축법 검토 및 자재비 견적서
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded text-xs cursor-pointer"
            >
              인쇄 / PDF 저장
            </button>
            <button
              onClick={handleDownloadHtml}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded text-xs cursor-pointer"
            >
              견적서 파일 저장(.html)
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
            >
              닫기 ✕
            </button>
          </div>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* 3D 렌더링 스냅샷 + 핵심 제원 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-slate-950/70 p-4 rounded-xl border border-slate-800">
            <div className="rounded-lg overflow-hidden border border-cyan-500/30 bg-black aspect-video flex items-center justify-center">
              {snapshotDataUrl ? (
                <img
                  src={snapshotDataUrl}
                  alt="3D 모델 투시도"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-slate-500">3D 투시도 미리보기</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-slate-400">건축 / 연면적</div>
                <div className="font-bold text-white text-sm">
                  {spec.buildingAreaSqm.toLocaleString()} / {spec.totalFloorAreaSqm.toLocaleString()}㎡
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-slate-400">높이 / 층수</div>
                <div className="font-bold text-white text-sm">
                  {spec.heightMeters}m / 지상 {spec.floors}층
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-slate-400">총 가구(세대) 수</div>
                <div className="font-bold text-cyan-300 text-sm">{spec.households} 세대</div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-slate-400">엘리베이터 / 계단</div>
                <div className="font-bold text-white text-sm">
                  {spec.elevators}대 / {spec.stairs}개소
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-slate-400">옥상 / 정원 면적</div>
                <div className="font-bold text-emerald-300 text-sm">
                  {spec.rooftops}개소 / {spec.gardenAreaSqm.toLocaleString()}㎡
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                <div className="text-slate-400">디자인 컨셉</div>
                <div className="font-bold text-amber-300 text-sm truncate">
                  {spec.designConcept || 'AI 맞춤 건축안'}
                </div>
              </div>
            </div>
          </div>

          {/* 1. 건축법 & 주차장법 자동 검토 */}
          <div>
            <h3 className="text-cyan-400 font-bold mb-2">
              1. 건축법·주차장법 의무 기준 자동 검토
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <th className="p-2.5">검토 항목</th>
                    <th className="p-2.5">법정 기준</th>
                    <th className="p-2.5">설계 반영치</th>
                    <th className="p-2.5">판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {report.laws.map((law, i) => (
                    <tr key={i} className="bg-slate-900/60">
                      <td className="p-2.5">
                        <div className="font-bold text-white">{law.category}</div>
                        <div className="text-[11px] text-slate-400">{law.note}</div>
                      </td>
                      <td className="p-2.5 text-cyan-200">{law.requirement}</td>
                      <td className="p-2.5">{law.currentValue}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            law.isCompliant
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {law.isCompliant ? '적합' : '보완 필요'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. 항목별 총 자재비 산출 내역 */}
          <div>
            <h3 className="text-cyan-400 font-bold mb-2">
              2. 항목별 총 자재비 산출 내역 (2026년 국토부 표준건축비 기반)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-300">
                  <tr>
                    <th className="p-2.5">공종 및 자재</th>
                    <th className="p-2.5">산출 근거</th>
                    <th className="p-2.5">수량</th>
                    <th className="p-2.5 text-right">금액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {report.costs.map((c, i) => (
                    <tr key={i} className="bg-slate-900/60">
                      <td className="p-2.5 font-bold text-white">{c.item}</td>
                      <td className="p-2.5 text-slate-400">{c.spec}</td>
                      <td className="p-2.5">{c.quantity}</td>
                      <td className="p-2.5 text-right font-mono text-cyan-200">
                        {c.totalPrice.toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 p-3.5 rounded-xl bg-cyan-950/50 border border-cyan-500/40 flex justify-between items-center">
              <span className="font-bold text-cyan-200">총 예상 자재비 합계</span>
              <span className="text-lg font-bold text-amber-300 font-mono">
                {formatKRW(report.totalMaterialCost)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}