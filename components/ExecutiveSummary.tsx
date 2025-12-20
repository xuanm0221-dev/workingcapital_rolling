'use client';
import { useState, useRef, useEffect } from 'react';
import { ExecutiveSummaryData } from '@/lib/types';

interface ExecutiveSummaryProps {
  data: ExecutiveSummaryData | null;
  onChange: (data: ExecutiveSummaryData) => void;
  onReset: () => void;
}

export default function ExecutiveSummary({ data, onChange, onReset }: ExecutiveSummaryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  };

  // 저장 (localStorage + JSON 백업 다운로드)
  const handleSave = () => {
    try {
      // localStorage에 저장
      localStorage.setItem('executive-summary', JSON.stringify(data));
      
      // JSON 파일로도 백업 다운로드
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `경영요약_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      alert('저장되었습니다! (브라우저 저장소 + JSON 파일 백업)');
    } catch (err) {
      console.error('저장 실패:', err);
      alert('저장에 실패했습니다.');
    }
  };

  // JSON 업로드
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const uploadedData = JSON.parse(event.target?.result as string);
        onChange(uploadedData);
        alert('경영요약 데이터를 불러왔습니다.');
      } catch (err) {
        alert('JSON 파일 형식이 올바르지 않습니다.');
      }
    };
    reader.readAsText(file);
    
    // 파일 입력 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

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
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept=".json"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors shadow-sm"
          >
            📁 JSON 불러오기
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
              {/* MLB 장종 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">MLB 장종</h3>
                <textarea
                  value={data.sections.브랜드포트폴리오.MLB장종.join('\n')}
                  onChange={(e) => handleTextChange('브랜드포트폴리오', 'MLB장종', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
              </div>

              {/* 신규 브랜드 고성장 */}
              <div>
                <h3 className="font-semibold text-gray-700 mb-2 text-sm">신규 브랜드 고성장</h3>
                <textarea
                  value={data.sections.브랜드포트폴리오.신규브랜드고성장.join('\n')}
                  onChange={(e) => handleTextChange('브랜드포트폴리오', '신규브랜드고성장', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

