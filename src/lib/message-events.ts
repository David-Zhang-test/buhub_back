import { EventEmitter } from "events";
import type Redis from "ioredis";
import { redis } from "@/src/lib/redis";
import { child } from "@/src/lib/logger";

const log = child("message-events");

export type MessageRealtimeEvent =
  | {
      id: string;
      type: "message:new";
      messageId: string;
      fromUserId: string;
      toUserId: string;
      conversationUserId: string;
      message?: {
        id: string;
        content: string;
        images: string[];
        isDeleted: boolean;
        isRead: boolean;
        createdAt: string;
        senderId: string;
        receiverId: string;
      };
      conversation?: {
        userId: string;
        user: {
          id: string;
          userName: string | null;
          nickname: string;
          avatar: string;
          gender: string;
          grade: string | null;
          major: string | null;
        };
        latestMessage: {
          content: string;
          images: string[];
          createdAt: Date | string;
          isRead: boolean;
          isDeleted: boolean;
          senderId: string;
        } | null;
        lastInteractedAt: Date | string;
        unreadCount: number;
      } | null;
      createdAt: number;
    }
  | {
      id: string;
      type: "typing:update";
      fromUserId: string;
      toUserId: string;
      conversationUserId: string;
      isTyping: boolean;
      createdAt: number;
    }
  | {
      id: string;
      type: "message:read";
      messageId?: string;
      readerUserId: string;
      conversationUserId: string;
      createdAt: number;
    }
  | {
      id: string;
      type: "message:recalled";
      messageId: string;
      operatorUserId: string;
      conversationUserId: string;
      conversation?: {
        userId: string;
        user: {
          id: string;
          userName: string | null;
          nickname: string;
          avatar: string;
          gender: string;
          grade: string | null;
          major: string | null;
        };
        latestMessage: {
          content: string;
          images: string[];
          createdAt: Date | string;
          isRead: boolean;
          isDeleted: boolean;
          senderId: string;
        } | null;
        lastInteractedAt: Date | string;
        unreadCount: number;
      } | null;
      createdAt: number;
    }
  | {
      id: string;
      type: "notification:new";
      notificationType: "like" | "follow" | "comment";
      createdAt: number;
    }
  | {
      // Global, non-targeted: fan out to every currently-connected client so
      // their forum feed query invalidates and the new post appears at the top
      // without waiting for the 15s polling tick. Payload is intentionally
      // minimal — authorId is only used by the mobile self-filter, postId
      // exists for future per-post invalidation. No identity info beyond the
      // raw user id, so anonymous posts must NOT be broadcast (caller's job).
      id: string;
      type: "post:new";
      postId: string;
      authorId: string;
      createdAt: number;
    };

type BrokerEnvelope = {
  userId: string;
  event: MessageRealtimeEvent;
};

class MessageEventBroker {
  private readonly channel = "message:events:notify";
  // Non-targeted broadcast channel for events that should reach every
  // currently-connected client (e.g. post:new). server.js subscribes
  // separately and fans out to every WebSocket. No per-user list — offline
  // users catch up via the regular feed polling on next open.
  static readonly BROADCAST_CHANNEL = "message:events:broadcast";
  private readonly eventListKeyPrefix = "message:events:user:";
  private readonly eventListTtlSeconds = 60 * 60;
  private readonly maxEventsPerUser = 200;
  private readonly emitters = new Map<string, EventEmitter>();
  private subscriber: Redis | null = null;
  private subscriberReadyPromise: Promise<void> | null = null;

  private getEmitter(userId: string): EventEmitter {
    const existing = this.emitters.get(userId);
    if (existing) return existing;
    const emitter = new EventEmitter();
    this.emitters.set(userId, emitter);
    return emitter;
  }

  private eventListKey(userId: string) {
    return `${this.eventListKeyPrefix}${userId}`;
  }

  private notifyLocal(userId: string) {
    this.getEmitter(userId).emit("event");
  }

  private async ensureSubscriber() {
    if (this.subscriberReadyPromise) {
      await this.subscriberReadyPromise;
      return;
    }

    const subscriber = redis.duplicate();
    subscriber.on("message", (_channel, payload) => {
      try {
        const envelope = JSON.parse(payload) as BrokerEnvelope;
        if (envelope?.userId) {
          this.notifyLocal(envelope.userId);
        }
      } catch {
        // Ignore malformed payload.
      }
    });
    subscriber.on("error", (error) => {
      log.error("subscriber error", { error });
    });

    this.subscriber = subscriber;
    this.subscriberReadyPromise = subscriber
      .subscribe(this.channel)
      .then(() => undefined)
      .catch((error) => {
        this.subscriberReadyPromise = null;
        throw error;
      });

    try {
      await this.subscriberReadyPromise;
    } catch (error) {
      log.error("subscribe failed", { error });
    }
  }

