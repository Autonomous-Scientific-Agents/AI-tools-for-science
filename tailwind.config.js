/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 12px 34px rgba(15, 23, 42, 0.08)",
      },
      colors: {
        ink: "#24323f",
        line: "#d8e0e7",
        paper: "#f7f3ec",
        coral: "#d96c54",
        spruce: "#196b63",
        saffron: "#c68b1c",
      },
    },
  },
  plugins: [],
};
