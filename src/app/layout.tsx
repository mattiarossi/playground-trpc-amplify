'use client';

import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc/provider";
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Amplify } from 'aws-amplify';

const inter = Inter({ subsets: ["latin"] });

// Configure Amplify
try {
  const outputs = require('../../amplify_outputs.json');
  Amplify.configure(outputs);
} catch (e) {
  console.error('Failed to load amplify_outputs.json');
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
              <div className="min-h-screen bg-gray-50">
                <nav className="bg-white shadow-sm border-b">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                      <div className="flex items-center">
                        <a href="/" className="flex items-center">
                          <h1 className="text-2xl font-bold text-gray-900">
                            Blog Platform
                          </h1>
                        </a>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-gray-700">
                          Welcome, {user?.signInDetails?.loginId}
                        </span>
                        <a
                          href="/"
                          className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                        >
                          Home
                        </a>
                        <a
                          href="/posts/new"
                          className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium"
                        >
                          New Post
                        </a>
                        <button
                          onClick={signOut}
                          className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                </nav>
                <main>{children}</main>
              </div>
            </TRPCProvider>
          )}
        </Authenticator>
      </body>
    </html>
  );
}
