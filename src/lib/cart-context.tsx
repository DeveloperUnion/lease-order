"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CartItem, Material, SpecSelectionLabel } from "./types";
import { buildCartLineId } from "./spec-resolver";

type AddItemInput = {
  material: Material;
  quantity: number;
  variantId?: string;
  variantName?: string;
  selections?: SpecSelectionLabel[];
};

type CartContextType = {
  items: CartItem[];
  addItem: (input: AddItemInput) => void;
  addItems: (inputs: AddItemInput[]) => void;
  updateQuantity: (cartLineId: string, quantity: number) => void;
  removeItem: (cartLineId: string) => void;
  clearCart: () => void;
  totalItems: number;
};

const CartContext = createContext<CartContextType | null>(null);

function toCartItem(input: AddItemInput): CartItem {
  return {
    cartLineId: buildCartLineId(input.material.id, input.variantId),
    material: input.material,
    quantity: input.quantity,
    variantId: input.variantId,
    variantName: input.variantName,
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((input: AddItemInput) => {
    setItems((prev) => mergeItem(prev, toCartItem(input)));
  }, []);

  const addItems = useCallback((inputs: AddItemInput[]) => {
    setItems((prev) => inputs.reduce((acc, i) => mergeItem(acc, toCartItem(i)), prev));
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

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, addItems, updateQuantity, removeItem, clearCart, totalItems }}
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
