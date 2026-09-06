import { lazy } from 'react';
import { useParams } from 'react-router-dom';
import TabbedPage from '../components/TabbedPage';
import { isManager } from '../hooks/useRole';

// Lazy tabs — each tab page is its own chunk, loaded on first visit.
const ContactsPage        = lazy(() => import('./ContactsPage'));
const CallsPage           = lazy(() => import('./CallsPage'));
const DataEntryReviewPage = lazy(() => import('./DataEntryReviewPage'));
const ScriptsPage         = lazy(() => import('./ScriptsPage'));
const ExcelSyncPage       = lazy(() => import('./ExcelSyncPage'));

export default function DataHubPage() {
  const { tab } = useParams();

  const TABS = [
    { id: 'contacts', label: 'Contacts',      el: <ContactsPage /> },
    { id: 'calls',    label: 'Call Log',      el: <CallsPage /> },
    { id: 'review',   label: 'Review',        el: <DataEntryReviewPage /> },
    ...(isManager() ? [
      { id: 'scripts',  label: 'Scripts',       el: <ScriptsPage /> },
      { id: 'import',   label: 'Import / Sync', el: <ExcelSyncPage /> },
    ] : []),
  ];

  return <TabbedPage base="/data" tabs={TABS} activeId={tab} />;
}
