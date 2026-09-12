# MedCall AI — Phase 7 Quality Control Review Guide

## What Phase 7 Delivers

**Call quality control for human and AI calls** — managers can review completed
calls, listen to recordings, read transcripts, rate call quality, and report
issues that need correction or follow-up. The review process covers both calls
handled by a human agent and calls handled by the AI caller.

Phase 7 adds a dedicated **Quality Control** page for managers. It does not
replace the Phase 4 data-entry review: Phase 4 confirms whether extracted form
data is correct, while Phase 7 evaluates the quality of the conversation and
the way the call was handled.

```
Completed human or AI call
        ↓
Call appears in the manager's Quality Control queue
        ↓
Manager opens the review
   ├── listens to the recording when available
   ├── reads the transcript and call details
   ├── checks consent, script coverage, accuracy, and conduct
   ├── gives ratings and optional notes
   └── reports one or more issues when something needs attention
        ↓
Review is saved with manager, date, ratings, notes, and issue history
        ↓
Quality dashboard shows trends by project, agent, call type, and issue type
```

The review must preserve the original call record. A quality review adds an
auditable assessment; it must not silently rewrite the recording, transcript,
call outcome, or the data-entry draft.

---

## Roles & Access Model

| Role | Quality-control access |
|---|---|
| **manager** | Assign human calls, review calls belonging to the manager's projects, rate them, report issues, resolve issues, and view quality summaries |
| **member** | Work calls assigned to them and continue data-entry tasks; cannot open the manager Quality Control page or change quality reviews |
| **admin / agent** | Keep the existing backward-compatible manager-level access described in Phase 5 |

- A manager can review both human-agent calls and AI calls in projects they
  own.
- A manager can assign uncompleted human calls to members attached to the
  relevant project.
- Project scoping remains mandatory: a manager must never see calls from
  another manager's projects.
- A manager may assign or acknowledge a reported issue, but the original
  review and rating remain part of the audit history.
- A call may be reviewed more than once when an issue is corrected or a
  follow-up review is requested; the system keeps the review history and marks
  the latest review clearly.

---

## Feature 1: Manager Call Assignment

Managers can distribute human calls to project members from the project call
list or the manager workspace. Assignment is for work that still needs to be
called; AI calls are not assigned to human members unless a manager explicitly
creates a human follow-up task.

### Assignment flow

```
Manager opens a project's available contacts or calls
        ↓
Selects one or more uncompleted calls
        ↓
Assigns them to a member attached to that project
        ↓
Member sees the calls in their My Calls worklist
        ↓
Member places the call and completes the normal call flow
        ↓
Completed call becomes available for manager quality review
```

The manager should be able to:

- assign one call or a batch of calls to a project member
- see unassigned, assigned, in-progress, completed, failed, and callback
  states
- filter by member, project, priority, outcome, and due date
- set an optional priority, due date, and assignment note
- reassign an unstarted call to another member
- remove an assignment before work begins
- view the member's assigned and completed call totals
- avoid assigning a call to a member who is not attached to the project

Members should be able to:

- see their assigned calls in a focused worklist
- open the contact and required project script from the worklist
- claim or start a call according to the existing calling flow
- see the assignment note, priority, and due date
- mark an assignment as unavailable or needing manager attention
- see calls they completed in their own history, but not change the assignment
  owner after completion

Assignment rules:

- A call can have at most one active human assignee.
- A manager can reassign an unstarted or failed call; the history keeps the
  previous member, reason, and time of reassignment.
- Starting a call changes the assignment to **in progress**. Completion,
  failure, no-answer, callback, and escalation remain visible as call
  outcomes.
- A completed human call keeps the member attribution used for progress and
  quality reporting.
- Campaign or AI calls remain attributable to their existing caller or flow;
  assignment must not change their original source.
- Members can only access assigned calls from projects they belong to.
- The manager must not silently overwrite an active assignment; reassignment
  requires a clear action and is recorded in history.

### Assignment and quality control

- The Quality Control queue shows the assigned member for every human call.
- Managers can filter quality reviews by assigned member and compare quality
  results with completed-call volume.
- Assignment notes are context for the caller and do not replace the quality
  reviewer's notes.
- A reported quality issue may trigger a follow-up call assignment, but it
  does not change the original review or call record.

