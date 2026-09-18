import type {
  DesktopSourceId,
} from './shared/desktop-multisource';
import type {
  DesktopDatePolicy,
} from './shared/desktop-run-resolution';

export type DesktopTaskGroup =
  | 'GOOGLE'
  | 'COMMERCE_SITE'
  | 'SEARCH_INTELLIGENCE';

export interface DesktopTaskDefinition {
  task_id: string;
  source_id: DesktopSourceId;
  task_name: string;
  description: string;
  group: DesktopTaskGroup;
  default_summary: string;
  date_policy?: DesktopDatePolicy;
}

export const DESKTOP_TASK_CATALOG:
  readonly DesktopTaskDefinition[] = [
    {
      task_id:
        'google-trends-interest-over-time',
      source_id:
        'google-trends',
      task_name:
        'Google Trends — Interest Over Time',
      description:
        'Relative search interest collected from configured Search Term groups.',
      group:
        'GOOGLE',
      default_summary:
        'Rolling 24 calendar months · Turkey · Web Search',
      date_policy:
        'TODAY_MINUS_24_CALENDAR_MONTHS_TO_YESTERDAY',
    },
    {
      task_id:
        'gsc-current-90-days',
      source_id:
        'google-search-console-query-page',
      task_name:
        'GSC — Current 90 Days',
      description:
        'Current Query × Page Search Console performance dataset.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 90 days → yesterday',
      date_policy:
        'TODAY_MINUS_90_TO_YESTERDAY',
    },
    {
      task_id:
        'gsc-long-16-months',
      source_id:
        'google-search-console-query-page',
      task_name:
        'GSC — Long 16 Months',
      description:
        'Long-window Query × Page Search Console history.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 16 calendar months → yesterday',
      date_policy:
        'TODAY_MINUS_16_CALENDAR_MONTHS_TO_YESTERDAY',
    },
    {
      task_id:
        'google-ads-search-terms',
      source_id:
        'google-ads-search-terms',
      task_name:
        'Google Ads — Search Terms',
      description:
        'First-party Search Terms performance data from Google Ads.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 17 days → yesterday',
      date_policy:
        'TODAY_MINUS_17_TO_YESTERDAY',
    },
    {
      task_id:
        'keyword-planner-historical-metrics',
      source_id:
        'google-keyword-planner',
      task_name:
        'Keyword Planner — Historical Metrics',
      description:
        'Historical keyword metrics for configured collection groups.',
      group:
        'GOOGLE',
      default_summary:
        'Last 12 complete calendar months',
    },
    {
      task_id:
        'keyword-planner-manual-csv-import',
      source_id:
        'google-keyword-planner-csv',
      task_name:
        'Keyword Planner — Manual CSV Import',
      description:
        'Manual Keyword Stats export preserved as immutable run evidence.',
      group:
        'GOOGLE',
      default_summary:
        'Observed UTF-16 tab-delimited Keyword Stats export',
    },
    {
      task_id:
        'ikas-products-import',
      source_id:
        'ikas-products',
      task_name:
        'İkas — Products Import',
      description:
        'Manual Products XLSX import preserved as run evidence.',
      group:
        'COMMERCE_SITE',
      default_summary:
        'Current full Products XLSX export',
    },
    {
      task_id:
        'bitkimark-sitemap',
      source_id:
        'bitkimark-sitemap',
      task_name:
        'Bitkimark — Sitemap/XML',
      description:
        'Current full sitemap/XML URL inventory snapshot.',
      group:
        'COMMERCE_SITE',
      default_summary:
        'Current full inventory · snapshot today',
    },
    {
      task_id:
        'serpapi-serp-snapshot',
      source_id:
        'serpapi',
      task_name:
        'SerpApi — SERP Snapshot',
      description:
        'Google Turkey desktop SERP snapshot including organic results and PAA.',
      group:
        'SEARCH_INTELLIGENCE',
      default_summary:
        'Snapshot today · Turkey · Turkish · Desktop',
    },
  ];
