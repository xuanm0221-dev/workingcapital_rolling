'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Brand, InventoryApiResponse, InventoryTableData, InventoryRowRaw, AccKey, ACC_KEYS, SEASON_KEYS, RowKey } from '@/lib/inventory-types';
import { MonthlyStockResponse } from '@/lib/inventory-monthly-types';
import { RetailSalesResponse } from '@/lib/retail-sales-types';
import type { ShipmentSalesResponse } from '@/app/api/inventory/shipment-sales/route';
import type { PurchaseResponse } from '@/app/api/inventory/purchase/route';
import { buildTableDataFromMonthly } from '@/lib/build-inventory-from-monthly';
import { buildTableData, applyAccTargetWoiOverlay, applyHqSellInSellOutPlanOverlay } from '@/lib/inventory-calc';
import {
  saveSnapshot,
  loadSnapshot,
  type SnapshotData,
} from '@/lib/inventory-snapshot';
import { stripPlanMonths, applyPlanToSnapshot, PLAN_FROM_MONTH } from '@/lib/retail-plan';
import {
  BRANDS_TO_AGGREGATE,
  aggregateMonthlyStock,
  aggregateRetailSales,
  aggregateShipmentSales,
  aggregatePurchase,
} from '@/lib/aggregate-inventory-by-brand';
import InventoryFilterBar from './InventoryFilterBar';
import InventoryTable from './InventoryTable';
import InventoryMonthlyTable, { TableData } from './InventoryMonthlyTable';

type LeafBrand = Exclude<Brand, '전체'>;
type TopTablePair = { dealer: InventoryTableData; hq: InventoryTableData };
const ANNUAL_SHIPMENT_PLAN_KEY = 'inv_annual_shipment_plan_2026_v1';
const ANNUAL_PLAN_BRANDS = ['MLB', 'MLB KIDS', 'DISCOVERY'] as const;
const ANNUAL_PLAN_SEASONS = ['currF', 'currS', 'year1', 'year2', 'next', 'past'] as const;
type AnnualPlanBrand = typeof ANNUAL_PLAN_BRANDS[number];
type AnnualPlanSeason = typeof ANNUAL_PLAN_SEASONS[number];
type AnnualShipmentPlan = Record<AnnualPlanBrand, Record<AnnualPlanSeason, number>>;

const ANNUAL_PLAN_SEASON_LABELS: Record<AnnualPlanSeason, string> = {
  currF: '당년F',
  currS: '당년S',
  year1: '1년차',
  year2: '2년차',
  next: '차기시즌',
  past: '과시즌',
};
const TXT_HQ_PURCHASE_HEADER = '본사 매입';
const TXT_ANNUAL_PLAN_TITLE = '26년 시즌별 연간 출고계획표';
const TXT_BRAND = '브랜드';
const TXT_PLAN_SECTION = '26년 시즌별 연간 출고계획';
const TXT_PLAN_UNIT = '(단위: CNY K)';
const TXT_EDIT = '수정';
const TXT_SAVE = '저장';
const TXT_PLAN_ICON = '📋';
const TXT_COLLAPSE = '▲ 접기';
const TXT_EXPAND = '▼ 펼치기';

function createEmptyAnnualShipmentPlan(): AnnualShipmentPlan {
  const emptyRow: Record<AnnualPlanSeason, number> = {
    currF: 0,
    currS: 0,
    year1: 0,
    year2: 0,
    next: 0,
    past: 0,
  };
  return {
    MLB: { ...emptyRow },
    'MLB KIDS': { ...emptyRow },
    DISCOVERY: { ...emptyRow },
  };
}

function calcYearDays(year: number): number {
  return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
}

function sum12(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + (b[i] ?? 0));
}

function aggregateLeafTables(tables: InventoryTableData[], year: number): InventoryTableData {
  if (tables.length === 0) return { rows: [] };
  const yearDays = calcYearDays(year);
  const byKey = new Map<string, InventoryRowRaw>();
  for (const table of tables) {
    for (const row of table.rows) {
      if (!row.isLeaf) continue;
      const existing = byKey.get(row.key);
      if (!existing) {
        byKey.set(row.key, {
          key: row.key as RowKey,
          opening: row.opening,
          sellIn: [...row.sellIn],
          sellOut: [...row.sellOut],
          closing: row.closing,
          woiSellOut: [...row.woiSellOut],
          ...(row.hqSales ? { hqSales: [...row.hqSales] } : {}),
        });
      } else {
        existing.opening += row.opening;
        existing.closing += row.closing;
        existing.sellIn = sum12(existing.sellIn, row.sellIn);
        existing.sellOut = sum12(existing.sellOut, row.sellOut);
        existing.woiSellOut = sum12(existing.woiSellOut ?? new Array(12).fill(0), row.woiSellOut);
        if (row.hqSales) {
          existing.hqSales = sum12(existing.hqSales ?? new Array(12).fill(0), row.hqSales);
        }
      }
    }
  }
  return buildTableData(Array.from(byKey.values()), yearDays);
}

function aggregateTopTables(tables: TopTablePair[], year: number): TopTablePair {
  return {
    dealer: aggregateLeafTables(tables.map((t) => t.dealer), year),
    hq: aggregateLeafTables(tables.map((t) => t.hq), year),
  };
}

function buildSeasonShipmentDerivedSellOutPlan(
  planBrand: AnnualPlanBrand,
  annualPlan: AnnualShipmentPlan,
  hqTable: InventoryTableData,
): Partial<Record<RowKey, number>> {
  const byKey = new Map(hqTable.rows.filter((r) => r.isLeaf).map((r) => [r.key, r]));
  const out: Partial<Record<RowKey, number>> = {};
  for (let i = 0; i < SEASON_KEYS.length && i < ANNUAL_PLAN_SEASONS.length; i += 1) {
    const seasonKey = SEASON_KEYS[i] as RowKey;
    const planSeason = ANNUAL_PLAN_SEASONS[i];
    const plannedShipment = annualPlan[planBrand][planSeason] ?? 0;
    const hqSalesTotal = byKey.get(seasonKey)?.hqSalesTotal ?? 0;
    out[seasonKey] = Math.max(0, Math.round(plannedShipment - hqSalesTotal));
  }
  return out;
}

