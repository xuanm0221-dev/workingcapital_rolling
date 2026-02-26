import { NextRequest, NextResponse } from 'next/server';
import { fetchOtbData, OtbData } from '@/lib/otb-db';

export const runtime = 'nodejs';

export interface OtbResponse {
  year: number;
  data: OtbData;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year') ?? '2026');

  if (year !== 2026) {
    return NextResponse.json({ year, data: null });
  }

  try {
    const data = await fetchOtbData();
    return NextResponse.json({ year, data } satisfies OtbResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[OTB API] error:', message);
    return NextResponse.json(
      { error: `대리상 OTB 조회 오류: ${message}` },
      { status: 500 },
    );
  }
}
