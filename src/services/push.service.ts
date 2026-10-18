const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export class PushService {
  async send(messages: PushMessage[]) {
    const valid = messages.filter(message => this.isExpoToken(message.to));
    if (valid.length === 0) return { sent: 0 };

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(valid),
      });

      if (!response.ok) {
        console.error("Expo push rejected the request:", response.status, await response.text());
        return { sent: 0 };
      }

      return { sent: valid.length };
    } catch (error) {
      console.error("Expo push request failed:", error);
      return { sent: 0 };
    }
  }

  private isExpoToken(token?: string | null): token is string {
    return !!token && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
  }
}
