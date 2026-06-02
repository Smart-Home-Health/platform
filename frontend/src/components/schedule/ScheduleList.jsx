import React, { useMemo, useState, useEffect } from 'react';

/**
 * Shared schedule list for the live dashboard (meds / care tasks / nutrition).
 *
 * Each modal normalizes its API rows into the shape below and passes them in.
 * The component handles day/time grouping, status filters, the Mark-All
 * affordance, and the per-item card layout. Behavior was lifted from the
 * care-task scheduled view, which is the visual baseline for all three.
 *
 * Normalized item shape:
 * {
 *   id:               string,                // unique key
 *   scheduled_time:   ISO string,
 *   name:             string,
 *   description?:     string,
 *   category?:        { name, color } | null,
 *   status:           'pending' | 'due_warning' | 'due_on_time' | 'due_late' |
 *                     'upcoming' | 'missed' | 'completed' | 'skipped',
 *   is_completed:     boolean,
 *   is_yesterday?:    boolean,
 *   extra?:           ReactNode,             // inline metadata (e.g. dose)
 *   completeLabel?:   string,                // override the primary button text
 *   skipLabel?:       string,                // override the secondary button text
 *   completedLabel?:  string,                // shown when is_completed (default "✓ Completed")
 *   showSkip?:        boolean,               // force-enable skip when not 'missed'
 * }
 *
 * Props:
 *   items, loading, emptyText
 *   onMarkComplete(item)   — invoked when the Mark Complete button is clicked
 *   onSkip(item)           — optional skip handler
 *   title                  — section heading
 *   showFilters / setShowFilters / statusFilters / setStatusFilters — optional
 *     external state; if any are omitted the component manages them internally.
 *   showLegend             — default true
 */

const DEFAULT_FILTERS = {
  pending: true,
  due_warning: true,
  due_on_time: true,
  due_late: true,
  upcoming: true,
  missed: true,
  completed: false,
  skipped: false,
};

const FILTER_OPTIONS = [
  { key: 'pending', label: 'Pending', color: '#17a2b8' },
  { key: 'due_warning', label: 'Due Warning', color: '#ffc107' },
  { key: 'due_on_time', label: 'Due On Time', color: '#28a745' },
  { key: 'due_late', label: 'Due Late', color: '#dc3545' },
  { key: 'upcoming', label: 'Upcoming', color: '#17a2b8' },
  { key: 'missed', label: 'Missed', color: '#dc3545' },
  { key: 'completed', label: 'Completed', color: '#28a745' },
  { key: 'skipped', label: 'Skipped', color: '#6c757d' },
];

