import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { formatRange, formatShort, pluralDays } from '../dates';
import type { LeaveRequest } from '../types';
import {
  Avatar,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  LoadingBlock,
  Modal,
  PageHeader,
  StatusBadge,
  useToast,
} from '../components/ui';

type Decision = 'approved' | 'rejected';

export function ApprovalsPage() {
  const notify = useToast();
  const [approvals, setApprovals] = useState<LeaveRequest[]>([]);
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<{ request: LeaveRequest; type: Decision } | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pending, decided] = await Promise.all([
        api.get<{ approvals: LeaveRequest[] }>('/approvals'),
        api.get<{ decisions: LeaveRequest[] }>('/approvals/history'),
      ]);
      setApprovals(pending.approvals);
      setHistory(decided.decisions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load approvals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openDecision(request: LeaveRequest, type: Decision) {
    setDecision({ request, type });
    setComment('');
    setDecisionError('');
  }

  async function submitDecision() {
    if (!decision) return;
    setDecisionError('');
    if (decision.type === 'rejected' && !comment.trim()) {
      setDecisionError('Add a short reason so the employee understands the decision.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/requests/${decision.request.id}/decision`, {
        decision: decision.type,
        comment,
      });
      notify(
        decision.type === 'approved'
          ? `${decision.request.userName.split(' ')[0]}’s leave was approved.`
          : `${decision.request.userName.split(' ')[0]}’s leave was rejected.`,
      );
      setDecision(null);
      void load();
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Unable to save the decision.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Approvals"
        subtitle="Review your team’s leave requests and keep decisions transparent."
        actions={
          <span className="count-pill count-pill-lg">
            {approvals.length} waiting
          </span>
        }
      />

      {error ? (
        <ErrorNote>
          {error}{' '}
          <button type="button" className="link-btn" onClick={() => void load()}>
            Try again
          </button>
        </ErrorNote>
      ) : null}

      {loading ? <LoadingBlock label="Loading approvals…" /> : null}

      {!loading && approvals.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="check"
            title="You’re all caught up"
            hint="No leave requests are waiting for your decision."
          />
        </div>
      ) : null}

      {!loading && approvals.length > 0 ? (
        <section className="approval-grid">
          {approvals.map((request) => {
            const remaining =
              request.available != null ? request.available - request.days : null;
            return (
              <article key={request.id} className="card approval-card">
                <div className="approval-head">
                  <Avatar name={request.userName} size="lg" />
                  <div className="approval-person">
                    <strong>{request.userName}</strong>
                    <span>
                      {request.department ?? 'No department'} · requested{' '}
                      {formatShort(request.createdAt.slice(0, 10))}
                    </span>
                  </div>
                  <div className="approval-days">
                    <strong>{request.days}</strong>
                    <span>{request.days === 1 ? 'day' : 'days'}</span>
                  </div>
                </div>

                <div className="approval-body">
                  <div className="approval-tags">
                    <span className="type-chip" style={{ borderColor: request.color, color: request.color }}>
                      <span className="type-dot" style={{ background: request.color }} />
                      {request.leaveType}
                    </span>
                    <span className={`status status-${request.status}`}>Awaiting approval</span>
                  </div>
                  <h3>{formatRange(request.startDate, request.endDate)}</h3>
                  <p className="approval-count">
                    {request.halfDay ? 'Half day' : pluralDays(request.days)} ·{' '}
                    {request.countMode === 'calendar' ? 'calendar days' : 'working days'}
                  </p>
                  {request.reason ? <p className="approval-quote">“{request.reason}”</p> : null}
                  {request.handover ? (
                    <p className="approval-handover">
                      <strong>Handover:</strong> {request.handover}
                    </p>
                  ) : null}
                  <p className="approval-balance">
                    {request.available == null
                      ? 'No fixed allowance for this leave type.'
                      : `Balance before approval: ${request.available} days available${
                          remaining != null ? ` · ${remaining} left after this request` : ''
                        }.`}
                  </p>
                </div>

                <div className="approval-actions">
                  <button
                    type="button"
                    className="btn btn-ghost danger-text"
                    onClick={() => openDecision(request, 'rejected')}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => openDecision(request, 'approved')}
                  >
                    Approve request
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      {!loading && history.length > 0 ? (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Your recent decisions</h2>
              <p>The last 12 requests you approved or rejected.</p>
            </div>
          </div>
          <ul className="decision-list">
            {history.map((request) => (
              <li key={request.id}>
                <Avatar name={request.userName} size="sm" />
                <div className="decision-main">
                  <strong>
                    {request.userName} · {request.leaveType}
                  </strong>
                  <span>
                    {formatRange(request.startDate, request.endDate)} · {pluralDays(request.days)}
                  </span>
                  {request.decisionComment ? <small>“{request.decisionComment}”</small> : null}
                </div>
                <StatusBadge status={request.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.type === 'approved' ? 'Approve leave request' : 'Reject leave request'}
        subtitle={
          decision
            ? `${decision.request.userName} · ${decision.request.leaveType} · ${formatRange(
                decision.request.startDate,
                decision.request.endDate,
              )}`
            : undefined
        }
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDecision(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${decision?.type === 'approved' ? 'btn-primary' : 'btn-danger'}`}
              onClick={() => void submitDecision()}
              disabled={submitting}
            >
              {submitting
                ? 'Saving…'
                : decision?.type === 'approved'
                  ? 'Approve leave'
                  : 'Reject request'}
            </button>
          </>
        }
      >
        {decision ? (
          <div className="stack">
            {decisionError ? <ErrorNote>{decisionError}</ErrorNote> : null}
            <InfoNote>
              {decision.type === 'approved'
                ? `${decision.request.days} day(s) will be deducted from ${decision.request.userName.split(' ')[0]}’s ${decision.request.leaveType} balance.`
                : 'The employee will see your reason and can submit a new request.'}
            </InfoNote>
            <Field
              label={decision.type === 'approved' ? 'Comment (optional)' : 'Reason for rejection'}
              hint={
                decision.type === 'approved'
                  ? 'A short note is shared with the employee.'
                  : 'Required — explain what needs to change.'
              }
            >
              <textarea
                rows={3}
                maxLength={500}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={
                  decision.type === 'approved'
                    ? 'e.g. Approved. Please complete the handover notes.'
                    : 'e.g. The team is short-staffed that week — could you shift the dates?'
                }
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
