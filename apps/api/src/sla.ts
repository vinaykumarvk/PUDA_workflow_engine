import { query } from "./db";

/**
 * B6: Calculate SLA due date in working days, excluding weekends and authority-specific holidays.
 */
export async function calculateSLADueDate(
  startDate: Date,
  workingDays: number,
  authorityId: string
): Promise<Date> {
  // Load holidays for this authority in the relevant window (up to 2x working days + buffer for weekends)
  const windowEnd = new Date(startDate);
  windowEnd.setDate(windowEnd.getDate() + workingDays * 3 + 15); // generous buffer

  const result = await query(
    `SELECT holiday_date FROM authority_holiday
     WHERE authority_id = $1 AND holiday_date >= $2::date AND holiday_date <= $3::date`,
    [authorityId, startDate.toISOString().slice(0, 10), windowEnd.toISOString().slice(0, 10)]
  );

  const holidays = new Set(result.rows.map((r: any) => {
    const d = new Date(r.holiday_date);
    return d.toISOString().slice(0, 10);
  }));

  let dueDate = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < workingDays) {
    dueDate.setDate(dueDate.getDate() + 1);
    const dayOfWeek = dueDate.getDay();
    const dateStr = dueDate.toISOString().slice(0, 10);

    // Skip Saturday (6), Sunday (0), and authority holidays
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;
    if (holidays.has(dateStr)) continue;

    daysAdded++;
  }

  return dueDate;
}
