import Navbar from "./components/Navbar";
import "@/app/globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="container mx-auto mt-4">{children}</main>
      </body>
    </html>
  );
}
