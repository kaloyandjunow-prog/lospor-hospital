/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  // Class-based dark mode: the app forces a dark UI (app.json userInterfaceStyle "dark").
  // Without this, NativeWind defaults to "media" and react-native-web throws
  // "cannot manually set color scheme, as dark mode is type 'media'" when the
  // forced scheme is applied. No `dark:` utilities are used, so this is style-neutral.
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: "#3b82f6",
      },
    },
  },
  // Disable aspect-ratio utilities — react-native-css-interop crashes on
  // `aspect-ratio: auto` (parseAspectRatio reads ratio[0] before checking undefined).
  // None of these utilities are used in the app.
  corePlugins: {
    aspectRatio: false,
  },
  plugins: [],
}
