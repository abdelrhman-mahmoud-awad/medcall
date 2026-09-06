import { Suspense } from 'react';
import { NavLink, Navigate } from 'react-router-dom';
import PageLoader from './PageLoader';

/**
 * Shared layout for tabbed pages (Data hub, Reports, Calling…).
 *
 * The tabs row is wrapped in the standard `.page` container so it aligns with
 * the page content column (same 28px padding + 1240px max-width) and never
 * sits flush against the sidebar. Tab pages render their own `.page`, so the
 * wrapper keeps zero bottom padding to avoid doubled spacing.
 *
 * Props:
 *   base — route prefix, e.g. "/data"
 *   tabs — [{ id, label, el }]; falls back to the first tab on unknown ids
 *   activeId — the :tab route param
 */
export default function TabbedPage({ base, tabs, activeId }) {
  const active = tabs.find(t => t.id === activeId);
  if (!active) return <Navigate to={`${base}/${tabs[0].id}`} replace />;

  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="tabs">
          {tabs.map(t => (
            <NavLink key={t.id} to={`${base}/${t.id}`}
                     className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
      <Suspense fallback={<PageLoader />}>
        {active.el}
      </Suspense>
    </div>
  );
}
