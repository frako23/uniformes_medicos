export interface Foto {
  id: number | string;
  documentId?: string;
  name?: string;
  alternativeText: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  url: string;
  position?: number;
  mime?: string;
  size?: number;
  formats?: Record<string, { url: string; width: number; height: number }>;
}

export interface TallaStock {
  id: number | string;
  Talla: string;
  cantidad_actual: number;
}

export type Genero = "Unisex" | "Dama" | "Caballero";

export interface Producto {
  id: number;
  documentId: string;
  Tipo: string;
  Fabricantes: string;
  Marca: string;
  Genero: Genero;
  Precio: number;
  SKU: string | null;
  Color: string;
  Talla: TallaStock[];
  Foto: Foto[];
  createdAt?: string | null;
  updatedAt?: string | null;
  publishedAt?: string | null;
  isAvailable?: boolean;
}

export interface CartDetailsResponse {
  data: Producto[];
  missingIds: number[];
}
