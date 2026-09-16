import type { Metadata } from "next";
import { AuthProvider } from "../providers/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Biddly — Chapter Recruitment",
  description: "Recruitment management built for fraternity and sorority chapters"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
