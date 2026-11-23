"use client";

import { Copy, Printer } from "lucide-react";
import { useState } from "react";

const btn = "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium whitespace-nowrap ring-1 ring-slate-200 hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800";

// Print the letter, or copy its text to paste into a message to the physician.
export function PrintButton() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = document.getElementById("letter")?.innerText ?? "";
    navigator.clipboard.writeText(text).then(() => setCopied(true), () => setCopied(false));
  };
  return (
    <div className="flex gap-2">
      <button type="button" onClick={copy} className={btn}><Copy className="size-4" /> {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}</button>
      <button type="button" onClick={() => window.print()} className={`${btn} bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700`}><Printer className="size-4" /> พิมพ์</button>
    </div>
  );
}
