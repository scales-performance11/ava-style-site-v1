import "./globals.css";

export const metadata = {
  title: "Ava | Luxury is how you wear it.",
  description: "Ava's personal editorial style world.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
