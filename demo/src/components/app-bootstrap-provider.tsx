"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { getCachedAppBootstrap, loadAppBootstrap, setCachedAppBootstrap, type AppBootstrapData } from "@/lib/app-bootstrap";
import { OnboardingFlow } from "@/components/onboarding";

interface AppBootstrapContextValue {
  bootstrapData: AppBootstrapData | null;
  ready: boolean;
  error: Error | null;
  updateBootstrapData: (updater: (current: AppBootstrapData) => AppBootstrapData) => void;
}

const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(null);

export function AppBootstrapProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { messages } = useLocale();
  const pathname = usePathname();
  const isLegalPage = pathname.startsWith("/legal");
  const [bootstrapData, setBootstrapData] = useState<AppBootstrapData | null>(() => getCachedAppBootstrap());
  const [error, setError] = useState<Error | null>(null);

  // Splash / loading state - skip splash for legal pages
  const [showSplash, setShowSplash] = useState(() => !isLegalPage && getCachedAppBootstrap() === null);
  const [splashFading, setSplashFading] = useState(false);
  const [splashShowLoading, setSplashShowLoading] = useState(false);
  const splashMinTimeRef = useRef(getCachedAppBootstrap() !== null);
  const loadingDoneRef = useRef(getCachedAppBootstrap() !== null);
  const ready = bootstrapData !== null || error !== null;

  // Onboarding state
  const [onboardingDone, setOnboardingDone] = useState(false);
  const needsOnboarding = bootstrapData !== null && !bootstrapData.localSettings?.onboardingCompleted && !onboardingDone;
  const [onboardingReady, setOnboardingReady] = useState(false);

  // Controls whether the onboarding content is visible (delayed after title moves)
  const [showOnboardingContent, setShowOnboardingContent] = useState(false);

  const dismissSplash = useCallback(() => {
    setSplashShowLoading(false);
    if (needsOnboarding) {
      setOnboardingReady(true);
      // Show onboarding content after the title has finished moving
      window.setTimeout(() => setShowOnboardingContent(true), 800);
    } else {
      setSplashFading(true);
      window.setTimeout(() => setShowSplash(false), 1000);
    }
  }, [needsOnboarding]);

  useEffect(() => {
    if (bootstrapData || error) return;
    let cancelled = false;
    loadAppBootstrap()
      .then((data) => { if (!cancelled) setBootstrapData(data); })
      .catch((nextError) => { if (!cancelled) setError(nextError instanceof Error ? nextError : new Error("Failed to load app bootstrap")); });
    return () => { cancelled = true; };
  }, [bootstrapData, error]);

  useEffect(() => {
    if (!showSplash) return;
    const minTimer = window.setTimeout(() => {
      splashMinTimeRef.current = true;
      if (loadingDoneRef.current) dismissSplash();
    }, 1500);
    const loadingTimer = window.setTimeout(() => {
      if (!loadingDoneRef.current) setSplashShowLoading(true);
    }, 2000);
    return () => { window.clearTimeout(minTimer); window.clearTimeout(loadingTimer); };
  }, [dismissSplash, showSplash]);

  useEffect(() => {
    if (!ready) return;
    loadingDoneRef.current = true;
    if (showSplash && splashMinTimeRef.current) {
      const t = window.setTimeout(() => dismissSplash(), 0);
      return () => window.clearTimeout(t);
    }
  }, [dismissSplash, ready, showSplash]);

  const updateBootstrapData = useCallback((updater: (current: AppBootstrapData) => AppBootstrapData) => {
    setBootstrapData((current) => {
      if (!current) return current;
      return setCachedAppBootstrap(updater(current));
    });
  }, []);

  const value = useMemo<AppBootstrapContextValue>(() => ({
    bootstrapData, ready, error, updateBootstrapData,
  }), [bootstrapData, error, ready, updateBootstrapData]);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingDone(true);
    setSplashFading(true);
    window.setTimeout(() => setShowSplash(false), 1000);
  }, []);

  const renderChildren = !needsOnboarding || onboardingDone;

  return (
    <AppBootstrapContext.Provider value={value}>
      {showSplash && (
        <div
          data-testid="app-splash"
          className={`fixed inset-0 z-[9999] transition-opacity ${splashFading ? "duration-700 delay-300 opacity-0" : "opacity-100"}`}
        >
          {/* Background */}
          <div className="absolute inset-0 bg-background" />

          {/* Title, absolute positioned, animates between center and top */}
          {!showOnboardingContent && (
            <h1
              className="absolute left-0 right-0 text-center font-light text-foreground/70 tracking-tight z-20"
              style={{
                top: "50%",
                fontSize: "48px",
                transform: "translateY(-50%)",
                opacity: splashFading ? 0 : 1,
                transition: "opacity 500ms ease",
              }}
            >
              <span className="inline-block animate-[splash-slide-up_0.8s_ease-out_0.4s_both]">
                {messages.common.appName}
              </span>
            </h1>
          )}

          {/* Loading spinner */}
          {splashShowLoading && !onboardingReady && !splashFading && (
            <div className="absolute left-0 right-0 flex justify-center" style={{ top: "calc(50% + 40px)" }}>
              <div className="flex items-center gap-2.5 animate-[splash-slide-up_0.5s_ease-out_both]">
                <svg className="h-3.5 w-3.5 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" />
                  <path className="opacity-70" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span className="text-xs tracking-wide text-muted-foreground">
                  {messages.chat.loadingSpace}
                </span>
              </div>
            </div>
          )}

          {/* Onboarding, appears after title finishes animating */}
          {onboardingReady && !splashFading && (
            <div
              className="absolute inset-x-0 bottom-0 overflow-y-auto z-10"
              style={{
                top: "90px",
                opacity: showOnboardingContent ? 1 : 0,
                transition: "opacity 600ms cubic-bezier(0.25, 0.1, 0.25, 1)",
              }}
            >
              <OnboardingFlow onComplete={handleOnboardingComplete} />
            </div>
          )}
        </div>
      )}
      {renderChildren && children}
    </AppBootstrapContext.Provider>
  );
}

export function useAppBootstrap() {
  const context = useContext(AppBootstrapContext);
  if (!context) {
    throw new Error("useAppBootstrap must be used within AppBootstrapProvider");
  }
  return context;
}
