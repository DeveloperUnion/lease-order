import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { CartItem, DeliveryMethod } from "../types";
import type { SubmitOrderInput } from "../order-submission";
import type { MessageAttachment } from "../chat/types";

const DB_NAME = "lease-order-offline";
const DB_VERSION = 3;

export type OutboxStatus = "pending" | "sending" | "sent" | "failed";

export type OutboxItem = {
  id: string;
  clientRequestId: string;
  tenantId: string | null;
  customerId: string | null;
  payload: SubmitOrderInput;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  resultOrderNumber: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ChatOutboxPayload = {
  conversationId?: string;
  customerId?: string;
  body: string;
  attachments: MessageAttachment[];
  orderId: string | null;
  clientRequestId: string;
};

export type ChatOutboxItem = {
  id: string;
  clientRequestId: string;
  tenantId: string | null;
  customerId: string | null;
  payload: ChatOutboxPayload;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  resultMessageId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type DraftFormFields = {
  siteName: string;
  contactName: string;
  phone: string;
  note: string;
  deliveryMethod: DeliveryMethod;
  deliveryAddress: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  pickupOfficeId: string;
  leaseStartDate: string;
  leaseEndDate: string;
};

export type Draft = {
  id: string;
  tenantId: string | null;
  customerId: string | null;
  name: string;
  items: CartItem[];
  formFields: DraftFormFields;
  createdAt: number;
  updatedAt: number;
};

interface OfflineSchema extends DBSchema {
  drafts: {
    key: string;
    value: Draft;
    indexes: { "by-customer": [string, string]; "by-updated": number };
  };
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: {
      "by-customer": [string, string];
      "by-status": OutboxStatus;
      "by-updated": number;
    };
  };
  chatOutbox: {
    key: string;
    value: ChatOutboxItem;
    indexes: {
      "by-customer": [string, string];
      "by-status": OutboxStatus;
      "by-updated": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<OfflineSchema>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const store = db.createObjectStore("drafts", { keyPath: "id" });
          store.createIndex("by-customer", ["tenantId", "customerId"]);
          store.createIndex("by-updated", "updatedAt");
        }
        if (oldVersion < 2) {
          const store = db.createObjectStore("outbox", { keyPath: "id" });
          store.createIndex("by-customer", ["tenantId", "customerId"]);
          store.createIndex("by-status", "status");
          store.createIndex("by-updated", "updatedAt");
        }
        if (oldVersion < 3) {
          const store = db.createObjectStore("chatOutbox", { keyPath: "id" });
          store.createIndex("by-customer", ["tenantId", "customerId"]);
          store.createIndex("by-status", "status");
          store.createIndex("by-updated", "updatedAt");
        }
      },
    });
  }
  return dbPromise;
}

export const EMPTY_FORM_FIELDS: DraftFormFields = {
  siteName: "",
  contactName: "",
  phone: "",
  note: "",
  deliveryMethod: "delivery",
  deliveryAddress: "",
  deliveryLat: null,
  deliveryLng: null,
  pickupOfficeId: "",
  leaseStartDate: "",
  leaseEndDate: "",
};
