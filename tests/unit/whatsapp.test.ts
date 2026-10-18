import { describe, expect, it } from "vitest";
import { buildInstallmentReminder, whatsappUrl } from "../../src/utils/whatsapp";

describe("whatsappUrl", () => {
  it("quita el + del número", () => {
    expect(whatsappUrl("+584142467789")).toBe("https://wa.me/584142467789");
  });
  it("codifica el texto", () => {
    const text = "Hola, tu cuota vence mañana & más";
    expect(whatsappUrl("+584142467789", text)).toBe(`https://wa.me/584142467789?text=${encodeURIComponent(text)}`);
  });
  it("nunca contiene +", () => {
    expect(whatsappUrl("+13055551234", "a b")).not.toContain("+");
  });
});

describe("buildInstallmentReminder", () => {
  const base = {
    phoneE164: "+584141234567",
    clientName: "Ana Pérez",
    description: "2 conjuntos talla M",
    label: "2 de 4",
    dueDate: "2026-10-15",
    state: "por_vencer" as const,
    amountUsd: "25.00",
    rate: { value: "991.16", rateDate: "2026-10-19" },
  };

  it("sigue la plantilla de recordatorio", () => {
    const { text } = buildInstallmentReminder(base);
    expect(text).toBe(
      "Hola Ana Pérez, te escribo de Uniformes Médicos 2015 para recordarte la cuota 2 de 4 de “2 conjuntos talla M”, con vencimiento el 15/10/2026: $25,00 (Bs 24.779,00 a tasa euro BCV de Bs 991,16 del 19/10/2026). ¡Gracias!",
    );
  });
  it("una cuota vencida dice “vencida el”", () => {
    expect(buildInstallmentReminder({ ...base, state: "vencida" }).text).toContain(", vencida el 15/10/2026:");
    expect(buildInstallmentReminder({ ...base, state: "vence_hoy" }).text).toContain("con vencimiento el");
  });
  it("la inicial aparece como Inicial", () => {
    expect(buildInstallmentReminder({ ...base, label: "Inicial" }).text).toContain("la cuota Inicial de");
  });
  it("sin tasa se omite la parte en bolívares", () => {
    const { text } = buildInstallmentReminder({ ...base, rate: null });
    expect(text).toContain(": $25,00. ¡Gracias!");
    expect(text).not.toContain("Bs");
  });
  it("la URL lleva el texto codificado y no contiene +", () => {
    const { text, url } = buildInstallmentReminder(base);
    expect(url).toBe(`https://wa.me/584141234567?text=${encodeURIComponent(text)}`);
    expect(url.split("?")[0]).not.toContain("+");
  });
});
