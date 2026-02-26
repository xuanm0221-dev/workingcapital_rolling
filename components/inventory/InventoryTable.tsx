'use client';

import { useRef, useState } from 'react';
import { InventoryRow, InventoryTableData, ACC_KEYS, SEASON_KEYS, AccKey, RowKey, SeasonKey } from '@/lib/inventory-types';
import { formatKValue, formatPct, formatWoi } from '@/lib/inventory-calc';

interface Props {
  title: string;
  /** 사용 안 함. tableType 기준으로 스타일 적용 */
  titleBg?: string;
  /** 제목 우측에 표시할 안내 문구 (예: 편집가능 안내) */
  titleNote?: string;
  data: InventoryTableData;
  year: number;
  /** 편집 모드일 때만 상품매입·대리상출고·재고주수 편집 UI 표시. false면 다른 열과 동일하게 숫자만 표시 */
  editMode?: boolean;
  sellInLabel?: string;
  sellOutLabel?: string;
  tableType?: 'dealer' | 'hq';
  onWoiChange?: (tableType: 'dealer' | 'hq', rowKey: string, newWoi: number) => void;
  onHqSellInChange?: (rowKey: RowKey, newSellInTotal: number) => void;
  onHqSellOutChange?: (rowKey: RowKey, newSellOutTotal: number) => void;
  /** 전전년 기말 (기초 YOY 계산용). 2026 탭에서만 전달, 2025 탭은 미전달 → 기초 YOY '-' */
  prevYearTotalOpening?: number | null;
  /** 전년 재고자산합계 sellInTotal (상품매입/Sell-in YOY 계산용) */
  prevYearTotalSellIn?: number;
  /** 전년 재고자산합계 sellOutTotal (대리상출고/Sell-out YOY 계산용) */
  prevYearTotalSellOut?: number;
  /** 전년 재고자산합계 hqSalesTotal (본사판매 YOY 계산용, 본사 전용) */
  prevYearTotalHqSales?: number;
}

// 헤더 스타일
const TH = 'px-2 py-2 text-center text-xs font-semibold bg-[#1a2e5a] text-white border border-[#2e4070] whitespace-nowrap';

// YOY 합성 행 (의류합계-당년F 사이)
const YOY_ROW_KEY = 'YOY';
function isYoyRow(row: InventoryRow | YoyRow): row is YoyRow {
  return row.key === YOY_ROW_KEY;
}
interface YoyRow {
  key: string;
  label: string;
  isTotal: false;
  isSubtotal: false;
  isLeaf: false;
  isYoy: true;
}
const yoyRow: YoyRow = {
  key: YOY_ROW_KEY,
  label: 'YOY',
  isTotal: false,
  isSubtotal: false,
  isLeaf: false,
  isYoy: true,
};

// 행 배경색
function rowBg(row: InventoryRow | YoyRow): string {
  if (isYoyRow(row)) return 'bg-sky-100';
  if (row.isTotal) return 'bg-sky-100';
  if (row.isSubtotal) return 'bg-gray-100';
  return 'bg-white hover:bg-gray-50';
}

// 셀 스타일
function cellCls(row: InventoryRow | YoyRow, extra = ''): string {
  if (isYoyRow(row)) {
    return 'px-2 py-1.5 text-right text-xs border-b border-gray-200 tabular-nums align-middle italic font-bold text-[#1a2e5a]';
  }
  const base = 'px-2 py-1.5 text-right text-xs border-b border-gray-200 tabular-nums align-middle';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  return `${base} ${weight} ${extra}`;
}

function labelCls(row: InventoryRow | YoyRow): string {
  if (isYoyRow(row)) {
    return 'py-1.5 text-xs border-b border-gray-200 whitespace-nowrap align-middle pl-2 pr-2 italic font-bold text-[#1a2e5a]';
  }
  const base = 'py-1.5 text-xs border-b border-gray-200 whitespace-nowrap align-middle';
  const weight = row.isTotal || row.isSubtotal ? 'font-semibold' : 'font-normal';
  const indent = row.isLeaf ? 'pl-6 pr-2' : 'pl-2 pr-2';
  return `${base} ${weight} ${indent}`;
}