function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
      {children}
    </div>
  );
}

function normalizeAnnualShipmentPlan(source: unknown): AnnualShipmentPlan {
  const base = createEmptyAnnualShipmentPlan();
  const parsed = (source ?? {}) as Partial<AnnualShipmentPlan>;
  for (const b of ANNUAL_PLAN_BRANDS) {
    for (const season of ANNUAL_PLAN_SEASONS) {
      const v = parsed?.[b]?.[season];
      base[b][season] = typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
  }
  return base;
}

function readAnnualShipmentPlanFromLocalStorage(): AnnualShipmentPlan {
  try {
    const raw = localStorage.getItem(ANNUAL_SHIPMENT_PLAN_KEY);
    if (!raw) return createEmptyAnnualShipmentPlan();
    return normalizeAnnualShipmentPlan(JSON.parse(raw));
  } catch {
    return createEmptyAnnualShipmentPlan();
  }
}

async function fetchSnapshotFromServer(year: number, brand: string): Promise<SnapshotData | null> {
  try {
    const params = new URLSearchParams({ year: String(year), brand });
    const res = await fetch(`/api/inventory/snapshot?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: SnapshotData | null };
    return (json.data ?? null) as SnapshotData | null;
  } catch {
    return null;
  }
}

async function saveSnapshotToServer(year: number, brand: string, data: SnapshotData): Promise<void> {
  try {
    await fetch('/api/inventory/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, brand, data }),
    });
  } catch {
    // ignore server sync errors; local snapshot remains available
  }
}

async function fetchAnnualPlanFromServer(year: number): Promise<AnnualShipmentPlan | null> {
  try {
    const params = new URLSearchParams({ year: String(year) });
    const res = await fetch(`/api/inventory/annual-shipment-plan?${params}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: unknown };
    if (!json.data) return null;
    return normalizeAnnualShipmentPlan(json.data);
  } catch {
    return null;
  }
}

async function saveAnnualPlanToServer(year: number, data: AnnualShipmentPlan): Promise<void> {
  try {
    await fetch('/api/inventory/annual-shipment-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, data }),
    });
  } catch {
    // ignore server sync errors; local copy remains available
  }
}

