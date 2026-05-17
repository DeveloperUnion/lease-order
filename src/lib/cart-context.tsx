"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { CartItem, Material, SpecSelectionLabel } from "./types";
import { buildCartLineId } from "./spec-resolver";

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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((input: AddItemInput) => {
    setItems((prev) => {
      const item = toCartItem(input);
      const existing = prev.find((i) => i.cartLineId === item.cartLineId);
      if (existing) {
        return prev.map((i) =>
          i.cartLineId === item.cartLineId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
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
      value={{ items, addItem, updateQuantity, removeItem, clearCart, totalItems }}
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
