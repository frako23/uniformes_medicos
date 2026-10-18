export interface AdminNavItem {
  href: string;
  label: string;
  /** Texto de la sección en la frase de bienvenida; sin él, no se menciona. */
  summaryLabel?: string;
}

/** Secciones del panel, en el orden de la navegación. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin/productos", label: "Productos", summaryLabel: "productos" },
  { href: "/admin/clientes", label: "Clientes", summaryLabel: "clientes" },
  { href: "/admin/pagos-financiados", label: "Pagos financiados", summaryLabel: "pagos financiados" },
  { href: "/admin/congresos", label: "Congresos", summaryLabel: "congresos" },
  { href: "/admin/estadisticas", label: "Estadísticas" },
];

export function isActiveNavItem(item: AdminNavItem, pathname: string) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** “productos, clientes y congresos” a partir de las secciones que tienen texto. */
export function summarySentence(items: AdminNavItem[] = ADMIN_NAV_ITEMS) {
  const labels = items.flatMap((item) => (item.summaryLabel ? [item.summaryLabel] : []));
  if (labels.length <= 1) return `Gestiona ${labels[0] ?? "el panel"}`;
  return `Gestiona ${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}
