"use client";
import React, { useMemo, useState } from "react";

function monthName(month: number) {
  return new Date(0, month).toLocaleString(undefined, { month: "long" });
}

function getCalendarMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonthDays = new Date(year, month, 0).getDate();

  const matrix: { date: Date; inMonth: boolean }[] = [];

  // previous month's tail
  for (let i = startDay - 1; i >= 0; i--) {
    matrix.push({ date: new Date(year, month - 1, prevMonthDays - i), inMonth: false });
  }

  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    matrix.push({ date: new Date(year, month, d), inMonth: true });
  }

  // next month fill
  const remaining = (7 - (matrix.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    matrix.push({ date: new Date(year, month + 1, i), inMonth: false });
  }

  return matrix;
}

export default function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [visible, setVisible] = useState(() => new Date());

  const year = visible.getFullYear();
  const month = visible.getMonth();

  const matrix = useMemo(() => getCalendarMatrix(year, month), [year, month]);

  function prev() {
    setVisible((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function next() {
    setVisible((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button onClick={prev} aria-label="Previous month">◀</button>
        <div className="calendar-title">{monthName(month)} {year}</div>
        <button onClick={next} aria-label="Next month">▶</button>
      </div>

      <div className="calendar-weekdays">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
          <div key={d} className="weekday">{d}</div>
        ))}
      </div>

      <div className="calendar-grid">
        {matrix.map(({ date, inMonth }, idx) => {
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div key={idx} className={"calendar-day" + (inMonth ? "" : " other-month") + (isToday ? " today" : "")}>
              <div className="date-number">{date.getDate()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
