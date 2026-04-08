// Interfaces base para el manejo de imágenes
interface ImageFormat {
  ext: string;
  url: string;
  hash: string;
  mime: string;
  name: string;
  path: string | null;
  size: number;
  width: number;
  height: number;
  sizeInBytes: number;
}

interface ImageFormats {
  large?: ImageFormat;
  small?: ImageFormat;
  medium?: ImageFormat;
  thumbnail?: ImageFormat;
}

interface Foto {
  id: number;
  documentId: string;
  name: string;
  alternativeText: string | null;
  caption: string | null;
  focalPoint: string | null;
  width: number;
  height: number;
  formats: ImageFormats;
  hash: string;
  ext: string;
  mime: string;
  size: number;
  url: string;
  previewUrl: string | null;
  provider: string;
  provider_metadata: any | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}

// Interfaz para el componente repetible de Tallas
interface TallaStock {
  id: number;
  Talla: string; // 'S' | 'M' | 'L' | 'XL' (puedes usar un union type si son fijas)
  cantidad_actual: number;
}

// Interfaz principal del Producto
export interface Producto {
  id: number;
  documentId: string;
  Tipo: string;
  Fabricantes: string;
  Marca: string;
  Genero: "Unisex" | "Dama" | "Caballero";
  Precio: number;
  SKU: string | null;
  Color: string;
  Talla: TallaStock[];
  Foto: Foto[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
}
