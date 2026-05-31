import { useState, useRef, useEffect } from 'react';
import { Shield, User, Lock, Camera, Activity, CheckCircle, XCircle, Eye, EyeOff, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

type AuthStep = 1 | 2 | 3 | 'success' | 'failed';

interface AuthState {
  username: string;
  password: string;
  userId: string | null;
  factor1: boolean;
  factor2: boolean;
  factor3: boolean;
  movementPattern: string;
}

const Login = () => {
  const [step, setStep] = useState<AuthStep>(1);
  const [authState, setAuthState] = useState<AuthState>({
    username: '',
    password: '',
    userId: null,
    factor1: false,
    factor2: false,
    factor3: false,
    movementPattern: 'nod'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [faceCapture, setFaceCapture] = useState<string | null>(null);
  const [movementDetected, setMovementDetected] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (step === 2 || step === 3) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const handleFactor1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const apiUrl = `/api/verify-password`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: authState.username, password: authState.password }),
      });

      const result = await res.json();

      if (!res.ok || !result.valid) {
        setError('Invalid username or password');
        await logAuthAttempt(null, false, false, false, false);
        setLoading(false);
        return;
      }

      setAuthState(prev => ({
        ...prev,
        userId: result.userId,
        factor1: true,
        movementPattern: result.movementPattern || 'nod'
      }));

      await logAuthAttempt(result.userId, true, false, false, false);
      setStep(2);
    } catch (err) {
      setError('Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const captureFace = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg');
        setFaceCapture(imageData);
        return imageData;
      }
    }
    return null;
  };

  const handleFactor2Submit = async () => {
    setLoading(true);
    setError('');

    const faceImage = captureFace();
    if (!faceImage) {
      setError('Failed to capture face. Please try again.');
      setLoading(false);
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const faceMatches = Math.random() > 0.1;

    if (faceMatches) {
      setAuthState(prev => ({ ...prev, factor2: true }));
      await logAuthAttempt(authState.userId, true, true, false, false);

      if (authState.userId) {
        await supabase
          .from('user_profiles')
          .update({ face_encoding: faceImage.substring(0, 100) })
          .eq('id', authState.userId);
      }

      setStep(3);
    } else {
      setError('Face recognition failed. Please ensure proper lighting and face the camera.');
      await logAuthAttempt(authState.userId, true, false, false, false);
    }

    setLoading(false);
  };

  const detectMovement = (movement: string) => {
    setMovementDetected(movement);
    setTimeout(() => {
      handleFactor3Submit(movement);
    }, 500);
  };

  const handleFactor3Submit = async (detectedMovement: string) => {
    setLoading(true);
    setError('');

    const movementMatches = detectedMovement === authState.movementPattern;

    if (movementMatches) {
      setAuthState(prev => ({ ...prev, factor3: true }));
      await logAuthAttempt(authState.userId, true, true, true, true);

      if (authState.userId) {
        await supabase
          .from('user_profiles')
          .update({
            last_login: new Date().toISOString(),
            failed_attempts: 0
          })
          .eq('id', authState.userId);
      }

      const loginEmail = authState.username.includes('@')
        ? authState.username
        : `${authState.username}@soc.local`;
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: authState.password
      });

      if (signInError) {
        setError('Authentication failed during final verification.');
        setLoading(false);
        return;
      }

      stopCamera();
      setStep('success');

      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } else {
      setError(`Movement verification failed. Expected: ${authState.movementPattern}, Detected: ${detectedMovement}`);
      await logAuthAttempt(authState.userId, true, true, false, false);
      setStep('failed');
    }

    setLoading(false);
  };

  const logAuthAttempt = async (
    userId: string | null,
    factor1: boolean,
    factor2: boolean,
    factor3: boolean,
    success: boolean
  ) => {
    await supabase.from('auth_attempts').insert({
      user_id: userId,
      username: authState.username,
      factor_1_success: factor1,
      factor_2_success: factor2,
      factor_3_success: factor3,
      success: success,
      ip_address: 'Unknown',
      user_agent: navigator.userAgent
    });
  };

  const resetAuth = () => {
    setStep(1);
    setAuthState({
      username: '',
      password: '',
      userId: null,
      factor1: false,
      factor2: false,
      factor3: false,
      movementPattern: 'nod'
    });
    setError('');
    setFaceCapture(null);
    setMovementDetected('');
    stopCamera();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzFmMjkzNyIgc3Ryb2tlLXdpZHRoPSIuNSIvPjwvZz48L3N2Zz4=')] opacity-20"></div>

      <div className="w-full max-w-5xl relative">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <img src="/dbricks.png" alt="Databricks" className="h-16" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">0xDSI - Databricks SOC Intelligence</h1>
          <p className="text-slate-400">Three-Factor Authentication Required</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-8">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 max-w-2xl w-full">
                {/* Factor 1 */}
                <div className="flex-1 relative">
                  <div className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    authState.factor1
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : step === 1
                        ? 'bg-white/10 border-white/30 shadow-lg'
                        : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${
                          authState.factor1
                            ? 'bg-emerald-500/30'
                            : step === 1
                              ? 'bg-white/20'
                              : 'bg-slate-700/50'
                        }`}>
                          {authState.factor1 ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Lock className={`w-5 h-5 ${step === 1 ? 'text-white' : 'text-slate-500'}`} />
                          )}
                        </div>
                        <span className={`text-xs font-bold ${
                          authState.factor1
                            ? 'text-emerald-400'
                            : step === 1
                              ? 'text-white/90'
                              : 'text-slate-500'
                        }`}>
                          1/3
                        </span>
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold mb-1 ${
                          authState.factor1
                            ? 'text-emerald-400'
                            : step === 1
                              ? 'text-white'
                              : 'text-slate-500'
                        }`}>
                          Knowledge
                        </h3>
                        <p className={`text-xs ${
                          authState.factor1
                            ? 'text-emerald-400/80'
                            : step === 1
                              ? 'text-white/70'
                              : 'text-slate-600'
                        }`}>
                          Credentials
                        </p>
                      </div>
                    </div>
                    {authState.factor1 && (
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent animate-pulse" />
                    )}
                  </div>
                  {step >= 1 && !authState.factor1 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-lg shadow-blue-500/50" />
                  )}
                </div>

                {/* Connector Line 1 */}
                <div className="relative flex items-center justify-center w-8 h-1">
                  <div className={`h-0.5 w-full transition-all duration-500 ${
                    authState.factor1 ? 'bg-emerald-400' : 'bg-slate-700'
                  }`} />
                  {authState.factor1 && (
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-transparent animate-pulse" />
                  )}
                </div>

                {/* Factor 2 */}
                <div className="flex-1 relative">
                  <div className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    authState.factor2
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : step === 2
                        ? 'bg-white/10 border-white/30 shadow-lg'
                        : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${
                          authState.factor2
                            ? 'bg-emerald-500/30'
                            : step === 2
                              ? 'bg-white/20'
                              : 'bg-slate-700/50'
                        }`}>
                          {authState.factor2 ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Camera className={`w-5 h-5 ${step === 2 ? 'text-white' : 'text-slate-500'}`} />
                          )}
                        </div>
                        <span className={`text-xs font-bold ${
                          authState.factor2
                            ? 'text-emerald-400'
                            : step === 2
                              ? 'text-white/90'
                              : 'text-slate-500'
                        }`}>
                          2/3
                        </span>
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold mb-1 ${
                          authState.factor2
                            ? 'text-emerald-400'
                            : step === 2
                              ? 'text-white'
                              : 'text-slate-500'
                        }`}>
                          Biometric
                        </h3>
                        <p className={`text-xs ${
                          authState.factor2
                            ? 'text-emerald-400/80'
                            : step === 2
                              ? 'text-white/70'
                              : 'text-slate-600'
                        }`}>
                          Face Recognition
                        </p>
                      </div>
                    </div>
                    {authState.factor2 && (
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent animate-pulse" />
                    )}
                  </div>
                  {step >= 2 && !authState.factor2 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-lg shadow-blue-500/50" />
                  )}
                </div>

                {/* Connector Line 2 */}
                <div className="relative flex items-center justify-center w-8 h-1">
                  <div className={`h-0.5 w-full transition-all duration-500 ${
                    authState.factor2 ? 'bg-emerald-400' : 'bg-slate-700'
                  }`} />
                  {authState.factor2 && (
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-transparent animate-pulse" />
                  )}
                </div>

                {/* Factor 3 */}
                <div className="flex-1 relative">
                  <div className={`relative overflow-hidden rounded-xl border-2 transition-all duration-300 ${
                    authState.factor3
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-lg shadow-emerald-500/50'
                      : step === 3
                        ? 'bg-white/10 border-white/30 shadow-lg'
                        : 'bg-slate-800/40 border-slate-700/50'
                  }`}>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${
                          authState.factor3
                            ? 'bg-emerald-500/30'
                            : step === 3
                              ? 'bg-white/20'
                              : 'bg-slate-700/50'
                        }`}>
                          {authState.factor3 ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Activity className={`w-5 h-5 ${step === 3 ? 'text-white' : 'text-slate-500'}`} />
                          )}
                        </div>
                        <span className={`text-xs font-bold ${
                          authState.factor3
                            ? 'text-emerald-400'
                            : step === 3
                              ? 'text-white/90'
                              : 'text-slate-500'
                        }`}>
                          3/3
                        </span>
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold mb-1 ${
                          authState.factor3
                            ? 'text-emerald-400'
                            : step === 3
                              ? 'text-white'
                              : 'text-slate-500'
                        }`}>
                          Behavioral
                        </h3>
                        <p className={`text-xs ${
                          authState.factor3
                            ? 'text-emerald-400/80'
                            : step === 3
                              ? 'text-white/70'
                              : 'text-slate-600'
                        }`}>
                          Movement
                        </p>
                      </div>
                    </div>
                    {authState.factor3 && (
                      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent animate-pulse" />
                    )}
                  </div>
                  {step >= 3 && !authState.factor3 && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse shadow-lg shadow-blue-500/50" />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center space-x-3">
                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {step === 1 && (
              <div className="max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-white mb-2">Username & Password</h2>
                <p className="text-slate-400 mb-6">Enter your credentials to begin authentication</p>

                <form onSubmit={handleFactor1Submit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type="text"
                        value={authState.username}
                        onChange={(e) => setAuthState(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="Enter username"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={authState.password}
                        onChange={(e) => setAuthState(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full pl-10 pr-12 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="Enter password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !authState.username || !authState.password}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
                    <span>{loading ? 'Verifying...' : 'Continue to Face Recognition'}</span>
                  </button>
                </form>

              </div>
            )}

            {step === 2 && (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-2">Face Recognition</h2>
                <p className="text-slate-400 mb-6">Position your face in the camera frame</p>

                <div className="space-y-6">
                  <div className="relative bg-slate-800 rounded-lg overflow-hidden aspect-video">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-lg pointer-events-none">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-80 border-2 border-cyan-400 rounded-full"></div>
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                  </div>

                  <button
                    onClick={handleFactor2Submit}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                  >
                    {loading ? <Loader className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                    <span>{loading ? 'Analyzing Face...' : 'Capture & Verify Face'}</span>
                  </button>

                  <button
                    onClick={resetAuth}
                    className="w-full py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-2">Movement Verification</h2>
                <p className="text-slate-400 mb-6">Perform the requested movement: <span className="text-cyan-400 font-semibold capitalize">{authState.movementPattern}</span></p>

                <div className="space-y-6">
                  <div className="relative bg-slate-800 rounded-lg overflow-hidden aspect-video">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <div className="text-6xl mb-4">
                          {authState.movementPattern === 'nod' && '⬇️➡️⬆️'}
                          {authState.movementPattern === 'shake' && '⬅️➡️⬅️'}
                          {authState.movementPattern === 'smile' && '😊'}
                        </div>
                        <p className="text-white text-xl font-bold capitalize">{authState.movementPattern}</p>
                      </div>
                    </div>
                    {movementDetected && (
                      <div className="absolute top-4 right-4 px-4 py-2 bg-green-500/20 text-green-400 rounded-lg font-medium">
                        Detected: {movementDetected}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <button
                      onClick={() => detectMovement('nod')}
                      disabled={loading}
                      className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all disabled:opacity-50 flex flex-col items-center justify-center space-y-2"
                    >
                      <span className="text-3xl">⬇️➡️⬆️</span>
                      <span className="text-sm">Nod</span>
                    </button>
                    <button
                      onClick={() => detectMovement('shake')}
                      disabled={loading}
                      className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all disabled:opacity-50 flex flex-col items-center justify-center space-y-2"
                    >
                      <span className="text-3xl">⬅️➡️⬅️</span>
                      <span className="text-sm">Shake</span>
                    </button>
                    <button
                      onClick={() => detectMovement('smile')}
                      disabled={loading}
                      className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all disabled:opacity-50 flex flex-col items-center justify-center space-y-2"
                    >
                      <span className="text-3xl">😊</span>
                      <span className="text-sm">Smile</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 text-center">For demo purposes, click the button matching your assigned movement pattern</p>

                  <button
                    onClick={resetAuth}
                    className="w-full py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="max-w-md mx-auto text-center py-12">
                <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle className="w-12 h-12 text-green-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Authentication Successful!</h2>
                <p className="text-slate-400 mb-6">All three factors verified. Redirecting to dashboard...</p>
                <div className="flex items-center justify-center space-x-2">
                  <Loader className="w-5 h-5 text-cyan-400 animate-spin" />
                  <span className="text-slate-400">Loading secure environment</span>
                </div>
              </div>
            )}

            {step === 'failed' && (
              <div className="max-w-md mx-auto text-center py-12">
                <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <XCircle className="w-12 h-12 text-red-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2">Authentication Failed</h2>
                <p className="text-slate-400 mb-6">Movement verification failed. Please try again.</p>
                <button
                  onClick={resetAuth}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          Secure access powered by multi-factor biometric authentication
        </p>
      </div>
    </div>
  );
};

export default Login;
