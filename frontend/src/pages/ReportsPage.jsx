import { lazy } from 'react';
import { useParams } from 'react-router-dom';
import TabbedPage from '../components/TabbedPage';
import { isManager } from '../hooks/useRole';

// Lazy tabs — keeps recharts out of the chunk until a report tab is opened.
const AnalyticsPage      = lazy(() => import('./AnalyticsPage'));
const MarketInsightsPage = lazy(() => import('./MarketInsightsPage'));

export default function ReportsPage() {
  const { tab } = useParams();

  const TABS = [
    { id: 'analytics', label: 'Analytics',       el: <AnalyticsPage /> },
    ...(isManager() ? [{ id: 'insights', label: 'Market Insights', el: <MarketInsightsPage /> }] : []),
  ];

  return <TabbedPage base="/reports" tabs={TABS} activeId={tab} />;
}
