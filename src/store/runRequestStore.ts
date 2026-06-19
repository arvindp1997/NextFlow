import { create } from "zustand";

interface RunRequestState {
  requestId: number;
  nodeId: string | null;
  requestSingleRun: (nodeId: string) => void;
}

export const useRunRequestStore = create<RunRequestState>((set, get) => ({
  requestId: 0,
  nodeId: null,
  requestSingleRun: (nodeId) => set({ requestId: get().requestId + 1, nodeId }),
}));
