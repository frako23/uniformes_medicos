import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correo").fill(process.env.ADMIN_EMAIL ?? "");
  await page.getByLabel("Contraseña").fill(process.env.ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/admin\/?$/);
}

export async function downloadFile(page: Page, linkName: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: linkName }).click()]);
  return { name: download.suggestedFilename(), bytes: await readFile((await download.path()) as string) };
}

export async function uploadWorkbook(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel("Archivo de Excel").setInputFiles({ name, mimeType: XLSX_TYPE, buffer });
  await page.getByRole("button", { name: "Validar archivo" }).click();
}

export const unique = (prefix = "E2E") => `${prefix} ${Date.now()}`;

/** Celular venezolano de 10 dígitos que no se repite entre ejecuciones. */
export const uniquePhone = () => `0414-${String(Date.now()).slice(-7, -4)}-${String(Date.now()).slice(-4)}`;
