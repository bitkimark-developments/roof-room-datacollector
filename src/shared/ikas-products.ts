export const IKAS_PRODUCTS_SOURCE_ID = 'ikas-products';
export const IKAS_PRODUCT_FIELDS = [
  'product_title', 'product_id', 'variant_id', 'url', 'categories_product_type',
  'categories', 'product_type', 'availability', 'price', 'sale_price', 'description', 'slug', 'image_url',
  'plant_height', 'pot_type', 'stock', 'deleted', 'variant_active', 'continue_selling',
  'sales_channel_lower', 'sales_channel_upper',
] as const;
export type IkasProductField = (typeof IKAS_PRODUCT_FIELDS)[number];
export interface IkasProductRow { [key: string]: string | number | boolean | Record<string, string> | null; }