function getStatusColors(status) {
  switch (status) {
    case 'ready_to_take':
    case 'due_on_time':
      return { bg: '#d4edda', border: '#28a745', text: '#155724' };
    case 'upcoming':
    case 'pending':
      return { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' };
    case 'due_warning':
    case 'warning':
    case 'late_early':
      return { bg: '#fff3cd', border: '#ffc107', text: '#856404' };
    case 'due_late':
    case 'missed':
      return { bg: '#f8d7da', border: '#dc3545', text: '#721c24' };
    case 'completed':
      return { bg: '#e8f5e8', border: '#28a745', text: '#155724' };
    case 'skipped':
      return { bg: '#f8f9fa', border: '#6c757d', text: '#495057' };
    default:
      return { bg: '#f8f9fa', border: '#6c757d', text: '#495057' };
  }
}

function statusLabel(status) {
  switch (status) {
    case 'due_on_time': return 'on time';
    case 'due_warning': return 'warning';
    case 'due_late': return 'late';
    case 'pending': return 'pending';
    case 'upcoming': return 'upcoming';
    case 'missed': return 'missed';
    case 'completed': return 'completed';
    case 'skipped': return 'skipped';
    default: return status || '';
  }
}

export default function ScheduleList({
  items = [],
  loading = false,
  emptyText = 'No scheduled items',
  title,
  onMarkComplete,
  onSkip,
  onMarkAll,
  showFilters: showFiltersProp,
  setShowFilters: setShowFiltersProp,
  statusFilters: statusFiltersProp,
  setStatusFilters: setStatusFiltersProp,
  showLegend = true,
}) {
  // Internal fallback state when the parent doesn't manage filters.
  const [showFiltersInner, setShowFiltersInner] = useState(false);
  const [statusFiltersInner, setStatusFiltersInner] = useState(DEFAULT_FILTERS);
  const showFilters = showFiltersProp ?? showFiltersInner;
  const setShowFilters = setShowFiltersProp ?? setShowFiltersInner;
  const statusFilters = statusFiltersProp ?? statusFiltersInner;
  const setStatusFilters = setStatusFiltersProp ?? setStatusFiltersInner;

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const filtered = useMemo(
    () => items.filter(i => statusFilters[i.status] !== false),
    [items, statusFilters]
  );

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(FILTER_OPTIONS.map(o => [o.key, 0]));
    counts.total = items.length;
    for (const it of items) {
      if (counts[it.status] !== undefined) counts[it.status]++;
    }
    return counts;
  }, [items]);

  // Group by day, then by HH:MM (24h for sorting).
  const groupByDay = useMemo(() => {
    const buckets = {};
    for (const it of filtered) {
      const d = new Date(it.scheduled_time);
      const dayKey = d.toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const timeKey24 = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const timeLabel = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
      if (!buckets[dayKey]) buckets[dayKey] = { date: d, times: {} };
      if (!buckets[dayKey].times[timeKey24]) buckets[dayKey].times[timeKey24] = { label: timeLabel, items: [] };
      buckets[dayKey].times[timeKey24].items.push(it);
    }
    return buckets;
  }, [filtered]);

  const sortedDays = Object.keys(groupByDay).sort((a, b) =>
    groupByDay[a].date - groupByDay[b].date
  );

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading…</div>;
  }

  if (items.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: 40, color: '#a0aec0',
        backgroundColor: '#2d3748', borderRadius: 8, border: '1px solid #4a5568',
      }}>
        <p style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 500, color: '#fff' }}>{emptyText}</p>
      </div>
    );
  }

  const toggleStatusFilter = (key) =>
    setStatusFilters({ ...statusFilters, [key]: !statusFilters[key] });
  const selectAllFilters = () =>
    setStatusFilters(Object.fromEntries(FILTER_OPTIONS.map(o => [o.key, true])));
  const resetFilters = () => setStatusFilters(DEFAULT_FILTERS);

  return (
    <div>
      {/* Header + filter toggle */}
      <div style={{
        marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        {title && (
          <h3 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>{title}</h3>
        )}
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            padding: '8px 16px',
            backgroundColor: showFilters ? '#007bff' : '#6c757d',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}
        >{showFilters ? 'Hide Filters' : 'Show Filters'}</button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{
          marginBottom: 20, padding: 16,
          backgroundColor: '#2d3748', borderRadius: 8, border: '1px solid #4a5568',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 12,
          }}>
            <h4 style={{ margin: 0, color: '#fff', fontSize: 14, fontWeight: 600 }}>
              Filter by Status:
            </h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={selectAllFilters} style={{
                padding: '4px 8px', backgroundColor: '#007bff', color: '#fff',
                border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}>Toggle All</button>
              <button onClick={resetFilters} style={{
                padding: '4px 8px', backgroundColor: '#28a745', color: '#fff',
                border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer',
              }}>Reset to Default</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {FILTER_OPTIONS.map(opt => (
              <label key={opt.key} style={{
                display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                color: '#e2e8f0', fontSize: 12,
                padding: '4px 8px', borderRadius: 4,
                backgroundColor: statusFilters[opt.key] ? '#4a5568' : 'transparent',
                border: '1px solid #4a5568',
              }}>
                <input
                  type="checkbox"
                  checked={statusFilters[opt.key] || false}
                  onChange={() => toggleStatusFilter(opt.key)}
                  style={{ cursor: 'pointer' }}
                />
                <div style={{
                  width: 12, height: 12, backgroundColor: opt.color, borderRadius: '50%',
                }} />
                {opt.label} ({statusCounts[opt.key] || 0})
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Filtered-count banner */}
      {filtered.length !== items.length && (
        <div style={{
          marginBottom: 16, padding: '8px 12px',
          backgroundColor: '#374151', borderRadius: 6,
          color: '#e2e8f0', fontSize: 12,
        }}>
          Showing {filtered.length} of {items.length} items
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, color: '#a0aec0',
          backgroundColor: '#2d3748', borderRadius: 8, border: '1px solid #4a5568',
        }}>
          <p style={{ margin: '0 0 10px 0', fontSize: 18, fontWeight: 500, color: '#fff' }}>
            No items match current filters
          </p>
          <p style={{ margin: 0 }}>Adjust your status filters to see more items.</p>
        </div>
      ) : (
        sortedDays.map(dayKey => (
          <div key={dayKey} style={{ marginBottom: 36 }}>
            <div style={{
              fontWeight: 800, fontSize: 22, color: '#fff', marginBottom: 8,
              letterSpacing: 0.5, textShadow: '0 1px 2px #222',
            }}>{dayKey}</div>
            <div style={{ borderBottom: '2px solid #e2e8f0', marginBottom: 16 }} />

            {Object.keys(groupByDay[dayKey].times).sort().map(timeKey => {
              const slot = groupByDay[dayKey].times[timeKey];
              return (
                <div key={timeKey} style={{
                  marginBottom: 32,
                  background: '#181f2a', borderRadius: 18,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                  padding: '18px 24px',
                  display: 'flex', flexDirection: 'column',
                  border: '1.5px solid #2d3748',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 16,
                  }}>
                    <div style={{
                      fontWeight: 700, fontSize: 20, color: '#00bfff', letterSpacing: 0.2,
                      textShadow: '0 1px 2px #222',
                    }}>{slot.label}</div>
                    {(onMarkAll || onMarkComplete) && slot.items.some(i => !i.is_completed) && (
                      <button
                        onClick={() => {
                          if (onMarkAll) {
                            onMarkAll(slot.items.filter(i => !i.is_completed));
                          } else {
                            slot.items.forEach(it => {
                              if (!it.is_completed) onMarkComplete(it);
                            });
                          }
                        }}
                        style={{
                          background: '#007bff', color: '#fff', border: 'none',
                          borderRadius: 12, padding: '8px 18px', fontWeight: 600,
                          fontSize: 14, cursor: 'pointer',
                        }}
                      >Mark All</button>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {slot.items.map(item => {
                      const colors = getStatusColors(item.status);
                      const catColor = item.category?.color || '#6f42c1';
                      return (
                        <div key={item.id} style={{
                          backgroundColor: colors.bg,
                          borderRadius: isMobile ? 10 : 12,
                          padding: isMobile ? '12px 14px' : '14px 18px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          border: `1.5px solid ${colors.border}`,
                          borderLeft: `6px solid ${catColor}`,
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          alignItems: isMobile ? 'stretch' : 'center',
                          gap: isMobile ? 10 : 12,
                          opacity: item.is_completed ? 0.7 : 1,
                          position: 'relative',
                        }}>
                          {!isMobile && item.category && (
                            <div style={{
                              position: 'absolute', top: 8, right: 8,
                              width: 12, height: 12, borderRadius: '50%',
                              backgroundColor: catColor,
                              border: '2px solid #fff',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                            }} />
                          )}

                          <div style={{
                            flex: 1, display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            gap: isMobile ? 6 : 10,
                          }}>
                            <span style={{
                              color: colors.text,
                              fontSize: isMobile ? 15 : 16, fontWeight: 600, lineHeight: 1.3,
                            }}>{item.name}</span>
                            {item.extra && (
                              <span style={{
                                color: colors.text, fontSize: isMobile ? 13 : 14,
                                fontWeight: 400, opacity: 0.85, lineHeight: 1.3,
                              }}>{item.extra}</span>
                            )}
                            {item.description && (
                              <span style={{
                                color: colors.text, fontSize: isMobile ? 13 : 14,
                                fontWeight: 400, opacity: 0.8, lineHeight: 1.3,
                              }}>{isMobile ? item.description : `- ${item.description}`}</span>
                            )}
                            <div style={{
                              display: 'flex', gap: 6, flexWrap: 'wrap',
                              marginTop: isMobile ? 4 : 0,
                            }}>
                              {item.category?.name && (
                                <span style={{
                                  backgroundColor: catColor, color: '#fff',
                                  padding: '2px 8px', borderRadius: 12,
                                  fontSize: isMobile ? 10 : 11, fontWeight: 600,
                                }}>{item.category.name}</span>
                              )}
                              <span style={{
                                backgroundColor: colors.border, color: '#fff',
                                padding: '2px 8px', borderRadius: 12,
                                fontSize: isMobile ? 11 : 12, fontWeight: 500,
                              }}>{statusLabel(item.status)}</span>
                            </div>
                          </div>

                          <div style={{
                            display: 'flex', gap: isMobile ? 6 : 8,
                            width: isMobile ? '100%' : 'auto',
                          }}>
                            {item.is_completed ? (
                              <div style={{
                                padding: isMobile ? '10px 14px' : '6px 14px',
                                backgroundColor: '#e8f5e8', color: '#28a745',
                                borderRadius: 8,
                                fontSize: isMobile ? 14 : 13, fontWeight: 600,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 4, flex: isMobile ? 1 : '0 0 auto',
                              }}>{item.completedLabel || '✓ Completed'}</div>
                            ) : (
                              <>
                                {onMarkComplete && (
                                  <button
                                    onClick={() => onMarkComplete(item)}
                                    style={{
                                      padding: isMobile ? '10px 14px' : '6px 14px',
                                      border: 'none', borderRadius: 8,
                                      backgroundColor: '#28a745', color: '#fff',
                                      cursor: 'pointer',
                                      fontSize: isMobile ? 14 : 13, fontWeight: 500,
                                      boxShadow: '0 1px 2px rgba(0,0,0,0.07)',
                                      flex: isMobile ? 1 : '0 0 auto',
                                    }}
                                  >
                                    {item.completeLabel ||
                                      (item.status === 'missed' ? 'Complete Now' :
                                        (isMobile ? 'Complete' : 'Mark Complete'))}
                                  </button>
                                )}
                                {onSkip && (item.showSkip || item.status === 'missed') && (
                                  <button
                                    onClick={() => onSkip(item)}
                                    style={{
                                      padding: isMobile ? '10px 14px' : '6px 14px',
                                      border: '2px solid #6c757d', borderRadius: 8,
                                      backgroundColor: '#fff', color: '#6c757d',
                                      cursor: 'pointer',
                                      fontSize: isMobile ? 14 : 13, fontWeight: 500,
                                      flex: isMobile ? 1 : '0 0 auto',
                                    }}
                                  >{item.skipLabel || 'Skip'}</button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {showLegend && (
        <div style={{
          marginTop: 24, padding: 16,
          backgroundColor: '#2d3748', borderRadius: 8, border: '1px solid #4a5568',
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#fff', fontSize: 14, fontWeight: 600 }}>
            Status Legend:
          </h4>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12,
            color: '#e2e8f0', marginBottom: 12,
          }}>
            <Legend color="#28a745" label="Ready / On time" />
            <Legend color="#ffc107" label="Warning (running late)" />
            <Legend color="#dc3545" label="Late / Missed" />
            <Legend color="#17a2b8" label="Upcoming" />
          </div>
          <div style={{
            fontSize: 12, color: '#e2e8f0', marginTop: 8, paddingTop: 8,
            borderTop: '1px solid #4a5568',
          }}>
            <span style={{ fontWeight: 600 }}>Category color:</span> Left border indicates item category
          </div>
        </div>
      )}
    </div>
  );
}

const Legend = ({ color, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{ width: 12, height: 12, backgroundColor: color, borderRadius: '50%' }} />
    <span>{label}</span>
  </div>
);
