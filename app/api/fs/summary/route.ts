import { NextResponse } from 'next/server';
import path from 'path';
import { readCSV } from '@/lib/csv';
import { calculatePL, calculateBS } from '@/lib/fs-mapping';
import { ExecutiveSummaryData, TableRow } from '@/lib/types';

// 값 가져오기 헬퍼 함수
function getValue(data: TableRow[], account: string, monthIndex: number): number {
  const row = data.find(r => r.account === account);
  return row?.values[monthIndex] || 0;
}

// 경영요약 자동 생성 함수 (2025년 기말 vs 2026년 기말)
function generateSummary(
  pl2025: TableRow[],
  pl2026: TableRow[],
  bs2025: TableRow[],
  bs2026: TableRow[]
): ExecutiveSummaryData {
  
  const month = 11; // 12월 기말 (index 11)
  
  // PL 데이터 추출 (12월 기말 기준, K 단위)
  const tag매출25 = getValue(pl2025, 'Tag매출', month);
  const tag매출26 = getValue(pl2026, 'Tag매출', month);
  const 실판매출25 = getValue(pl2025, '실판매출', month);
  const 실판매출26 = getValue(pl2026, '실판매출', month);
  const 매출총이익25 = getValue(pl2025, '매출총이익', month);
  const 매출총이익26 = getValue(pl2026, '매출총이익', month);
  const 영업이익25 = getValue(pl2025, '영업이익', month);
  const 영업이익26 = getValue(pl2026, '영업이익', month);
  const 영업이익률25 = getValue(pl2025, '영업이익률', month);
  const 영업이익률26 = getValue(pl2026, '영업이익률', month);
  const 영업비25 = getValue(pl2025, '영업비', month);
  const 영업비26 = getValue(pl2026, '영업비', month);
  const 광고비25 = getValue(pl2025, '광고비', month);
  const 광고비26 = getValue(pl2026, '광고비', month);
  
  // BS 데이터 추출 (12월 기말 기준, K 단위)
  const 자산25 = getValue(bs2025, '자산', month);
  const 자산26 = getValue(bs2026, '자산', month);
  const 부채25 = getValue(bs2025, '부채', month);
  const 부채26 = getValue(bs2026, '부채', month);
  const 자본25 = getValue(bs2025, '자본', month);
  const 자본26 = getValue(bs2026, '자본', month);
  const 유동자산25 = getValue(bs2025, '유동자산', month);
  const 유동자산26 = getValue(bs2026, '유동자산', month);
  const 유동부채25 = getValue(bs2025, '유동부채', month);
  const 유동부채26 = getValue(bs2026, '유동부채', month);
  const 이익잉여금25 = getValue(bs2025, '이익잉여금', month);
  const 이익잉여금26 = getValue(bs2026, '이익잉여금', month);
  const 재고25 = getValue(bs2025, '재고자산', month);
  const 재고26 = getValue(bs2026, '재고자산', month);
  const 직영AR25 = getValue(bs2025, '직영AR', month);
  const 대리상AR25 = getValue(bs2025, '대리상AR', month);
  const AR25 = 직영AR25 + 대리상AR25;
  const 직영AR26 = getValue(bs2026, '직영AR', month);
  const 대리상AR26 = getValue(bs2026, '대리상AR', month);
  const AR26 = 직영AR26 + 대리상AR26;
  const 차입금25 = getValue(bs2025, '차입금', month);
  const 차입금26 = getValue(bs2026, '차입금', month);
  
  // 브랜드별 매출 (12월 기말 기준, K 단위)
  const mlb26 = getValue(pl2026, 'MLB', month);
  const kids26 = getValue(pl2026, 'KIDS', month);
  const discovery25 = getValue(pl2025, 'DISCOVERY', month);
  const discovery26 = getValue(pl2026, 'DISCOVERY', month);
  
  // 계산 (25년 → 26년)
  const tag매출증가율 = tag매출25 !== 0 ? ((tag매출26 - tag매출25) / tag매출25) * 100 : 0;
  const 실판매출증가율 = 실판매출25 !== 0 ? ((실판매출26 - 실판매출25) / 실판매출25) * 100 : 0;
  const 영업이익증가율 = 영업이익25 !== 0 ? ((영업이익26 - 영업이익25) / Math.abs(영업이익25)) * 100 : 0;
  
  const 영업이익상태 =
    영업이익25 < 0 && 영업이익26 > 0 ? '흑자전환' :
    영업이익25 > 0 && 영업이익26 < 0 ? '적자전환' :
    null;
  
  const 영업비증가율 = 영업비25 !== 0 ? ((영업비26 - 영업비25) / 영업비25) * 100 : 0;
  const 광고비증가율 = 광고비25 !== 0 ? ((광고비26 - 광고비25) / 광고비25) * 100 : 0;
  const 자산증가율 = 자산25 !== 0 ? ((자산26 - 자산25) / 자산25) * 100 : 0;
  const 부채증가율 = 부채25 !== 0 ? ((부채26 - 부채25) / 부채25) * 100 : 0;
  const 자본증가율 = 자본25 !== 0 ? ((자본26 - 자본25) / 자본25) * 100 : 0;
  const 재고증가율 = 재고25 !== 0 ? ((재고26 - 재고25) / 재고25) * 100 : 0;
  const AR증가율 = AR25 !== 0 ? ((AR26 - AR25) / AR25) * 100 : 0;
  const 부채비율25 = 자본25 !== 0 ? (부채25 / 자본25) * 100 : 0;
  const 부채비율26 = 자본26 !== 0 ? (부채26 / 자본26) * 100 : 0;
  const discovery증가율 = discovery25 !== 0 ? ((discovery26 - discovery25) / discovery25) * 100 : 0;
  
  // 당기순이익 (이익잉여금 YoY 차이)
  const 당기순이익26 = 이익잉여금26 - 이익잉여금25;
  
  const ROE26 = 자본26 !== 0 ? (당기순이익26 / 자본26) * 100 : 0;
  const ROA26 = 자산26 !== 0 ? (당기순이익26 / 자산26) * 100 : 0;
  
  const 유동비율25 = 유동부채25 !== 0 ? (유동자산25 / 유동부채25) * 100 : 0;
  const 유동비율26 = 유동부채26 !== 0 ? (유동자산26 / 유동부채26) * 100 : 0;
  
  const 매출총이익률25 = 실판매출25 !== 0 ? (매출총이익25 / 실판매출25) * 100 : 0;
  const 매출총이익률26 = 실판매출26 !== 0 ? (매출총이익26 / 실판매출26) * 100 : 0;
  
  // K 단위로 콤마 포맷팅 (1위안 단위 → K 단위 변환)
  const toKWithComma = (val: number) => {
    return Math.round(val / 1000).toLocaleString('ko-KR');
  };
  
  // M 단위로 변환 (K / 1000) - 재무현황 등에서 사용하지 않으므로 제거 가능하지만 일단 유지
  const toM = (val: number) => Math.round(val / 1000);
  
  return {
    title: 'F&F CHINA 2026 재무 성과 종합 분석 (2026년 기말 기준)',
    baseMonth: 12,
    sections: {
      수익성분석: {
        매출성장: [
          `• Tag매출 25년 ${toKWithComma(tag매출25)}K → 26년 ${toKWithComma(tag매출26)}K (${tag매출증가율 > 0 ? '+' : ''}${tag매출증가율.toFixed(1)}%)`,
          `• 실판매출 ${toKWithComma(실판매출25)}K → ${toKWithComma(실판매출26)}K (${실판매출증가율 > 0 ? '+' : '△'}${Math.abs(실판매출증가율).toFixed(1)}%)`,
          `• 영업이익 ${toKWithComma(영업이익25)}K → ${toKWithComma(영업이익26)}K (${영업이익상태 || `${영업이익증가율 > 0 ? '+' : '△'}${Math.abs(영업이익증가율).toFixed(1)}%`})`,
          `• 영업이익률 ${영업이익률25.toFixed(1)}% → ${영업이익률26.toFixed(1)}% (${(영업이익률26 - 영업이익률25) > 0 ? '+' : '△'}${Math.abs(영업이익률26 - 영업이익률25).toFixed(1)}%p)`
        ],
        비용증가: [
          `• 영업비 ${toKWithComma(영업비25)}K → ${toKWithComma(영업비26)}K (${영업비증가율 >= 0 ? '+' : '△'}${Math.abs(영업비증가율).toFixed(1)}%)`,
          `• 광고비 ${toKWithComma(광고비25)}K → ${toKWithComma(광고비26)}K (${광고비증가율 >= 0 ? '+' : '△'}${Math.abs(광고비증가율).toFixed(0)}%)`
        ]
      },
      재무현황: {
        자산규모: [
          `• 총자산: ${toKWithComma(자산25)}K → ${toKWithComma(자산26)}K (${자산26 - 자산25 >= 0 ? '+' : '△'}${toKWithComma(Math.abs(자산26 - 자산25))}K, ${자산증가율 >= 0 ? '+' : '△'}${Math.abs(자산증가율).toFixed(1)}%)`,
          `• 현금: ${toKWithComma(getValue(bs2025, '현금 및 현금성자산', month))}K → ${toKWithComma(getValue(bs2026, '현금 및 현금성자산', month))}K`
        ],
        부채증가: [
          `• 부채: ${toKWithComma(부채25)}K → ${toKWithComma(부채26)}K (${부채증가율 > 0 ? '+' : '△'}${toKWithComma(Math.abs(부채26 - 부채25))}K, ${부채증가율 > 0 ? '+' : '△'}${Math.abs(부채증가율).toFixed(1)}%)`,
          `• 차입금: ${toKWithComma(차입금25)}K → ${toKWithComma(차입금26)}K`
        ],
        재고자산: [
          `• 재고: ${toKWithComma(재고25)}K → ${toKWithComma(재고26)}K (${재고26 - 재고25 >= 0 ? '+' : '△'}${toKWithComma(Math.abs(재고26 - 재고25))}K, ${재고증가율 >= 0 ? '+' : '△'}${Math.abs(재고증가율).toFixed(1)}%)`,
          `• 외상매출금: ${toKWithComma(AR25)}K → ${toKWithComma(AR26)}K (${AR26 - AR25 >= 0 ? '+' : '△'}${toKWithComma(Math.abs(AR26 - AR25))}K, ${AR증가율 >= 0 ? '+' : '△'}${Math.abs(AR증가율).toFixed(1)}%)`
        ],
        자본안정: [
          `• 총자본: ${toKWithComma(자본25)}K → ${toKWithComma(자본26)}K (${자본26 - 자본25 >= 0 ? '+' : '△'}${toKWithComma(Math.abs(자본26 - 자본25))}K, ${자본증가율 >= 0 ? '+' : '△'}${Math.abs(자본증가율).toFixed(1)}%)`
        ]
      },
      실적분석: {
        주요지표: [
          `• ROE (자기자본순이익률): ${ROE26.toFixed(1)}% (당기순이익 ${toKWithComma(당기순이익26)}K)`,
          `• ROA (총자산순이익률): ${ROA26.toFixed(1)}%`,
          `• 유동비율: ${유동비율25.toFixed(0)}% → ${유동비율26.toFixed(0)}% (${(유동비율26 - 유동비율25) > 0 ? '+' : '△'}${Math.abs(유동비율26 - 유동비율25).toFixed(0)}%p)`,
          `• 매출총이익률: ${매출총이익률25.toFixed(1)}% → ${매출총이익률26.toFixed(1)}% (${(매출총이익률26 - 매출총이익률25) > 0 ? '+' : '△'}${Math.abs(매출총이익률26 - 매출총이익률25).toFixed(1)}%p)`,
          `• 부채비율: ${부채비율25.toFixed(0)}% → ${부채비율26.toFixed(0)}% (${(부채비율26 - 부채비율25) > 0 ? '+' : '△'}${Math.abs(부채비율26 - 부채비율25).toFixed(0)}%p)`
        ],
        부채비율: [
          `• 부채비율: ${부채비율25.toFixed(0)}% → ${부채비율26.toFixed(0)}% (${(부채비율26 - 부채비율25) > 0 ? '+' : '△'}${(부채비율26 - 부채비율25).toFixed(0)}%p)`
        ]
      },
      브랜드포트폴리오: {
        기존브랜드: [
          `• MLB: ${toKWithComma(mlb26)}K (${tag매출26 !== 0 ? ((mlb26 / tag매출26) * 100).toFixed(1) : '0'}%)`,
          `• KIDS: ${toKWithComma(kids26)}K (${tag매출26 !== 0 ? ((kids26 / tag매출26) * 100).toFixed(1) : '0'}%)`
        ],
        신규브랜드: [
          `• Discovery: ${discovery증가율 > 0 ? '+' : ''}${discovery증가율.toFixed(0)}% (${toKWithComma(discovery26)}K)`
        ]
      }
    }
  };
}