  private async readEventsSince(userId: string, since: number): Promise<MessageRealtimeEvent[]> {
    try {
      const rawEvents = await redis.lrange(this.eventListKey(userId), 0, this.maxEventsPerUser - 1);
      if (rawEvents.length === 0) return [];

      const parsed = rawEvents
        .map((item) => {
          try {
            return JSON.parse(item) as MessageRealtimeEvent;
          } catch {
            return null;
          }
        })
        .filter((event): event is MessageRealtimeEvent => Boolean(event));

      return parsed
        .filter((event) => event.createdAt > since)
        .sort((a, b) => a.createdAt - b.createdAt);
    } catch (error) {
      log.error("read events failed", { error });
      return [];
    }
  }

  private async publishRemote(userId: string, event: MessageRealtimeEvent) {
    const envelope: BrokerEnvelope = { userId, event };
    const serializedEvent = JSON.stringify(event);
    const serializedEnvelope = JSON.stringify(envelope);
    const key = this.eventListKey(userId);

    await redis
      .multi()
      .lpush(key, serializedEvent)
      .ltrim(key, 0, this.maxEventsPerUser - 1)
      .expire(key, this.eventListTtlSeconds)
      .publish(this.channel, serializedEnvelope)
      .exec();
  }

  publish(userId: string, event: MessageRealtimeEvent) {
    this.publishRemote(userId, event).catch((error) => {
      log.error("publish failed", { error });
    });
  }

  /**
   * Broadcast a global event to every currently-connected WebSocket client.
   * Fire-and-forget, no persistence — offline users will catch up via the
   * regular polling refresh when they re-open the app. Used for events that
   * are not targeted at a single user (e.g. a new post appearing in the
   * forum feed for everyone).
   *
   * Param type is narrowed to the broadcast-safe variants only — passing a
   * targeted event like `notification:new` would leak it to all users, so
   * the type system rejects it at compile time. Extend the Extract<> union
   * when adding new broadcast event types.
   */
  broadcast(event: Extract<MessageRealtimeEvent, { type: "post:new" }>) {
    redis
      .publish(MessageEventBroker.BROADCAST_CHANNEL, JSON.stringify(event))
      .catch((error) => {
        log.error("broadcast failed", { error });
      });
  }

  /**
   * Publish an ephemeral event (e.g. typing) via pub/sub only — NOT persisted
   * to the Redis event list. This avoids evicting durable events from the ring buffer.
   */
  publishTransient(userId: string, event: MessageRealtimeEvent) {
    const envelope: BrokerEnvelope = { userId, event };
    redis.publish(this.channel, JSON.stringify(envelope)).catch((error) => {
      log.error("transient publish failed", { error });
    });
  }

  async poll(
    userId: string,
    since: number,
    timeoutMs = 25000,
    signal?: AbortSignal
  ): Promise<MessageRealtimeEvent[]> {
    // If already aborted, return immediately
    if (signal?.aborted) return [];

    const immediate = await this.readEventsSince(userId, since);
    if (immediate.length > 0) return immediate;

    await this.ensureSubscriber();

    return new Promise<MessageRealtimeEvent[]>((resolve) => {
      let finished = false;
      const emitter = this.getEmitter(userId);
      let timeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        emitter.removeListener("event", onEvent);
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      };

      const finish = (events: MessageRealtimeEvent[]) => {
        if (finished) return;
        finished = true;
        cleanup();
        resolve(events);
      };

      const onEvent = async () => {
        const nextEvents = await this.readEventsSince(userId, since);
        if (nextEvents.length > 0) {
          finish(nextEvents);
        }
      };

      const onAbort = () => {
        finish([]);
      };

      emitter.on("event", onEvent);

      // Clean up listener when the HTTP connection drops
      if (signal) {
        signal.addEventListener("abort", onAbort);
      }

      timeout = setTimeout(() => {
        finish([]);
      }, timeoutMs);

      // Resolve race: event may arrive between initial read and listener registration.
      void onEvent();
    });
  }
}

const globalForMessageBroker = globalThis as unknown as {
  messageEventBroker?: MessageEventBroker;
};

export const messageEventBroker =
  globalForMessageBroker.messageEventBroker ?? new MessageEventBroker();

if (process.env.NODE_ENV !== "production") {
  globalForMessageBroker.messageEventBroker = messageEventBroker;
}
