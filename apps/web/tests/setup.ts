import "@testing-library/jest-dom";

// jsdom doesn't implement matchMedia — ScoreRing (and anything else checking
// prefers-reduced-motion) needs this polyfilled or it throws on mount.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}
