/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        headline: ["Tus-Fuentes-Aqui", "sans-serif"],
      },
      colors: {
        // Asegúrate de que tus colores personalizados sigan aquí
      },
    },
  },
  plugins: [],
};
