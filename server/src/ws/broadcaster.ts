export interface WsClient {
  send(data: string): void;
  readyState: number;
}

const OPEN = 1;

const clients = new Set<WsClient>();

export function register(client: WsClient): void {
  clients.add(client);
}

export function unregister(client: WsClient): void {
  clients.delete(client);
}

export function broadcast(json: string): void {
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

export function getClientCount(): number {
  return clients.size;
}
