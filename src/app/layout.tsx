'use client';

import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/provider";
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import { useUser } from '@/lib/hooks/useUsers';
import { configureAmplify } from '@/lib/utils/amplify-config';

const inter = Inter({ subsets: ["latin"] });

// Configure Amplify immediately when module loads
configureAmplify();

function LayoutContent({ 
  children, 
  signOut, 
  userId, 
  userEmail 
}: { 
  children: React.ReactNode; 
  signOut: () => void; 
  userId: string; 
  userEmail?: string;
}) {
  // Fetch the user's display name from the database using custom hook
  const { data: userData } = useUser(userId);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        userEmail={userEmail}
        userName={userData?.name}
        onSignOut={signOut}
      />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Authenticator>
          {({ signOut, user }) => (
            <TRPCProvider>
              <LayoutContent
                signOut={signOut || (() => {})}
                userId={user?.username || ''}
                userEmail={user?.signInDetails?.loginId}
              >
                {children}
              </LayoutContent>
            </TRPCProvider>
          )}
        </Authenticator>
      </body>
    </html>
  );
}
