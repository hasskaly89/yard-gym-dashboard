"use client";

import { useState } from "react";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface FormData {
  staffName: string;
  abn: string;
  hourlyRate: string;
  hours: Record<string, string>;
  weekEnding: string;
}

export default function TimesheetsPage() {
  const [form, setForm] = useState<FormData>({
    staffName: "",
    abn: "",
    hourlyRate: "",
    hours: Object.fromEntries(DAYS.map((d) => [d, ""])),
    weekEnding: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const totalHours = DAYS.reduce((sum, day) => sum + (parseFloat(form.hours[day]) || 0), 0);
  const totalPay = totalHours * (parseFloat(form.hourlyRate) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, totalHours, totalPay }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submission failed");
      }

      setStatus("success");
      setForm({
        staffName: "",
        abn: "",
        hourlyRate: "",
        hours: Object.fromEntries(DAYS.map((d) => [d, ""])),
        weekEnding: "",
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gym-text">Timesheets</h1>
        <p className="text-gym-text-secondary text-sm mt-1">Submit your weekly hours for payroll processing</p>
      </div>

      {status === "success" ? (
        <div className="bg-gym-surface border border-green-800 rounded-xl p-8 flex flex-col items-center text-center max-w-md mx-auto">
          <div className="w-14 h-14 bg-green-900/40 rounded-full flex items-center justify-center mb-4">
            <span className="text-green-400 text-2xl">✓</span>
          </div>
          <h2 className="text-gym-text font-semibold text-lg mb-2">Timesheet Submitted!</h2>
          <p className="text-gym-muted text-sm mb-6">Your timesheet has been submitted and a notification has been sent.</p>
          <button
            onClick={() => setStatus("idle")}
            className="bg-gym-accent hover:bg-gym-accent-hover text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Submit Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {/* Staff Details */}
          <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
            <h2 className="text-gym-text font-semibold mb-4 text-sm uppercase tracking-wider">Staff Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-gym-text-secondary text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Full Name <span className="text-gym-accent">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.staffName}
                  onChange={(e) => setForm({ ...form, staffName: e.target.value })}
                  placeholder="e.g. Jane Smith"
                  className="w-full bg-gym-bg border border-gym-border rounded-lg px-4 py-2.5 text-gym-text text-sm placeholder-gym-muted focus:outline-none focus:border-gym-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-gym-text-secondary text-xs font-medium mb-1.5 uppercase tracking-wider">
                  ABN <span className="text-gym-accent">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.abn}
                  onChange={(e) => setForm({ ...form, abn: e.target.value })}
                  placeholder="e.g. 12 345 678 901"
                  className="w-full bg-gym-bg border border-gym-border rounded-lg px-4 py-2.5 text-gym-text text-sm placeholder-gym-muted focus:outline-none focus:border-gym-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-gym-text-secondary text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Hourly Rate (AUD) <span className="text-gym-accent">*</span>
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={form.hourlyRate}
                  onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                  placeholder="e.g. 35.00"
                  className="w-full bg-gym-bg border border-gym-border rounded-lg px-4 py-2.5 text-gym-text text-sm placeholder-gym-muted focus:outline-none focus:border-gym-accent transition-colors"
                />
              </div>
              <div>
                <label className="block text-gym-text-secondary text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Week Ending <span className="text-gym-accent">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.weekEnding}
                  onChange={(e) => setForm({ ...form, weekEnding: e.target.value })}
                  className="w-full bg-gym-bg border border-gym-border rounded-lg px-4 py-2.5 text-gym-text text-sm focus:outline-none focus:border-gym-accent transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Hours per day */}
          <div className="bg-gym-surface border border-gym-border rounded-xl p-6">
            <h2 className="text-gym-text font-semibold mb-4 text-sm uppercase tracking-wider">Hours Worked</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DAYS.map((day) => (
                <div key={day}>
                  <label className="block text-gym-text-secondary text-xs font-medium mb-1.5">{day.slice(0, 3)}</label>
                  <input
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    value={form.hours[day]}
                    onChange={(e) =>
                      setForm({ ...form, hours: { ...form.hours, [day]: e.target.value } })
                    }
                    placeholder="0"
                    className="w-full bg-gym-bg border border-gym-border rounded-lg px-3 py-2.5 text-gym-text text-sm placeholder-gym-muted focus:outline-none focus:border-gym-accent transition-colors"
                  />
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-gym-border grid grid-cols-2 gap-4">
              <div className="bg-gym-bg rounded-lg p-3 text-center">
                <p className="text-gym-muted text-xs uppercase tracking-wider mb-1">Total Hours</p>
                <p className="text-gym-text text-2xl font-bold">{totalHours.toFixed(1)}</p>
              </div>
              <div className="bg-gym-bg rounded-lg p-3 text-center">
                <p className="text-gym-muted text-xs uppercase tracking-wider mb-1">Total Pay</p>
                <p className="text-gym-accent text-2xl font-bold">
                  ${totalPay.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {status === "error" && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full bg-gym-accent hover:bg-gym-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg text-sm font-semibold transition-colors"
          >
            {status === "loading" ? "Submitting..." : "Submit Timesheet"}
          </button>
        </form>
      )}
    </div>
  );
}
