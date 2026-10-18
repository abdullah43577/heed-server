import { type Response } from "express";

export interface SSEMessage {
  chunk?: string;
  full?: string;
  done?: boolean;
  error?: string;
  [key: string]: unknown;
}

export class SSEHelper {
  private res: Response;
  private isClosed: boolean = false;

  constructor(res: Response) {
    this.res = res;
    this.setupHeaders();
  }

  private setupHeaders() {
    this.res.setHeader("Content-Type", "text/event-stream");
    this.res.setHeader("Cache-Control", "no-cache");
    this.res.setHeader("Connection", "keep-alive");
    this.res.setHeader("X-Accel-Buffering", "no");
    this.res.setHeader("Access-Control-Allow-Origin", "*");
    this.res.setHeader("Access-Control-Allow-Headers", "Cache-Control");
  }

  send(message: SSEMessage) {
    if (this.isClosed) return;
    this.res.write(`data: ${JSON.stringify(message)}\n\n`);
  }

  sendChunk(chunk: string, full?: string) {
    this.send({ chunk, full: full ?? "" });
  }

  sendComplete(summary: string) {
    this.send({ done: true, summary });
  }

  sendError(error: string, code?: string) {
    this.send({ error, ...(code && { code }) });
    this.close();
  }

  close() {
    if (this.isClosed) return;
    this.isClosed = true;
    this.res.end();
  }

  isConnectionOpen(): boolean {
    return !this.isClosed && !this.res.writableEnded;
  }

  onDisconnect(callback: () => void) {
    this.res.on("close", () => {
      this.isClosed = true;
      callback();
    });
  }
}