export default function InventoryDashboard() {
  const [year, setYear] = useState<number>(2026);
  const [brand, setBrand] = useState<Brand>('전체');
  const [growthRate, setGrowthRate] = useState<number>(5);

  // 湲곗〈 Sell-in/Sell-out ???곗씠??
  const [data, setData] = useState<InventoryApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ?붾퀎 ?ш퀬?붿븸 ???곗씠??
  const [monthlyData, setMonthlyData] = useState<MonthlyStockResponse | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState<boolean>(false);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);

  // 由ы뀒??留ㅼ텧 ???곗씠??
  const [retailData, setRetailData] = useState<RetailSalesResponse | null>(null);
  const [retailLoading, setRetailLoading] = useState<boolean>(false);
  const [retailError, setRetailError] = useState<string | null>(null);

  // 蹂몄궗?믩?由ъ긽 異쒓퀬留ㅼ텧 ???곗씠??
  const [shipmentData, setShipmentData] = useState<ShipmentSalesResponse | null>(null);
  const [shipmentLoading, setShipmentLoading] = useState<boolean>(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);

  // 蹂몄궗 留ㅼ엯?곹뭹 ???곗씠??
  const [purchaseData, setPurchaseData] = useState<PurchaseResponse | null>(null);
  const [purchaseLoading, setPurchaseLoading] = useState<boolean>(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // ?붾퀎 ?뱀뀡 ?좉? (湲곕낯 ?묓옒)
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const [retailOpen, setRetailOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [annualPlanOpen, setAnnualPlanOpen] = useState(false);
  const [annualShipmentPlan2026, setAnnualShipmentPlan2026] = useState<AnnualShipmentPlan>(createEmptyAnnualShipmentPlan);
  const [annualShipmentPlanDraft2026, setAnnualShipmentPlanDraft2026] = useState<AnnualShipmentPlan>(createEmptyAnnualShipmentPlan);
  const [annualPlanEditMode, setAnnualPlanEditMode] = useState(false);

  // ?ㅻ깄???곹깭
  const [snapshotSaved, setSnapshotSaved] = useState(false);
  const [snapshotSavedAt, setSnapshotSavedAt] = useState<string | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  // 2026 ACC 湲곕쭚 紐⑺몴 ?ш퀬二쇱닔 (?由ъ긽/蹂몄궗蹂??좊컻쨌紐⑥옄쨌媛諛㈑룰린?)
  const [accTargetWoiDealer, setAccTargetWoiDealer] = useState<Record<AccKey, number>>({
    '신발': 29,
    '모자': 29,
    '가방': 25,
    '기타': 39,
  } as Record<AccKey, number>);
  const [accTargetWoiHq, setAccTargetWoiHq] = useState<Record<AccKey, number>>({
    '신발': 10,
    '모자': 8,
    '가방': 10,
    '기타': 10,
  } as Record<AccKey, number>);
  const accTargetWoiDealerRef = useRef(accTargetWoiDealer);
  const accTargetWoiHqRef = useRef(accTargetWoiHq);
  useEffect(() => {
    accTargetWoiDealerRef.current = accTargetWoiDealer;
  }, [accTargetWoiDealer]);
  useEffect(() => {
    accTargetWoiHqRef.current = accTargetWoiHq;
  }, [accTargetWoiHq]);
  // 2026 蹂몄궗 ?곹뭹留ㅼ엯쨌?由ъ긽異쒓퀬 ?몄쭛 怨꾪쉷 (?곌컙 K). 2025???ъ슜?섏? ?딆쓬.
  const [hqSellInPlan, setHqSellInPlan] = useState<Partial<Record<RowKey, number>>>({});
  const [hqSellOutPlan, setHqSellOutPlan] = useState<Partial<Record<RowKey, number>>>({});
  // 2026 ?ш퀬?먯궛???몄쭛 紐⑤뱶 (?섏젙 ?대┃ ?쒖뿉留??몄쭛 媛?ν븳 諛뺤뒪 ?쒖떆)
  const [editMode, setEditMode] = useState(false);
  // 2026 怨꾪쉷??怨꾩궛??2025 ?ㅼ쟻 蹂닿? (API ?묐떟???ы븿??
  const retail2025Ref = useRef<RetailSalesResponse['retail2025'] | null>(null);
  const monthlyByBrandRef = useRef<Partial<Record<LeafBrand, MonthlyStockResponse>>>({});
  const retailByBrandRef = useRef<Partial<Record<LeafBrand, RetailSalesResponse>>>({});
  const shipmentByBrandRef = useRef<Partial<Record<LeafBrand, ShipmentSalesResponse>>>({});
  const purchaseByBrandRef = useRef<Partial<Record<LeafBrand, PurchaseResponse>>>({});
  const [savedSnapshotByBrand, setSavedSnapshotByBrand] = useState<Partial<Record<LeafBrand, SnapshotData>>>({});

  const DEFAULT_ACC_WOI_DEALER: Record<AccKey, number> = {
    '신발': 29,
    '모자': 29,
    '가방': 25,
    '기타': 39,
  } as Record<AccKey, number>;
  const DEFAULT_ACC_WOI_HQ: Record<AccKey, number> = {
    '신발': 10,
    '모자': 8,
    '가방': 10,
    '기타': 10,
  } as Record<AccKey, number>;

  // ?? 湲곗〈 ??fetch ??
  const fetchData = useCallback(async () => {
    // 2025/2026 ?ш퀬?먯궛 ???곷떒 ?붿빟?쒕뒗 ?붾퀎/由ы뀒??異쒓퀬/留ㅼ엯 議고빀?쇰줈留??뚮뜑?쒕떎.
    // (湲곗〈 /api/inventory fallback???곕㈃ 珥덇린 ?섎뱶肄붾뵫 ?レ옄 源쒕묀?꾩씠 諛쒖깮)
    if (year === 2025 || year === 2026) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        growthRate: String(growthRate),
        brand,
      });
      const res = await fetch(`/api/inventory?${params}`);
      if (!res.ok) throw new Error('?곗씠??濡쒕뱶 ?ㅽ뙣');
      setData(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [year, brand, growthRate]);

  // ?? ?붾퀎 ?ш퀬?붿븸 fetch ??
  const fetchMonthlyData = useCallback(async () => {
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand: b })}`),
          ),
        );
        const jsons: MonthlyStockResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error);
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          monthlyByBrandRef.current[b] = jsons[i];
        });
        setMonthlyData(aggregateMonthlyStock(jsons));
      } else {
        const res = await fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand })}`);
        if (!res.ok) throw new Error('?붾퀎 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        const json: MonthlyStockResponse = await res.json();
        if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
        monthlyByBrandRef.current[brand as LeafBrand] = json;
        setMonthlyData(json);
      }
    } catch (e) {
      setMonthlyError(String(e));
    } finally {
      setMonthlyLoading(false);
    }
  }, [year, brand]);

  // ?? 由ы뀒??留ㅼ텧 fetch ??
  const fetchRetailData = useCallback(async () => {
    setRetailLoading(true);
    setRetailError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand: b, growthRate: String(growthRate) })}`),
          ),
        );
        const jsons: RetailSalesResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error);
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          retailByBrandRef.current[b] = jsons[i];
        });
        const aggregated = aggregateRetailSales(jsons);
        if (aggregated.retail2025) retail2025Ref.current = aggregated.retail2025;
        setRetailData(aggregated);
      } else {
        const res = await fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand, growthRate: String(growthRate) })}`);
        if (!res.ok) throw new Error('由ы뀒??留ㅼ텧 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        const json: RetailSalesResponse = await res.json();
        if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
        if (json.retail2025) retail2025Ref.current = json.retail2025;
        retailByBrandRef.current[brand as LeafBrand] = json;
        setRetailData(json);
      }
    } catch (e) {
      setRetailError(String(e));
    } finally {
      setRetailLoading(false);
    }
  }, [year, brand, growthRate]);

  // ?? 異쒓퀬留ㅼ텧 fetch ??
  const fetchShipmentData = useCallback(async () => {
    setShipmentLoading(true);
    setShipmentError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand: b })}`),
          ),
        );
        const jsons: ShipmentSalesResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? '異쒓퀬留ㅼ텧 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          shipmentByBrandRef.current[b] = jsons[i];
        });
        setShipmentData(aggregateShipmentSales(jsons));
      } else {
        const res = await fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand })}`);
        const json: ShipmentSalesResponse = await res.json();
        if (!res.ok || (json as { error?: string }).error) throw new Error((json as { error?: string }).error ?? '異쒓퀬留ㅼ텧 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        shipmentByBrandRef.current[brand as LeafBrand] = json;
        setShipmentData(json);
      }
    } catch (e) {
      setShipmentError(String(e));
    } finally {
      setShipmentLoading(false);
    }
  }, [year, brand]);

  // ?? 蹂몄궗 留ㅼ엯?곹뭹 fetch ??
  const fetchPurchaseData = useCallback(async () => {
    setPurchaseLoading(true);
    setPurchaseError(null);
    try {
      if (brand === '전체') {
        const ress = await Promise.all(
          BRANDS_TO_AGGREGATE.map((b) =>
            fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand: b })}`),
          ),
        );
        const jsons: PurchaseResponse[] = await Promise.all(ress.map((r) => r.json()));
        for (const j of jsons) if ((j as { error?: string }).error) throw new Error((j as { error?: string }).error ?? '留ㅼ엯?곹뭹 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        BRANDS_TO_AGGREGATE.forEach((b, i) => {
          purchaseByBrandRef.current[b] = jsons[i];
        });
        setPurchaseData(aggregatePurchase(jsons));
      } else {
        const res = await fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand })}`);
        const json: PurchaseResponse = await res.json();
        if (!res.ok || (json as { error?: string }).error) throw new Error((json as { error?: string }).error ?? '留ㅼ엯?곹뭹 ?곗씠??濡쒕뱶 ?ㅽ뙣');
        purchaseByBrandRef.current[brand as LeafBrand] = json;
        setPurchaseData(json);
      }
    } catch (e) {
      setPurchaseError(String(e));
    } finally {
      setPurchaseLoading(false);
    }
  }, [year, brand]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ?ㅻ깄?룹씠 ?덉쑝硫?API ?앸왂, ?놁쑝硫?4媛?API ?몄텧 (전체 ??? ?ㅻ깄??誘몄궗?? ??긽 API 吏묎퀎)
  useEffect(() => {
    let cancelled = false;

    const applySnapshotToState = (snap: SnapshotData) => {
      setMonthlyData(snap.monthly);
      setShipmentData(snap.shipment);
      setPurchaseData(snap.purchase);
      if (snap.hqSellInPlan && Object.keys(snap.hqSellInPlan).length) setHqSellInPlan(snap.hqSellInPlan);
      if (snap.hqSellOutPlan && Object.keys(snap.hqSellOutPlan).length) setHqSellOutPlan(snap.hqSellOutPlan);
      if (snap.accTargetWoiDealer) setAccTargetWoiDealer(snap.accTargetWoiDealer);
      if (snap.accTargetWoiHq) setAccTargetWoiHq(snap.accTargetWoiHq);
      if (year === 2026 && snap.planFromMonth && snap.retail2025) {
        retail2025Ref.current = snap.retail2025;
        setRetailData(
          applyPlanToSnapshot(snap.retailActuals, snap.retail2025 as RetailSalesResponse, snap.planFromMonth, growthRate),
        );
      } else {
        setRetailData(snap.retailActuals);
      }
      setSnapshotSaved(true);
      setSnapshotSavedAt(snap.savedAt);
    };

    const run = async () => {
      if (brand === '전체') {
        setSnapshotSaved(false);
        setSnapshotSavedAt(null);
        await Promise.all([
          fetchMonthlyData(),
          fetchRetailData(),
          fetchShipmentData(),
          fetchPurchaseData(),
        ]);
        return;
      }

      const serverSnap = await fetchSnapshotFromServer(year, brand);
      if (cancelled) return;
      if (serverSnap) {
        saveSnapshot(year, brand, serverSnap);
        applySnapshotToState(serverSnap);
        return;
      }

      const localSnap = loadSnapshot(year, brand);
      if (localSnap) {
        applySnapshotToState(localSnap);
        return;
      }

      setSnapshotSaved(false);
      setSnapshotSavedAt(null);
      await Promise.all([
        fetchMonthlyData(),
        fetchRetailData(),
        fetchShipmentData(),
        fetchPurchaseData(),
      ]);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, brand]); // growthRate???섎룄?곸쑝濡??쒖쇅

  useEffect(() => {
    setEditMode(false);
  }, [year, brand]);

  useEffect(() => {
    if (year !== 2026) return;
    let cancelled = false;

    const run = async () => {
      const serverPlan = await fetchAnnualPlanFromServer(year);
      if (cancelled) return;
      if (serverPlan) {
        setAnnualShipmentPlan2026(serverPlan);
        setAnnualShipmentPlanDraft2026(serverPlan);
        setAnnualPlanEditMode(false);
        try {
          localStorage.setItem(ANNUAL_SHIPMENT_PLAN_KEY, JSON.stringify(serverPlan));
        } catch {
          // ignore storage errors
        }
        return;
      }

      const localPlan = readAnnualShipmentPlanFromLocalStorage();
      setAnnualShipmentPlan2026(localPlan);
      setAnnualShipmentPlanDraft2026(localPlan);
      setAnnualPlanEditMode(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [year]);

  // growthRate 변경 시 저장된 스냅샷이면 계획 구간만 재계산 (API 재조회 없음)
  useEffect(() => {
    if (!snapshotSaved) return;
    const snap = loadSnapshot(year, brand);
    if (!snap || year !== 2026 || !snap.planFromMonth || !snap.retail2025) return;
    setRetailData(
      applyPlanToSnapshot(snap.retailActuals, snap.retail2025 as RetailSalesResponse, snap.planFromMonth, growthRate),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growthRate]);

  useEffect(() => {
    if (year !== 2026 || brand !== '전체') return;
    let cancelled = false;

    const warmServerSnapshotsToLocal = async () => {
      const localSnapshots: Partial<Record<LeafBrand, SnapshotData>> = {};
      for (const b of BRANDS_TO_AGGREGATE) {
        const localSnap = loadSnapshot(year, b);
        if (localSnap) localSnapshots[b] = localSnap;
      }
      if (!cancelled) {
        setSavedSnapshotByBrand(localSnapshots);
      }

      await Promise.all(
        BRANDS_TO_AGGREGATE.map(async (b) => {
          const snap = await fetchSnapshotFromServer(year, b);
          if (!cancelled && snap) {
            saveSnapshot(year, b, snap);
            localSnapshots[b] = snap;
          }
        }),
      );
      if (!cancelled) {
        setSavedSnapshotByBrand({ ...localSnapshots });
      }
    };

    void warmServerSnapshotsToLocal();
    return () => {
      cancelled = true;
    };
  }, [year, brand]);

  // 2025쨌2026?????곷떒 ?쒕뒗 ?붾퀎 ?ш퀬?붿븸 + 由ы뀒??留ㅼ텧 + 異쒓퀬留ㅼ텧 + 留ㅼ엯?곹뭹?쇰줈 援ъ꽦
  // 2026???뚮쭔 ACC 紐⑺몴 ?ш퀬二쇱닔 ?ㅻ쾭?덉씠 ?곸슜
  const topTableData = useMemo(() => {
    if (
      (year !== 2025 && year !== 2026) ||
      !monthlyData ||
      !retailData ||
      !shipmentData ||
      monthlyData.dealer.rows.length === 0 ||
      retailData.dealer.rows.length === 0 ||
      shipmentData.data.rows.length === 0
    ) {
      return null;
    }
    if (year === 2026 && brand === '전체') {
      const perBrand: TopTablePair[] = [];
      for (const b of BRANDS_TO_AGGREGATE) {
        const snap = savedSnapshotByBrand[b] ?? loadSnapshot(year, b);
        const monthly = snap?.monthly ?? monthlyByBrandRef.current[b];
        const shipment = snap?.shipment ?? shipmentByBrandRef.current[b];
        const purchase = snap?.purchase ?? purchaseByBrandRef.current[b];
        const retail = snap
          ? (
            snap.planFromMonth && snap.retail2025
              ? applyPlanToSnapshot(
                  snap.retailActuals,
                  snap.retail2025 as RetailSalesResponse,
                  snap.planFromMonth,
                  growthRate,
                )
              : snap.retailActuals
          )
          : retailByBrandRef.current[b];
        if (!monthly || !retail || !shipment || !purchase) continue;

        const builtByBrand = buildTableDataFromMonthly(
          monthly,
          retail,
          shipment,
          purchase,
          year,
        );
        const withWoi = applyAccTargetWoiOverlay(
          builtByBrand.dealer,
          builtByBrand.hq,
          retail,
          snap?.accTargetWoiDealer ?? DEFAULT_ACC_WOI_DEALER,
          snap?.accTargetWoiHq ?? DEFAULT_ACC_WOI_HQ,
          year,
        );
        const derivedSellOutPlan = buildSeasonShipmentDerivedSellOutPlan(
          b,
          annualShipmentPlan2026,
          withWoi.hq,
        );
        const mergedSellOutPlan = {
          ...(snap?.hqSellOutPlan ?? {}),
          ...derivedSellOutPlan,
        };
        perBrand.push(
          applyHqSellInSellOutPlanOverlay(
            withWoi.dealer,
            withWoi.hq,
            snap?.hqSellInPlan ?? {},
            mergedSellOutPlan,
            year,
          ),
        );
      }
      if (perBrand.length > 0) {
        return aggregateTopTables(perBrand, year);
      }
    }

    const built = buildTableDataFromMonthly(
      monthlyData,
      retailData,
      shipmentData,
      purchaseData ?? undefined,
      year,
    );
    if (year === 2026 && brand !== '전체') {
      const withWoi = applyAccTargetWoiOverlay(
        built.dealer,
        built.hq,
        retailData,
        accTargetWoiDealer,
        accTargetWoiHq,
        year,
      );
      const derivedSellOutPlan = buildSeasonShipmentDerivedSellOutPlan(
        brand as AnnualPlanBrand,
        annualShipmentPlan2026,
        withWoi.hq,
      );
      const mergedSellOutPlan = {
        ...hqSellOutPlan,
        ...derivedSellOutPlan,
      };
      return applyHqSellInSellOutPlanOverlay(
        withWoi.dealer,
        withWoi.hq,
        hqSellInPlan,
        mergedSellOutPlan,
        year,
      );
    }
    return built;
  }, [year, brand, monthlyData, retailData, shipmentData, purchaseData, annualShipmentPlan2026, accTargetWoiDealer, accTargetWoiHq, hqSellInPlan, hqSellOutPlan, savedSnapshotByBrand]);

  const shouldUseTopTableOnly = year === 2025 || year === 2026;
  const dealerTableData = shouldUseTopTableOnly
    ? (topTableData?.dealer ?? null)
    : (topTableData?.dealer ?? data?.dealer ?? null);
  const hqTableData = shouldUseTopTableOnly
    ? (topTableData?.hq ?? null)
    : (topTableData?.hq ?? data?.hq ?? null);

  // 2026 ACC ???ш퀬二쇱닔 ?몄쭛 ???곹깭 諛섏쁺 (??? ?먮뒗 湲곕낯媛?釉붾줉怨??곕룞)
  const handleWoiChange = useCallback((tableType: 'dealer' | 'hq', rowKey: string, newWoi: number) => {
    if (!ACC_KEYS.includes(rowKey as AccKey)) return;
    if (tableType === 'dealer') {
      setAccTargetWoiDealer((prev) => {
        const next = { ...prev, [rowKey]: newWoi };
        accTargetWoiDealerRef.current = next;
        return next;
      });
    } else {
      setAccTargetWoiHq((prev) => {
        const next = { ...prev, [rowKey]: newWoi };
        accTargetWoiHqRef.current = next;
        return next;
      });
    }
  }, []);

  // 2026 蹂몄궗 ?곹뭹留ㅼ엯(?곌컙) ?몄쭛
  const handleHqSellInChange = useCallback((rowKey: RowKey, newSellInTotal: number) => {
    setHqSellInPlan((prev) => ({ ...prev, [rowKey]: newSellInTotal }));
  }, []);

  // 2026 蹂몄궗 ?由ъ긽異쒓퀬(?곌컙) ?몄쭛 ???由ъ긽 ??Sell-in???먮룞 諛섏쁺
  const handleHqSellOutChange = useCallback((rowKey: RowKey, newSellOutTotal: number) => {
    setHqSellOutPlan((prev) => ({ ...prev, [rowKey]: newSellOutTotal }));
  }, []);

  // ?? ?ㅻ깄???????
  const handleSave = useCallback(async () => {
    if (!monthlyData || !retailData || !shipmentData || !purchaseData) return;
    const retailActuals =
      year === 2026 && retailData.planFromMonth
        ? stripPlanMonths(retailData, retailData.planFromMonth)
        : retailData;
    const snap: SnapshotData = {
      monthly: monthlyData,
      retailActuals,
      retail2025: retail2025Ref.current ?? null,
      shipment: shipmentData,
      purchase: purchaseData,
      savedAt: new Date().toISOString(),
      planFromMonth: retailData.planFromMonth,
    };
    if (year === 2026) {
      snap.hqSellInPlan = Object.keys(hqSellInPlan).length ? hqSellInPlan : undefined;
      snap.hqSellOutPlan = Object.keys(hqSellOutPlan).length ? hqSellOutPlan : undefined;
      snap.accTargetWoiDealer = accTargetWoiDealerRef.current;
      snap.accTargetWoiHq = accTargetWoiHqRef.current;
    }
    saveSnapshot(year, brand, snap);
    await saveSnapshotToServer(year, brand, snap);
    setSnapshotSaved(true);
    setSnapshotSavedAt(snap.savedAt);
    setEditMode(false);
  }, [year, brand, monthlyData, retailData, shipmentData, purchaseData, hqSellInPlan, hqSellOutPlan]);

  // ?? 2026 ?몄쭛媛?珥덇린媛?由ъ뀑 ??
  const handleResetToDefault = useCallback(() => {
    setHqSellInPlan({});
    setHqSellOutPlan({});
    setAccTargetWoiDealer(DEFAULT_ACC_WOI_DEALER);
    setAccTargetWoiHq(DEFAULT_ACC_WOI_HQ);
    setEditMode(false);
  }, []);

  // ?? ?ш퀎????
  const handleRecalc = useCallback(async (mode: 'current' | 'annual') => {
    setRecalcLoading(true);
    try {
      // mode? ?? ?? ???? ??, ??? ?? ?? ??? ?? ????? ??
      void mode;

      if (brand !== 'MLB' && brand !== 'MLB KIDS' && brand !== 'DISCOVERY') {
        await Promise.all([
          fetchMonthlyData(),
          fetchRetailData(),
          fetchShipmentData(),
          fetchPurchaseData(),
        ]);
        setSnapshotSaved(false);
        setSnapshotSavedAt(null);
        return;
      }

      const [fm, fr, fs, fp] = await Promise.all([
        fetch(`/api/inventory/monthly-stock?${new URLSearchParams({ year: String(year), brand })}`).then(
          (r) => r.json() as Promise<MonthlyStockResponse & { error?: string }>,
        ),
        fetch(`/api/inventory/retail-sales?${new URLSearchParams({ year: String(year), brand, growthRate: String(growthRate) })}`).then(
          (r) => r.json() as Promise<RetailSalesResponse & { error?: string }>,
        ),
        fetch(`/api/inventory/shipment-sales?${new URLSearchParams({ year: String(year), brand })}`).then(
          (r) => r.json() as Promise<ShipmentSalesResponse & { error?: string }>,
        ),
        fetch(`/api/inventory/purchase?${new URLSearchParams({ year: String(year), brand })}`).then(
          (r) => r.json() as Promise<PurchaseResponse & { error?: string }>,
        ),
      ]);

      if (fm.error) throw new Error(fm.error);
      if (fr.error) throw new Error(fr.error);
      if (fs.error) throw new Error(fs.error);
      if (fp.error) throw new Error(fp.error);

      setMonthlyData(fm);
      setRetailData(fr);
      setShipmentData(fs);
      setPurchaseData(fp);
      monthlyByBrandRef.current[brand as LeafBrand] = fm;
      retailByBrandRef.current[brand as LeafBrand] = fr;
      shipmentByBrandRef.current[brand as LeafBrand] = fs;
      purchaseByBrandRef.current[brand as LeafBrand] = fp;
      if (fr.retail2025) retail2025Ref.current = fr.retail2025;

      const retailActuals =
        year === 2026 && fr.planFromMonth
          ? stripPlanMonths(fr, fr.planFromMonth)
          : fr;

      const freshSnapshot: SnapshotData = {
        monthly: fm,
        retailActuals,
        retail2025: fr.retail2025 ?? null,
        shipment: fs,
        purchase: fp,
        savedAt: new Date().toISOString(),
        planFromMonth: fr.planFromMonth,
      };
      if (year === 2026) {
        freshSnapshot.hqSellInPlan = Object.keys(hqSellInPlan).length ? hqSellInPlan : undefined;
        freshSnapshot.hqSellOutPlan = Object.keys(hqSellOutPlan).length ? hqSellOutPlan : undefined;
        freshSnapshot.accTargetWoiDealer = accTargetWoiDealerRef.current;
        freshSnapshot.accTargetWoiHq = accTargetWoiHqRef.current;
      }

      saveSnapshot(year, brand, freshSnapshot);
      await saveSnapshotToServer(year, brand, freshSnapshot);
      setSnapshotSaved(true);
      setSnapshotSavedAt(freshSnapshot.savedAt);
    } catch (e) {
      console.error('[recalc] error:', e);
    } finally {
      setRecalcLoading(false);
    }
  }, [year, brand, growthRate, fetchMonthlyData, fetchRetailData, fetchShipmentData, fetchPurchaseData, hqSellInPlan, hqSellOutPlan]);

  const handleAnnualPlanCellChange = useCallback((planBrand: AnnualPlanBrand, season: AnnualPlanSeason, value: string) => {
    if (!annualPlanEditMode) return;
    const numeric = parseInt(value.replace(/[^\d-]/g, ''), 10);
    const nextValue = Number.isNaN(numeric) ? 0 : numeric;
    setAnnualShipmentPlanDraft2026((prev) => ({
      ...prev,
      [planBrand]: {
        ...prev[planBrand],
        [season]: nextValue,
      },
    }));
  }, [annualPlanEditMode]);

  const handleAnnualPlanEditStart = useCallback(() => {
    setAnnualShipmentPlanDraft2026(annualShipmentPlan2026);
    setAnnualPlanEditMode(true);
  }, [annualShipmentPlan2026]);

  const handleAnnualPlanSave = useCallback(async () => {
    setAnnualShipmentPlan2026(annualShipmentPlanDraft2026);
    setAnnualPlanEditMode(false);
    try {
      localStorage.setItem(ANNUAL_SHIPMENT_PLAN_KEY, JSON.stringify(annualShipmentPlanDraft2026));
    } catch {
      // ignore storage errors
    }
    await saveAnnualPlanToServer(2026, annualShipmentPlanDraft2026);
  }, [annualShipmentPlanDraft2026]);

  return (
    <div className="bg-gray-50 overflow-auto h-[calc(100vh-64px)]">
      <InventoryFilterBar
        year={year}
        brand={brand}
        growthRate={growthRate}
        onYearChange={setYear}
        onBrandChange={setBrand}
        onGrowthRateChange={setGrowthRate}
        snapshotSaved={snapshotSaved}
        snapshotSavedAt={snapshotSavedAt}
        recalcLoading={recalcLoading}
        onSave={handleSave}
        onRecalc={handleRecalc}
        canSave={!!(monthlyData && retailData && shipmentData && purchaseData)}
        editMode={year === 2026 && brand !== '전체' ? editMode : false}
        onEditModeEnter={year === 2026 && brand !== '전체' ? () => setEditMode(true) : undefined}
        onResetToDefault={year === 2026 && brand !== '전체' ? handleResetToDefault : undefined}
      />

      <div className="px-6 py-5">
        {/* ?? 湲곗〈 Sell-in / Sell-out ???? */}
        {loading && !dealerTableData && (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
              로딩 중...
            </div>
        )}
        {error && !dealerTableData && (
          <div className="py-10 text-center text-red-500 text-sm">{error}</div>
        )}
        {dealerTableData && hqTableData && (
          <>
            <div className="flex flex-wrap gap-6 items-start">
            <div className="min-w-0 flex-1" style={{ minWidth: '320px' }}>
              <InventoryTable
                title="대리상 (CNY K)"
                data={dealerTableData!}
                year={year}
                editMode={year === 2026 && brand !== '전체' ? editMode : false}
                sellInLabel="Sell-in"
                sellOutLabel="Sell-out"
                tableType="dealer"
                onWoiChange={year === 2026 && brand !== '전체' ? handleWoiChange : undefined}
              />
            </div>
            <div className="min-w-0 flex-1" style={{ minWidth: '320px' }}>
              <InventoryTable
                title="본사 (CNY K)"
                titleNote={year === 2026 && brand !== '전체' ? '편집가능: 의류 상품매입, 대리상출고 | ACC: 재고주수' : undefined}
                data={hqTableData!}
                year={year}
                editMode={year === 2026 && brand !== '전체' ? editMode : false}
                sellInLabel="상품매입"
                sellOutLabel="대리상출고"
                tableType="hq"
                onWoiChange={year === 2026 && brand !== '전체' ? handleWoiChange : undefined}
                onHqSellInChange={year === 2026 && brand !== '전체' ? handleHqSellInChange : undefined}
                onHqSellOutChange={year === 2026 && brand !== '전체' ? handleHqSellOutChange : undefined}
              />
            </div>
          </div>
          </>
        )}

        {/* ?? ?붾퀎 ?ш퀬?붿븸 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setMonthlyOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📦</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">월별 재고잔액</span>
            <span className="text-xs font-normal text-gray-400">
              (단위: CNY K / 실적 기준: ~{monthlyData?.closedThrough ?? '--'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {monthlyOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {monthlyError && !monthlyOpen && (
            <p className="text-red-500 text-xs mt-1">{monthlyError}</p>
          )}
          {monthlyOpen && (
            <>
              {monthlyLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {monthlyError && (
                <div className="py-8 text-center text-red-500 text-sm">{monthlyError}</div>
              )}
              {monthlyData && !monthlyLoading && monthlyData.dealer.rows.length > 0 && (
                <>
                  <InventoryMonthlyTable
                    firstColumnHeader="대리상"
                    data={monthlyData.dealer as TableData}
                    year={year}
                    showOpening={true}
                  />
                  <InventoryMonthlyTable
                    firstColumnHeader="본사"
                    data={monthlyData.hq as TableData}
                    year={year}
                    showOpening={true}
                    headerBg="#4db6ac"
                    headerBorderColor="#2a9d8f"
                    totalRowCls="bg-teal-50"
                  />
                </>
              )}
              {monthlyData && !monthlyLoading && monthlyData.dealer.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ?? 由ы뀒??留ㅼ텧 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setRetailOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📊</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">리테일 매출</span>
            <span className="text-xs font-normal text-gray-400">
              (단위: CNY K / 실적 기준: ~{retailData?.closedThrough ?? '--'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {retailOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {retailError && !retailOpen && (
            <p className="text-red-500 text-xs mt-1">{retailError}</p>
          )}
          {retailOpen && (
            <>
              {retailLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {retailError && (
                <div className="py-8 text-center text-red-500 text-sm">{retailError}</div>
              )}
              {retailData && !retailLoading && retailData.dealer.rows.length > 0 && (
                <>
                  <InventoryMonthlyTable
                    firstColumnHeader="대리상"
                    data={retailData.dealer as TableData}
                    year={year}
                    showOpening={false}
                    planFromMonth={retailData.planFromMonth}
                  />
                  <InventoryMonthlyTable
                    firstColumnHeader="본사"
                    data={retailData.hq as TableData}
                    year={year}
                    showOpening={false}
                    planFromMonth={retailData.planFromMonth}
                    headerBg="#4db6ac"
                    headerBorderColor="#2a9d8f"
                    totalRowCls="bg-teal-50"
                  />
                </>
              )}
              {retailData && !retailLoading && retailData.dealer.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ?? 蹂몄궗?믩?由ъ긽 異쒓퀬留ㅼ텧 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setShipmentOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">🚚</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">본사→대리상 출고매출</span>
            <span className="text-xs font-normal text-gray-400">
              (단위: CNY K / 실적 기준: ~{shipmentData?.closedThrough ?? '--'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {shipmentOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {shipmentError && !shipmentOpen && (
            <p className="text-red-500 text-xs mt-1">{shipmentError}</p>
          )}
          {shipmentOpen && (
            <>
              {shipmentLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {shipmentError && (
                <div className="py-8 text-center text-red-500 text-sm">{shipmentError}</div>
              )}
              {shipmentData && !shipmentLoading && shipmentData.data.rows.length > 0 && (
                <InventoryMonthlyTable
                  firstColumnHeader="본사→대리상 출고"
                  data={shipmentData.data as TableData}
                  year={year}
                  showOpening={false}
                  headerBg="#4db6ac"
                  headerBorderColor="#2a9d8f"
                  totalRowCls="bg-teal-50"
                />
              )}
              {shipmentData && !shipmentLoading && shipmentData.data.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* ?? 蹂몄궗 留ㅼ엯?곹뭹 ???? */}
        <div className="mt-10 border-t border-gray-300 pt-8">
          <button
            type="button"
            onClick={() => setPurchaseOpen((v) => !v)}
            className="flex items-center gap-2 w-full text-left py-1"
          >
            <SectionIcon>
              <span className="text-lg">📥</span>
            </SectionIcon>
            <span className="text-sm font-bold text-gray-700">본사 매입상품</span>
            <span className="text-xs font-normal text-gray-400">
              (단위: CNY K / 실적 기준: ~{purchaseData?.closedThrough ?? '--'})
            </span>
            <span className="ml-auto text-gray-400 text-xs shrink-0">
              {purchaseOpen ? '접기' : '펼치기'}
            </span>
          </button>
          {purchaseError && !purchaseOpen && (
            <p className="text-red-500 text-xs mt-1">{purchaseError}</p>
          )}
          {purchaseOpen && (
            <>
              {purchaseLoading && (
                <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                  로딩 중...
                </div>
              )}
              {purchaseError && (
                <div className="py-8 text-center text-red-500 text-sm">{purchaseError}</div>
              )}
              {purchaseData && !purchaseLoading && purchaseData.data.rows.length > 0 && (
                <>
                  <InventoryMonthlyTable
                    firstColumnHeader={TXT_HQ_PURCHASE_HEADER}
                    data={purchaseData.data as TableData}
                    year={year}
                    showOpening={false}
                    headerBg="#4db6ac"
                    headerBorderColor="#2a9d8f"
                    totalRowCls="bg-teal-50"
                  />
                </>
              )}
              {purchaseData && !purchaseLoading && purchaseData.data.rows.length === 0 && (
                <div className="py-8 text-center text-gray-400 text-sm">
                  해당 연도의 마감 데이터가 없습니다.
                </div>
              )}
            </>
          )}
        </div>

        {/* 2026 ?쒖쫵蹂??곌컙 異쒓퀬怨꾪쉷 */}
        {year === 2026 && (
          <div className="mt-10 border-t border-gray-300 pt-8">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAnnualPlanOpen((v) => !v)}
                className="flex items-center gap-2 flex-1 text-left py-1"
              >
                <SectionIcon>
                  <span className="text-lg">{TXT_PLAN_ICON}</span>
                </SectionIcon>
                <span className="text-sm font-bold text-gray-700">{TXT_PLAN_SECTION}</span>
                <span className="text-xs font-normal text-gray-400">{TXT_PLAN_UNIT}</span>
                <span className="ml-auto text-gray-400 text-xs shrink-0">
                  {annualPlanOpen ? TXT_COLLAPSE : TXT_EXPAND}
                </span>
              </button>
              {annualPlanOpen && (
                <div className="flex items-center gap-2">
                  {!annualPlanEditMode ? (
                    <button
                      type="button"
                      onClick={handleAnnualPlanEditStart}
                      className="px-3 py-1.5 text-xs rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      {TXT_EDIT}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAnnualPlanSave}
                      className="px-3 py-1.5 text-xs rounded border border-sky-600 bg-sky-600 text-white hover:bg-sky-700"
                    >
                      {TXT_SAVE}
                    </button>
                  )}
                </div>
              )}
            </div>
            {annualPlanOpen && (
              <div className="mt-3 overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left bg-[#1a2e5a] text-white border border-[#2e4070] min-w-[120px]">{TXT_BRAND}</th>
                      {ANNUAL_PLAN_SEASONS.map((season) => (
                        <th
                          key={season}
                          className="px-3 py-2 text-center bg-[#1a2e5a] text-white border border-[#2e4070] min-w-[90px]"
                        >
                          {ANNUAL_PLAN_SEASON_LABELS[season]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ANNUAL_PLAN_BRANDS.map((planBrand) => (
                      <tr key={planBrand} className="bg-white hover:bg-gray-50">
                        <td className="px-3 py-2 border-b border-gray-200 font-medium text-gray-700">{planBrand}</td>
                        {ANNUAL_PLAN_SEASONS.map((season) => (
                          <td key={`${planBrand}-${season}`} className="px-2 py-1.5 border-b border-gray-200">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={String((annualPlanEditMode ? annualShipmentPlanDraft2026 : annualShipmentPlan2026)[planBrand][season] || 0)}
                              onChange={(e) => handleAnnualPlanCellChange(planBrand, season, e.target.value)}
                              disabled={!annualPlanEditMode}
                              className={`w-full text-right text-xs px-1.5 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-sky-400 ${
                                annualPlanEditMode ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 text-gray-600'
                              }`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
