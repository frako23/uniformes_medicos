import { persistentAtom } from "@nanostores/persistent";

// Definimos el store como un array de IDs (strings)
// El primer parámetro es el nombre en Local Storage ('favorites')
// El segundo es el valor inicial
// El tercero es cómo manejar el JSON
export const favoritesStore = persistentAtom<string[]>("favorites", [], {
  encode: JSON.stringify,
  decode: JSON.parse,
});

// Función para alternar (añadir/quitar) favoritos
export function toggleFavorite(productId: string) {
  const currentFavorites = favoritesStore.get();
  if (currentFavorites.includes(productId)) {
    favoritesStore.set(currentFavorites.filter((id) => id !== productId));
  } else {
    favoritesStore.set([...currentFavorites, productId]);
  }
}
