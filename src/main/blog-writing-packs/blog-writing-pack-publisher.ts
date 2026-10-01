import type { BlogWritingPackAssembly } from '../../shared/blog-writing-pack';
import { renderBlogWritingPackWorkbook } from '../export/blog-writing-pack-exporter';
import {
  BlogWritingPackStore,
  type PublishedBlogWritingPack,
} from './blog-writing-pack-store';

export const publishBlogWritingPack = async (
  store: BlogWritingPackStore,
  assembly: BlogWritingPackAssembly,
): Promise<PublishedBlogWritingPack> => store.publish({
  manifest: assembly.manifest,
  data_package: assembly.data_package,
  workbook_bytes: await renderBlogWritingPackWorkbook(assembly),
});
