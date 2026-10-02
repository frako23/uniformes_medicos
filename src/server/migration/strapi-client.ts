import { normalizeProduct, type SourceProduct } from "./normalize-strapi";

export interface StrapiClientOptions {
  baseUrl: string;
  token: string;
  pageSize?: number;
}

export function createStrapiClient(options: StrapiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const pageSize = options.pageSize ?? 100;

  async function request(path: string) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${options.token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Strapi respondió ${response.status} para ${path}`);
    return response.json();
  }

  async function products(): Promise<SourceProduct[]> {
    const result: SourceProduct[] = [];
    let page = 1;
    let pageCount: number | undefined;
    while (pageCount === undefined || page <= pageCount) {
      const query = new URLSearchParams({
        "populate": "*",
        "pagination[page]": String(page),
        "pagination[pageSize]": String(pageSize),
      });
      const payload = await request(`/api/productos?${query.toString()}`);
      const rows = Array.isArray(payload.data) ? payload.data : [];
      result.push(...rows.map(normalizeProduct));
      const sourcePageCount = Number(payload.meta?.pagination?.pageCount);
      if (Number.isFinite(sourcePageCount) && sourcePageCount > 0) {
        pageCount = sourcePageCount;
      } else if (!rows.length || rows.length < pageSize) {
        break;
      } else {
        pageCount = page + 1;
      }
      if (!rows.length) break;
      page += 1;
    }
    return result;
  }

  async function downloadImage(url: string) {
    const absoluteUrl = resolveUrl(url);
    const response = await fetch(absoluteUrl, { headers: { Authorization: `Bearer ${options.token}` } });
    if (!response.ok) throw new Error(`No se pudo descargar la imagen ${absoluteUrl}: ${response.status}`);
    return { url: absoluteUrl, response };
  }

  function resolveUrl(url: string) {
    return url.startsWith("http") ? url : `${baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  return { products, downloadImage, absoluteUrl: resolveUrl };
}
