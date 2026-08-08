/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Fundo calmo, não-clínico: verde-acinzentado suave em vez de cinza/branco puro
        base: {
          50: "#F5F7F4",
          100: "#EDF1EB",
          200: "#DCE4D8",
        },
        ink: {
          900: "#1F2D28", // texto principal — verde-ardósia escuro, não preto puro
          600: "#4A5A52",
          400: "#7C897F",
        },
        // Verde musgo: recuperação/crescimento, alternativa deliberada ao terracota padrão
        moss: {
          50: "#EEF3EC",
          200: "#C4D6C1",
          500: "#4C6B58",
          700: "#37503F",
        },
        // Estados — tons dessaturados de propósito (menos alarme visual p/ quem está sob estresse)
        alert: {
          amber: "#C98A3B",
          brick: "#B5493D",
          sage: "#7FA88F",
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],   // títulos — serifado quente, usado com moderação
        body: ["'Manrope'", "sans-serif"],  // corpo e dados — legível, amigável
      },
      borderRadius: {
        card: "1.25rem",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.015)" },
        },
      },
      animation: {
        breathe: "breathe 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
