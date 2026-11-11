// Ward demo end to end: ward list → Discharge → AI draft → DRG / AdjRW comparison.
// Needs the seeded demo data (npm run seed-ward); the expected DRGs are the TGrp6305 results for those cases.
import { expect, test, type Locator, type Page } from "@playwright/test";

const section = (page: Page, heading: RegExp) =>
  page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });

async function expectRow(row: Locator, ...texts: string[]) {
  for (const t of texts) await expect(row).toContainText(t);
}

async function openFromWard(page: Page, name: string, an: string) {
  await page.goto("/ward");
  await page.getByRole("row", { name: new RegExp(name) }).getByRole("link", { name: "Discharge" }).click();
  await expect(page).toHaveURL(new RegExp(`/ward/${an}$`));
}

test("pneumonia with sepsis: physician answers and approver decisions re-group the case", async ({ page }) => {
  await openFromWard(page, "นางสมใจ", "69-005101");
  const compare = section(page, /เปรียบเทียบ DRG/);
  const row = (name: RegExp) => compare.getByRole("row", { name });

  await expectRow(row(/^A: ร่างปัจจุบัน/), "04523", "3.1233", "26,080");
  await expectRow(row(/^B: ภาวะไตเป็น prerenal azotemia/), "04522", "1.8974", "−1.2259");
  await expectRow(row(/^C: Sepsis with organ failure/), "04523", "ไม่เปลี่ยน");
  await expect(row(/^ผลตามคำตอบแพทย์/)).toHaveCount(0);

  await page.getByRole("radio", { name: "แพทย์ยืนยันตามแบบนี้" }).first().check();
  await expectRow(row(/^ผลตามคำตอบแพทย์/), "04522", "1.8974");

  const codes = section(page, /ข้อแนะนำการให้รหัส/);
  await codes.getByRole("row", { name: /J13/ }).getByRole("button", { name: "ปฏิเสธ" }).click();
  await expectRow(row(/^A: ร่างปัจจุบัน/), "26509", "error 1");
  await expect(section(page, /แบบสรุปการรักษา/).getByRole("row", { name: /J13/ })).toHaveClass(/line-through/);
  await expect(codes).toContainText("รอยืนยัน 5 จาก 6 รหัส");
});

test("stroke referred out: missing destination is a hard stop and a 1-day stay gets the short-stay AdjRW", async ({ page }) => {
  await openFromWard(page, "นายวิชัย", "69-005107");

  await expect(page.getByRole("alert").filter({ hasText: "ส่งเบิกไม่ได้จนกว่าจะแก้" })).toContainText("ไม่ได้ระบุชื่อสถานพยาบาลที่ส่งต่อ");
  await expect(page.getByText("สถานพยาบาลที่ส่งต่อ", { exact: true }).locator("..")).toContainText("ไม่ได้ระบุ");

  const compare = section(page, /เปรียบเทียบ DRG/);
  await expectRow(compare.getByRole("row", { name: /^A: ร่างปัจจุบัน/ }), "01550", "1.1574", "1.1053");

  const codes = section(page, /ข้อแนะนำการให้รหัส/);
  await expect(codes).toContainText("รอยืนยัน 5 จาก 5 รหัส");
  await codes.getByRole("row", { name: /I63\.9/ }).getByRole("button", { name: "รับ" }).click();
  await expect(codes).toContainText("รอยืนยัน 4 จาก 5 รหัส");
  await expect(codes.getByRole("row", { name: /I63\.9/ }).getByRole("button", { name: "รับ" })).toHaveAttribute("aria-pressed", "true");
});
