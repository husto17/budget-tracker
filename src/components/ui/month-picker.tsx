"use client";

import { useState } from "react";
import { format, subMonths, addMonths, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface MonthPickerProps {
  value: string; // YYYY-MM
  onChange: (month: string) => void;
  min?: string; // earliest allowed YYYY-MM
  max?: string; // latest allowed YYYY-MM
  className?: string;
  showNav?: boolean;
}

function toDate(monthStr: string): Date {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthPicker({ value, onChange, min, max, className, showNav = true }: MonthPickerProps) {
  const current = toDate(value);
  const [open, setOpen] = useState(false);
  const [calYear, setCalYear] = useState(current.getFullYear());

  const minDate = min ? toDate(min) : null;
  const maxDate = max ? toDate(max) : null;

  const prevMonth = subMonths(current, 1);
  const nextMonth = addMonths(current, 1);
  const canPrev = !minDate || prevMonth >= startOfMonth(minDate);
  const canNext = !maxDate || nextMonth <= startOfMonth(maxDate);

  return (
    <div className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {showNav && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(toKey(prevMonth))}
          disabled={!canPrev}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5 h-8 min-w-[140px] justify-center">
              <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <span>{format(current, "MMMM yyyy")}</span>
            </Button>
          }
        />
        <PopoverContent className="w-[260px] p-3" align="start">
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCalYear(calYear - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-semibold">{calYear}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCalYear(calYear + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }).map((_, i) => {
              const d = new Date(calYear, i, 1);
              const key = toKey(d);
              const selected = key === value;
              const disabled =
                (minDate && d < startOfMonth(minDate)) ||
                (maxDate && d > startOfMonth(maxDate));
              return (
                <button
                  key={i}
                  disabled={Boolean(disabled)}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className={`text-xs py-1.5 rounded-md transition-colors ${
                    selected
                      ? "bg-indigo-600 text-white"
                      : disabled
                      ? "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  {format(d, "MMM")}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {showNav && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(toKey(nextMonth))}
          disabled={!canNext}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
