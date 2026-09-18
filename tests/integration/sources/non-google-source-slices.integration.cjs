const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, strToU8 } = require('fflate');
(async () => {
const [buildRoot, workRoot] = process.argv.slice(2);
if (!buildRoot || !workRoot) throw new Error('Expected compiled build root and temporary work root.');
const { parseIkasProductsXlsx } = require(path.join(buildRoot, 'main', 'sources', 'ikas', 'ikas-products-parser.js'));
const { parseBitkimarkSitemap } = require(path.join(buildRoot, 'main', 'sources', 'bitkimark', 'bitkimark-sitemap-parser.js'));
const { IkasProductsSource } = require(path.join(buildRoot, 'main', 'sources', 'ikas', 'ikas-products-source.js'));
const { BitkimarkSitemapSource } = require(path.join(buildRoot, 'main', 'sources', 'bitkimark', 'bitkimark-sitemap-source.js'));
const { IkasProductsValidator } = require(path.join(buildRoot, 'main', 'sources', 'ikas', 'ikas-products-validator.js'));
const { BitkimarkSitemapValidator } = require(path.join(buildRoot, 'main', 'sources', 'bitkimark', 'bitkimark-sitemap-validator.js'));

const columnName = (index) => { let value = index + 1; let output = ''; while (value > 0) { const remainder = (value - 1) % 26; output = String.fromCharCode(65 + remainder) + output; value = Math.floor((value - 1) / 26); } return output; };
const sheet = (rows) => `<?xml version="1.0"?><worksheet><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => `<c r="${columnName(c)}${r + 1}" t="str"><v>${v}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
const xlsx = new Uint8Array(zipSync({ 'xl/workbook.xml': strToU8('<workbook/>'), 'xl/worksheets/sheet1.xml': strToU8(sheet([['Product ID', 'Variant ID', 'Product title', 'Price', 'Sale price'], ['p1', 'v1', 'Ficus', '12.5', '']])) }));
const parsed = parseIkasProductsXlsx(xlsx);
assert.equal(parsed.rows[0].product_id, 'p1');
assert.equal(parsed.rows[0].product_title, 'Ficus');
assert.equal(parsed.rows[0].sale_price, null);
assert.throws(() => parseIkasProductsXlsx(new Uint8Array([1, 2, 3])));

const productionHeaders = ['Ürün Grup ID', 'Varyant ID', 'İsim', 'Açıklama', 'Satış Fiyatı', 'İndirimli Fiyatı', 'Alış Fiyatı', 'Barkod Listesi', 'SKU', 'Silindi mi?', 'Marka', 'Kategoriler', 'Etiketler', 'Resim URL', 'Metadata Başlık', 'Metadata Açıklama', 'Slug', 'Stok:Ana Depo', 'Tip', 'Varyant Tip 1', 'Varyant Değer 1', 'Varyant Tip 2', 'Varyant Değer 2', 'Varyant Tip 3', 'Varyant Değer 3', 'Desi', 'HS Kod', 'Birim Ürün Miktarı', 'Ürün Birimi', 'Satılan Ürün Miktarı', 'Satılan Ürün Birimi', 'Google Ürün Kategorisi', 'Tedarikçi', 'Stoğu Tükenince Satmaya Devam Et', 'Satış Kanalı:bitkimark', 'Satış Kanalı:Bitkimark', 'Sepet Başına Minimum Alma Adeti:bitkimark', 'Sepet Başına Maksimum Alma Adeti:bitkimark', 'Varyant Aktiflik', 'Oluşturulma Tarihi'];
const productionRow = (id, variant, title, sale, stock, active, continueSelling, slot2, slot3) => { const row = Array(40).fill(''); row[0] = id; row[1] = variant; row[2] = title; row[3] = '&lt;p&gt;HTML açıklama&lt;/p&gt;'; row[4] = '129.90'; row[5] = sale; row[11] = 'Bitkiler'; row[13] = 'https://cdn.example/image.jpg'; row[16] = `slug-${variant}`; row[17] = String(stock); row[18] = 'Bitki'; row[19] = 'Renk'; row[20] = 'Yeşil'; row[21] = slot2[0]; row[22] = slot2[1]; row[23] = slot3[0]; row[24] = slot3[1]; row[33] = continueSelling ? 'true' : 'false'; row[38] = active ? 'true' : 'false'; return row; };
const productionXlsx = new Uint8Array(zipSync({ 'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Ikas Excel File"/></sheets></workbook>'), 'xl/worksheets/sheet1.xml': strToU8(sheet([productionHeaders, productionRow('p1', 'v1', 'Ficus', '', 0, true, true, ['Saksı Tipi', 'Seramik'], ['Bitki Boyu (Saksı Dahil)', '120 cm']), productionRow('p1', 'v2', 'Ficus', '99.90', 4, true, false, ['Renk', 'Beyaz'], ['Saksı Tipi', 'Plastik']), productionRow('p2', 'v3', 'Saksı', '', 0, false, false, ['', ''], ['', ''])])) }));
const productionParsed = parseIkasProductsXlsx(productionXlsx);
assert.deepEqual(productionParsed.rows.map((row) => ({ id: row.product_id, variant: row.variant_id, title: row.product_title, categories: row.categories, type: row.product_type, price: row.price, sale: row.sale_price, slug: row.slug, url: row.url, height: row.plant_height, pot: row.pot_type, availability: row.availability })), [
  { id: 'p1', variant: 'v1', title: 'Ficus', categories: 'Bitkiler', type: 'Bitki', price: 129.9, sale: null, slug: 'slug-v1', url: null, height: '120 cm', pot: 'Seramik', availability: 'BACKORDERABLE' },
  { id: 'p1', variant: 'v2', title: 'Ficus', categories: 'Bitkiler', type: 'Bitki', price: 129.9, sale: 99.9, slug: 'slug-v2', url: null, height: null, pot: 'Plastik', availability: 'AVAILABLE' },
  { id: 'p2', variant: 'v3', title: 'Saksı', categories: 'Bitkiler', type: 'Bitki', price: 129.9, sale: null, slug: 'slug-v3', url: null, height: null, pot: null, availability: 'INACTIVE' },
]);
const productionPath = path.join(workRoot, 'ikas-production.xlsx'); fs.mkdirSync(workRoot, { recursive: true }); fs.writeFileSync(productionPath, productionXlsx);
const productionDecision = await new IkasProductsValidator().validate({ absolute_path: productionPath }); assert.equal(productionDecision.validation_status, 'VALID'); assert.deepEqual([...fs.readFileSync(productionPath)], [...productionXlsx]);
const ikasPath = path.join(workRoot, 'ikas.xlsx');
fs.mkdirSync(workRoot, { recursive: true }); fs.writeFileSync(ikasPath, xlsx);
const ikasSource = new IkasProductsSource();
const collectedIkas = await ikasSource.collect({ source_id: 'ikas-products', source_context: { task_id: 'ikas-products-import', source_id: 'ikas-products', source_mode: 'FILE_IMPORT', file_path: ikasPath } });
assert.equal(collectedIkas.result_type, 'ARTIFACT_PRODUCED');
assert.deepEqual([...collectedIkas.bytes], [...xlsx]);
const ikasDecision = await new IkasProductsValidator().validate({ absolute_path: ikasPath });
assert.equal(ikasDecision.validation_status, 'VALID');

const xml = Buffer.from('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://bitkimark.com/ficus-benjamin</loc></url><url><loc>https://bitkimark.com/about</loc><lastmod>2026-09-10</lastmod></url></urlset>');
const fakeFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => xml });
const sitemapSource = new BitkimarkSitemapSource('https://bitkimark.com/sitemap.xml', fakeFetch);
const collectedSitemap = await sitemapSource.collect({});
assert.equal(collectedSitemap.result_type, 'ARTIFACT_PRODUCED');
const sitemapDoc = parseBitkimarkSitemap(collectedSitemap.bytes, 'https://bitkimark.com/sitemap.xml', '2026-09-10T00:00:00.000Z');
assert.equal(sitemapDoc.entries.length, 2);
assert.deepEqual(sitemapDoc.entries[0].annotations, ['ficus', 'benjamin']);
assert.deepEqual(sitemapDoc.entries[1].annotations, []);
const sitemapPath = path.join(workRoot, 'sitemap.xml'); fs.writeFileSync(sitemapPath, xml);
const sitemapDecision = await new BitkimarkSitemapValidator().validate({ absolute_path: sitemapPath, source_context: { source_url: 'https://bitkimark.com/sitemap.xml' } });
assert.equal(sitemapDecision.validation_status, 'VALID');
const badFetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('<html>error</html>') });
const bad = await new BitkimarkSitemapSource('https://bitkimark.com/sitemap.xml', badFetch).collect({});
assert.equal(bad.result_type, 'ARTIFACT_PRODUCED');
assert.throws(() => parseBitkimarkSitemap(bad.bytes, 'https://bitkimark.com/sitemap.xml', '2026-09-10T00:00:00.000Z'));
console.log('PASS NON-GOOGLE-SOURCES-001: İkas XLSX and Bitkimark sitemap preserve raw bytes and produce validated source-specific parses');
})();
