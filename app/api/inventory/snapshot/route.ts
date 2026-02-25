import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const keyOf = (year: number, brand: string) => `inv_snapshot_${year}_${brand}`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year'));
    const brand = (searchParams.get('brand') ?? '').trim();
    if (!Number.isFinite(year) || !brand) {
      return NextResponse.json({ error: 'Invalid year/brand' }, { status: 400 });
    }
    const data = await kv.get(keyOf(year, brand));
    return NextResponse.json({ data: data ?? null });
  } catch (error) {
    console.error('inventory snapshot GET error:', error);
    return NextResponse.json({ data: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      year?: number;
      brand?: string;
      data?: unknown;
    };
    const year = Number(body.year);
    const brand = (body.brand ?? '').trim();
    if (!Number.isFinite(year) || !brand) {
      return NextResponse.json({ error: 'Invalid year/brand' }, { status: 400 });
    }
    await kv.set(keyOf(year, brand), body.data ?? null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('inventory snapshot POST error:', error);
    return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 });
  }
}

