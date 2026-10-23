import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * On the web, browsers with scroll-driven animations run the feed motion on the
 * compositor (same CSS as the design canvas), so no JavaScript runs per frame.
 * Native, and browsers without support, use the Reanimated styles in FeedCard.
 * The pin is linear so the old card stays exactly put; only its shrink is eased.
 */
export const CSS_SCROLL =
  Platform.OS === 'web' && typeof CSS !== 'undefined' && !!CSS.supports?.('animation-timeline: view()');

/** Tags a view for the stylesheet below (renders as data-eg="role"). */
export const egRole = (role: 'page' | 'card' | 'inner' | 'dim') => (CSS_SCROLL ? ({ dataSet: { eg: role } } as object) : {});

export function useFeedCss(pageH: number) {
  useEffect(() => {
    if (!CSS_SCROLL || pageH <= 0) return;
    const pin = pageH - 30;
    const el = document.createElement('style');
    el.id = 'eg-feed-motion';
    el.textContent = `
@keyframes egEnter{from{scale:.93}to{scale:1}}
@keyframes egPin{from{translate:0 0}to{translate:0 ${pin}px}}
@keyframes egShrink{from{scale:1}to{scale:.9}}
@keyframes egDim{from{opacity:0}to{opacity:.78}}
@keyframes egLift{from{transform:translateY(56px);opacity:.15}to{transform:none;opacity:1}}
[data-eg="page"]{view-timeline:--eg-card block;scroll-snap-stop:always}
[data-eg="card"]{will-change:translate,scale;
  animation:egEnter cubic-bezier(.2,.7,.2,1) backwards,egPin linear forwards,egShrink cubic-bezier(.45,0,.55,1) forwards;
  animation-timeline:--eg-card,--eg-card,--eg-card;
  animation-range:entry 0% entry 100%,exit 0% exit 100%,exit 0% exit 100%}
[data-eg="dim"]{opacity:0;animation:egDim linear both;animation-timeline:--eg-card;animation-range:exit 0% exit 100%}
[data-eg="inner"]{animation:egLift cubic-bezier(.2,.7,.2,1) backwards;animation-timeline:--eg-card;animation-range:entry 25% entry 100%}`;
    document.getElementById(el.id)?.remove();
    document.head.appendChild(el);
    return () => el.remove();
  }, [pageH]);
}
