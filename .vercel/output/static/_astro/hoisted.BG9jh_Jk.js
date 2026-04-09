import{f as l}from"./favoritesStore.CKRHiLeo.js";function f(){const t=document.getElementById("cart-container"),o=document.getElementById("order-summary-section");t&&(t.innerHTML=`
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
    `),o&&o.classList.add("hidden")}const{PUBLIC_STRAPI_TOKEN:b}={PUBLIC_STRAPI_TOKEN:"aa2a09fb649474d812478720fcf74c5b25ae8a551719fa6581fe6a28295cccc54287cd2877bfafb7eda08a51b0ad5ae39ecadf50bd98ef081d92f8dc47d0cac6db213cf8c7e4687259d52310042b4467ee95607b8f880f278e3a74f7e8e2a49835540de29cdb0f2c03eb91ed6d1fd742691023540996b32f230e72b373d4ba30",BASE_URL:"/",MODE:"production",DEV:!1,PROD:!0,SSR:!1,SITE:void 0,ASSETS_PREFIX:void 0},m="https://strapi.frakodev.com";window.removeItem=t=>{const d=l.get().filter(c=>{const e=typeof c=="object"?c.id:c;return Number(e)!==Number(t)});l.set(d),p()};async function p(){const t=l.get();if(!t||t.length===0)return document.getElementById("checkout-container")?.classList.add("hidden"),document.getElementById("order-summary-section")?.classList.add("hidden"),f();const o=t.map(e=>typeof e=="object"?e.id:e).filter(e=>e&&e!=="[object Object]"),d=new URLSearchParams;o.forEach((e,a)=>{d.append(`filters[id][$in][${a}]`,e)}),d.append("populate","*");const c=`${m}/api/productos?${d.toString()}`;try{const e=await fetch(c,{headers:{Authorization:`Bearer ${b}`}}),{data:a}=await e.json(),r=document.getElementById("cart-container"),s=document.getElementById("subtotal"),u=document.getElementById("total");if(r&&a&&a.length>0){let i=0;r.innerHTML="",a.forEach(n=>{const g=n.Precio||0;i+=g,r.innerHTML+=`
           <div class="flex gap-4 group animate-in fade-in duration-500" data-id="${n.id}">

              <div class="w-24 h-32 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">

                <img class="w-full h-full object-cover" src="${m}${n.Foto[0].url}" alt="${n.Tipo} ${n.Fabricantes} ${n.Marca}" />

              </div>
  <div class="cart-item-data flex gap-4 group animate-in fade-in duration-500" data-id="${n.id}">
    <div class="flex flex-col justify-between py-1 flex-grow">
      <div>
        <div class="flex justify-between items-start">
          <h3 class="product-title font-headline font-bold text-slate-800 leading-tight">
            ${n.Fabricantes} ${n.Marca}
          </h3>
          </div>
        <p class="product-type text-xs font-semibold text-sky-700 uppercase tracking-widest mt-1">
          ${n.Tipo}
        </p>
      </div>
      </div>
  </div>
  </div>
`}),s&&(s.textContent=`$${i.toFixed(2)}`),u&&(u.textContent=`$${i.toFixed(2)}`),document.getElementById("checkout-container")?.classList.remove("hidden"),document.getElementById("order-summary-section")?.classList.remove("hidden")}else f()}catch(e){console.error("Error cargando el carrito:",e);const a=document.getElementById("cart-container");a&&(a.innerHTML="<p>Error al conectar con el servidor.</p>")}}p();document.getElementById("checkout-whatsapp")?.addEventListener("click",()=>{const t=document.getElementById("total"),o=t?t.innerText.trim():"$0.00",c=`¡Hola! Me gustaría finalizar mi pedido en *The Clinical Editorial*.

*Resumen del Pedido:*
${Array.from(document.querySelectorAll(".cart-item-data")).map(a=>{const r=a.querySelector(".product-title")?.innerText.trim();return`• *${a.querySelector(".product-type")?.innerText.trim()}* - ${r}`}).join(`
`)}

*Monto Total:* ${o}

¿Podrían indicarme los pasos para el pago?`,e=encodeURIComponent(c);window.open(`https://wa.me/584241468579?text=${e}`,"_blank")});
