import { resolve } from "../cdp/endpoint.ts";
import { open as openTransport, type Transport } from "../cdp/transport.ts";
import { act as runAction } from "./execute.ts";
import { check as checkFreshness } from "./fresh.ts";
import { observe as readObservation } from "./read.ts";
import { close as closeSession, open as openSession, type OpenOptions, type Session } from "./session.ts";
import type { Action, BrowserPort } from "./types.ts";

export type ConnectOptions = OpenOptions & {
  /** Sends the snapshot to the model as a frame with the numbered boxes of the elements. */
  readonly vision?: boolean;
  /** Leaves the tab behind for inspection, closing only the socket, when it leaves a `using` block. */
  readonly keepOpen?: boolean;
};

export type Connection = {
  readonly port: BrowserPort;
  readonly session: Session;
  readonly transport: Transport;
  /** Closes the tab and the socket, or only the socket when the connection was opened to be kept. */
  [Symbol.asyncDispose](): Promise<void>;
};

/** Resolves the browser endpoint, opens one background tab and binds it as a port. */
export async function connect(url: string, options: ConnectOptions = {}): Promise<Connection> {
  const endpoint = await resolve();
  const transport = await openTransport(endpoint);
  const session = await openSession(transport, url, options);
  const port = bind(session, transport, options.vision);
  return {
    port,
    session,
    transport,
    [Symbol.asyncDispose]: async () => {
      if (options.keepOpen) {
        transport.close();
        return;
      }
      await port.close();
    },
  };
}

export function bind(session: Session, transport?: Transport, vision = false): BrowserPort {
  return {
    observe: (screenshot) =>
      readObservation(session.client, { screenshot, vision, afterInput: consume(session) }),
    fresh: (page, action) => checkFreshness(session.client, page, action),
    act: (action, page, text) => runAction(session, action, page, text ?? null),
    close: async () => {
      await closeSession(session);
      if (transport) await transport.close();
    },
  };
}

function consume(session: Session): Action | null {
  const pending = session.afterInput;
  session.afterInput = null;
  return pending;
}
