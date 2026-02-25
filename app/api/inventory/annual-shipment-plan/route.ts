import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

const keyOf = (year: number) => `inv_annual_shipment_plan_${year}`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') ?? '2026');
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    const data = await kv.get(keyOf(year));
    return NextResponse.json({ data: data ?? null });
  } catch (error) {
    console.error('annual shipment plan GET error:', error);
    return NextResponse.json({ data: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      year?: number;
      data?: unknown;
    };
    const year = Number(body.year ?? 2026);
    if (!Number.isFinite(year)) {
      return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
    }
    await kv.set(keyOf(year), body.data ?? null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('annual shipment plan POST error:', error);
    return NextResponse.json({ error: 'Failed to save annual shipment plan' }, { status: 500 });
  }
}

