import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, ExternalLink, CheckCircle2, LogOut, AlertCircle, User, Activity, Server, Cpu, Shield, RefreshCw } from 'lucide-react';
import OpenClaw from '@/components/ui/icons/OpenClaw';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const STATUS_POLL_MS = 10000;

function formatUptime(startedAt) {
  if (!startedAt) return '—';
  const started = new Date(startedAt).getTime();
  if (isNaN(started)) return '—';
  const diffMs = Date.now() - started;
  if (diffMs < 0) return '—';
  const s = Math.floor(diffMs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function SetupPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(location.state?.user || null);
  const [isAuthenticated, setIsAuthenticated] = useState(location.state?.user ? true : null);
  const [provider, setProvider] = useState('emergent');
  const [apiKey, setApiKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [uptimeTick, setUptimeTick] = useState(0);
  const pollRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setUptimeTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (location.state?.user) {
      setIsAuthenticated(true);
      setUser(location.state.user);
      checkOpenClawStatus();
      return;
    }

    const checkAuth = async () => {
      try {
        const response = await fetch(`${API}/auth/me`, { credentials: 'include' });
        if (!response.ok) throw new Error('Not authenticated');
        const userData = await response.json();
        setUser(userData);
        setIsAuthenticated(true);
        checkOpenClawStatus();
      } catch (e) {
        setIsAuthenticated(false);
        navigate('/login', { replace: true });
      }
    };
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, location.state]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    pollRef.current = setInterval(() => checkOpenClawStatus(true), STATUS_POLL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const checkOpenClawStatus = async (silent = false) => {
    if (!silent) setCheckingStatus(true);
    try {
      const res = await fetch(`${API}/openclaw/status`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      // Silent
    } finally {
      if (!silent) setCheckingStatus(false);
    }
  };

  const stageText = useMemo(() => {
    if (progress < 10) return 'Waiting to start';
    if (progress < 30) return 'Validating configuration...';
    if (progress < 60) return 'Starting OpenClaw services...';
    if (progress < 85) return 'Initializing Control UI...';
    if (progress < 95) return 'Almost ready...';
    return 'Redirecting to Control UI';
  }, [progress]);

  const goToControlUI = async () => {
    try {
      const res = await fetch(`${API}/openclaw/token`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const gatewayWsUrl = `${wsProtocol}//${window.location.host}/api/openclaw/ws`;
        window.location.href = `${API}/openclaw/ui/?gatewayUrl=${encodeURIComponent(gatewayWsUrl)}&token=${encodeURIComponent(data.token)}`;
      } else {
        toast.error('Unable to get access token');
      }
    } catch (e) {
      toast.error('Failed to access Control UI');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      // Ignore
    }
    navigate('/login', { replace: true });
  };

  const handleStopOpenClaw = async () => {
    try {
      const res = await fetch(`${API}/openclaw/stop`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setStatus(s => ({ ...(s || {}), running: false, pid: null, started_at: null }));
        toast.success('OpenClaw stopped');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.detail || 'Failed to stop OpenClaw');
      }
    } catch (e) {
      toast.error('Failed to stop OpenClaw');
    }
  };

  async function start() {
    setError('');
    if (!provider) {
      setError('Please choose a provider.');
      toast.error('Please choose a provider');
      return;
    }
    if (provider !== 'emergent' && (!apiKey || apiKey.length < 10)) {
      setError('Please enter a valid API key.');
      toast.error('Please enter a valid API key');
      return;
    }

    try {
      setLoading(true);
      setProgress(15);

      const progressInterval = setInterval(() => {
        setProgress(prev => (prev < 80 ? prev + Math.random() * 10 : prev));
      }, 500);

      const payload = { provider };
      if (provider !== 'emergent' && apiKey) payload.apiKey = apiKey;

      const res = await fetch(`${API}/openclaw/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Startup failed' }));
        throw new Error(data.detail || 'Startup failed');
      }

      const data = await res.json();
      setProgress(95);
      toast.success('OpenClaw started successfully!');

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const gatewayWsUrl = `${wsProtocol}//${window.location.host}/api/openclaw/ws`;
      const controlUrl = `${data.controlUrl}?gatewayUrl=${encodeURIComponent(gatewayWsUrl)}&token=${encodeURIComponent(data.token)}`;

      setTimeout(() => {
        setProgress(100);
        window.location.href = controlUrl;
      }, 1000);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Unable to start OpenClaw');
      toast.error('Startup error: ' + (e.message || 'Unknown error'));
      setLoading(false);
      setProgress(0);
    }
  }

  if (isAuthenticated === null || checkingStatus) {
    return (
      <div className="min-h-screen bg-[#0f0f10] flex items-center justify-center">
        <div className="text-zinc-400 flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          {isAuthenticated === null ? 'Checking authentication...' : 'Loading dashboard...'}
        </div>
      </div>
    );
  }

  const running = !!status?.running;
  const isOwner = !!status?.is_owner;
  const blocked = running && !isOwner;
  const uptime = running ? formatUptime(status?.started_at) : '—';
  // uptimeTick referenced so React re-renders every second
  void uptimeTick;

  return (
    <div className="min-h-screen bg-[#0f0f10] text-zinc-100">
      <div className="texture-noise" aria-hidden="true" />

      {/* Header */}
      <header className="relative z-10 container mx-auto px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex justify-between items-center"
        >
          <div className="flex items-center gap-3">
            <OpenClaw size={36} />
            <div>
              <h1 className="heading text-2xl sm:text-3xl font-semibold tracking-tight">
                OpenClaw Dashboard
              </h1>
              <p className="text-zinc-500 text-xs sm:text-sm">
                Manage your OpenClaw instance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 text-sm text-zinc-400" data-testid="user-chip">
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#1f2022] flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </div>
                )}
                <span className="hidden sm:inline">{user.name}</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              data-testid="logout-button"
              className="text-zinc-400 hover:text-zinc-200 hover:bg-[#1f2022]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Logout</span>
            </Button>
          </div>
        </motion.div>
      </header>

      {/* Main */}
      <main className="relative z-10 container mx-auto px-4 sm:px-6 pb-16 space-y-6">
        {/* Status hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card
            data-testid="status-hero"
            className={`border-[#1f2022] bg-[#141416]/95 backdrop-blur-sm ${running ? 'ring-1 ring-[#22c55e]/20' : ''}`}
          >
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className={`mt-1 relative w-3 h-3 rounded-full ${running ? 'bg-[#22c55e]' : 'bg-zinc-600'}`}>
                    {running && (
                      <span className="absolute inset-0 rounded-full bg-[#22c55e] animate-ping opacity-40" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="heading text-xl font-semibold" data-testid="status-label">
                        {running ? 'Running' : 'Stopped'}
                      </span>
                      {running && (
                        <span className="text-xs uppercase tracking-wider text-zinc-500 px-2 py-0.5 border border-[#1f2022] rounded">
                          {status?.provider || 'unknown'}
                        </span>
                      )}
                      {blocked && (
                        <span className="text-xs uppercase tracking-wider text-yellow-400 px-2 py-0.5 border border-yellow-900/60 rounded">
                          In use by another user
                        </span>
                      )}
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">
                      {running
                        ? <>Uptime <span className="text-zinc-300 font-medium" data-testid="uptime">{uptime}</span>{status?.pid && <> · PID {status.pid}</>}</>
                        : 'Configure a provider and start the gateway below.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {running && isOwner && (
                    <>
                      <Button
                        onClick={goToControlUI}
                        className="bg-[#FF4500] hover:bg-[#E63E00] text-white"
                        data-testid="control-ui-redirect"
                      >
                        Open Control UI
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </Button>
                      <Button
                        onClick={handleStopOpenClaw}
                        variant="outline"
                        className="border-zinc-700 hover:bg-zinc-800 text-zinc-300"
                        data-testid="stop-moltbot-button"
                      >
                        Stop
                      </Button>
                    </>
                  )}
                  <Button
                    onClick={() => checkOpenClawStatus()}
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-zinc-200 hover:bg-[#1f2022]"
                    data-testid="refresh-status"
                    title="Refresh status"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Info strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          <Card className="border-[#1f2022] bg-[#141416]/95 backdrop-blur-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider mb-2">
                <Shield className="w-3.5 h-3.5" />
                Signed in as
              </div>
              <div className="text-zinc-200 font-medium truncate" data-testid="info-email">
                {user?.email || '—'}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#1f2022] bg-[#141416]/95 backdrop-blur-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider mb-2">
                <Server className="w-3.5 h-3.5" />
                Instance
              </div>
              <div className="text-zinc-200 font-medium">
                {isOwner || !status?.owner_user_id ? 'You own this instance' : 'Locked to another user'}
              </div>
            </CardContent>
          </Card>
          <Card className="border-[#1f2022] bg-[#141416]/95 backdrop-blur-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-wider mb-2">
                <Cpu className="w-3.5 h-3.5" />
                Provider
              </div>
              <div className="text-zinc-200 font-medium capitalize" data-testid="info-provider">
                {status?.provider || (running ? 'unknown' : 'Not configured')}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Setup / Config card */}
        {!blocked && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
          >
            <Card className="border-[#1f2022] bg-[#141416]/95 backdrop-blur-sm setup-card">
              <CardHeader>
                <CardTitle className="heading text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#FF4500]" />
                  {running ? 'Restart with different configuration' : 'Start OpenClaw'}
                </CardTitle>
                <CardDescription className="text-zinc-500">
                  {running
                    ? 'Stopping the current instance will clear the active session.'
                    : 'Choose a provider and (if needed) an API key.'}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="provider" className="text-zinc-200">LLM Provider</Label>
                    <Select
                      onValueChange={(val) => {
                        setProvider(val);
                        if (val === 'emergent') setApiKey('');
                      }}
                      value={provider}
                      disabled={loading}
                    >
                      <SelectTrigger
                        id="provider"
                        data-testid="provider-select"
                        className="bg-[#0f0f10] border-[#1f2022] focus:ring-[#FF4500] focus:ring-offset-0 h-11"
                      >
                        <SelectValue placeholder="Choose provider" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#141416] border-[#1f2022]">
                        <SelectItem value="emergent" className="focus:bg-[#1f2022]">
                          Emergent (no key needed)
                        </SelectItem>
                        <SelectItem value="anthropic" className="focus:bg-[#1f2022]">
                          Anthropic (Claude) — bring your own key
                        </SelectItem>
                        <SelectItem value="openai" className="focus:bg-[#1f2022]">
                          OpenAI (GPT) — bring your own key
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {provider === 'emergent' && (
                      <p className="text-xs text-[#22c55e]">
                        Pre-configured with Claude and GPT models — no API key needed.
                      </p>
                    )}
                  </div>

                  {provider !== 'emergent' && (
                    <div className="space-y-2">
                      <Label htmlFor="apiKey" className="text-zinc-200">API Key</Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          data-testid="api-key-input"
                          type={reveal ? 'text' : 'password'}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          disabled={loading}
                          className="pr-12 tracking-wider bg-[#0f0f10] border-[#1f2022] focus-visible:ring-[#FF4500] focus-visible:ring-offset-0 h-11 api-key-input"
                          placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                          aria-describedby="apiKeyHelp"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid="reveal-api-key-toggle"
                          onClick={() => setReveal(r => !r)}
                          disabled={loading}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 px-2 text-zinc-400 hover:text-zinc-200 hover:bg-[#1f2022]"
                        >
                          {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p id="apiKeyHelp" className="text-xs text-zinc-500">
                        Your key is used only to start OpenClaw.
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    data-testid="startup-error"
                    className="rounded-lg border border-red-900/60 bg-red-950/40 text-red-300 px-4 py-3 text-sm"
                  >
                    {error}
                  </motion.div>
                )}

                {loading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    <Progress value={progress} data-testid="startup-progress" className="h-2 bg-[#1f2022]" />
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#FF4500]" />
                      <p className="text-sm text-zinc-400" data-testid="startup-status-text" aria-live="polite">
                        {stageText}
                      </p>
                    </div>
                  </motion.div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col sm:flex-row justify-between gap-4 pt-2">
                <Button
                  onClick={start}
                  data-testid="start-moltbot-button"
                  disabled={loading || !provider || (provider !== 'emergent' && !apiKey) || blocked}
                  className="w-full sm:w-auto bg-[#FF4500] hover:bg-[#E63E00] text-white font-medium h-11 px-6 btn-primary"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : running ? (
                    'Restart OpenClaw'
                  ) : (
                    'Start OpenClaw'
                  )}
                </Button>

                <a
                  href="https://docs.molt.bot/web/control-ui"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                  data-testid="docs-link"
                >
                  Documentation
                  <ExternalLink className="w-3 h-3" />
                </a>
              </CardFooter>
            </Card>
          </motion.div>
        )}

        {blocked && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-yellow-900/40 bg-yellow-950/20 backdrop-blur-sm">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 text-yellow-500 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">OpenClaw is in use by another user</span>
                </div>
                <p className="text-zinc-400 text-sm">
                  Wait for them to stop their session before starting yours.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  );
}
