/** @novnc/novnc ships no type declarations of its own - this covers just
 * the small slice of its API RemoteFrame.tsx actually uses. */
declare module "@novnc/novnc" {
  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string, options?: { credentials?: unknown; shared?: boolean; wsProtocols?: string[] });
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
    clipboardPasteFrom(text: string): void;
    sendCtrlAltDel(): void;
  }
}
