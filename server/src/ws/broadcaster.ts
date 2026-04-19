export interface WsClient {
  send(data: string): void;
  readyState: number;
}

const OPEN = 1;

const clients = new Set<WsClient>();

function register(client: WsClient): void {
  clients.add(client);
}

function unregister(client: WsClient): void {
  clients.delete(client);
}

function broadcast(json: string): void {
  for (const client of clients) {
    if (client.readyState === OPEN) {
      try {
        client.send(json);
      } catch {
        clients.delete(client);
      }
    } else {
      clients.delete(client);
    }
  }
}

function getClientCount(): number {
  return clients.size;
}

export const wsBroadcaster = {
  register,
  unregister,
  broadcast,
  getClientCount,
};

export { register, unregister, broadcast, getClientCount };
