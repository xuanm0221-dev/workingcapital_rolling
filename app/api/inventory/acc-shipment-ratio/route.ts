import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export const runtime = 'nodejs';

type AccBrand = 'MLB' | 'MLB KIDS' | 'DISCOVERY';

interface AccShipmentRatioRow {
  brand: AccBrand;
  monthly: (number | null)[];
}

function toNullableNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBrand(raw: string): AccBrand | null {
  const v = raw.trim().toUpperCase();
  if (v === 'MLB') return 'MLB';
  if (v === 'MLB KIDS') return 'MLB KIDS';
  if (v === 'DISCOVERY' || v === 'DX') return 'DISCOVERY';
  return null;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '보조파일(simu)', 'ACC출고비율.csv');
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
    });

    const rows: AccShipmentRatioRow[] = [];
    for (const row of parsed.data) {
      const firstKey = Object.keys(row)[0] ?? '';
      const brandRaw = row[firstKey] ?? '';
      const brand = normalizeBrand(brandRaw);
      if (!brand) continue;
      const monthly = Array.from({ length: 12 }, (_, idx) => toNullableNumber(row[`${idx + 1}월`]));
      rows.push({ brand, monthly });
    }

    return NextResponse.json(
      {
        rows,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `ACC출고비율 조회 오류: ${message}` }, { status: 500 });
  }
}

