export const IKAS_PRODUCTS_SOURCE_ID = 'ikas-products';
export const IKAS_PRODUCT_FIELDS = [
  'product_title', 'product_id', 'variant_id', 'url', 'categories_product_type',
  'availability', 'price', 'sale_price', 'description', 'plant_height', 'pot_type',
] as const;
export type IkasProductField = (typeof IKAS_PRODUCT_FIELDS)[number];
export interface IkasProductRow { [key: string]: string | number | null; }
