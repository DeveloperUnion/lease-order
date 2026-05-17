"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { CartItem, Material, SpecSelectionLabel } from "./types";
import { buildCartLineId } from "./spec-resolver";
import {
  ensureActiveDraft,
  getDraft,
  createDraft,
  updateDraftItems,
  setActiveDraftIdSync,
} from "./offline/drafts";

type AddItemInput = {
  material: Material;
  quantity: number;
  selections: SpecSelectionLabel[];
};

type CartContextType = {
  items: CartItem[];
  addItem: (input: AddItemInput) => void;
  updateQuantity: (cartLineId: string, quantity: number) => void;
  removeItem: (cartLineId: string) => void;
  clearCart: () => void;
  totalItems: number;
  activeDraftId: string | null;
  switchDraft: (draftId: string) => Promise<void>;
  startNewDraft: () => Promise<string>;
};

const CartContext = createContext<CartContextType | null>(null);

function toCartItem(input: AddItemInput): CartItem {
  return {
    cartLineId: buildCartLineId(input.material.id, input.selections),
    material: input.material,
    quantity: input.quantity,
    selections: input.selections,
  };
}

function mergeItem(prev: CartItem[], item: CartItem): CartItem[] {
  const existing = prev.find((i) => i.cartLineId === item.cartLineId);
  if (existing) {
    return prev.map((i) =>
      i.cartLineId === item.cartLineId
        ? { ...i, quantity: i.quantity + item.quantity }
        : i
    );
  }
  return [...prev, item];
}

type CartProviderProps = {
  children: ReactNode;
  tenantId: string | null;
  customerId: string | null;
};

export function CartProvider({ children, tenantId, customerId }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    (async () => {
      try {
        const draft = await ensureActiveDraft(tenantId, customerId);
        if (cancelled) return;
        setActiveDraftId(draft.id);
        setItems(draft.items);
      } catch {
        if (cancelled) return;
        setActiveDraftId(null);
        setItems([]);
      } finally {
        if (!cancelled) loadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, customerId]);

  useEffect(() => {
    if (!loadedRef.current || !activeDraftId) return;
    updateDraftItems(activeDraftId, items).catch(() => {
      /* offline write best-effort */
    });
  }, [items, activeDraftId]);

  const addItem = useCallback((input: AddItemInput) => {
    setItems((prev) => mergeItem(prev, toCartItem(input)));
  }, []);

  const updateQuantity = useCallback((cartLineId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.cartLineId === cartLineId ? { ...item, quantity } : item
      )
    );
  }, []);

  const removeItem = useCallback((cartLineId: string) => {
    setItems((prev) => prev.filter((item) => item.cartLineId !== cartLineId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const switchDraft = useCallback(
    async (draftId: string) => {
      const target = await getDraft(draftId);
      if (!target) return;
      loadedRef.current = false;
      setActiveDraftIdSync(tenantId, customerId, target.id);
      setActiveDraftId(target.id);
      setItems(target.items);
      loadedRef.current = true;
    },
    [tenantId, customerId]
  );

  const startNewDraft = useCallback(async () => {
    const draft = await createDraft({ tenantId, customerId });
    loadedRef.current = false;
    setActiveDraftIdSync(tenantId, customerId, draft.id);
    setActiveDraftId(draft.id);
    setItems([]);
    loadedRef.current = true;
    return draft.id;
  }, [tenantId, customerId]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        totalItems,
        activeDraftId,
        switchDraft,
        startNewDraft,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
