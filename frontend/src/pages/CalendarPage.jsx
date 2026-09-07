import { useEffect, useMemo, useState } from 'react';
import {
  cancelCalendarEvent,
  createCalendarEvent,
  getCalendarEvents,
  getContacts,
  updateCalendarEvent,
} from '../services/api';
import { onProjectChange } from '../services/projectStore';

const STATUS_META = {
  scheduled: { label: 'Scheduled', cls: 'badge-blue' },
  'in-progress': { label: 'In progress', cls: 'badge-amber' },
  completed: { label: 'Completed', cls: 'badge-green' },
  cancelled: { label: 'Cancelled', cls: 'badge-gray' },
  failed: { label: 'Failed', cls: 'badge-red' },
};

const EMPTY_FORM = { contactId: '', scheduledAt: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, notes: '' };

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function monthLabel(date) {
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function calendarDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [calendarRes, contactsRes] = await Promise.all([
        getCalendarEvents(),
        getContacts({ limit: 200 }),
      ]);
      setEvents(calendarRes.data || []);
      setContacts(contactsRes.data.contacts || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load calendar callbacks.');
    }
  };

  useEffect(() => {
    load();
    return onProjectChange(load);
  }, []);

  const days = useMemo(() => calendarDays(month), [month]);
  const eventsByDay = useMemo(() => events.reduce((groups, event) => {
    const key = dayKey(new Date(event.scheduledAt));
    groups[key] = groups[key] || [];
    groups[key].push(event);
    return groups;
  }, {}), [events]);

  const upcoming = [...events]
    .filter(event => !['cancelled', 'completed'].includes(event.status))
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .slice(0, 8);

  const openNew = (date = new Date()) => {
    const local = new Date(date);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    setEditing(null);
    setForm({ ...EMPTY_FORM, scheduledAt: local.toISOString().slice(0, 16) });
    setError('');
    setShowForm(true);
  };

  const openEdit = (event) => {
    const local = new Date(event.scheduledAt);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    setEditing(event._id);
    setForm({
      contactId: event.contact?._id || event.contact,
      scheduledAt: local.toISOString().slice(0, 16),
      timezone: event.timezone || EMPTY_FORM.timezone,
      notes: event.notes || '',
    });
    setError('');
    setShowForm(true);
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, scheduledAt: new Date(form.scheduledAt).toISOString() };
      if (editing) await updateCalendarEvent(editing, payload);
      else await createCalendarEvent(payload);
      await load();
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save callback.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (event) => {
    if (!window.confirm(`Cancel the callback for ${event.contact?.name || 'this doctor'}?`)) return;
    try {
      await cancelCalendarEvent(event._id);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel callback.');
    }
  };

  return (
    <div className="page calendar-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">Calendar</h2>
          <p className="page-sub">Requested callbacks and the doctors waiting for their call</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() - 1); setMonth(d); }}>‹</button>
          <button className="btn btn-outline" onClick={() => setMonth(new Date())}>Today</button>
          <button className="btn btn-outline" onClick={() => { const d = new Date(month); d.setMonth(d.getMonth() + 1); setMonth(d); }}>›</button>
          <button className="btn btn-primary" onClick={() => openNew()}>+ Schedule callback</button>
        </div>
      </div>

      {error && <div className="alert alert-err">{error}</div>}

      <div className="calendar-layout">
        <section className="card calendar-card">
          <div className="calendar-toolbar">
            <h3 className="card-title">{monthLabel(month)}</h3>
            <span className="muted">{events.length} callbacks</span>
          </div>
          <div className="calendar-weekdays">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {days.map(date => {
              const key = dayKey(date);
              const dayEvents = eventsByDay[key] || [];
              const isCurrentMonth = date.getMonth() === month.getMonth();
              const isToday = key === dayKey(new Date());
              return (
                <div key={key} className={`calendar-day ${isCurrentMonth ? '' : 'is-muted'} ${isToday ? 'is-today' : ''}`} onDoubleClick={() => openNew(date)}>
                  <div className="calendar-day-head"><span>{date.getDate()}</span>{isToday && <i>Today</i>}</div>
                  <div className="calendar-events">
                    {dayEvents.slice(0, 3).map(event => {
                      const status = STATUS_META[event.status] || STATUS_META.scheduled;
                      return <button key={event._id} className={`calendar-event ${status.cls}`} onClick={() => openEdit(event)}>
                        <b>{formatTime(event.scheduledAt)}</b> {event.contact?.name || 'Doctor'}
                      </button>;
                    })}
                    {dayEvents.length > 3 && <span className="calendar-more">+{dayEvents.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="card upcoming-card">
          <div className="card-head"><h3 className="card-title">Upcoming callbacks</h3><span className="dot" style={{ background: 'var(--primary)' }} /></div>
          {upcoming.length === 0 ? <div className="empty-state">No callbacks scheduled yet.</div> : upcoming.map(event => {
            const status = STATUS_META[event.status] || STATUS_META.scheduled;
            return <div className="callback-item" key={event._id}>
              <div className="callback-date"><strong>{new Date(event.scheduledAt).toLocaleDateString([], { weekday: 'short' })}</strong><span>{new Date(event.scheduledAt).getDate()}</span></div>
              <div className="callback-info"><b>{event.contact?.name || 'Doctor'}</b><span>{formatTime(event.scheduledAt)} · {event.contact?.specialty || 'Physician'}</span><em className={`badge ${status.cls}`}>{status.label}</em></div>
              <button className="btn-icon" title="Cancel callback" onClick={() => cancel(event)}>×</button>
            </div>;
          })}
        </aside>
      </div>

      {showForm && <div className="overlay" onMouseDown={event => { if (event.target === event.currentTarget) setShowForm(false); }}>
        <form className="modal" onSubmit={save}>
          <h3>{editing ? 'Reschedule callback' : 'Schedule a callback'}</h3>
          <p className="modal-sub">The doctor will be called at the requested local time.</p>
          <div className="field"><label className="label">Doctor *</label><select className="select" required value={form.contactId} onChange={event => setForm(f => ({ ...f, contactId: event.target.value }))}><option value="">Select a doctor</option>{contacts.map(contact => <option key={contact._id} value={contact._id}>{contact.name} · {contact.phone}</option>)}</select></div>
          <div className="form-row field"><div><label className="label">Requested date & time *</label><input className="input" required type="datetime-local" value={form.scheduledAt} onChange={event => setForm(f => ({ ...f, scheduledAt: event.target.value }))} /></div><div><label className="label">Timezone</label><input className="input" required value={form.timezone} onChange={event => setForm(f => ({ ...f, timezone: event.target.value }))} /></div></div>
          <div className="field"><label className="label">Notes</label><textarea className="textarea" placeholder="What should the agent remember?" value={form.notes} onChange={event => setForm(f => ({ ...f, notes: event.target.value }))} /></div>
          <div className="modal-actions"><button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save new time' : 'Add to calendar'}</button></div>
        </form>
      </div>}
    </div>
  );
}