---

## Feature 2: Light and Dark Mode

The application should support both visual modes through a visible theme
switch button. The existing dark mode remains the current mode and the default
for existing users; the manager or member can switch to light mode at any time
and switch back to dark mode.

Theme switch requirements:

- provide one clearly visible control in the shared application shell or
  account menu
- show the current mode and the mode that will be selected
- support **Dark mode** (the existing current theme) and **Light mode**
- update the full application consistently, including navigation, pages,
  forms, tables, dialogs, audio controls, charts, and status messages
- keep text, controls, borders, focus states, ratings, and issue severity
  colors readable in both modes
- preserve the selected mode when the user navigates between pages
- remember the user's choice on the same device and restore it on the next
  visit
- use an accessible button label and state so keyboard and assistive-technology
  users can change the mode
- do not change project data, call assignments, call reviews, or permissions
  when the theme changes

The theme control is a personal display preference. Managers and members may
choose different modes without affecting anyone else on the team.

---

## Quality Control Page

The page is a manager-only workspace with two connected views:

### Review queue

The queue helps the manager find calls that need attention:

- pending, reviewed, flagged, and resolved filters
- human calls, AI calls, or all calls
- project, assigned member, date range, call outcome, and rating filters
- search by contact, phone number, call ID, or reviewer
- sorting by newest, oldest, lowest rating, or highest priority
- clear indication when a recording, transcript, or consent evidence is
  unavailable
- pagination or incremental loading for large call histories

The queue should show enough context to prioritize work without opening every
call: call date, project, call type, agent, contact, duration, outcome,
review status, overall rating, and issue count.

### Call review workspace

Opening a call shows the evidence and the assessment together:

- audio player for the call recording, with timestamp seeking when supported
- transcript with speaker labels and timestamps when available
- call type: human or AI
- assigned user or AI flow, project, script, contact, outcome, duration, and
  consent result
- relevant call events, such as transfer, callback request, escalation, or
  failure
- linked data-entry draft and its status, without mixing its approval with the
  quality decision
- review form for ratings, notes, and issue reports
- previous reviews and the history of changes to issue status

The manager should be able to mark a call as reviewed even when evidence is
incomplete, while recording the missing evidence as a quality issue or review
note.

---

## Review Criteria and Ratings

Each review uses a consistent rating scale. The exact scale should be visible
on the page and applied the same way to human and AI calls.

Recommended criteria:

- **Consent and compliance** — consent was requested and handled correctly;
  recording and disclosure rules were followed.
- **Introduction and professionalism** — the caller identified the purpose of
  the call and communicated respectfully.
- **Script and question coverage** — required questions were asked in the
  correct project context without unnecessary omissions.
- **Accuracy** — contact details, answers, outcomes, and extracted information
  match the conversation.
- **Conversation quality** — the caller listened, responded appropriately, and
  avoided confusing or repetitive behavior.
- **Call outcome** — the final status, lead signal, callback, escalation, or
  rejection accurately reflects what happened.
- **Overall quality** — manager's final assessment of the complete call.

The manager can leave a short explanation for any low rating. An overall
rating should not be considered complete when a required criterion is missing.
The page should distinguish between a low-quality call and a call that cannot
be judged because its recording or transcript is unavailable.

Suggested outcome labels:

- **Pass** — acceptable quality; no corrective action required
- **Needs attention** — usable call with a coaching, configuration, or minor
  process issue
- **Fail** — serious quality, compliance, accuracy, or conduct problem
- **Unable to review** — insufficient evidence; requires technical follow-up

---

## Issue Reporting

Managers can report one or more issues directly from a call review. Every
issue includes a category, severity, description, and optional timestamp or
transcript reference so the problem can be located quickly.

Issue categories should include:

- consent or compliance
- incorrect script or missing question
- inaccurate answer, extraction, or call outcome
- poor human-agent conduct or communication
- AI misunderstanding, hallucination, repetition, or unsafe response
- audio, transcript, recording, or telephony failure
- contact or project configuration problem
- escalation, callback, or transfer handled incorrectly
- other quality concern

Severity levels:

- **low** — observation or minor improvement
- **medium** — quality problem that needs follow-up
- **high** — significant accuracy, operational, or customer experience risk
- **critical** — compliance, safety, privacy, or repeated system failure

