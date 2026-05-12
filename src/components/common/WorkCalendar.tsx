import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface WorkSession {
  session_date: string;
  earliest_checkin_at: string | null;
  latest_checkout_at: string | null;
  total_records: number;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  session: WorkSession | null;
  hoursWorked: number | null; // decimal hours
}

const DAYS_VN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const MONTHS_VN = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

function calcHours(checkin: string | null, checkout: string | null): number | null {
  if (!checkin || !checkout) return null;
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  if (ms <= 0) return null;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function formatHours(h: number | null): string {
  if (h === null) return "-";
  return `${h.toFixed(1)}h`;
}

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Pad start
  const startPad = firstDay.getDay(); // 0=CN
  for (let i = startPad - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Month days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Pad end to complete grid (6 rows × 7 = 42)
  while (days.length < 42) {
    const last = days[days.length - 1];
    days.push(new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1));
  }
  return days;
}

function dateToStr(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

export default function WorkCalendar() {
  const { user } = useAuth();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [sessions, setSessions] = useState<Map<string, WorkSession>>(new Map());
  const [loading, setLoading] = useState(false);

  // Load sessions for the visible month
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);

    const startDate = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const endDate = new Date(viewYear, viewMonth + 1, 0).toLocaleDateString("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    });

    void supabase
      .from("work_sessions")
      .select("session_date, earliest_checkin_at, latest_checkout_at, total_records")
      .eq("user_id", user.id)
      .gte("session_date", startDate)
      .lte("session_date", endDate)
      .then(({ data }) => {
        const map = new Map<string, WorkSession>();
        (data ?? []).forEach((row: any) => {
          map.set(String(row.session_date), row as WorkSession);
        });
        setSessions(map);
      })
      .finally(() => setLoading(false));
  }, [user?.id, viewYear, viewMonth]);

  const days = getMonthDays(viewYear, viewMonth);
  const todayStr = dateToStr(today);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(y => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(y => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  const isFuture = (d: Date) => {
    const s = dateToStr(d);
    return s > todayStr;
  };

  // Summary
  const monthSessions = days
    .filter(d => d.getMonth() === viewMonth && !isFuture(d))
    .map(d => sessions.get(dateToStr(d)))
    .filter((s): s is WorkSession => s !== null);

  const totalDaysWorked = monthSessions.length;
  const totalHoursWorked = monthSessions.reduce((sum, s) => {
    const h = calcHours(s.earliest_checkin_at, s.latest_checkout_at);
    return sum + (h ?? 0);
  }, 0);

  const workDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {MONTHS_VN[viewMonth]} {viewYear}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalDaysWorked} ngày làm · {totalHoursWorked.toFixed(1)}h tổng
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={prevMonth}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={nextMonth}
              disabled={viewYear === today.getFullYear() && viewMonth === today.getMonth()}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1">
          {DAYS_VN.map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            const dateStr = dateToStr(d);
            const session = sessions.get(dateStr);
            const hoursWorked = session
              ? calcHours(session.earliest_checkin_at, session.latest_checkout_at)
              : null;
            const isToday = dateStr === todayStr;
            const inCurrentMonth = d.getMonth() === viewMonth;
            const future = isFuture(d);
            const hasSession = session !== null && !future;
            const noCheckout = hasSession && session.latest_checkout_at === null;

            let bgClass = "";
            if (hasSession) {
              if (noCheckout) {
                bgClass = "bg-amber-100 dark:bg-amber-900/40";
              } else if (hoursWorked !== null && hoursWorked >= 8) {
                bgClass = "bg-emerald-100 dark:bg-emerald-900/40";
              } else if (hoursWorked !== null && hoursWorked >= 4) {
                bgClass = "bg-blue-50 dark:bg-blue-950/40";
              } else {
                bgClass = "bg-slate-100 dark:bg-slate-800";
              }
            }

            return (
              <div
                key={i}
                className={`
                  relative flex flex-col items-center justify-start
                  rounded-lg p-1 min-h-[56px] text-center
                  transition-colors
                  ${inCurrentMonth ? "bg-muted/30" : "bg-muted/10"}
                  ${isToday ? "ring-2 ring-primary/60" : ""}
                  ${future ? "opacity-40" : ""}
                  ${hasSession ? bgClass : ""}
                `}
              >
                <span
                  className={`text-xs font-semibold leading-none mb-1 ${
                    isToday
                      ? "text-primary"
                      : inCurrentMonth
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {d.getDate()}
                </span>

                {hasSession && !future && (
                  <div className="flex flex-col items-center gap-0.5 w-full mt-1">
                    {session.total_records > 0 && (
                      <div className="flex items-center gap-0.5">
                        {session.earliest_checkin_at && (
                          <span className="text-[9px] leading-none text-emerald-600 dark:text-emerald-400">↑</span>
                        )}
                        {session.latest_checkout_at && (
                          <span className="text-[9px] leading-none text-amber-600 dark:text-amber-400">↓</span>
                        )}
                      </div>
                    )}
                    {hoursWorked !== null ? (
                      <span className={`text-[10px] font-bold leading-none ${
                        hoursWorked >= 8
                          ? "text-emerald-700 dark:text-emerald-400"
                          : hoursWorked >= 4
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-600 dark:text-slate-400"
                      }`}>
                        {hoursWorked.toFixed(1)}h
                      </span>
                    ) : (
                      noCheckout && (
                        <span className="text-[9px] text-amber-600 dark:text-amber-400 leading-none">...</span>
                      )
                    )}
                  </div>
                )}

                {/* Today dot */}
                {isToday && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 border-t border-border/50">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40 inline-block" />
            <span className="text-xs text-muted-foreground">≥8h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-50 dark:bg-blue-950/40 inline-block" />
            <span className="text-xs text-muted-foreground">4–7.9h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800 inline-block" />
            <span className="text-xs text-muted-foreground">&lt;4h</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/40 inline-block" />
            <span className="text-xs text-muted-foreground">Chưa check-out</span>
          </div>
        </div>

        {/* Monthly summary bar */}
        <div className="flex items-center gap-3 pt-2 border-t border-border/50">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Ngày đi làm</p>
            <p className="text-base font-bold text-foreground">{totalDaysWorked} / {workDaysInMonth}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Tổng giờ công</p>
            <p className="text-base font-bold text-foreground">{totalHoursWorked.toFixed(1)}h</p>
          </div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">TB / ngày</p>
            <p className="text-base font-bold text-foreground">
              {totalDaysWorked > 0 ? (totalHoursWorked / totalDaysWorked).toFixed(1) : "0"}h
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
