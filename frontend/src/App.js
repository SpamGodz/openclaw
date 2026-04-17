import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import AuthCallback from "@/pages/AuthCallback";
import { Toaster } from "@/components/ui/sonner";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH

function AppRouter() {
  const location = useLocation();
  
  // Detect Claude OAuth callback via ?code= query param — runs before route matching
  if (new URLSearchParams(location.search).get('code')) {
    return <AuthCallback />;
  }
  
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<SetupPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App dark">
      <Toaster data-testid="global-toaster" richColors position="top-center" />
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </div>
  );
}

export default App;
