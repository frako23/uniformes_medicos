export function renderEmptyCart() {
  const container = document.getElementById("cart-container");
  const summary = document.getElementById("order-summary-section"); // El div que envuelve los totales

  if (container) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div class="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <span class="material-symbols-outlined text-4xl text-slate-400">shopping_bag</span>
        </div>
        <h3 class="text-lg font-bold text-slate-700">Tu bolsa está vacía</h3>
        <p class="text-sm text-slate-500 max-w-[250px] mt-2">
          Parece que aún no has elegido tu uniforme ideal.
        </p>
        <a href="/" class="mt-6 px-8 py-3 bg-[#005d90] text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">
          Ver Catálogo
        </a>
      </div>
    `;
  }

  // Ocultamos el resumen de la orden porque no hay nada que sumar
  if (summary) {
    summary.classList.add("hidden");
  }
}
