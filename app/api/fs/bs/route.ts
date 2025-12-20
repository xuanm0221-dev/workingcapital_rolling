import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readCSV } from '@/lib/csv';
import { calculateBS, calculateComparisonDataBS, calculateWorkingCapital } from '@/lib/fs-mapping';

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
    
    // 2025년 또는 2026년인 경우 전년 데이터와 비교
    if (year === 2025 || year === 2026) {
      const prevYear = year - 1;
      const prevFilePath = path.join(process.cwd(), 'BS', `${prevYear}.csv`);
      const prevData = await readCSV(prevFilePath, prevYear);
      const prevTableRows = calculateBS(prevData);
      const prevWorkingCapitalRows = calculateWorkingCapital(prevData);
      
      tableRows = calculateComparisonDataBS(tableRows, prevTableRows, year);
      workingCapitalRows = calculateComparisonDataBS(workingCapitalRows, prevWorkingCapitalRows, year);
    }
    
    return NextResponse.json({
      year,
      type: 'BS',
      rows: tableRows,
      workingCapital: workingCapitalRows,
    });
  } catch (error) {
    console.error('BS API 에러:', error);
    return NextResponse.json(
      { error: 'BS 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

