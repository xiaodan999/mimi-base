/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
    semi: true,
    tabWidth: 4,
    printWidth: 80,
    singleQuote: false,
    trailingComma: "all",
    jsxSingleQuote: false,
    bracketSpacing: true,
    endOfLine: "lf",
    plugins: [await import("prettier-plugin-tailwindcss")],
};
export default config;