Issue lifecycle:

1. Manager reports the issue from the call review.
2. The issue starts as **open** and remains attached to the call and project.
3. A manager can add an owner, action note, and due date.
4. The issue can move to **in progress**, **resolved**, or **dismissed** with a
   required explanation for resolution or dismissal.
5. Repeated issues should be grouped in quality summaries so managers can
   identify training, script, configuration, or AI-prompt problems.

Issue reports must not delete or overwrite earlier reports. Corrections and
status changes are recorded as history.

---

## Human and AI Call Differences

The same core review criteria apply to both call types, with additional checks
where appropriate:

### Human calls

- agent followed the assigned project script
- agent recorded answers and outcomes accurately
- agent used appropriate judgment when the contact was unclear, unavailable,
  or requested a callback
- agent escalated complaints, consent concerns, or sensitive situations
- coaching notes can be attached to the review

### AI calls

- AI used the correct project script, consent configuration, and language
- AI understood responses and did not invent information
- AI stayed within the configured purpose of the call
- AI handled interruptions, refusal, silence, callback requests, and
  escalation correctly
- AI did not repeat questions excessively or continue after a clear refusal
- issues can be marked for prompt, script, voice, transcription, or routing
  investigation

The review must show whether an issue is specific to one call or may affect
other calls using the same script, project configuration, AI prompt, or
telephony path.

---

## Quality Summaries

The Quality Control page should provide manager-level summaries without
exposing another manager's data:

- reviewed versus unreviewed calls
- average overall rating and rating by criterion
- human versus AI comparison
- issue count by category and severity
- open and overdue issues
- quality trend over time
- project, agent, and AI-flow breakdowns
- repeated issue patterns and calls requiring re-review

Summaries are decision-support views. They should link back to the underlying
calls and reviews so a manager can inspect the evidence behind a metric.

---

## Audit and Data Rules

- Every review stores the reviewing manager, review time, ratings, outcome,
  notes, and linked call.
- Every issue stores its reporter, timestamps, category, severity, status, and
  status-change history.
- Original recordings, transcripts, call outcomes, and data-entry drafts are
  retained as source evidence.
- Access follows the existing manager and project ownership rules.
- If a call is deleted or unavailable under existing retention rules, its
  review must show that the evidence is unavailable rather than appearing as
  an unqualified pass.
- Quality ratings and issue reports should be included in project audit and
  export views where those views already exist.

---

## Acceptance Tests

- A completed human call appears in the manager's Quality Control queue.
- A completed AI call appears in the same queue and is clearly labeled as an
  AI call.
- A manager can assign an uncompleted human call to a member in the same
  project.
- The assigned member sees the call in their worklist and can complete the
  normal human call flow.
- A member cannot access another member's assigned calls or calls from another
  project.
- A manager can reassign an unstarted or failed call, and the assignment
  history remains visible.
- Completed calls retain the member attribution used for progress and quality
  summaries.
- The application starts in the existing dark mode for a new or existing user
  without a saved preference.
- A user can switch between dark mode and light mode from the shared theme
  control, and the selected mode remains active while navigating.
- A saved theme preference is restored on the user's next visit without
  changing another user's mode.
- Quality Control pages, ratings, issue statuses, forms, and call evidence stay
  readable and visually consistent in both modes.
- A member cannot open the manager Quality Control page or submit a quality
  review.
- A manager can listen to a recording, inspect the transcript, rate each
  criterion, and save an overall review.
- A manager can report multiple issues on one call with category, severity,
  notes, and an optional timestamp.
- An issue can be assigned, updated, resolved, or dismissed without removing
  its history.
- A missing recording or transcript is visible and can be marked as unable to
  review.
- A review does not change the original call log, recording, transcript, or
  data-entry draft automatically.
- A manager sees only calls and quality data from owned projects.
- Quality summaries correctly separate human and AI calls and link metrics
  back to the reviewed calls.

---

## Phase 7 Boundary

Phase 7 evaluates call quality and manages corrective issues. It does not
automatically retrain an AI model, change a script, alter a project schema, or
approve data-entry values. Those actions remain separate, explicit workflows
that may use the quality findings as input in a later phase.