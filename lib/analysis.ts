import { TableRow } from './types';
import { formatNumber, formatMillionYuan } from './utils';

// ==================== 월별 추세 분석 ====================

interface MonthlyTrend {
  pattern: 'increasing' | 'decreasing' | 'volatile' | 'stable';
  peakMonth: number | null;
  valleyMonth: number | null;
  h1Total: number;
  h2Total: number;
  concentration: number; // 특정 분기 집중도 (0~1)
  volatility: number; // 변동성
}

export function analyzeMonthlyTrend(values: (number | null)[]): MonthlyTrend {
  if (values.length < 12) {
    return {
      pattern: 'stable',
      peakMonth: null,
      valleyMonth: null,
      h1Total: 0,
      h2Total: 0,
      concentration: 0,
      volatility: 0,
    };
  }

  // null 값을 0으로 변환
  const monthlyValues = values.slice(0, 12).map(v => v ?? 0);
  
  // 상반기/하반기 합계
  const h1Total = monthlyValues.slice(0, 6).reduce((sum, v) => sum + v, 0);
  const h2Total = monthlyValues.slice(6, 12).reduce((sum, v) => sum + v, 0);
  
  // 피크/밸리
  const maxValue = Math.max(...monthlyValues.map(Math.abs));
  const minValue = Math.min(...monthlyValues.map(Math.abs));
  const peakMonth = monthlyValues.findIndex(v => Math.abs(v) === maxValue) + 1;
  const valleyMonth = monthlyValues.findIndex(v => Math.abs(v) === minValue) + 1;
  
  // 변동성 (표준편차 / 평균의 절댓값)
  const mean = monthlyValues.reduce((sum, v) => sum + v, 0) / 12;
  const variance = monthlyValues.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / 12;
  const stdDev = Math.sqrt(variance);
  const volatility = mean !== 0 ? Math.abs(stdDev / mean) : 0;
  
  // 분기별 집중도 (최대 분기 비중)
  const q1 = monthlyValues.slice(0, 3).reduce((sum, v) => sum + Math.abs(v), 0);
  const q2 = monthlyValues.slice(3, 6).reduce((sum, v) => sum + Math.abs(v), 0);
  const q3 = monthlyValues.slice(6, 9).reduce((sum, v) => sum + Math.abs(v), 0);
  const q4 = monthlyValues.slice(9, 12).reduce((sum, v) => sum + Math.abs(v), 0);
  const totalAbs = q1 + q2 + q3 + q4;
  const maxQuarter = Math.max(q1, q2, q3, q4);
  const concentration = totalAbs > 0 ? maxQuarter / totalAbs : 0;
  
  // 패턴 분류
  let pattern: MonthlyTrend['pattern'] = 'stable';
  
  if (volatility > 0.5) {
    pattern = 'volatile';
  } else {
    // 선형 회귀 기울기 계산
    const xMean = 6.5; // 1~12의 평균
    const covariance = monthlyValues.reduce((sum, v, i) => sum + (i + 1 - xMean) * (v - mean), 0) / 12;
    const xVariance = monthlyValues.reduce((sum, _, i) => sum + Math.pow(i + 1 - xMean, 2), 0) / 12;
    const slope = xVariance !== 0 ? covariance / xVariance : 0;
    
    if (slope > mean * 0.05) {
      pattern = 'increasing';
    } else if (slope < -mean * 0.05) {
      pattern = 'decreasing';
    }
  }
  
  return {
    pattern,
    peakMonth,
    valleyMonth,
    h1Total,
    h2Total,
    concentration,
    volatility,
  };
}

// ==================== 구조적 개선 판단 ====================

