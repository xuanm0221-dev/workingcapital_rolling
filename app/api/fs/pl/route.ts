import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { readCSV } from '@/lib/csv';
import { calculatePL, calculateComparisonData } from '@/lib/fs-mapping';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const baseMonthParam = searchParams.get('baseMonth');
    const year = yearParam ? parseInt(yearParam, 10) : 2024;
    const baseMonth = baseMonthParam ? parseInt(baseMonthParam, 10) : 11;
    
    if (![2024, 2025].includes(year)) {
      return NextResponse.json(
        { error: '유효하지 않은 연도입니다. 2024 또는 2025를 선택하세요.' },
        { status: 400 }
      );
    }
    
    if (baseMonth < 1 || baseMonth > 12) {
      return NextResponse.json(
        { error: '기준월은 1~12 사이여야 합니다.' },
        { status: 400 }
      );
    }
    
    const filePath = path.join(process.cwd(), 'PL', `${year}.csv`);
    const data = await readCSV(filePath, year);
    let tableRows = calculatePL(data);
    
    // 2025년인 경우 비교 데이터 추가
    if (year === 2025) {
      const filePath2024 = path.join(process.cwd(), 'PL', '2024.csv');
      const data2024 = await readCSV(filePath2024, 2024);
      const rows2024 = calculatePL(data2024);
      tableRows = calculateComparisonData(tableRows, rows2024, baseMonth);
    }
    
    return NextResponse.json({
      year,
      type: 'PL',
      baseMonth: year === 2025 ? baseMonth : undefined,
      rows: tableRows,
    });
  } catch (error) {
    console.error('PL API 에러:', error);
    return NextResponse.json(
      { error: 'PL 데이터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

