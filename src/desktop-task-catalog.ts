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

interface DesktopTaskDefinitionBase {
  task_id: string;
  task_name: string;
  description: string;
  group: DesktopTaskGroup;
  default_summary: string;
}

export interface CollectionDesktopTaskDefinition extends DesktopTaskDefinitionBase {
  task_kind: 'COLLECTION';
  source_id: DesktopSourceId;
  date_policy?: DesktopDatePolicy;
}

export interface TaskPackageDesktopTaskDefinition extends DesktopTaskDefinitionBase {
  task_kind: 'TASK_PACKAGE';
  recipe_id: 'ADS_OPTIMIZATION_PACK';
}

export type DesktopTaskDefinition =
  | CollectionDesktopTaskDefinition
  | TaskPackageDesktopTaskDefinition;

export const DESKTOP_TASK_CATALOG:
  readonly DesktopTaskDefinition[] = [
    {
      task_kind: 'TASK_PACKAGE',
      task_id: 'ads-optimization-pack',
      recipe_id: 'ADS_OPTIMIZATION_PACK',
      task_name: 'Kampanya Gelişim',
      description: 'Local evidence package for six Google Ads SEARCH reporting datasets.',
      group: 'GOOGLE',
      default_summary: 'SEARCH only · last 7 complete local calendar days',
    },
    {
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
      task_id:
        'gsc-query-current-previous-28-days',
      source_id:
        'google-search-console-query',
      task_name:
        'GSC — Queries Current + Previous 28 Days',
      description:
        'Query-level Search Console performance for the current and immediately preceding 28-day windows.',
      group:
        'GOOGLE',
      default_summary:
        'Current 28 days + previous 28 days · complete days through yesterday',
    },
    {
      task_kind: 'COLLECTION',
      task_id:
        'gsc-query-page-current-7-days',
      source_id:
        'google-search-console-query-page',
      task_name:
        'GSC — Query × Page Current 7 Days',
      description:
        'Current Query × Page Search Console performance dataset for the latest 7 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 7 days → yesterday',
      date_policy:
        'TODAY_MINUS_7_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
      task_id:
        'gsc-query-page-current-14-days',
      source_id:
        'google-search-console-query-page',
      task_name:
        'GSC — Query × Page Current 14 Days',
      description:
        'Current Query × Page Search Console performance dataset for the latest 14 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 14 days → yesterday',
      date_policy:
        'TODAY_MINUS_14_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
      task_id:
        'gsc-query-page-current-30-days',
      source_id:
        'google-search-console-query-page',
      task_name:
        'GSC — Query × Page Current 30 Days',
      description:
        'Current Query × Page Search Console performance dataset for the latest 30 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 30 days → yesterday',
      date_policy:
        'TODAY_MINUS_30_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
      task_id:
        'gsc-query-page-current-28-days',
      source_id:
        'google-search-console-query-page',
      task_name:
        'GSC — Query × Page Current 28 Days',
      description:
        'Current Query × Page Search Console performance dataset for the latest 28 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 28 days → yesterday',
      date_policy:
        'TODAY_MINUS_28_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
      task_id:
        'google-ads-search-terms-7-days',
      source_id:
        'google-ads-search-terms',
      task_name:
        'Google Ads — Search Terms 7 Days',
      description:
        'First-party Search Terms performance data from Google Ads for the latest 7 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 7 days → yesterday',
      date_policy:
        'TODAY_MINUS_7_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
      task_id:
        'google-ads-search-terms-14-days',
      source_id:
        'google-ads-search-terms',
      task_name:
        'Google Ads — Search Terms 14 Days',
      description:
        'First-party Search Terms performance data from Google Ads for the latest 14 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 14 days → yesterday',
      date_policy:
        'TODAY_MINUS_14_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
      task_id:
        'google-ads-search-terms-30-days',
      source_id:
        'google-ads-search-terms',
      task_name:
        'Google Ads — Search Terms 30 Days',
      description:
        'First-party Search Terms performance data from Google Ads for the latest 30 complete days.',
      group:
        'GOOGLE',
      default_summary:
        'Today − 30 days → yesterday',
      date_policy:
        'TODAY_MINUS_30_TO_YESTERDAY',
    },
    {
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
      task_id:
        'google-analytics-4',
      source_id:
        'google-analytics-4',
      task_name:
        'Google Analytics 4',
      description:
        'First-party GA4 Content Performance and Paid Funnel evidence.',
      group:
        'GOOGLE',
      default_summary:
        'Explicit absolute date range · Content Performance + Paid Funnel',
    },
    {
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
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
      task_kind: 'COLLECTION',
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
