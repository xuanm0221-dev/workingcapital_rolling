import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readCSV } from '@/lib/csv';
import { calculateBS, calculateComparisonDataBS, calculateWorkingCapital } from '@/lib/fs-mapping';
import { TableRow } from '@/lib/types';

// 운전자본 비고 자동 생성 함수
function generateWCRemarks(
  currentBSData: TableRow[], 
  previousBSData: TableRow[],
  currentYear: number
): { [key: string]: string } {
  
  // 비교 월 결정
  const currentMonth = currentYear === 2026 ? 5 : 11; // 6월(index 5) 또는 12월(index 11)
  const previousMonth = 11; // 항상 전년 12월
  
  // 계정 값 가져오기
  const getValue = (data: TableRow[], account: string, month: number) => {
    const row = data.find(r => r.account === account);
    return row?.values[month] || 0;
  };
  
  // 변동 계산 및 포맷팅
  const formatChange = (label: string, current: number, previous: number) => {
    const diff = current - previous;
    const diffK = Math.round(diff / 1000); // K 단위로 반올림
    
    if (Math.abs(diffK) < 1) return null; // 1K 미만은 무시
    
    const sign = diffK > 0 ? '+' : '△';
    const absValue = Math.abs(diffK);
    return `${label} ${sign}${absValue}m`;
  };
  
  const remarks: { [key: string]: string } = {};
  const yearLabel = currentYear === 2026 ? '26.6월 vs 25.12월' : '25.12월 vs 24.12월';
  
  // 1. 운전자본
  const wcAccounts = [
    { key: '직영AR', label: 'AR' },
    { key: '대리상AR', label: 'AR' },
    { key: '재고자산', label: '재고' },
    { key: '본사선급금', label: 'AP' }, // 캡처에서 AP로 표시됨
    { key: '본사 AP', label: 'AP' },
    { key: '제품 AP', label: 'AP' }
  ];
  
  const wcChanges: string[] = [];
  wcAccounts.forEach(({ key, label }) => {
    const curr = getValue(currentBSData, key, currentMonth);
    const prev = getValue(previousBSData, key, previousMonth);
    const change = formatChange(label, curr, prev);
    if (change) wcChanges.push(change);
  });
  
  if (wcChanges.length > 0) {
    remarks['운전자본'] = `${yearLabel}: ${wcChanges.join(', ')}`;
  }
  
  // 2. from대리상
  const fromDealerChanges: string[] = [];
  [
    { key: '대리상선수금', label: '선수금' },
    { key: '대리상지원금', label: '지원금' }
  ].forEach(({ key, label }) => {
    const curr = getValue(currentBSData, key, currentMonth);
    const prev = getValue(previousBSData, key, previousMonth);
    const change = formatChange(label, curr, prev);
    if (change) fromDealerChanges.push(change);
  });
  
  if (fromDealerChanges.length > 0) {
    remarks['from대리상'] = fromDealerChanges.join(', ');
  }
  
  // 3. from 현금/차입금
  const fromCashChanges: string[] = [];
  [
    { key: '현금 및 현금성자산', label: '현금' },
    { key: '차입금', label: '차입금' }
  ].forEach(({ key, label }) => {
    const curr = getValue(currentBSData, key, currentMonth);
    const prev = getValue(previousBSData, key, previousMonth);
    const change = formatChange(label, curr, prev);
    if (change) fromCashChanges.push(change);
  });
  
  if (fromCashChanges.length > 0) {
    remarks['from 현금/차입금'] = fromCashChanges.join(', ');
  }
  
  // 4. from 이익창출
  const 이익잉여금Curr = getValue(currentBSData, '이익잉여금', currentMonth);
  const 이익잉여금Prev = getValue(previousBSData, '이익잉여금', previousMonth);
  const 이익잉여금Change = formatChange('이연잉여금', 이익잉여금Curr, 이익잉여금Prev);
  if (이익잉여금Change) {
    remarks['from 이익창출'] = 이익잉여금Change;
  }
  
  // 5. 기타운전자본
  const otherChanges: string[] = [];
  [
    { key: '선급금(기타)', label: '선급' },
    { key: '이연법인세자산', label: '선급' },
    { key: '유,무형자산', label: '고정자산' },
    { key: '장기보증금', label: '고정자산' },
    { key: '기타 유동자산', label: '미수금' },
    { key: '기타 유동부채', label: '미지급금' }
  ].forEach(({ key, label }) => {
    const curr = getValue(currentBSData, key, currentMonth);
    const prev = getValue(previousBSData, key, previousMonth);
    const change = formatChange(label, curr, prev);
    if (change) otherChanges.push(change);
  });
  
  if (otherChanges.length > 0) {
    remarks['기타운전자본'] = otherChanges.join(', ');
  }
  
  // 6. 리스관련
  const leaseChanges: string[] = [];
  [
    { key: '사용권자산', label: '사용권자산' },
    { key: '리스부채(장,단기)', label: '리스부채' }
  ].forEach(({ key, label }) => {
    const curr = getValue(currentBSData, key, currentMonth);
    const prev = getValue(previousBSData, key, previousMonth);
    const change = formatChange(label, curr, prev);
    if (change) leaseChanges.push(change);
  });
  
  if (leaseChanges.length > 0) {
    remarks['리스관련'] = leaseChanges.join(', ');
  } else {
    remarks['리스관련'] = '사용권 변동 없음, 리스부채 변동 없음';
  }
  
  return remarks;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : 2024;
    
    if (![2024, 2025, 2026].includes(year)) {
      return NextResponse.json(
        { error: '유효하지 않은 연도입니다. 2024, 2025 또는 2026을 선택하세요.' },
        { status: 400 }
      );
    }
    
    const filePath = path.join(process.cwd(), 'BS', `${year}.csv`);
    const data = await readCSV(filePath, year);
    let tableRows = calculateBS(data);
    let workingCapitalRows = calculateWorkingCapital(data);
    let wcRemarksAuto: { [key: string]: string } | null = null;
    
    // 2025년 또는 2026년인 경우 전년 데이터와 비교
    if (year === 2025 || year === 2026) {
      const prevYear = year - 1;
      const prevFilePath = path.join(process.cwd(), 'BS', `${prevYear}.csv`);
      const prevData = await readCSV(prevFilePath, prevYear);
      const prevTableRows = calculateBS(prevData);
      const prevWorkingCapitalRows = calculateWorkingCapital(prevData);
      
      tableRows = calculateComparisonDataBS(tableRows, prevTableRows, year);
      workingCapitalRows = calculateComparisonDataBS(workingCapitalRows, prevWorkingCapitalRows, year);
      
      // 운전자본 비고 자동 생성 (BS 데이터 기반)
      wcRemarksAuto = generateWCRemarks(tableRows, prevTableRows, year);
    }
    
    return NextResponse.json({
      year,
      type: 'BS',
      rows: tableRows,
      workingCapital: workingCapitalRows,
      wcRemarksAuto: wcRemarksAuto,
    });
  } catch (error) {
    console.error('BS API 에러:', error);
    return NextResponse.json(
      { error: 'BS 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

