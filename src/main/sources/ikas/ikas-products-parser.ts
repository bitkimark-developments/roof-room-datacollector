import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser, type Element } from '@xmldom/xmldom';
import type { IkasProductField, IkasProductRow } from '../../../shared/ikas-products';

const FIELD_HEADERS: Record<IkasProductField, string[]> = {
  product_title: ['product title', 'title', 'ürün adı', 'isim'], product_id: ['product id', 'ürün id', 'ürün grup id'], variant_id: ['variant id', 'varyant id'],
  url: ['url', 'product url', 'ürün url'], categories_product_type: ['categories / product type', 'kategori'], categories: ['categories', 'kategoriler'], product_type: ['product type', 'tip'],
  availability: ['availability', 'stock status', 'availability status', 'stok durumu'], price: ['price', 'fiyat', 'satış fiyatı'], sale_price: ['sale price', 'indirimli fiyat', 'indirimli fiyatı'],
  description: ['description', 'açıklama'], slug: ['slug'], image_url: ['image url', 'resim url'], plant_height: ['plant height', 'bitki boyu'], pot_type: ['pot type', 'saksı tipi'],
  stock: ['stock', 'stok:ana depo'], deleted: ['deleted', 'silindi mi?'], variant_active: ['variant active', 'varyant aktiflik'], continue_selling: ['continue selling', 'stoğu tükenince satmaya devam et'],
  sales_channel_lower: [], sales_channel_upper: [],
};

