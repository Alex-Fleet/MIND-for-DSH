export declare const inject: readonly ["slots"];
interface SlotsService {
    inject(name: string, factory: () => (() => void) | void): void;
    register(options: Record<string, unknown>, component: (props: never) => unknown): () => void;
}
interface ClientContext {
    slots: SlotsService;
    effect(factory: () => () => void, label?: string): void;
}
/**
 * Browser half of MIND for DSH.
 *
 * The sidebar entry and the global main panel share the id `mind`, so the
 * sidebar shell selects the panel without extra wiring.
 */
export declare function apply(ctx: ClientContext): void;
export {};
