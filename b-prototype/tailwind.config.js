/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f5fbff",
        xinghai: {
          navy: "#061426",
          deep: "#081b31",
          panel: "rgba(8, 24, 45, 0.62)",
          cyan: "#65e7ff",
          blue: "#5c8dff",
          violet: "#b8a1ff",
          amber: "#ffd08a",
        },
      },
      boxShadow: {
        "xinghai-glow": "0 0 44px rgba(101, 231, 255, 0.28)",
        "xinghai-card": "0 26px 90px rgba(0, 10, 28, 0.38)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "PingFang SC",
          "Microsoft YaHei",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