interface StructuralAssessment {
  isStructural: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export function assessStructuralChange(
  currentYearValues: (number | null)[],
  prevYearTotal: number | null,
  currentYearTotal: number
): StructuralAssessment {
  const trend = analyzeMonthlyTrend(currentYearValues);
  
  if (prevYearTotal === null) {
    return {
      isStructural: false,
      confidence: 'low',
      reason: '전년 데이터 없음',
    };
  }
  
  // 개선/악화 방향 (현금흐름 관점: 양수가 개선)
  const yoyChange = currentYearTotal - prevYearTotal;
  const isImprovement = yoyChange > 0;
  
  // 구조적 판단 기준
  const isLowVolatility = trend.volatility < 0.4;
  const isBalanced = Math.abs(trend.h1Total - trend.h2Total) < Math.abs(currentYearTotal) * 0.3;
  const isNotConcentrated = trend.concentration < 0.4;
  
  let isStructural = false;
  let confidence: 'high' | 'medium' | 'low' = 'low';
  let reason = '';
  
  if (isLowVolatility && isBalanced && isNotConcentrated) {
    isStructural = true;
    confidence = 'high';
    reason = '연중 점진적이고 균등한 변화';
  } else if ((isLowVolatility && isBalanced) || (isLowVolatility && isNotConcentrated)) {
    isStructural = true;
    confidence = 'medium';
    reason = '비교적 안정적인 추세';
  } else if (trend.concentration > 0.5) {
    isStructural = false;
    confidence = 'high';
    reason = `특정 분기에 ${Math.round(trend.concentration * 100)}% 집중`;
  } else if (trend.volatility > 0.6) {
    isStructural = false;
    confidence = 'medium';
    reason = '월별 변동성이 높아 지속성 불확실';
  } else {
    isStructural = false;
    confidence = 'low';
    reason = '명확한 추세 없음';
  }
  
  return { isStructural, confidence, reason };
}

// ==================== 대분류 데이터 추출 ====================

interface CategoryData {
  account: string;
  monthlyValues: (number | null)[];
  annualTotal: number;
  yoyAbsolute: number | null;
  yoyPercent: number | null;
  prevYearTotal: number | null;
  year2023Total: number | null;
}

export function extractTopLevelData(data: TableRow[] | null): CategoryData[] {
  if (!data) return [];
  
  return data
    .filter(row => row.level === 0 && row.values && row.values.length >= 13)
    .map(row => {
      const monthlyValues = row.values.slice(0, 12);
      const annualTotal = row.values[12] ?? 0;
      const yoyAbsolute = row.values[13] ?? null;
      const prevYearTotal = row.year2024Value ?? null;
      const year2023Total = (row as any).year2023Value ?? null;
      
      let yoyPercent: number | null = null;
      if (prevYearTotal !== null && prevYearTotal !== 0) {
        yoyPercent = ((annualTotal - prevYearTotal) / Math.abs(prevYearTotal)) * 100;
      }
      
      return {
        account: row.account,
        monthlyValues,
        annualTotal,
        yoyAbsolute,
        yoyPercent,
        prevYearTotal,
        year2023Total,
      };
    });
}

// ==================== 현금흐름표 분석 ====================

export function analyzeCashFlowData(
  workingCapitalData: TableRow[] | null,
  year: number
): {
  categories: CategoryData[];
  summary: string[];
} {
  const categories = extractTopLevelData(workingCapitalData);
  const summary: string[] = [];
  
  if (categories.length === 0) {
    return { categories, summary: ['데이터가 충분하지 않습니다.'] };
  }
  
  // 영업활동 찾기
  const operations = categories.find(c => c.account === '영업활동');
  if (operations) {
    const trend = analyzeMonthlyTrend(operations.monthlyValues);
    const assessment = assessStructuralChange(
      operations.monthlyValues,
      operations.prevYearTotal,
      operations.annualTotal
    );
    
    if (operations.yoyAbsolute !== null) {
      const direction = operations.yoyAbsolute > 0 ? '개선' : '악화';
      const trendDesc = trend.pattern === 'stable' ? '안정적' : 
        trend.pattern === 'increasing' ? '점진적 개선' :
        trend.pattern === 'decreasing' ? '점진적 악화' : '변동성 높음';
      
      summary.push(
        `${year}년 영업활동 현금흐름은 전년 대비 ${formatMillionYuan(Math.abs(operations.yoyAbsolute))} ${direction}되었으며, ` +
        `${trendDesc} 추세를 보임. ${assessment.isStructural ? '구조적 변화로 판단' : '일시적 효과 가능성'} (${assessment.reason}).`
      );
    }
  }
  
  return { categories, summary };
}

// ==================== 운전자본표 분석 ====================

export function analyzeWorkingCapitalData(
  wcStatementData: TableRow[] | null,
  year: number
): {
  categories: CategoryData[];
  summary: string[];
  arInsight: string;
  inventoryInsight: string;
  apInsight: string;
} {
  const categories = extractTopLevelData(wcStatementData);
  const summary: string[] = [];
  
  if (categories.length === 0) {
    return {
      categories,
      summary: ['데이터가 충분하지 않습니다.'],
      arInsight: '',
      inventoryInsight: '',
      apInsight: '',
    };
  }
  
  const ar = categories.find(c => c.account === '매출채권');
  const inventory = categories.find(c => c.account === '재고자산');
  const ap = categories.find(c => c.account === '매입채무');
  
  // 매출채권 인사이트
  let arInsight = '';
  if (ar) {
    const trend = analyzeMonthlyTrend(ar.monthlyValues);
    const change = ar.yoyAbsolute ?? 0;
    
    if (change < 0) {
      arInsight = `매출채권이 전년 대비 ${formatMillionYuan(Math.abs(change))} 감소하여 현금 유입에 기여. `;
      if (trend.concentration > 0.45) {
        arInsight += `${trend.peakMonth}월에 집중 회수되어 일회성 효과 가능성 존재.`;
      } else {
        arInsight += `연중 ${trend.pattern === 'stable' ? '균등하게' : '점진적으로'} 개선되어 구조적 변화로 판단.`;
      }
    } else {
      arInsight = `매출채권이 ${formatMillionYuan(change)} 증가하여 현금 유출 요인으로 작용.`;
    }
  }
  
  // 재고자산 인사이트
  let inventoryInsight = '';
  if (inventory) {
    const trend = analyzeMonthlyTrend(inventory.monthlyValues);
    const change = inventory.yoyAbsolute ?? 0;
    
    if (change < 0) {
      inventoryInsight = `재고자산이 ${formatMillionYuan(Math.abs(change))} 감소하여 현금 유입 기여. `;
      
      // 하반기 집중 감소인지 확인
      if (Math.abs(trend.h2Total) > Math.abs(trend.h1Total) * 1.5) {
        inventoryInsight += `하반기에 집중 축소되어 관리 조정 효과로 판단. 향후 매출 대응 재고 확보 필요.`;
      } else {
        inventoryInsight += `연중 균등 감소하여 보수적 재고 운영 정책으로 판단.`;
      }
    } else {
      inventoryInsight = `재고자산이 ${formatMillionYuan(change)} 증가하여 현금 유출.`;
    }
  }
  
  // 매입채무 인사이트
  let apInsight = '';
  if (ap) {
    const trend = analyzeMonthlyTrend(ap.monthlyValues);
    const change = ap.yoyAbsolute ?? 0;
    
    if (change < 0) {
      apInsight = `매입채무가 ${formatMillionYuan(Math.abs(change))} 감소하여 현금 유출 요인. `;
      apInsight += `구매 규모 축소 또는 지급조건 변화 가능성.`;
    } else {
      apInsight = `매입채무가 ${formatMillionYuan(change)} 증가하여 현금 유입에 기여. `;
      if (trend.volatility > 0.5) {
        apInsight += `월별 변동성이 높아 단기 타이밍 효과로 판단.`;
      } else {
        apInsight += `지급조건 개선으로 현금흐름 관리에 긍정적.`;
      }
    }
  }
  
  // 전체 운전자본 요약
  const totalWCChange = categories.reduce((sum, c) => {
    // 운전자본 = AR + 재고 - AP (증가=현금 유출, 감소=현금 유입)
    if (c.account === '매출채권' || c.account === '재고자산') {
      return sum + (c.yoyAbsolute ?? 0);
    } else if (c.account === '매입채무') {
      return sum - (c.yoyAbsolute ?? 0);
    }
    return sum;
  }, 0);
  
  if (totalWCChange < 0) {
    summary.push(
      `${year}년 운전자본은 전년 대비 ${formatMillionYuan(Math.abs(totalWCChange))} 감소하여 ` +
      `영업현금흐름 개선에 기여. `
    );
  } else {
    summary.push(
      `${year}년 운전자본이 ${formatMillionYuan(totalWCChange)} 증가하여 현금 유출 요인으로 작용.`
    );
  }
  
  return {
    categories,
    summary,
    arInsight,
    inventoryInsight,
    apInsight,
  };
}

// ==================== 종합 인사이트 생성 ====================

export function generateCashFlowInsights(
  workingCapitalData: TableRow[] | null,
  wcStatementData: TableRow[] | null,
  year: number
): {
  keyInsights: string[];
  riskFactors: string[];
  actionItems: string[];
} {
  const cfAnalysis = analyzeCashFlowData(workingCapitalData, year);
  const wcAnalysis = analyzeWorkingCapitalData(wcStatementData, year);
  
  const keyInsights: string[] = [];
  const riskFactors: string[] = [];
  const actionItems: string[] = [];
  
  // 핵심 인사이트: 영업활동 + 다년 추세 + 26년 전망
  const operations = cfAnalysis.categories.find(c => c.account === '영업활동');
  if (operations && operations.yoyAbsolute !== null) {
    if (operations.yoyAbsolute > 0) {
      keyInsights.push(
        `✓ 영업활동 현금흐름 ${year}년 ${formatMillionYuan(operations.annualTotal)}으로 ` +
        `전년 대비 ${formatMillionYuan(Math.abs(operations.yoyAbsolute))}(${operations.yoyPercent?.toFixed(1)}%) 증가. ` +
        `영업활동 증가는 긍정적 신호로, 운전자본 효율화가 주요 개선 요인.`
      );
    } else {
      keyInsights.push(
        `영업현금흐름이 전년 대비 ${formatMillionYuan(Math.abs(operations.yoyAbsolute))} 악화. ` +
        `운전자본 증가 및 비용 구조 변화 영향.`
      );
    }
    
    // 다년 추세 (2023~2025) 및 2026년 전망
    if (operations.year2023Total !== null && operations.prevYearTotal !== null) {
      const val2023 = operations.year2023Total;
      const val2024 = operations.prevYearTotal;
      const val2025 = operations.annualTotal;
      
      // 2년 CAGR 계산 (2023→2025)
      const years = 2;
      const cagr = ((Math.pow(val2025 / Math.abs(val2023), 1 / years) - 1) * 100);
      
      if (cagr > 5) {
        const forecast2026 = val2025 * (1 + cagr / 100);
        keyInsights.push(
          `2023~2025년 영업활동 연평균 ${cagr.toFixed(1)}% 개선 추세 지속 중. ` +
          `동일 추세 가정 시 2026년 ${formatMillionYuan(forecast2026)} 수준 기대.`
        );
      } else if (cagr < -5) {
        keyInsights.push(
          `2023~2025년 영업활동 연평균 ${Math.abs(cagr).toFixed(1)}% 악화 추세. ` +
          `2026년 구조적 개선 조치 필요.`
        );
      } else {
        keyInsights.push(
          `2023~2025년 영업활동 수준 유사(연평균 ${cagr.toFixed(1)}%). ` +
          `2026년 변동성 낮은 안정적 운영 예상.`
        );
      }
    }
  }
  
  // 차입금 분석
  const debt = cfAnalysis.categories.find(c => c.account === '차입금');
  if (debt && debt.yoyAbsolute !== null && debt.yoyAbsolute < 0) {
    keyInsights.push(
      `✓ ${year}년 차입금 순 상환 ${formatMillionYuan(Math.abs(debt.yoyAbsolute))}으로 재무 레버리지 감소. ` +
      `영업현금 개선이 차입금 상환 여력을 제공하며 재무 건전성 개선 중.`
    );
  }
  
  // 운전자본 기여도 + 연쇄 영향 분석
  const ar = wcAnalysis.categories.find(c => c.account === '매출채권');
  const inventory = wcAnalysis.categories.find(c => c.account === '재고자산');
  const ap = wcAnalysis.categories.find(c => c.account === '매입채무');
  
  // 운전자본 총액 추이 분석 (재고 + AR - AP)
  if (ar && inventory && ap) {
    const wcTotal2026 = (inventory.annualTotal ?? 0) + (ar.annualTotal ?? 0) - Math.abs(ap.annualTotal ?? 0);
    const wcTotal2025 = (inventory.prevYearTotal ?? 0) + (ar.prevYearTotal ?? 0) - Math.abs(ap.prevYearTotal ?? 0);
    const wcTotal2023 = (inventory.year2023Total ?? 0) + (ar.year2023Total ?? 0) - Math.abs(ap.year2023Total ?? 0);
    
    if (wcTotal2023 !== 0 && wcTotal2025 !== 0 && wcTotal2026 < wcTotal2025) {
      keyInsights.push(
        `✓ 운전자본 총액은 2023년 ${formatMillionYuan(wcTotal2023)} → ${year}년 ${formatMillionYuan(wcTotal2026)}으로 구조적 축소 중. ` +
        `매출 규모 대비 운전자본 부담 경감으로 단기 자금 소요 압력 완화.`
      );
    }
  }
  
  if (ar || inventory || ap) {
    const details: string[] = [];
    
    // 재고자산 감소 (강화된 해석)
    if (inventory && inventory.yoyAbsolute && inventory.yoyAbsolute < 0) {
      details.push(
        `재고자산 ${formatMillionYuan(Math.abs(inventory.yoyAbsolute))} 감소 → 회전율 개선, SKU/시즌 관리 효율화 가능성. ` +
        `현금 전환 가속 및 향후 평가손/처분손 리스크 축소`
      );
    }
    
    // 매출채권 감소 (강화된 해석 - 매출 질 개선)
    if (ar && ar.yoyAbsolute && ar.yoyAbsolute < 0) {
      details.push(
        `매출채권 ${formatMillionYuan(Math.abs(ar.yoyAbsolute))} 감소 → 신용 관리 강화, 매출 '질' 개선 관점에서 긍정적. ` +
        `할인·프로모션 중심 확대가 아닌 건전한 매출 구조로 전환`
      );
    }
    
    // 매입채무 감소 (질적 개선 관점 추가)
    if (ap && ap.yoyAbsolute && ap.yoyAbsolute < 0) {
      if (operations && operations.yoyAbsolute && operations.yoyAbsolute > 0) {
        // 매입채무 감소에도 영업현금흐름이 개선된 경우 -> 질적 개선
        details.push(
          `매입채무 ${formatMillionYuan(Math.abs(ap.yoyAbsolute))} 감소에도 불구하고 영업현금흐름 개선 → 질적 개선의 증거. ` +
          `영업 규모 조정에 따른 정상화로 부정 신호 아님`
        );
      } else {
        details.push(
          `매입채무 ${formatMillionYuan(Math.abs(ap.yoyAbsolute))} 감소 → 대부분 본사 매입채무 감소로, 매출 감소에 따른 원재료 구매 축소 영향`
        );
      }
    }
    
    if (details.length > 0) {
      keyInsights.push(
        `운전자본 변화: ` + details.join(' / ')
      );
    }
    
    // 연쇄 영향 로직 (질적 개선 관점 강화)
    if (ap && ap.yoyAbsolute && ap.yoyAbsolute < 0 && operations && operations.yoyAbsolute && operations.yoyAbsolute > 0) {
      keyInsights.push(
        `연쇄 효과: 매출 감소 → 매입채무 감소 → 운전자본 개선 → 영업활동 현금흐름 증가 → 차입금 상환 가능. ` +
        `운영 규모 축소가 아닌 운전자본 구조 정상화에 기반한 질적 개선으로 해석됨. 중장기 성장 동력 확보 필요.`
      );
    }
  }
  
  // Net Cash 인사이트 추가
  const netCash = cfAnalysis.categories.find(c => c.account === 'net cash');
  if (netCash && netCash.prevYearTotal !== null) {
    if (netCash.annualTotal > 0 && netCash.prevYearTotal < 0) {
      // 플러스 전환
      keyInsights.push(
        `✓ Net Cash가 ${formatMillionYuan(netCash.prevYearTotal)}에서 ${formatMillionYuan(netCash.annualTotal)}으로 플러스 전환. ` +
        `금액은 작지만 지속 가능한 현금창출 구조로의 전환 출발점으로 해석됨.`
      );
    } else if (netCash.annualTotal > 0 && netCash.prevYearTotal > 0) {
      // 플러스 유지
      const netCashImprovement = netCash.annualTotal - netCash.prevYearTotal;
      if (netCashImprovement > 0) {
        keyInsights.push(
          `Net Cash ${formatMillionYuan(netCash.annualTotal)}로 플러스 유지. 실질적 현금 체력 ${formatMillionYuan(netCashImprovement)} 개선.`
        );
      }
    }
  }
  
  // 지속가능성 평가
  if (operations) {
    const assessment = assessStructuralChange(
      operations.monthlyValues,
      operations.prevYearTotal,
      operations.annualTotal
    );
    
    if (assessment.isStructural && assessment.confidence === 'high') {
      keyInsights.push(
        `현재 현금흐름 개선은 구조적 변화로 판단되며, ${year + 1}년 지속 가능성 높음. ` +
        `연중 균등한 개선 추세 확인.`
      );
    } else if (!assessment.isStructural) {
      keyInsights.push(
        `현금흐름 개선의 일부는 일시적 효과 가능성 존재. ` +
        `${assessment.reason}로 ${year + 1}년 지속 여부 모니터링 필요.`
      );
    }
  }
  
  // 리스크 요인
  if (inventory && inventory.yoyAbsolute && inventory.yoyAbsolute < 0) {
    const trend = analyzeMonthlyTrend(inventory.monthlyValues);
    if (Math.abs(trend.h2Total) > Math.abs(trend.h1Total) * 1.5) {
      riskFactors.push(
        `재고 급격한 축소(하반기 집중)로 인한 향후 매출 대응력 저하 리스크 존재.`
      );
    }
  }
  
  if (ar && ar.yoyAbsolute && ar.yoyAbsolute < 0) {
    const trend = analyzeMonthlyTrend(ar.monthlyValues);
    if (trend.concentration > 0.45) {
      riskFactors.push(
        `매출채권 회수가 특정 월에 집중되어 ${year + 1}년 동일 효과 재현 불확실.`
      );
    }
  }
  
  if (operations && operations.yoyAbsolute && operations.yoyAbsolute < 0) {
    riskFactors.push(
      `영업현금흐름 악화 지속 시 단기 유동성 압박 가능성.`
    );
  }
  
  // 관리 포인트
  actionItems.push(
    `월별 운전자본 변동성 모니터링 강화: 특정 월 집중 효과 vs 구조적 개선 구분.`
  );
  
  if (inventory && inventory.yoyAbsolute && inventory.yoyAbsolute < 0) {
    actionItems.push(
      `재고 수준 적정성 검토: 현금 개선과 매출 대응력 균형 유지.`
    );
  }
  
  if (ar && ar.yoyAbsolute) {
    actionItems.push(
      `매출채권 회수 정책 점검: 회수조건 변화가 매출에 미치는 영향 평가.`
    );
  }
  
  return { keyInsights, riskFactors, actionItems };
}
