import { lazy } from 'react';
import { useParams } from 'react-router-dom';
import TabbedPage from '../components/TabbedPage';
import { isManager } from '../hooks/useRole';

// One "Calling" page for the AI-calling engine:
//   Quick calls  — immediate ad-hoc calls (former Call Center)
//   Campaigns    — queued named bulk runs (former Campaigns page, managers only)
const CallCenterPage = lazy(() => import('./CallCenterPage'));
const CampaignPage   = lazy(() => import('./CampaignPage'));

export default function CallingPage() {
  const { tab } = useParams();

  const TABS = [
    { id: 'quick', label: 'Quick calls', el: <CallCenterPage /> },
    ...(isManager() ? [{ id: 'campaigns', label: 'Campaigns', el: <CampaignPage /> }] : []),
  ];

  return <TabbedPage base="/calling" tabs={TABS} activeId={tab} />;
}
