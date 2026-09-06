import { lazy, Suspense } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import PageLoader from '../components/PageLoader';

// Lazy tabs — keeps recharts out of the chunk until a report tab is opened.
const AnalyticsPage      = lazy(() => import('./AnalyticsPage'));
const MarketInsightsPage = lazy(() => import('./MarketInsightsPage'));

export default function ReportsPage() {
  const { tab } = useParams();
  const isManager = (localStorage.getItem('medcall_role') || 'manager') !== 'member';

  const TABS = [
    { id: 'analytics', label: 'Analytics',       el: <AnalyticsPage /> },
    ...(isManager ? [{ id: 'insights', label: 'Market Insights', el: <MarketInsightsPage /> }] : []),
  ];

  const active = TABS.find(t => t.id === tab);
  if (!active) return <Navigate to="/reports/analytics" replace />;

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <NavLink key={t.id} to={`/reports/${t.id}`}
                   className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Suspense fallback={<PageLoader />}>
        {active.el}
      </Suspense>
    </div>
  );
}
