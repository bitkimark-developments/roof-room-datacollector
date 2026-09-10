import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser, type Element } from '@xmldom/xmldom';
import type { IkasProductField, IkasProductRow } from '../../../shared/ikas-products';

const FIELD_HEADERS: Record<IkasProductField, string[]> = {
  product_title: ['product title', 'title', 'ürün adı'], product_id: ['product id', 'ürün id'],
  variant_id: ['variant id', 'varyant id'], url: ['url', 'product url', 'ürün url'],
  categories_product_type: ['categories', 'product type', 'categories / product type', 'kategori'],
  availability: ['availability', 'stock status', 'availability status', 'stok durumu'],
  price: ['price', 'fiyat'], sale_price: ['sale price', 'indirimli fiyat'],
  description: ['description', 'açıklama'], plant_height: ['plant height', 'bitki boyu'],
  pot_type: ['pot type', 'saksı tipi'],
};

const normalize = (value: string): string => value.trim().toLocaleLowerCase('en-US');
const cellColumn = (ref: string): number => { const letters = (ref.match(/[A-Z]+/i)?.[0] ?? '').toUpperCase(); let n = 0; for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

export interface ParsedIkasProducts { rows: IkasProductRow[]; headers: string[]; }

export const parseIkasProductsXlsx = (bytes: Uint8Array): ParsedIkasProducts => {
  const files = unzipSync(bytes);
  const workbook = files['xl/workbook.xml'];
  const sheet = files['xl/worksheets/sheet1.xml'];
  if (!workbook || !sheet) throw new Error('Unsupported XLSX: workbook or first worksheet is missing.');
  const shared = files['xl/sharedStrings.xml'];
  const sharedValues = shared ? Array.from(new DOMParser().parseFromString(strFromU8(shared), 'application/xml').getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')) : [];
  const doc = new DOMParser().parseFromString(strFromU8(sheet), 'application/xml');
  const rowNodes = Array.from(doc.getElementsByTagName('row'));
  if (rowNodes.length < 2) throw new Error('XLSX worksheet must contain a header and at least one data row.');
  const readRow = (row: Element): string[] => {
    const values: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const index = cellColumn(cell.getAttribute('r') ?? 'A1'); const type = cell.getAttribute('t'); const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      values[index] = type === 's' ? (sharedValues[Number(value)] ?? '') : value;
    }
    return values.map((v) => v ?? '');
  };
  const headers = readRow(rowNodes[0]).map((v) => v.trim());
  const mapped = new Map<IkasProductField, number>();
  Object.entries(FIELD_HEADERS).forEach(([field, names]) => { const index = headers.findIndex((header) => names.includes(normalize(header))); if (index >= 0) mapped.set(field as IkasProductField, index); });
  if (!mapped.has('product_id') && !mapped.has('variant_id')) throw new Error('Unsupported İkas workbook: no proven product or variant identity column.');
  const rows = rowNodes.slice(1).map((node) => { const values = readRow(node); const result: IkasProductRow = {}; for (const field of mapped.keys()) result[field] = values[mapped.get(field) ?? -1] || null; return result; });
  return { rows, headers };
};
