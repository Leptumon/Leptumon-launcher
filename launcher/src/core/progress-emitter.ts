/**
 * Internal event bus for weighted launch progress (java / loader / game).
 * Producers: main/launchPipeline.ts and core/engine download callbacks.
 * Consumer: main/launchProgress.ts → renderer launch-progress IPC.
 */
import { EventEmitter } from 'events';

export const progressEmitter = new EventEmitter();