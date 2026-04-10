// src/pages/api/cart-details.js

export const POST = async ({ request }: { request: Request }) => {
  try {
    const { ids } = await request.json();

    // Si no hay IDs, devolvemos un array vacío rápido para no gastar recursos
    if (!ids || ids.length === 0) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    // Construimos la URL
    // Usamos el filtro de Strapi: filters[id][$in][0]=5&filters[id][$in][1]=6...
    const params = new URLSearchParams();
    interface CartDetailsRequestBody {
      ids: number[];
    }

    ids.forEach((id: number, index: number) => {
      params.append(`filters[id][$in][${index}]`, id.toString());
    });
    params.append("populate", "*");

    const apiUrl = `${import.meta.env.STRAPI_URL}/api/productos?${params.toString()}`;
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${import.meta.env.STRAPI_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "Error en Strapi", details: data }),
        {
          status: response.status,
        },
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error en el servidor de Astro:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
    });
  }
};
