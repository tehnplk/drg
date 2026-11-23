import type { Metadata } from "next";
import Calculator from "./calculator.tsx";

export const metadata: Metadata = { title: "คำนวณ DRG" };

export default function DrgCalculatorPage() {
  return <Calculator />;
}