const normalize = (value: string): string => value.trim().normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US');
const cellColumn = (ref: string): number => { const letters = (ref.match(/[A-Z]+/iu)?.[0] ?? '').toUpperCase(); let n = 0; for (const c of letters) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
const parseNumber = (value: string): number | null => { const text = value.trim(); if (!text) return null; const normalized = text.includes(',') && !text.includes('.') ? text.replace(',', '.') : text.replace(/,/gu, ''); const number = Number(normalized); return Number.isFinite(number) ? number : null; };
const parseBoolean = (value: string): boolean | null => { const normalized = normalize(value); if (!normalized) return null; if (['true', '1', 'yes', 'evet', 'aktif'].includes(normalized)) return true; if (['false', '0', 'no', 'hayır', 'pasif'].includes(normalized)) return false; return null; };
const availability = (row: IkasProductRow): string => { if (row.deleted === true) return 'DELETED'; if (row.variant_active === false) return 'INACTIVE'; if (typeof row.stock === 'number' && row.stock > 0) return 'AVAILABLE'; if (row.stock === 0 && row.continue_selling === true) return 'BACKORDERABLE'; if (row.stock === 0 && row.continue_selling !== null) return 'OUT_OF_STOCK'; return 'UNKNOWN'; };

export interface ParsedIkasProducts { rows: IkasProductRow[]; headers: string[]; sheet_name: string; issues: string[]; }

export const parseIkasProductsXlsx = (bytes: Uint8Array): ParsedIkasProducts => {
  const files = unzipSync(bytes); const workbook = files['xl/workbook.xml']; const sheet = files['xl/worksheets/sheet1.xml'];
  if (!workbook || !sheet) throw new Error('Unsupported XLSX: workbook or first worksheet is missing.');
  const workbookDoc = new DOMParser().parseFromString(strFromU8(workbook), 'application/xml'); const sheetName = workbookDoc.getElementsByTagName('sheet')[0]?.getAttribute('name') ?? 'Sheet1';
  const shared = files['xl/sharedStrings.xml']; const sharedValues = shared ? Array.from(new DOMParser().parseFromString(strFromU8(shared), 'application/xml').getElementsByTagName('si')).map((si) => Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')) : [];
  const doc = new DOMParser().parseFromString(strFromU8(sheet), 'application/xml'); const rowNodes = Array.from(doc.getElementsByTagName('row')); if (rowNodes.length < 2) throw new Error('XLSX worksheet must contain a header and at least one data row.');
  const readRow = (row: Element): string[] => { const values: string[] = []; for (const cell of Array.from(row.getElementsByTagName('c'))) { const index = cellColumn(cell.getAttribute('r') ?? 'A1'); const type = cell.getAttribute('t'); const value = cell.getElementsByTagName('v')[0]?.textContent ?? ''; values[index] = type === 's' ? (sharedValues[Number(value)] ?? '') : value; } return values.map((v) => v ?? ''); };
  const headers = readRow(rowNodes[0]).map((v) => v.trim()); const normalizedHeaders = headers.map(normalize); const mapped = new Map<IkasProductField, number>();
  (Object.entries(FIELD_HEADERS) as [IkasProductField, string[]][]).forEach(([field, names]) => { const normalizedNames = names.map(normalize); const index = normalizedHeaders.findIndex((header) => normalizedNames.includes(header)); if (index >= 0) mapped.set(field, index); });
  const lowerChannel = headers.findIndex((header) => header === 'Satış Kanalı:bitkimark'); const upperChannel = headers.findIndex((header) => header === 'Satış Kanalı:Bitkimark');
  if (lowerChannel >= 0) mapped.set('sales_channel_lower', lowerChannel); if (upperChannel >= 0) mapped.set('sales_channel_upper', upperChannel);
  const variantTypeIndexes = [1, 2, 3].map((slot) => ({ type: normalizedHeaders.indexOf(normalize(`Varyant Tip ${slot}`)), value: normalizedHeaders.indexOf(normalize(`Varyant Değer ${slot}`)) }));
  if (!mapped.has('product_id') || !mapped.has('variant_id')) throw new Error('Unsupported İkas workbook: Ürün Grup ID and Varyant ID are required.'); if (!mapped.has('product_title')) throw new Error('Unsupported İkas workbook: İsim is required.');
  const issues: string[] = []; const rows = rowNodes.slice(1).map((node, rowIndex) => { const values = readRow(node); const valueAt = (field: IkasProductField): string => values[mapped.get(field) ?? -1] ?? ''; const result: IkasProductRow = {};
    for (const field of mapped.keys()) { const raw = valueAt(field); if (['price', 'sale_price', 'stock'].includes(field)) { const parsed = parseNumber(raw); if (raw.trim() && parsed === null) issues.push(`row ${rowIndex + 2} ${field} is not numeric`); result[field] = parsed; } else if (['deleted', 'variant_active', 'continue_selling'].includes(field)) result[field] = parseBoolean(raw); else result[field] = raw.trim() || null; }
    const attributes: Record<string, string> = {}; for (const pair of variantTypeIndexes) { if (pair.type < 0 || pair.value < 0) continue; const label = values[pair.type] ?? ''; const value = values[pair.value] ?? ''; if (normalize(label) === normalize('Bitki Boyu (Saksı Dahil)')) result.plant_height = value.trim() || null; if (normalize(label) === normalize('Saksı Tipi')) result.pot_type = value.trim() || null; if (label.trim()) attributes[label.trim()] = value.trim() || ''; }
    result.variant_attributes = attributes; if (!Object.prototype.hasOwnProperty.call(result, 'url')) result.url = null; if (!Object.prototype.hasOwnProperty.call(result, 'plant_height')) result.plant_height = null; if (!Object.prototype.hasOwnProperty.call(result, 'pot_type')) result.pot_type = null; if (!Object.prototype.hasOwnProperty.call(result, 'stock')) result.stock = null; if (!Object.prototype.hasOwnProperty.call(result, 'deleted')) result.deleted = null; if (!Object.prototype.hasOwnProperty.call(result, 'variant_active')) result.variant_active = null; if (!Object.prototype.hasOwnProperty.call(result, 'continue_selling')) result.continue_selling = null; result.availability = availability(result); return result; });
  return { rows, headers, sheet_name: sheetName, issues };
};
