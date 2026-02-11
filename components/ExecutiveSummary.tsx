'use client';
import { useEffect, useState } from 'react';
import { ExecutiveSummaryData } from '@/lib/types';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  onChange: (data: ExecutiveSummaryData) => void;
  onReset: () => void;
  onSaveToServer?: (data: ExecutiveSummaryData, password?: string) => Promise<{ ok: boolean; requirePassword?: boolean }>;
}

export default function ExecutiveSummary({ data, onChange, onReset, onSaveToServer }: ExecutiveSummaryProps) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [serverSavePassword, setServerSavePassword] = useState('');
  const [serverSaveError, setServerSaveError] = useState<string | null>(null);

  // data가 변경될 때마다 localStorage에 자동 저장
  useEffect(() => {
    if (data) {
      try {
        localStorage.setItem('executive-summary', JSON.stringify(data));
      } catch (err) {
        console.error('localStorage 저장 실패:', err);
      }
    }
  }, [data]);

  if (!data) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-500">경영요약 데이터를 불러오는 중...</div>
      </div>
    );
  }

  // 텍스트 변경 핸들러
  const handleTextChange = (
    section: keyof ExecutiveSummaryData['sections'],
    subsection: string,
    value: string
  ) => {
    const lines = value.split('\n').filter(line => line.trim());
    
    if (section === '브랜드포트폴리오') {
      // 브랜드포트폴리오 섹션을 새 구조로 변환
      const brandPortfolio = { ...data.sections.브랜드포트폴리오 };
      
      // 이전 키 제거 (있다면)
      if (subsection === '기존브랜드') {
        delete (brandPortfolio as any).MLB장종;
        brandPortfolio.기존브랜드 = lines;
      } else if (subsection === '신규브랜드') {
        delete (brandPortfolio as any).신규브랜드고성장;
        delete (brandPortfolio as any).신규브랜드성장;
        brandPortfolio.신규브랜드 = lines;
      }
      
      onChange({
        ...data,
        sections: {
          ...data.sections,
          브랜드포트폴리오: brandPortfolio
        }
      });
    } else {
      onChange({
        ...data,
        sections: {
          ...data.sections,
          [section]: {
            ...data.sections[section],
            [subsection]: lines
          }
        }
      });
    }
  };

  // 서버 저장 (비밀번호 모달에서 확인 클릭 시)
  const handleServerSaveWithPassword = async () => {
    if (!onSaveToServer || !data) return;
    setServerSaveError(null);
    const result = await onSaveToServer(data, serverSavePassword);
    if (result.ok) {
      setShowPasswordModal(false);
      setServerSavePassword('');
      alert('서버에 저장되었습니다.');
    } else if (result.requirePassword) {
      setServerSaveError('비밀번호가 올바르지 않습니다.');
    } else {
      setServerSaveError('서버 저장에 실패했습니다.');
    }
  };

  // 저장 (localStorage + JSON 백업 다운로드 + 서버 저장)
  const handleSave = async () => {
    try {
      // localStorage에 저장
      localStorage.setItem('executive-summary', JSON.stringify(data));
      
      // JSON 파일로도 백업 다운로드
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `executive-summary.json`;
      a.click();
      URL.revokeObjectURL(url);

      // 서버에 저장 (배포 환경이면 비밀번호 필요 시 모달 표시)
      if (onSaveToServer) {
        const result = await onSaveToServer(data);
        if (result.ok) {
          alert('저장되었습니다. (로컬 + 서버)');
        } else if (result.requirePassword) {
          setServerSaveError(null);
          setShowPasswordModal(true);
        } else {
          alert('로컬에는 저장되었으나 서버 저장에 실패했습니다.');
        }
      } else {
        alert('저장되었습니다!\n\n📌 팁: 다운로드된 executive-summary.json 파일을\n프로젝트의 /public/data/ 폴더에 복사하고\nGitHub에 푸시하면 팀 전체가 최신 버전을 사용할 수 있습니다.');
      }
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장에 실패했습니다.');
    }
  };

  // 이전 구조 호환성 처리
  const 기존브랜드 = data.sections.브랜드포트폴리오.기존브랜드 || 
    (data.sections.브랜드포트폴리오 as any).MLB장종 || [];
  const 신규브랜드 = data.sections.브랜드포트폴리오.신규브랜드 || 
    (data.sections.브랜드포트폴리오 as any).신규브랜드성장 || 
    (data.sections.브랜드포트폴리오 as any).신규브랜드고성장 || [];

  return (
    <div className="p-6">
      {/* 제목 + 버튼 */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{data.title}</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
          >
            💾 저장하기
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors shadow-sm"
          >
            🔄 초기값으로
          </button>
        </div>
      </div>

      {/* 2열 레이아웃 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 좌측 컬럼 */}
        <div className="space-y-6">
          {/* 수익성 분석 */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-800">
              📊 수익성 분석
            </h2>

            {/* 매출 성장 vs 수익성 약세 */}
            <div className="mb-4">
              <h3 className="font-semibold text-blue-700 mb-2 text-sm">매출 성장 vs 수익성 약세</h3>
              <textarea
                value={data.sections.수익성분석.매출성장.join('\n')}
                onChange={(e) => handleTextChange('수익성분석', '매출성장', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
              />
            </div>

            {/* 비용 증가 */}
            <div>
              <h3 className="font-semibold text-red-700 mb-2 text-sm">비용 증가</h3>
              <textarea
                value={data.sections.수익성분석.비용증가.join('\n')}
                onChange={(e) => handleTextChange('수익성분석', '비용증가', e.target.value)}
                className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
              />
            </div>
          </div>

          {/* 재무 현황 */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-orange-800">
              🔥 재무 현황
            </h2>

            <div className="space-y-4">
              {/* 자산 규모 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">자산 규모</h3>
                <textarea
                  value={data.sections.재무현황.자산규모.join('\n')}
                  onChange={(e) => handleTextChange('재무현황', '자산규모', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              {/* 부채 증가 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">부채 증가</h3>
                <textarea
                  value={data.sections.재무현황.부채증가.join('\n')}
                  onChange={(e) => handleTextChange('재무현황', '부채증가', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              {/* 재고자산 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">재고자산</h3>
                <textarea
                  value={data.sections.재무현황.재고자산.join('\n')}
                  onChange={(e) => handleTextChange('재무현황', '재고자산', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>

              {/* 자본 안정 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">자본 안정</h3>
                <textarea
                  value={data.sections.재무현황.자본안정.join('\n')}
                  onChange={(e) => handleTextChange('재무현황', '자본안정', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={1}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 우측 컬럼 */}
        <div className="space-y-6">
          {/* 실적 분석 */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-green-800">
              🔍 실적 분석
            </h2>

            <div className="space-y-4">
              {/* 주요 지표 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">주요 지표</h3>
                <textarea
                  value={data.sections.실적분석.주요지표.join('\n')}
                  onChange={(e) => handleTextChange('실적분석', '주요지표', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                />
              </div>

              {/* 부채비율 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">부채비율</h3>
                <textarea
                  value={data.sections.실적분석.부채비율.join('\n')}
                  onChange={(e) => handleTextChange('실적분석', '부채비율', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={1}
                />
              </div>
            </div>
          </div>

          {/* 브랜드 포트폴리오 */}
          <div className="bg-white rounded-lg border border-gray-300 shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-800">
              📦 브랜드 포트폴리오
            </h2>

            <div className="space-y-4">
              {/* 기존브랜드 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">기존브랜드</h3>
                <textarea
                  value={기존브랜드.join('\n')}
                  onChange={(e) => handleTextChange('브랜드포트폴리오', '기존브랜드', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              {/* 신규 브랜드 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">신규 브랜드</h3>
                <textarea
                  value={신규브랜드.join('\n')}
                  onChange={(e) => handleTextChange('브랜드포트폴리오', '신규브랜드', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 서버 저장 비밀번호 모달 (배포 환경) */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-800 mb-2">서버에 저장</h3>
            <p className="text-sm text-gray-600 mb-3">비밀번호를 입력하세요.</p>
            <input
              type="password"
              value={serverSavePassword}
              onChange={(e) => setServerSavePassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded mb-2"
              placeholder="비밀번호"
            />
            {serverSaveError && <p className="text-sm text-red-600 mb-2">{serverSaveError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setShowPasswordModal(false); setServerSavePassword(''); setServerSaveError(null); }}
                className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleServerSaveWithPassword}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