export async function GET() {
  try {
    // CSV 파일에서 직접 데이터 읽기 (2025·2026 기말 기준)
    const pl2025Path = path.join(process.cwd(), '파일', 'PL', '2025.csv');
    const pl2026Path = path.join(process.cwd(), '파일', 'PL', '2026.csv');
    const bs2025Path = path.join(process.cwd(), '파일', 'BS', '2025.csv');
    const bs2026Path = path.join(process.cwd(), '파일', 'BS', '2026.csv');
    
    const pl2025Data = await readCSV(pl2025Path, 2025);
    const pl2026Data = await readCSV(pl2026Path, 2026);
    const bs2025Data = await readCSV(bs2025Path, 2025);
    const bs2026Data = await readCSV(bs2026Path, 2026);
    
    const pl2025Rows = calculatePL(pl2025Data);
    const pl2026Rows = calculatePL(pl2026Data);
    const bs2025Rows = calculateBS(bs2025Data);
    const bs2026Rows = calculateBS(bs2026Data);
    
    const summary = generateSummary(pl2025Rows, pl2026Rows, bs2025Rows, bs2026Rows);
    
    return NextResponse.json(summary);
  } catch (error) {
    console.error('경영요약 API 에러:', error);
    return NextResponse.json(
      { error: '경영요약 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
