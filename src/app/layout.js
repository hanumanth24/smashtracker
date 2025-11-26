import "./globals.css";
import SiteFooter from "../components/SiteFooter.jsx";

export const metadata = {
  title: "SmashTrack 3D",
  description: "Firebase-powered badminton league and tournament tracker with a neon 3D court.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main className="page-main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
