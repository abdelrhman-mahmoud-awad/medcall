import { lazy, Suspense } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import PageLoader from '../components/PageLoader';

// Lazy tabs — each tab page is its own chunk, loaded on first visit.
const ContactsPage        = lazy(() => import('./ContactsPage'));
const CallsPage           = lazy(() => import('./CallsPage'));
const DataEntryReviewPage = lazy(() => import('./DataEntryReviewPage'));
const ScriptsPage         = lazy(() => import('./ScriptsPage'));
const ExcelSyncPage       = lazy(() => import('./ExcelSyncPage'));

const TABS = [
  { id: 'contacts', label: 'Contacts',      el: <ContactsPage /> },
  { id: 'calls',    label: 'Call Log',      el: <CallsPage /> },
  { id: 'review',   label: 'Review',        el: <DataEntryReviewPage /> },
  { id: 'scripts',  label: 'Scripts',       el: <ScriptsPage /> },
  { id: 'import',   label: 'Import / Sync', el: <ExcelSyncPage /> },
];

export default function DataHubPage() {
  const { tab } = useParams();
  const active = TABS.find(t => t.id === tab);
  if (!active) return <Navigate to="/data/contacts" replace />;

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <NavLink key={t.id} to={`/data/${t.id}`}
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
