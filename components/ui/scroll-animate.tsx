"use client";

import React, { useRef, useEffect } from 'react';
import { useFadeInAnimation, useScrollAnimation } from '@/contexts/ScrollTriggerContext';

interface ScrollAnimateProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale' | 'rotate';
  duration?: number;
  delay?: number;
  start?: string;
  end?: string;
  stagger?: number;
  once?: boolean;
}

export const ScrollAnimate: React.FC<ScrollAnimateProps> = ({
  children,
  className = '',
  animation = 'fadeIn',
  duration = 1,
  delay = 0,
  start = "top 80%",
  end = "bottom 20%",
  once = false,
}) => {
  const elementRef = useRef<HTMLDivElement>(null);

  // Get animation config based on type
  const getAnimationConfig = () => {
    switch (animation) {
      case 'slideUp':
        return { opacity: 1, y: 0, duration, delay, ease: "power2.out" };
      case 'slideDown':
        return { opacity: 1, y: 0, duration, delay, ease: "power2.out" };
      case 'slideLeft':
        return { opacity: 1, x: 0, duration, delay, ease: "power2.out" };
      case 'slideRight':
        return { opacity: 1, x: 0, duration, delay, ease: "power2.out" };
      case 'scale':
        return { opacity: 1, scale: 1, duration, delay, ease: "power2.out" };
      case 'rotate':
        return { opacity: 1, rotation: 0, duration, delay, ease: "power2.out" };
      default:
        return { opacity: 1, y: 0, duration, delay, ease: "power2.out" };
    }
  };

  // Get initial style based on animation type
  const getInitialStyle = () => {
    switch (animation) {
      case 'slideUp':
        return { opacity: 0, transform: 'translateY(30px)' };
      case 'slideDown':
        return { opacity: 0, transform: 'translateY(-30px)' };
      case 'slideLeft':
        return { opacity: 0, transform: 'translateX(30px)' };
      case 'slideRight':
        return { opacity: 0, transform: 'translateX(-30px)' };
      case 'scale':
        return { opacity: 0, transform: 'scale(0.8)' };
      case 'rotate':
        return { opacity: 0, transform: 'rotate(10deg)' };
      default:
        return { opacity: 0, transform: 'translateY(30px)' };
    }
  };

  // Apply animation
  useScrollAnimation(
    elementRef,
    getAnimationConfig(),
    {
      trigger: elementRef.current,
      start,
      end,
      toggleActions: once ? "play none none none" : "play none none reverse",
    }
  );

  return (
    <div
      ref={elementRef}
      className={className}
      style={getInitialStyle()}
    >
      {children}
    </div>
  );
};

// Stagger Animation Component
interface ScrollStaggerProps {
  children: React.ReactNode;
  className?: string;
  animation?: 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'scale';
  duration?: number;
  stagger?: number;
  start?: string;
  end?: string;
  once?: boolean;
}

export const ScrollStagger: React.FC<ScrollStaggerProps> = ({
  children,
  className = '',
  animation = 'fadeIn',
  duration = 0.8,
  stagger = 0.1,
  start = "top 80%",
  end = "bottom 20%",
  once = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const childElements = containerRef.current.children;
    
    // Apply initial styles to all children
    Array.from(childElements).forEach((child) => {
      const element = child as HTMLElement;
      switch (animation) {
        case 'slideUp':
          element.style.opacity = '0';
          element.style.transform = 'translateY(30px)';
          break;
        case 'slideDown':
          element.style.opacity = '0';
          element.style.transform = 'translateY(-30px)';
          break;
        case 'slideLeft':
          element.style.opacity = '0';
          element.style.transform = 'translateX(30px)';
          break;
        case 'slideRight':
          element.style.opacity = '0';
          element.style.transform = 'translateX(-30px)';
          break;
        case 'scale':
          element.style.opacity = '0';
          element.style.transform = 'scale(0.8)';
          break;
        default:
          element.style.opacity = '0';
          element.style.transform = 'translateY(30px)';
      }
    });
  }, [animation]);

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};

// Parallax Component
interface ScrollParallaxProps {
  children: React.ReactNode;
  className?: string;
  speed?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}

export const ScrollParallax: React.FC<ScrollParallaxProps> = ({
  children,
  className = '',
  speed = 0.5,
  direction = 'up',
}) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useScrollAnimation(
    elementRef,
    {
      y: direction === 'up' ? -100 * speed : direction === 'down' ? 100 * speed : 0,
      x: direction === 'left' ? -100 * speed : direction === 'right' ? 100 * speed : 0,
      ease: "none",
    },
    {
      trigger: elementRef.current,
      start: "top bottom",
      end: "bottom top",
      scrub: true,
    }
  );

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
};

// Pin Component (for sticky elements)
interface ScrollPinProps {
  children: React.ReactNode;
  className?: string;
  start?: string;
  end?: string;
  pinSpacing?: boolean;
}

export const ScrollPin: React.FC<ScrollPinProps> = ({
  children,
  className = '',
  start = "top top",
  end = "bottom top",
  pinSpacing = true,
}) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useScrollAnimation(
    elementRef,
    {},
    {
      trigger: elementRef.current,
      start,
      end,
      pin: true,
      pinSpacing,
    }
  );

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
}; 