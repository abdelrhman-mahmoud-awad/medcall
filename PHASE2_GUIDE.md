# MedCall AI - Phase 2 Implementation Guide

## What Phase 2 Provides

Phase 2 adds mass calling, real-time operations, human escalation, campaign
analytics, and contact management on top of the Phase 1 single-call flow.

The implementation lives in the source files below. This guide describes the
ownership and navigation only; it does not duplicate source code.

## Current Application Locations

| Capability | Current location |
|---|---|
| Quick outbound calls | `frontend/src/pages/CallCenterPage.jsx` via `/#/calling/quick` |
| Mass campaigns | `frontend/src/pages/CampaignPage.jsx` via `/#/calling/campaigns` |
| Live campaign calls | `frontend/src/components/LiveCallFeed.jsx` |
| Campaign cards and controls | `frontend/src/components/CampaignCard.jsx` |
| Analytics | `frontend/src/pages/AnalyticsPage.jsx` via `/#/reports/analytics` |
| Human agent console | `frontend/src/pages/AgentConsolePage.jsx` via `/#/agents` |
| Contacts and call list | `frontend/src/pages/ContactsPage.jsx` via `/#/data/contacts` |
| Campaign queue | `backend/src/queues/callQueue.js` and `backend/src/queues/callWorker.js` |
| Campaign API | `backend/src/routes/campaigns.js` |
| Analytics API | `backend/src/routes/analytics.js` |
| Agent API | `backend/src/routes/agents.js` |
| Real-time events | `backend/src/services/socketService.js` and `frontend/src/hooks/useSocket.js` |
| Human escalation | `backend/src/services/escalationService.js` and `backend/src/routes/twilio.js` |
| Campaign and agent models | `backend/src/models/Campaign.js` and `backend/src/models/Agent.js` |

These backend routes are registered in `backend/src/index.js`:

- `/api/campaigns`
- `/api/analytics`
- `/api/agents`

The frontend groups these capabilities into the current navigation:

```text
Calling
  ├── Quick calls
  └── Campaigns

Reports
  ├── Analytics
  └── Market Insights

Operations
  └── Agent Console
```

## Runtime Requirements

Add these values to `backend/.env` when the related services are used:

```env
REDIS_URL=redis://localhost:6379
MAX_CONCURRENT_CALLS=5
ESCALATION_PHONE=+20xxxxxxxxxx
CLIENT_URL=http://localhost:5173
```

Redis is required for campaign mass calling and scheduled queue jobs. Without
Redis, the backend still supports single calls and normal dashboard pages, but
campaign launch returns a clear unavailable response.

## Feature Ownership

### Mass Calling

`CampaignPage.jsx` creates campaigns from a script and selected contacts.
`routes/campaigns.js` stores campaigns and queues calls. `callWorker.js`
creates the outbound Twilio call and its `CallLog`.

Campaign completion and lead counters are updated by
`services/callSession.js`. Campaign progress is sent through
`socketService.js` to `useSocket.js` and `LiveCallFeed.jsx`.

### Analytics

`routes/analytics.js` supplies summary and timeline data.
and lead distribution. The Hot lead category is intentionally not displayed
AnalyticsPage.jsx` displays call volume, completion, escalation, average score,
and cold/warm lead distribution.

### Human Escalation

The conversation engine can return an `ESCALATE` action. `twilio.js` places
the caller into a conference and `escalationService.js` selects an available
agent or the configured fallback escalation phone. `AgentConsolePage.jsx`
shows agents and recent escalated calls.

### Contact Management

`ContactsPage.jsx` is the project call list. It supports manual contact CRUD,
Excel integration entry points, data validation, and AI verification controls.
CSV import remains available through `backend/src/scripts/importContacts.js`.

## Validation Checklist

- Redis responds to `redis-cli ping` with `PONG` before launching campaigns.
- A manager can create a campaign at `/#/calling/campaigns`.
- A campaign can select a project script and contacts, then launch when Redis is
  available.
- Live calls appear in the campaign page through Socket.io.
- Analytics loads at `/#/reports/analytics`.
- Escalations appear at `/#/agents` and can select available agents.
- Contacts are managed at `/#/data/contacts`.

## Phase 2 Completion Checklist

- [ ] Redis installed and reachable
- [ ] Campaign creation, launch, pause, and resume tested
- [ ] Queue worker creates outbound calls and CallLog records
- [ ] Socket.io call and campaign events appear in the UI
- [ ] Human escalation reaches an available agent
- [ ] Analytics summary and timeline load correctly
- [ ] Contact CSV import tested
- [ ] Active-project scoping reviewed for campaigns and analytics

## Later Work

- Office-hours-aware call scheduling and retry policy are now documented in
  Phase 6's Calendar feature.
- CRM exports and additional languages remain future work.
