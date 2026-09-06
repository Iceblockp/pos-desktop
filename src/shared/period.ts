export interface DateRange {
  from: string;
  to: string;
}

export type RangeKey = 'today' | 'week' | 'month';

/**
 * Day boundaries in the device's local time, not UTC.
 *
 * A shop's "today" ends when it closes, not at midnight in London. Sales are
 * stored as UTC instants, so the range is built from local midnight and
 * converted — otherwise a 7pm sale in Yangon would land in the previous day's
 * takings.
 */
export function rangeFor(key: RangeKey, now = new Date()): DateRange {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (key === 'week') start.setDate(start.getDate() - 6);
  if (key === 'month') start.setDate(start.getDate() - 29);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { from: start.toISOString(), to: end.toISOString() };
}

/**
 * The periods a shop actually asks for.
 *
 * Calendar months, not rolling windows. Rent, wholesaler credit and the
 * electricity bill all run to the month, so "ဒီလ" means the 1st onwards — a
 * rolling 30 days answers a question nobody asked.
 */
export type PeriodKey =
  | 'today'
  | 'yesterday'
  | 'thisMonth'
  | 'lastMonth'
  | 'week'
  | 'rolling30'
  | 'custom';

export function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * Month arithmetic built from year and month numbers, never by subtracting.
 *
 * Stepping back a month from the 31st with setMonth gives 3 March, because
 * February has no 31st and Date silently rolls forward. Constructing from
 * (year, monthIndex, 1) cannot do that, and handles the January-to-December
 * year rollover on its own.
 */
export function monthStart(date: Date, monthsBack = 0): Date {
  return new Date(date.getFullYear(), date.getMonth() - monthsBack, 1, 0, 0, 0, 0);
}

export function periodRange(key: PeriodKey, now = new Date()): DateRange {
  switch (key) {
    case 'yesterday': {
      const day = new Date(now);
      day.setDate(day.getDate() - 1);
      return { from: startOfDay(day).toISOString(), to: endOfDay(day).toISOString() };
    }
    case 'thisMonth':
      // To now, not to the end of the month: there is nothing in the future,
      // and the label has to read as a month still in progress.
      return {
        from: monthStart(now).toISOString(),
        to: endOfDay(now).toISOString(),
      };
    case 'lastMonth': {
      const start = monthStart(now, 1);
      const end = new Date(monthStart(now).getTime() - 1);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    case 'week':
      return rangeFor('week', now);
    case 'rolling30':
      return rangeFor('month', now);
    case 'custom':
      // The caller holds the dates; asking for a custom range without them is
      // a programming error, so fall back to today rather than guess.
      return rangeFor('today', now);
    case 'today':
    default:
      return rangeFor('today', now);
  }
}

export function customRange(from: Date, to: Date): DateRange {
  // Swapped rather than rejected: picking the later date first is a slip, not
  // a request for an empty report.
  const [start, end] = from <= to ? [from, to] : [to, from];
  return { from: startOfDay(start).toISOString(), to: endOfDay(end).toISOString() };
}