function formatWithComma(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '';
}

const PencilIcon = () => (
  <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

export default function InventoryTable({
  title,
  titleNote,
  data,
  year,
  editMode = false,
  sellInLabel = 'Sell-in',
  sellOutLabel = 'Sell-out',
  tableType = 'dealer',
  onWoiChange,
  onHqSellInChange,
  onHqSellOutChange,
  prevYearTotalOpening,
  prevYearTotalSellIn,
  prevYearTotalSellOut,
  prevYearTotalHqSales,
}: Props) {
  const isWoiEditable = year === 2026 && !!onWoiChange && editMode;
  const isAccRow = (key: string) => ACC_KEYS.includes(key as AccKey);
  const isWoiEditableForRow = (row: InventoryRow) => isWoiEditable && row.isLeaf && isAccRow(row.key);
  const isHqSellEditableForRow = (row: InventoryRow) =>
    year === 2026 &&
    tableType === 'hq' &&
    row.isLeaf &&
    SEASON_KEYS.includes(row.key as SeasonKey) &&
    (!!onHqSellInChange || !!onHqSellOutChange) &&
    editMode;
  const prevYear = year - 1;

  const totalRow = data.rows.find((r) => r.key === '재고자산합계');
  const yoyOpening: number | null =
    prevYearTotalOpening != null &&
    prevYearTotalOpening > 0 &&
    totalRow &&
    Number.isFinite(totalRow.opening)
      ? totalRow.opening / prevYearTotalOpening
      : null;
  const yoyClosing: number | null =
    totalRow &&
    totalRow.opening > 0 &&
    Number.isFinite(totalRow.closing)
      ? totalRow.closing / totalRow.opening
      : null;
  const yoySellIn: number | null =
    prevYearTotalSellIn != null && prevYearTotalSellIn > 0 && totalRow
      ? totalRow.sellInTotal / prevYearTotalSellIn
      : null;
  const yoySellOut: number | null =
    prevYearTotalSellOut != null && prevYearTotalSellOut > 0 && totalRow
      ? totalRow.sellOutTotal / prevYearTotalSellOut
      : null;
  const yoyHqSales: number | null =
    prevYearTotalHqSales != null && prevYearTotalHqSales > 0 && totalRow && totalRow.hqSalesTotal != null
      ? totalRow.hqSalesTotal / prevYearTotalHqSales
      : null;

  type EditField = 'sellIn' | 'sellOut' | 'woi';
  const [editingCell, setEditingCell] = useState<{ rowKey: string; field: EditField } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [legendOpen, setLegendOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = (rowKey: string, field: EditField) =>
    editingCell?.rowKey === rowKey && editingCell?.field === field;

  const startEdit = (row: InventoryRow, field: EditField, currentValue: number) => {
    setEditingCell({ rowKey: row.key, field });
    setEditValue(currentValue > 0 ? String(Math.round(currentValue)) : '');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = (rowKey: string, field: EditField, fallback: number) => {
    if (field === 'woi') {
      const v = parseFloat(editValue);
      if (!isNaN(v) && v > 0 && v <= 99) onWoiChange?.(tableType, rowKey, v);
      else onWoiChange?.(tableType, rowKey, fallback || 1);
    } else {
      const v = parseInt(editValue.replace(/\D/g, ''), 10);
      const num = isNaN(v) || v < 0 ? fallback : v;
      if (field === 'sellIn') onHqSellInChange?.(rowKey as RowKey, num);
      else onHqSellOutChange?.(rowKey as RowKey, num);
    }
    setEditingCell(null);
    setEditValue('');
  };

  const editableCellCls = 'group relative flex items-center justify-end gap-1 min-h-[28px] w-full cursor-text';
  const editableCellBgCls = 'bg-amber-50 hover:bg-amber-100';
  const inputCls = 'w-full min-w-0 text-right text-xs border-0 bg-transparent outline-none tabular-nums px-1 py-0.5';

  return (
    <div className="mb-8 flex flex-col">
      {/* 테이블 제목 */}
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div
          className={`
            border-l-4 rounded-r-md px-4 py-2 text-sm font-semibold tracking-tight
            border-teal-600 bg-teal-50/80 text-slate-800
          `}
        >
          {title}
        </div>
        {titleNote && (
          <span className="text-xs text-gray-500">
            {titleNote}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 shadow-sm">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={TH} style={{ minWidth: 100 }}>구분</th>
              <th className={TH} style={{ minWidth: 70 }}>
                기초<br />
                <span className="font-normal text-[10px] text-blue-200">({prevYear}년기말)</span>
              </th>
              <th className={TH} style={{ minWidth: 70 }}>
                {sellInLabel}<br />
                <span className="font-normal text-[10px] text-blue-200">(연간)</span>
              </th>
              <th className={TH} style={{ minWidth: 70 }}>
                {sellOutLabel}<br />
                <span className="font-normal text-[10px] text-blue-200">(연간)</span>
              </th>
              {tableType === 'hq' && (
                <th className={TH} style={{ minWidth: 70 }}>
                  본사판매<br />
                  <span className="font-normal text-[10px] text-blue-200">(연간)</span>
                </th>
              )}
              <th className={TH} style={{ minWidth: 70 }}>
                기말<br />
                <span className="font-normal text-[10px] text-blue-200">({year}년기말)</span>
              </th>
              <th className={TH} style={{ minWidth: 55 }}>증감</th>
              <th className={TH} style={{ minWidth: 65 }}>Sell-through</th>
              <th className={TH} style={{ minWidth: 55 }}>재고주수</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const displayRows: (InventoryRow | YoyRow)[] = [];
              for (const row of data.rows) {
                displayRows.push(row);
                if (row.key === '재고자산합계') displayRows.push(yoyRow);
              }
              return displayRows;
            })().map((row) => (
              <tr key={row.key} className={`${rowBg(row)} transition-colors min-h-[28px]`}>
                {/* 구분 */}
                <td className={labelCls(row)}>
                  {!isYoyRow(row) && row.isLeaf && <span className="text-gray-400 mr-1">└</span>}
                  {row.label}
                </td>
                {/* 기초 */}
                <td className={cellCls(row)}>
                  {isYoyRow(row)
                    ? yoyOpening != null
                      ? formatPct(yoyOpening * 100)
                      : '-'
                    : formatKValue(row.opening)}
                </td>
                {/* Sell-in (연간) — 2026 본사 leaf면 편집 가능 */}
                <td className={cellCls(row)}>
                  {isYoyRow(row) ? (yoySellIn != null ? formatPct(yoySellIn * 100) : '-') : isHqSellEditableForRow(row as InventoryRow) && onHqSellInChange ? (
                    <div
                      className={`${editableCellCls} ${editableCellBgCls}`}
                      onClick={() => !isEditing(row.key, 'sellIn') && startEdit(row, 'sellIn', row.sellInTotal || 0)}
                    >
                      {isEditing(row.key, 'sellIn') ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ''))}
                          onBlur={() => commitEdit(row.key, 'sellIn', row.sellInTotal || 0)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                          className={inputCls}
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-right">{formatWithComma((row as InventoryRow).sellInTotal || 0)}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <PencilIcon />
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    formatKValue((row as InventoryRow).sellInTotal)
                  )}
                </td>
                {/* Sell-out (연간) — 2026 본사 leaf면 편집 가능 */}
                <td className={cellCls(row)}>
                  {isYoyRow(row) ? (yoySellOut != null ? formatPct(yoySellOut * 100) : '-') : isHqSellEditableForRow(row as InventoryRow) && onHqSellOutChange ? (
                    <div
                      className={`${editableCellCls} ${editableCellBgCls}`}
                      onClick={() => !isEditing(row.key, 'sellOut') && startEdit(row, 'sellOut', row.sellOutTotal || 0)}
                    >
                      {isEditing(row.key, 'sellOut') ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="numeric"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value.replace(/\D/g, ''))}
                          onBlur={() => commitEdit(row.key, 'sellOut', row.sellOutTotal || 0)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                          className={inputCls}
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-right">{formatWithComma((row as InventoryRow).sellOutTotal || 0)}</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <PencilIcon />
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    formatKValue(row.sellOutTotal)
                  )}
                </td>
                {/* 본사판매 (본사 테이블 전용) */}
                {tableType === 'hq' && (
                  <td className={cellCls(row)}>
                    {isYoyRow(row)
                      ? yoyHqSales != null ? formatPct(yoyHqSales * 100) : '-'
                      : (row as InventoryRow).hqSalesTotal != null ? formatKValue((row as InventoryRow).hqSalesTotal!) : '-'}
                  </td>
                )}
                {/* 기말 */}
                <td className={cellCls(row)}>
                  {isYoyRow(row)
                    ? yoyClosing != null
                      ? formatPct(yoyClosing * 100)
                      : '-'
                    : formatKValue((row as InventoryRow).closing)}
                </td>
                {/* 증감 */}
                <td className={`${cellCls(row)} ${!isYoyRow(row) && (row as InventoryRow).delta < 0 ? 'text-blue-600' : !isYoyRow(row) && (row as InventoryRow).delta > 0 ? 'text-red-500' : ''}`}>
                  {isYoyRow(row) ? '-' : ((row as InventoryRow).delta > 0 ? '+' : '') + formatKValue((row as InventoryRow).delta)}
                </td>
                {/* Sell-through */}
                <td className={`${cellCls(row)} ${
                  isYoyRow(row) ? '' :
                  (row as InventoryRow).sellThrough >= 70 ? 'text-green-600' :
                  (row as InventoryRow).sellThrough >= 50 ? 'text-yellow-600' :
                  (row as InventoryRow).sellThrough > 0 ? 'text-red-500' : ''
                }`}>
                  {isYoyRow(row) ? '-' : formatPct((row as InventoryRow).sellThrough)}
                </td>
                {/* 재고주수 (2026년 리프 행 편집 가능) */}
                <td className={`${cellCls(row)} ${
                  isYoyRow(row) ? '' :
                  (row as InventoryRow).woi > 0 && (row as InventoryRow).woi <= 10 ? 'text-green-600' :
                  (row as InventoryRow).woi > 10 && (row as InventoryRow).woi <= 20 ? 'text-yellow-600' :
                  (row as InventoryRow).woi > 20 ? 'text-red-500' : ''
                }`}>
                  {isYoyRow(row) ? '-' : isWoiEditableForRow(row as InventoryRow) ? (
                    <span
                      className={`flex items-center justify-end gap-0.5 ${editableCellCls} ${editableCellBgCls}`}
                      onClick={() => !isEditing(row.key, 'woi') && startEdit(row, 'woi', row.woi || 0)}
                    >
                      {isEditing(row.key, 'woi') ? (
                        <input
                          ref={inputRef}
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^\d.]/g, '');
                            const parts = raw.split('.');
                            if (parts.length <= 2 && (parts[1]?.length ?? 0) <= 1) setEditValue(raw);
                          }}
                          onBlur={() => commitEdit(row.key, 'woi', row.woi || 1)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
                          className={`${inputCls} w-12`}
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-right">{formatWoi(row.woi)}</span>
                          <span
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); startEdit(row, 'woi', row.woi || 0); }}
                          >
                            <PencilIcon />
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    formatWoi(row.woi)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 범례: 토글 가능 */}
      <div className="mt-2 px-1 text-[11px]">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
        >
          <span>{legendOpen ? '▼' : '▶'}</span>
          <span>
            {year === 2026
              ? tableType === 'dealer'
                ? 'ACC 범례'
                : '의류 범례'
              : '범례'}{' '}
            {legendOpen ? '접기' : '펼치기'}
          </span>
        </button>
        {legendOpen && (
        <div className="mt-1 text-gray-500">
        {year === 2026 ? (
          tableType === 'dealer' ? (
            <div className="space-y-2">
              <p><strong className="font-semibold text-gray-700">1. Sell-through</strong></p>
              <p className="ml-1">- 대리상 = Sell-out ÷ Sell-in</p>
              <p className="ml-1">- 본사 = (대리상출고+본사판매) ÷ 상품매입</p>
              <p><strong className="font-semibold text-gray-700">2. 재고주수</strong></p>
              <p className="ml-1">- 목표 재고주수 입력</p>
              <p><strong className="font-semibold text-gray-700">3. ACC 재고계산 (재고주수 → 대리상 기말재고 역산 → 본사 상품매입)</strong></p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5">
                <div>① Sell-out/본사판매 = 전년동월 × 성장률</div>
                <div>④ 대리상 Sell-in 산출 (=기말+Sell-out-기초)</div>
                <div>② 대리상/본사 목표 재고주수 입력</div>
                <div>⑤ 본사 대리상출고 = ④</div>
                <div>
                  <div>③ 목표 기말재고 역산 (=연간매출÷연간일수×7일×목표재고주수)</div>
                  <div className="ml-3 mt-0.5 text-gray-400">- 대리상: 대리상 판매매출로 역산</div>
                  <div className="ml-3 text-gray-400">- 본사: 대리상+직영 판매매출로 역산</div>
                </div>
                <div>⑥ 본사 상품매입 = 기말+본사판매+대리상출고-기초</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p><strong className="font-semibold text-gray-700">1. Sell-through</strong></p>
              <p className="ml-1">- Sell-through (대리상) = Sell-out ÷ (기초 + Sell-in)</p>
              <p className="ml-1">- Sell-through (본사) = (대리상출고+본사판매) ÷ (기초 + 상품매입)</p>
              <p><strong className="font-semibold text-gray-700">2. 의류 재고계산</strong></p>
              <div className="space-y-0.5">
                <div>① Sell-out/본사판매 = 전년동월×성장률</div>
                <div>② 본사 26년 시즌별 연간 출고계획 = 대리상출고+본사판매</div>
                <div>③ 대리상출고 = ② - ①</div>
                <div>④ Sell-in = ③</div>
                <div>⑤ 대리상 기말재고 = 기초 + Sell-in - Sell-out</div>
                <div>⑥ 상품매입 = 중국현지 상품매입 계획</div>
                <div>⑦ 본사 기말재고 = 기초 + 상품매입⑥ - 대리상출고③ - 본사판매</div>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-1">
            <p>
              <strong className="text-gray-600">Sell-through:</strong>
              {tableType === 'dealer'
                ? ' 재고자산 합계·ACC = Sell-out ÷ Sell-in / 의류 = Sell-out ÷ (기초 + Sell-in)'
                : ' 재고자산 합계·ACC = (대리상출고+본사판매) ÷ 상품매입 / 의류 = 대리상출고 ÷ (기초 + 상품매입)'}
            </p>
            <p>
              <strong className="text-gray-600">재고주수:</strong>
              {tableType === 'dealer'
                ? ' 주 매출 = Sell-out 연간합 ÷ (당연도 일수 × 7), 재고주수 = 기말재고자산 ÷ 주매출'
                : ' 주 매출 = (대리상 리테일 + 본사 리테일) 연간합 ÷ (당연도 일수 × 7), 재고주수 = 기말재고자산 ÷ 주매출'}
            </p>
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  );
}
