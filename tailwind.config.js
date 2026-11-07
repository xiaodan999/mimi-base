const { fontFamily } = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    future: {
        // Touch taps leave `:hover` latched until the next tap, so a ghost
        // button's background stayed visible after a like. Only emit hover
        // styles for devices that can actually hover.
        hoverOnlyWhenSupported: true,
    },
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                success: {
                    DEFAULT: "hsl(var(--success))",
                    foreground: "hsl(var(--success-foreground))",
                },
                warning: {
                    DEFAULT: "hsl(var(--warning))",
                    foreground: "hsl(var(--warning-foreground))",
                },
                info: {
                    DEFAULT: "hsl(var(--info))",
                    foreground: "hsl(var(--info-foreground))",
                },
                chart: {
                    1: "hsl(var(--chart-1))",
                    2: "hsl(var(--chart-2))",
                    3: "hsl(var(--chart-3))",
                    4: "hsl(var(--chart-4))",
                    5: "hsl(var(--chart-5))",
                    6: "hsl(var(--chart-6))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
            },
            borderRadius: {
                sm: "calc(var(--radius) - 6px)",
                md: "calc(var(--radius) - 4px)",
                lg: "calc(var(--radius) - 2px)",
                xl: "calc(var(--radius) + 2px)",
                "2xl": "calc(var(--radius) + 6px)",
                "3xl": "calc(var(--radius) + 10px)",
            },
            fontFamily: {
                sans: [
                    '"PingFang SC"',
                    '"Hiragino Sans GB"',
                    '"Noto Sans SC"',
                    '"Microsoft YaHei"',
                    ...fontFamily.sans,
                ],
            },
            boxShadow: {
                soft: "var(--shadow-soft)",
                lift: "var(--shadow-lift)",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
                "fade-in": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
                "slide-up": {
                    from: { opacity: "0", transform: "translateY(8px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                pop: {
                    "0%": { transform: "scale(0.96)" },
                    "60%": { transform: "scale(1.02)" },
                    "100%": { transform: "scale(1)" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "fade-in": "fade-in 0.18s ease-out",
                "slide-up": "slide-up 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
                pop: "pop 0.18s ease-out",
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
};
