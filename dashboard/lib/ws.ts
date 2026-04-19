"use client";

import { useEffect } from "react";
import { create } from "zustand";

interface WsEvent {
  type: string;
  payload: unknown;
  timestamp: string;
}

interface WsStore {
  events: WsEvent[];
  connected: boolean;
  addEvent: (event: WsEvent) => void;
  setConnected: (connected: boolean) => void;
  clearEvents: () => void;
}

export const useWsStore = create<WsStore>((set) => ({
  events: [],
  connected: false,
  addEvent: (event) =>
    set((state) => ({ events: [...state.events, event] })),
  setConnected: (connected) => set({ connected }),
  clearEvents: () => set({ events: [] }),
}));

const WS_URL =
  process.env.NEXT_PUBLIC_WARDEN_WS_URL ?? "ws://localhost:3000/ws";

export type useWardenEvents = () => WsEvent[];

export const useWardenEvents: useWardenEvents = () => {
  return useWsStore((state) => state.events);
};

export function useWardenWs() {
  const { addEvent, setConnected } = useWsStore();

  useEffect(() => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as WsEvent;
        addEvent(event);
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
    };
  }, [addEvent, setConnected]);
}
