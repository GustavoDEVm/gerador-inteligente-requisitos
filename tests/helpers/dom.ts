import { JSDOM } from "jsdom";

type GlobalPropertyDescriptor = {
  key: string;
  descriptor: PropertyDescriptor | undefined;
};

/**
 * Instala um DOM isolado para um teste de componente executado pelo node:test.
 * A função retornada restaura todos os globais alterados ao estado anterior.
 */
export function installDomEnvironment() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/elicitacao",
  });
  const globalObject = globalThis as typeof globalThis & Record<string, unknown>;
  const values: Record<string, unknown> = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    location: dom.window.location,
    history: dom.window.history,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    SVGElement: dom.window.SVGElement,
    Node: dom.window.Node,
    Text: dom.window.Text,
    Event: dom.window.Event,
    EventTarget: dom.window.EventTarget,
    CustomEvent: dom.window.CustomEvent,
    MouseEvent: dom.window.MouseEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.keys(values).map((key): GlobalPropertyDescriptor => ({
    key,
    descriptor: Object.getOwnPropertyDescriptor(globalObject, key),
  }));

  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalObject, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  }

  return () => {
    for (const { key, descriptor } of previous) {
      if (descriptor) {
        Object.defineProperty(globalObject, key, descriptor);
      } else {
        Reflect.deleteProperty(globalObject, key);
      }
    }
    dom.window.close();
  };
}
