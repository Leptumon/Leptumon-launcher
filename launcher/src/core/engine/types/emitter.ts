/**
 * Type-safe event emitter
 */

type EventHandler<T> = (data: T) => void | Promise<void>;

export class TypedEventEmitter<TEventMap extends Record<string, unknown>> {
    private handlers = new Map<keyof TEventMap, Set<EventHandler<unknown>>>();

    /**
     * Subscribe to an event
     */
    on<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): () => void {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event)!.add(handler as EventHandler<unknown>);

        // Return unsubscribe function
        return () => this.off(event, handler);
    }

    /**
     * Unsubscribe from an event
     */
    off<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): void {
        this.handlers.get(event)?.delete(handler as EventHandler<unknown>);
    }

    /**
     * Subscribe to an event once
     */
    once<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): () => void {
        const wrapper: EventHandler<TEventMap[K]> = (data) => {
            this.off(event, wrapper);
            return handler(data);
        };
        return this.on(event, wrapper);
    }

    /**
     * Emit an event
     */
    async emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): Promise<void> {
        const eventHandlers = this.handlers.get(event);
        if (!eventHandlers) return;

        const promises = [...eventHandlers].map((handler) => handler(data));
        await Promise.all(promises);
    }

    /**
     * Remove all handlers for an event (or all events)
     */
    removeAllListeners(event?: keyof TEventMap): void {
        if (event) {
            this.handlers.delete(event);
        } else {
            this.handlers.clear();
        }
    }
}
