"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register ScrollTrigger plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

interface ScrollTriggerContextType {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  isReady: boolean;
  createAnimation: (element: string | Element, animation: gsap.TweenVars, scrollTriggerConfig?: ScrollTrigger.Vars) => gsap.core.Tween;
  createTimeline: (scrollTriggerConfig?: ScrollTrigger.Vars) => gsap.core.Timeline;
  refresh: () => void;
  killAll: () => void;
}

const ScrollTriggerContext = createContext<ScrollTriggerContextType | undefined>(undefined);

interface ScrollTriggerProviderProps {
  children: React.ReactNode;
}

export const ScrollTriggerProvider: React.FC<ScrollTriggerProviderProps> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize ScrollTrigger
    const initScrollTrigger = () => {
      try {
        gsap.registerPlugin(ScrollTrigger);
        
        // Configure ScrollTrigger defaults
        ScrollTrigger.defaults({
          toggleActions: "restart pause resume pause",
          scroller: window,
        });

        // Enable ScrollTrigger
        ScrollTrigger.refresh();
        
        if (mountedRef.current) {
          setIsReady(true);
        }
      } catch (error) {
        console.error('Failed to initialize ScrollTrigger:', error);
      }
    };

    // Initialize on mount
    initScrollTrigger();

    // Refresh on window resize
    const handleResize = () => {
      ScrollTrigger.refresh();
    };

    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      window.removeEventListener('resize', handleResize);
      ScrollTrigger.killAll();
    };
  }, []);

  // Helper function to create animations with ScrollTrigger
  const createAnimation = (
    element: string | Element,
    animation: gsap.TweenVars,
    scrollTriggerConfig?: ScrollTrigger.Vars
  ): gsap.core.Tween => {
    const tween = gsap.to(element, {
      ...animation,
      scrollTrigger: scrollTriggerConfig ? {
        trigger: element,
        start: "top 80%",
        end: "bottom 20%",
        toggleActions: "play none none reverse",
        ...scrollTriggerConfig,
      } : scrollTriggerConfig,
    });

    return tween;
  };

  // Helper function to create timeline with ScrollTrigger
  const createTimeline = (scrollTriggerConfig?: ScrollTrigger.Vars): gsap.core.Timeline => {
    const timeline = gsap.timeline({
      scrollTrigger: scrollTriggerConfig ? {
        start: "top 80%",
        end: "bottom 20%",
        toggleActions: "play none none reverse",
        ...scrollTriggerConfig,
      } : scrollTriggerConfig,
    });

    return timeline;
  };

  // Refresh all ScrollTriggers
  const refresh = () => {
    ScrollTrigger.refresh();
  };

  // Kill all ScrollTriggers
  const killAll = () => {
    ScrollTrigger.killAll();
  };

  const value: ScrollTriggerContextType = {
    gsap,
    ScrollTrigger,
    isReady,
    createAnimation,
    createTimeline,
    refresh,
    killAll,
  };

  return (
    <ScrollTriggerContext.Provider value={value}>
      {children}
    </ScrollTriggerContext.Provider>
  );
};

// Custom hook to use ScrollTrigger
export const useScrollTrigger = () => {
  const context = useContext(ScrollTriggerContext);
  if (context === undefined) {
    throw new Error('useScrollTrigger must be used within a ScrollTriggerProvider');
  }
  return context;
};

// Custom hook for creating scroll animations
export const useScrollAnimation = (
  elementRef: React.RefObject<HTMLElement>,
  animation: gsap.TweenVars,
  scrollTriggerConfig?: ScrollTrigger.Vars,
  dependencies: React.DependencyList = []
) => {
  const { createAnimation, isReady } = useScrollTrigger();
  const animationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!isReady || !elementRef.current) return;

    // Kill existing animation
    if (animationRef.current) {
      animationRef.current.kill();
    }

    // Create new animation
    animationRef.current = createAnimation(
      elementRef.current,
      animation,
      scrollTriggerConfig
    );

    // Cleanup on unmount
    return () => {
      if (animationRef.current) {
        animationRef.current.kill();
      }
    };
  }, [isReady, elementRef.current, ...dependencies]);

  return animationRef.current;
};

// Custom hook for creating timeline animations
export const useScrollTimeline = (
  scrollTriggerConfig?: ScrollTrigger.Vars,
  dependencies: React.DependencyList = []
) => {
  const { createTimeline, isReady } = useScrollTrigger();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    if (!isReady) return;

    // Kill existing timeline
    if (timelineRef.current) {
      timelineRef.current.kill();
    }

    // Create new timeline
    timelineRef.current = createTimeline(scrollTriggerConfig);

    // Cleanup on unmount
    return () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
    };
  }, [isReady, ...dependencies]);

  return timelineRef.current;
};

// Utility hook for simple fade in animations
export const useFadeInAnimation = (
  elementRef: React.RefObject<HTMLElement>,
  options: {
    duration?: number;
    delay?: number;
    y?: number;
    start?: string;
    end?: string;
  } = {}
) => {
  const {
    duration = 1,
    delay = 0,
    y = 30,
    start = "top 80%",
    end = "bottom 20%",
  } = options;

  return useScrollAnimation(
    elementRef,
    {
      opacity: 1,
      y: 0,
      duration,
      delay,
      ease: "power2.out",
    },
    {
      trigger: elementRef.current,
      start,
      end,
      toggleActions: "play none none reverse",
    }
  );
};

// Utility hook for stagger animations
export const useStaggerAnimation = (
  elementsRef: React.RefObject<HTMLElement[]>,
  animation: gsap.TweenVars,
  scrollTriggerConfig?: ScrollTrigger.Vars,
  staggerAmount: number = 0.1
) => {
  const { gsap, isReady } = useScrollTrigger();
  const animationRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!isReady || !elementsRef.current || elementsRef.current.length === 0) return;

    // Kill existing animation
    if (animationRef.current) {
      animationRef.current.kill();
    }

    // Create staggered animation
    animationRef.current = gsap.to(elementsRef.current, {
      ...animation,
      stagger: staggerAmount,
      scrollTrigger: scrollTriggerConfig ? {
        trigger: elementsRef.current[0],
        start: "top 80%",
        end: "bottom 20%",
        toggleActions: "play none none reverse",
        ...scrollTriggerConfig,
      } : scrollTriggerConfig,
    });

    // Cleanup on unmount
    return () => {
      if (animationRef.current) {
        animationRef.current.kill();
      }
    };
  }, [isReady, elementsRef.current]);

  return animationRef.current;
}; 