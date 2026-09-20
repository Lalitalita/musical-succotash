import { create } from "zustand";

export interface BankIcon {
  id: string;
  icon?: string;
  iconUrl?: string;
}

interface IconBankState {
  customIcons: BankIcon[];
  addIcon: (icon: Omit<BankIcon, "id">) => void;
  removeIcon: (id: string) => void;
  hydrate: (icons: BankIcon[]) => void;
}

let counter = 0;

export const useIconBankStore = create<IconBankState>((set, get) => ({
  customIcons: [],

  addIcon: (icon) => {
    set({ customIcons: [...get().customIcons, { ...icon, id: `bank-${Date.now()}-${counter++}` }] });
  },

  removeIcon: (id) => set({ customIcons: get().customIcons.filter((i) => i.id !== id) }),

  hydrate: (icons) => set({ customIcons: Array.isArray(icons) ? icons : [] }),
}));
