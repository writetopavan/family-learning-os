import "./globals.css";

export const metadata = {
  title: "Family Learning OS",
  description: "AI-first learning workspace for families",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
