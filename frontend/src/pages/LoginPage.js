import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import OpenClaw from '@/components/ui/icons/OpenClaw';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export default function LoginPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [instanceLock, setInstanceLock] = useState(null);

  // Check if already authenticated and instance lock status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check instance lock status first
        const instanceRes = await fetch(`${API}/auth/instance`);
        if (instanceRes.ok) {
          const instanceData = await instanceRes.json();
          setInstanceLock(instanceData);
        }

        const response = await fetch(`${API}/auth/me`, {
          credentials: 'include'
        });
        if (response.ok) {
          // Already authenticated, go to setup
          navigate('/', { replace: true });
          return;
        }
      } catch (e) {
        // Not authenticated
      }
      setChecking(false);
    };
    checkAuth();
  }, [navigate]);

  const handleLogin = async () => {
    const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

    // Generate PKCE code_verifier (32 random bytes → base64url)
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const codeVerifier = btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Generate code_challenge = base64url(sha256(verifier))
    const digest = await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(codeVerifier)
    );
    const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const state = crypto.randomUUID();
    sessionStorage.setItem('pkce_code_verifier', codeVerifier);
    sessionStorage.setItem('pkce_state', state);

    const redirectUri = window.location.origin + '/';
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'user:profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    window.location.href = `https://claude.ai/oauth/authorize?${params}`;
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0f0f10] flex items-center justify-center">
        <div className="text-zinc-400 flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Checking authentication...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f10] text-zinc-100 flex items-center justify-center p-4">
      {/* Subtle texture overlay */}
      <div className="texture-noise" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="border-[#1f2022] bg-[#141416]/95 backdrop-blur-sm">
          <CardHeader className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <OpenClaw size={48} />
            </div>
            <CardTitle className="heading text-2xl font-semibold">
              OpenClaw Setup
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {instanceLock?.locked 
                ? 'This is a private instance. Only the owner can sign in.'
                : 'Sign in with your Claude account to configure and access your personal OpenClaw instance.'
              }
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {instanceLock?.locked ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 text-red-300 px-4 py-4 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4" />
                    <span className="font-medium">Private Instance</span>
                  </div>
                  <p className="text-red-400/80">
                    This OpenClaw instance is private and access is restricted.
                  </p>
                </div>
                <button
                  onClick={handleLogin}
                  className="text-xs text-zinc-600 hover:text-zinc-400 underline underline-offset-2"
                >
                  Instance owner? Sign in here
                </button>
              </div>
            ) : (
              <>
                <Button
                  onClick={handleLogin}
                  data-testid="claude-login-button"
                  className="w-full bg-[#FF4500] hover:bg-[#e03d00] text-white font-medium h-12 flex items-center justify-center gap-3"
                >
                  {/* Anthropic/Claude wordmark-style "A" */}
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.827 3.52h3.603L24 20.32h-3.603l-1.43-4.218h-7.347l-1.43 4.218H6.587L13.827 3.52zm2.517 9.882-2.268-6.689-2.268 6.689h4.536zM0 3.52h3.603L5.03 7.738l1.43-4.218h3.603L3.82 20.32H0.217L0 3.52z" />
                  </svg>
                  Sign in with Claude
                </Button>
                
                <p className="text-xs text-zinc-500 text-center">
                  Your OpenClaw instance will be private and only accessible by you.
                </p>
              </>
            )}
          </CardContent>
        </Card>
        
        <p className="text-xs text-zinc-600 text-center mt-6">
          Powered by{' '}
          <a
            href="https://github.com/openclaw/openclaw"
            target="_blank"
            rel="noreferrer"
            className="text-zinc-500 hover:text-zinc-400 underline underline-offset-2"
          >
            OpenClaw
          </a>
        </p>
      </motion.div>
    </div>
  );
}
